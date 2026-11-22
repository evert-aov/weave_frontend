import { HeadingItem } from '../models/word-document.model';

import type { PureDocEditorComponent } from '../pure-doc-editor.component';
import type { WordEditorHooks } from './word-editor-hooks';

type WordNavigationControllerHost = Pick<PureDocEditorComponent,
  | 'activePageIndex'
  | 'docTitle'
  | 'fileInputRef'
  | 'focusMode'
  | 'getHeaderEl'
  | 'getPageBody'
  | 'handleDeletePage'
  | 'handleUpdateLayout'
  | 'headings'
  | 'isReadMode'
  | 'mainScrollRef'
  | 'refreshObjectOverlays'
  | 'maxBodyContentHeightPx'
  | 'pages'
  | 'pendingScrollHeadingId'
  | 'pushUndoSnapshot'
  | 'viewMode'
  | 'zoom'>;
type WordNavigationControllerHooks = Pick<WordEditorHooks,
  | 'cdr'
  | 'getActivePageElement'
  | 'getCanvasReadableText'
  | 'showToast'
  | 'wordCompat'>;

/** Navigation behavior owned by one editor instance. */
export class WordNavigationController {
  constructor(private readonly editor: WordNavigationControllerHost, private readonly hooks: WordNavigationControllerHooks) {}

  private zoomFrame: number | null = null;
  private restoreZoomAnchoring?: () => void;

  cancelZoom(): void {
    if (this.zoomFrame !== null) cancelAnimationFrame(this.zoomFrame);
    this.zoomFrame = null;
    this.restoreZoomAnchoring?.(); this.restoreZoomAnchoring = undefined;
  }

  setDocumentZoom(percent: number, pointer?: { x: number; y: number; page: HTMLElement }): void {
    if (!Number.isFinite(percent)) return;
    const next = Math.max(50, Math.min(160, Math.round(percent)));
    if (next === this.editor.zoom()) return;
    this.cancelZoom();
    const viewport = this.editor.mainScrollRef?.nativeElement;
    if (!viewport) { this.editor.zoom.set(next); return; }
    const bounds = viewport.getBoundingClientRect();
    let x = pointer?.x ?? bounds.left + bounds.width / 2;
    let y = pointer?.y ?? bounds.top + bounds.height / 2;
    let page = pointer?.page || document.elementFromPoint?.(x, y)?.closest<HTMLElement>('.word-page-sheet');
    if (!page || !viewport.contains(page)) {
      page = Array.from(viewport.querySelectorAll<HTMLElement>('.word-page-sheet')).find(element => {
        const rect = element.getBoundingClientRect();
        return rect.bottom > bounds.top && rect.top < bounds.bottom;
      });
    }
    if (!page) { this.editor.zoom.set(next); return; }
    const before = page.getBoundingClientRect();
    if (!before.width || !before.height) { this.editor.zoom.set(next); return; }
    x = Math.max(before.left, Math.min(before.right, x));
    y = Math.max(before.top, Math.min(before.bottom, y));
    const relativeX = (x - before.left) / before.width;
    const relativeY = (y - before.top) / before.height;
    const previousAnchoring = viewport.style.overflowAnchor;
    viewport.style.overflowAnchor = 'none';
    this.restoreZoomAnchoring = () => { viewport.style.overflowAnchor = previousAnchoring; };
    const anchor = page;
    const canvasIndex=page.getAttribute('data-canvas-index');
    const space=page.closest<HTMLElement>('.canvas-document-space');
    const ratio=next/this.editor.zoom();
    const restore = () => {
      if (!viewport.isConnected) return;
      if(canvasIndex!==null&&space?.isConnected){
        const rect=space.getBoundingClientRect(),height=before.height*ratio,width=before.width*ratio;
        viewport.scrollTop+=rect.top+Number(canvasIndex)*(height+32)+relativeY*height-y;
        viewport.scrollLeft+=rect.left+relativeX*width-x;
        return;
      }
      if(!anchor.isConnected)return;
      const after = anchor.getBoundingClientRect();
      viewport.scrollTop += after.top + relativeY * after.height - y;
      viewport.scrollLeft += after.left + relativeX * after.width - x;
      this.editor.refreshObjectOverlays();
    };
    this.editor.zoom.set(next);
    this.hooks.cdr?.detectChanges();
    restore();
    this.zoomFrame = requestAnimationFrame(() => {
      this.zoomFrame = null; restore();
      this.restoreZoomAnchoring?.(); this.restoreZoomAnchoring = undefined;
    });
  }

  onPageWheel(event: WheelEvent): void {
    const target = event.target instanceof Element ? event.target.closest<HTMLElement>('.word-page-sheet') : null;
    if (!event.ctrlKey || !target) return;
    event.preventDefault(); event.stopPropagation();
    if (event.deltaY) this.setDocumentZoom(this.editor.zoom() + (event.deltaY < 0 ? 10 : -10), { x: event.clientX, y: event.clientY, page: target });
  }

  handleReadAloud(): void {
    if (!('speechSynthesis' in window)) {
      this.hooks.showToast('Tu navegador no soporta lectura en voz alta');
      return;
    }
    if (window.speechSynthesis.speaking) {
      window.speechSynthesis.cancel();
      this.hooks.showToast('Lectura en voz alta detenida');
      return;
    }
    const activeEl = this.hooks.getActivePageElement();
    const canvasText = this.hooks.getCanvasReadableText?.(this.editor.activePageIndex());
    const textToRead = (canvasText !== undefined && canvasText !== null ? canvasText : (window.getSelection()?.toString().trim() || activeEl?.innerText?.trim() || '')).trim();
    if (!textToRead) {
      this.hooks.showToast('No hay texto en la página actual para leer');
      return;
    }
    const utterance = new SpeechSynthesisUtterance(textToRead);
    utterance.lang = 'es-ES';
    window.speechSynthesis.speak(utterance);
    this.hooks.showToast(
      `Lector Inmersivo leyendo Página ${this.editor.activePageIndex() + 1} (haz clic de nuevo para detener)`
    );
  }

  handleSelectHeadingInSidebar(id: string, pageIndex: number): void {
    const clamped = Math.max(0, Math.min(this.editor.pages().length - 1, pageIndex));
    this.editor.activePageIndex.set(clamped);
    this.applyPendingScroll(id);
  }

  applyPendingScroll(headingId: string): void {
    this.editor.pendingScrollHeadingId.set(headingId);
    setTimeout(() => {
      const el = document.getElementById(headingId);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('bg-yellow-100/80', 'transition-colors', 'rounded');
        setTimeout(() => {
          el.classList.remove('bg-yellow-100/80');
        }, 1400);
      } else {
        const activePage = this.editor.pages()[this.editor.activePageIndex()];
        if (activePage) {
          const pageEl = this.editor.getPageBody(activePage.id);
          pageEl?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }
      this.editor.pendingScrollHeadingId.set(null);
    }, 50);
  }

  jumpToPage(pageIdx: number): void {
    const clamped = Math.max(0, Math.min(this.editor.pages().length - 1, pageIdx));
    this.editor.activePageIndex.set(clamped);
    setTimeout(() => {
      const target = this.editor.pages()[clamped];
      if (!target) return;
      const el = this.editor.getPageBody(target.id);
      el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 40);
  }

  handleFocusHeaderArea(): void {
    this.editor.handleUpdateLayout((prev) => ({ ...prev, showHeaderFooter: true }));
    setTimeout(() => {
      const currentPage = this.editor.pages()[this.editor.activePageIndex()] || this.editor.pages()[0];
      if (currentPage) {
        const hEl = this.editor.getHeaderEl(currentPage.id);
        if (hEl) {
          hEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
          hEl.focus();
        }
      }
    }, 60);
  }

  handleFocusFooterArea(): void {
    const activePage = this.hooks.getActivePageElement();
    if (activePage) {
      activePage.scrollTop = activePage.scrollHeight;
      activePage.focus();
      this.hooks.showToast('Pie de página enfocado');
    }
  }

  openFilePicker(): void {
    this.editor.fileInputRef?.nativeElement.click();
  }

  exitFocusOrRead(): void {
    this.editor.focusMode.set(false);
    if (this.editor.isReadMode()) this.editor.viewMode.set('print');
  }

  handleOutlineClick(h: HeadingItem): void {
    this.editor.viewMode.set('print');
    this.handleSelectHeadingInSidebar(h.id, h.pageIndex);
  }

  onDeletePageClick(e: Event, pageIndex: number): void {
    e.stopPropagation();
    this.editor.handleDeletePage(pageIndex);
  }

  onDocTitleInput(e: Event): void {
    this.editor.docTitle.set((e.target as HTMLInputElement).value);
  }

  onPageNumberChange(e: Event): void {
    const val = parseInt((e.target as HTMLInputElement).value, 10);
    if (!isNaN(val)) this.jumpToPage(val - 1);
  }

  onZoomInput(e: Event): void {
    this.setDocumentZoom(Number((e.target as HTMLInputElement).value));
  }
}
