import { Directive, ElementRef, OnDestroy, effect, inject } from '@angular/core';
import { NotesService } from '../../core/services/notes.service';
import { DocumentHistoryService, DocumentPosition } from '../../core/services/document-history.service';
import { DocumentNavigationService } from '../../core/services/document-navigation.service';
import { documentIdFromHref } from '../../core/utils/document-link';
import { captureDocumentPosition, documentAnchorAtSelection, restoreDocumentPosition } from '../utils/document-position';

@Directive({ selector: '[appDocumentReferences]', standalone: true })
export class DocumentReferencesDirective implements OnDestroy {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly notes = inject(NotesService);
  private readonly history = inject(DocumentHistoryService);
  private readonly navigation = inject(DocumentNavigationService);
  private hovered: HTMLAnchorElement | null = null;
  private observer?: MutationObserver;
  private restoreTimeout?: ReturnType<typeof setTimeout>;
  private lastNavigation = '';
  private restoring = false;

  constructor() {
    this.host.addEventListener('click', this.onClick, true);
    this.host.addEventListener('mouseover', this.onHover);
    this.host.addEventListener('mouseleave', this.onLeave);
    this.host.addEventListener('focusout', this.remember);
    window.addEventListener('keydown', this.onKeyDown, true);
    effect(() => {
      const version = this.history.version();
      const noteId = this.notes.currentNote()?._id;
      const key = `${version}:${noteId}`;
      if (key === this.lastNavigation) return;
      this.lastNavigation = key;
      this.hovered = null;
      this.stopRestore();
      const entry = this.history.current();
      if (noteId && entry?.noteId === noteId && entry.position) this.restoreWhenReady(entry.position, noteId);
    });
  }

  private anchor(target: EventTarget | null): HTMLAnchorElement | null {
    const element = target instanceof Element ? target : null;
    const anchor = element?.closest<HTMLAnchorElement>('a[href]');
    return anchor && this.host.contains(anchor) ? anchor : null;
  }

  private targetId(anchor: HTMLAnchorElement | null): string | null {
    return anchor && this.host.contains(anchor) ? documentIdFromHref(anchor.getAttribute('href') ?? '', window.location.origin) : null;
  }

  private readonly onHover = (event: MouseEvent): void => { this.hovered = this.anchor(event.target); };
  private readonly onLeave = (): void => { this.hovered = null; };
  private readonly remember = (): void => {
    if (this.restoring) return;
    const id = this.notes.currentNote()?._id;
    if (id && this.host.getAttribute('data-document-id') === id) {
      this.history.remember(id, { ...captureDocumentPosition(this.host), readingMode: this.notes.isReadingMode() });
    }
  };

  private readonly onClick = (event: MouseEvent): void => {
    if (event.button !== 0 || event.altKey || event.shiftKey) return;
    const id = this.targetId(this.anchor(event.target));
    if (!id) return;
    event.preventDefault(); event.stopImmediatePropagation();
    this.remember(); this.navigation.open(id);
  };

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey || event.isComposing) return;
    const target = event.target instanceof Element ? event.target : null;
    if (!target || target.closest('input,textarea,[role="dialog"],.monaco-editor,.cm-editor')) return;
    if (!this.host.contains(target) && target !== document.body && !target.closest('.workspace-shell')) return;
    const key = event.key.toLowerCase();
    if (key === 'i' && this.history.canGoBack()) {
      event.preventDefault(); event.stopImmediatePropagation();
      this.remember(); this.navigation.back();
    } else if (key === 'o') {
      const id = this.targetId(this.anchor(target)) ?? this.targetId(documentAnchorAtSelection(this.host)) ?? this.targetId(this.hovered);
      if (!id) return;
      event.preventDefault(); event.stopImmediatePropagation();
      this.remember(); this.navigation.open(id);
    }
  };

  private restoreWhenReady(position: DocumentPosition, noteId: string): void {
    const restore = (): void => {
      if (this.host.getAttribute('data-document-id') !== noteId || this.notes.isLoadingNote()) return;
      this.restoring = true;
      try {
        if (position.readingMode !== undefined) this.notes.isReadingMode.set(position.readingMode);
        if (restoreDocumentPosition(this.host, position)) this.stopRestore();
      } finally { this.restoring = false; }
    };
    this.observer = new MutationObserver(restore);
    this.observer.observe(this.host, { childList: true, subtree: true, attributes: true, attributeFilter: ['contenteditable', 'data-document-id', 'data-word-ready'] });
    this.restoreTimeout = setTimeout(() => this.stopRestore(), 15000);
    restore();
  }

  private stopRestore(): void {
    this.observer?.disconnect(); this.observer = undefined;
    clearTimeout(this.restoreTimeout); this.restoreTimeout = undefined;
  }

  ngOnDestroy(): void {
    this.stopRestore();
    this.host.removeEventListener('click', this.onClick, true);
    this.host.removeEventListener('mouseover', this.onHover);
    this.host.removeEventListener('mouseleave', this.onLeave);
    this.host.removeEventListener('focusout', this.remember);
    window.removeEventListener('keydown', this.onKeyDown, true);
  }
}
