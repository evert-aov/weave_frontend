import { DocumentModelDomAdapter } from './document-model-dom';
import { AfterViewInit, Directive, ElementRef, Input, NgZone, OnChanges, OnDestroy, inject } from '@angular/core';
import { CanvasPageRenderer, PageDisplayList } from './canvas-page-renderer';
import { buildDomDisplayList, buildModelPageDisplayList } from './dom-page-display-list';
import { caretForPosition, moveCaretVertically, selectionRectsForRange } from './canvas-caret';
import { hitTestPage } from './canvas-hit-test';
import { DocumentPosition } from './document-model';

/** Hybrid and model-driven Canvas display backend; retains DOM semantics and releases offscreen buffers. */
@Directive({ selector: '[wordHybridPage]', standalone: true })
export class HybridPageDirective implements AfterViewInit, OnChanges, OnDestroy {
  @Input() wordHybridPage = false;
  @Input() wordCanvasEdit = false;
  @Input() hybridRevision = '';
  @Input() hybridScale = 1;
  private readonly body = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly zone = inject(NgZone);
  private observer?: IntersectionObserver;
  private resize?: ResizeObserver;
  private mutations?: MutationObserver;
  private canvas?: HTMLCanvasElement;
  private spareCanvas?: HTMLCanvasElement;
  private lastPage?: PageDisplayList;
  private visible = false;
  private frame: number | null = null;
  private destroyed = false;
  private revision = 0;
  private composing = false;
  private printing = false;
  private dirty = true;
  private nativeSelection = false;
  private readonly renderer = new CanvasPageRenderer();
  private readonly modelAdapter = new DocumentModelDomAdapter();

  private readonly selection = () => {
    if (!this.visible || !this.wordHybridPage) return;
    const native = this.needsDom(), wasNative = this.nativeSelection;
    this.nativeSelection = native;
    if (native) {
      this.release(true);
    } else if (wasNative) {
      this.schedule();
    } else if (this.wordCanvasEdit && !this.dirty && this.lastPage && this.canvas) {
      this.renderSelectionOverlay();
    } else if (this.wordCanvasEdit && this.dirty) {
      this.schedule();
    }
  };

  ngAfterViewInit(): void {
    if (typeof IntersectionObserver === 'undefined') return;
    this.zone.runOutsideAngular(() => {
      this.observer = new IntersectionObserver(
        entries => {
          this.visible = entries.some(entry => entry.isIntersecting);
          if (this.visible) this.schedule();
          else this.release(true);
        },
        { root: this.body.closest('[data-document-scroll]'), rootMargin: '400px' },
      );
      this.observer.observe(this.body);
      this.resize = new ResizeObserver(this.invalidate);
      this.resize.observe(this.body);
      this.mutations = new MutationObserver(this.invalidate);
      this.mutations.observe(this.body, { subtree: true, childList: true, characterData: true });
      // Capture restores the existing DOM before browser caret placement/input when not in model Canvas edit mode.
      for (const event of ['pointerdown', 'focusin', 'keydown', 'beforeinput']) {
        this.body.addEventListener(event, this.activate, true);
      }
      this.body.addEventListener('focusout', this.deactivate);
      this.body.addEventListener('load', this.fonts, true);
      this.body.addEventListener('error', this.fonts, true);
      this.body.addEventListener('compositionstart', this.compositionStart, true);
      this.body.addEventListener('compositionend', this.compositionEnd, true);
      document.addEventListener('selectionchange', this.selection);
      document.fonts?.addEventListener('loadingdone', this.fonts);
      window.addEventListener('beforeprint', this.beforePrint);
      window.addEventListener('afterprint', this.afterPrint);
    });
  }

  ngOnChanges(): void {
    this.dirty = true;
    this.release(!this.wordHybridPage);
    this.schedule();
  }

  /** Resolves an unzoomed coordinate on the active Canvas page to a logical position and updates Selection. */
  hitTestAndPlaceCaret(x: number, y: number): DocumentPosition | null {
    if (!this.lastPage) return null;
    const pos = hitTestPage(this.lastPage, x, y);
    if (!pos) return null;
    this.modelAdapter.restore({ anchor: pos, focus: pos });
    if (this.wordCanvasEdit && this.canvas) this.renderSelectionOverlay();
    return pos;
  }

  /** Moves the logical caret vertically across visual lines using the Canvas display list. */
  navigateVertically(direction: -1 | 1, preferredX?: number): { position: DocumentPosition; x: number } | null {
    if (!this.lastPage) return null;
    const currentSel = this.modelAdapter.selection(window.getSelection());
    if (!currentSel) return null;
    const moved = moveCaretVertically(this.lastPage, currentSel.focus, direction, preferredX);
    if (!moved) return null;
    this.modelAdapter.restore({ anchor: moved.position, focus: moved.position });
    if (this.wordCanvasEdit && this.canvas) this.renderSelectionOverlay();
    return moved;
  }

  private readonly invalidate = () => {
    this.dirty = true;
    this.release();
    this.schedule();
  };
  private readonly fonts = this.invalidate;
  private readonly beforePrint = () => {
    this.printing = true;
    this.release();
  };
  private readonly afterPrint = () => {
    this.printing = false;
    this.fonts();
  };
  private readonly activate = () => {
    if (this.wordCanvasEdit && !this.composing && !this.printing) return;
    this.nativeSelection = true;
    this.release(true);
  };
  private readonly deactivate = () => {
    this.release(true);
    this.schedule();
  };
  private readonly compositionStart = () => {
    this.composing = true;
    this.release(true);
  };
  private readonly compositionEnd = () => {
    this.composing = false;
    this.schedule();
  };

  private needsDom(): boolean {
    if (this.composing || this.printing) return true;
    const selection = window.getSelection();
    if (this.wordCanvasEdit) {
      if (!selection?.rangeCount) return false;
      const range = selection.getRangeAt(0);
      // Cross-page selections fall back to native DOM selection across sheets.
      if (!selection.isCollapsed && range.intersectsNode(this.body)) {
        const insideThisPage = this.body.contains(range.startContainer) && this.body.contains(range.endContainer);
        if (!insideThisPage) return true;
      }
      return false;
    }
    // DOM-derived glyph measurement is too expensive on every caret movement/input.
    // Keep the native caret when wordCanvasEdit is off.
    if (this.body.contains(document.activeElement)) return true;
    if (!selection?.rangeCount) return false;
    const range = selection.getRangeAt(0);
    // An inactive editor can still own a caret or a selection kept by the ribbon.
    return selection.isCollapsed
      ? this.body.getAttribute('contenteditable') === 'true' && this.body.contains(selection.anchorNode)
      : range.intersectsNode(this.body);
  }

  private renderSelectionOverlay(): void {
    if (!this.lastPage || !this.canvas) return;
    const sel = this.modelAdapter.selection(window.getSelection());
    const isCollapsed = sel && sel.anchor.nodeId === sel.focus.nodeId && sel.anchor.offset === sel.focus.offset;
    const caret = sel ? caretForPosition(this.lastPage, sel.focus) : undefined;
    const selections = sel && !isCollapsed ? selectionRectsForRange(this.lastPage, sel) : undefined;
    this.lastPage = {
      ...this.lastPage,
      caret,
      selections,
    };
    this.renderer.render(this.canvas, this.lastPage, 1, Math.min(2, (window.devicePixelRatio || 1) * this.hybridScale));
  }

  private schedule(): void {
    if (this.destroyed || !this.visible || !this.wordHybridPage || !this.dirty || this.frame !== null || this.canvas) return;
    if (this.needsDom()) {
      this.nativeSelection = true;
      return;
    }
    this.zone.runOutsideAngular(() => {
      this.frame = requestAnimationFrame(() => {
        this.frame = null;
        this.draw();
      });
    });
  }

  private draw(): void {
    if (!this.visible || !this.wordHybridPage || this.destroyed || !this.dirty) return;
    if (this.needsDom()) {
      this.nativeSelection = true;
      return;
    }
    try {
      this.dirty = false; // Unsupported pages are retried only after content/layout invalidation.
      const activeInPage =
        this.body.contains(document.activeElement) ||
        (!!window.getSelection()?.rangeCount && this.body.contains(window.getSelection()!.anchorNode));
      const page = this.wordCanvasEdit && activeInPage
        ? buildModelPageDisplayList(this.body, ++this.revision, this.modelAdapter)
        : buildDomDisplayList(this.body, ++this.revision, this.modelAdapter);
      if (!page) {
        this.lastPage = undefined;
        this.modelAdapter.clear();
        this.release(true);
        return;
      }
      this.lastPage = page;
      const canvas = this.spareCanvas || document.createElement('canvas');
      this.spareCanvas = undefined;
      canvas.setAttribute('aria-hidden', 'true');
      canvas.className = 'word-hybrid-surface';
      canvas.style.cssText = `position:absolute;pointer-events:none;left:${this.body.offsetLeft}px;top:${this.body.offsetTop}px;z-index:1;`;
      // The page stack already applies zoom. Only the backing buffer needs its scale.
      this.renderer.render(canvas, page, 1, Math.min(2, (window.devicePixelRatio || 1) * this.hybridScale));
      this.body.after(canvas);
      this.canvas = canvas;
      this.body.classList.add('word-hybrid-source');
    } catch {
      this.lastPage = undefined;
      this.modelAdapter.clear();
      this.release(true);
    }
  }

  private release(discard = false): void {
    if (this.frame !== null) {
      cancelAnimationFrame(this.frame);
      this.frame = null;
    }
    this.canvas?.remove();
    if (this.canvas) {
      this.spareCanvas = this.canvas;
      this.dirty = true;
    }
    this.canvas = undefined;
    if (discard) {
      this.lastPage = undefined;
      if (this.spareCanvas) {
        this.spareCanvas.width = 0;
        this.spareCanvas.height = 0;
        this.spareCanvas = undefined;
        this.modelAdapter.clear();
      }
    }
    if (this.body.classList.contains('word-hybrid-source')) this.body.classList.remove('word-hybrid-source');
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.release(true);
    this.modelAdapter.clear();
    this.observer?.disconnect();
    this.resize?.disconnect();
    this.mutations?.disconnect();
    document.removeEventListener('selectionchange', this.selection);
    document.fonts?.removeEventListener('loadingdone', this.fonts);
    for (const event of ['pointerdown', 'focusin', 'keydown', 'beforeinput']) {
      this.body.removeEventListener(event, this.activate, true);
    }
    this.body.removeEventListener('focusout', this.deactivate);
    this.body.removeEventListener('load', this.fonts, true);
    this.body.removeEventListener('error', this.fonts, true);
    this.body.removeEventListener('compositionstart', this.compositionStart, true);
    this.body.removeEventListener('compositionend', this.compositionEnd, true);
    window.removeEventListener('beforeprint', this.beforePrint);
    window.removeEventListener('afterprint', this.afterPrint);
  }
}
