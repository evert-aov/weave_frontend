import type {
  DocumentCommentReply,
  DocumentCommentThread,
  DocumentPage,
  DocumentRevisionItem,
} from '../models/word-document.model';
import type { WordCanvasEditorComponent } from '../components/word-canvas-editor/word-canvas-editor.component';
import type { ElementRef } from '@angular/core';
import {
  applyRevisionDecisionToHtml,
  listRevisionsInPages,
} from '../utils/document-review';

export interface WordReviewEditorHooks {
  canvasEditor: () => WordCanvasEditorComponent | undefined;
  canvasEnabled: () => boolean;
  isReadMode: () => boolean;
  activePageIndex: () => number;
  pages: () => DocumentPage[];
  setPages: (pages: DocumentPage[]) => void;
  comments: () => DocumentCommentThread[];
  setComments: (next: DocumentCommentThread[]) => void;
  commentsPanelOpen: () => boolean;
  setCommentsPanelOpen: (open: boolean) => void;
  activeCommentId: () => string | null;
  setActiveCommentId: (id: string | null) => void;
  trackChangesEnabled: () => boolean;
  setTrackChangesEnabled: (enabled: boolean) => void;
  hideCommentsOnExport: () => boolean;
  setHideCommentsOnExport: (hide: boolean) => void;
  revisions: () => DocumentRevisionItem[];
  setRevisions: (items: DocumentRevisionItem[]) => void;
  mainScrollRef: () => ElementRef<HTMLElement> | undefined;
  liveBodies: () => HTMLElement[];
  syncDomBodiesFromPages: (pages: DocumentPage[]) => void;
  jumpToPage: (pageIndex: number) => void;
  showToast: (message: string) => void;
  setStatusMessage: (message: string) => void;
  scheduleAutoSave: () => void;
}

export class WordReviewController {
  private seq = 0;

  constructor(private readonly hooks: WordReviewEditorHooks) {}

  private nextId(prefix: string): string {
    return `${prefix}-${Date.now().toString(36)}-${++this.seq}`;
  }

  private scrollCanvasToLocation(loc: { pageIndex: number; y: number }): void {
    const canvas = this.hooks.canvasEditor();
    const scroller = this.hooks.mainScrollRef()?.nativeElement;
    if (scroller && canvas) {
      const top = canvas.pageTopFor(loc.pageIndex) + Math.max(0, loc.y - 80) * canvas.scale();
      scroller.scrollTo({ top, behavior: 'smooth' });
      return;
    }
    this.hooks.jumpToPage(loc.pageIndex);
  }

  refreshRevisions(): void {
    const session = this.hooks.canvasEnabled() ? this.hooks.canvasEditor()?.session : undefined;
    if (session) {
      this.hooks.setRevisions(session.listRevisions());
      return;
    }
    this.hooks.setRevisions(listRevisionsInPages(this.hooks.pages()));
  }

  toggleCommentsPanel(open?: boolean): void {
    const next = open ?? !this.hooks.commentsPanelOpen();
    this.hooks.setCommentsPanelOpen(next);
    if (next) {
      this.refreshRevisions();
    }
  }

  openNewComment(): void {
    this.hooks.setCommentsPanelOpen(true);
    this.refreshRevisions();
  }

  createComment(text: string, author = 'Revisor'): DocumentCommentThread | null {
    if (this.hooks.isReadMode()) return null;
    const trimmed = text.trim();
    if (!trimmed) return null;

    const id = this.nextId('cmt');
    let quote = '';
    let pageIndex = this.hooks.activePageIndex();

    const canvas = this.hooks.canvasEnabled() ? this.hooks.canvasEditor() : undefined;
    if (canvas?.session) {
      const anchored = canvas.session.wrapSelectionWithCommentAnchor(id, pageIndex, 'Comentario');
      if (anchored) {
        quote = anchored.quote;
        pageIndex = anchored.pageIndex;
      }
      canvas.publishNow();
    } else if (typeof window !== 'undefined' && typeof document !== 'undefined') {
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0) {
        const range = sel.getRangeAt(0);
        const bodies = this.hooks.liveBodies();
        const inBody = bodies.some(b => b.contains(range.commonAncestorContainer));
        if (inBody) {
          quote = sel.toString().trim();
          const span = document.createElement('span');
          span.setAttribute('data-word-comment-id', id);
          if (quote) {
            span.className = 'word-comment-anchor';
            span.style.backgroundColor = '#fef3c7';
            span.style.borderBottom = '2px solid #f59e0b';
            try {
              range.surroundContents(span);
            } catch {
              const frag = range.extractContents();
              span.appendChild(frag);
              range.insertNode(span);
            }
          } else {
            span.className = 'word-comment-badge';
            span.textContent = '[Comentario]';
            range.insertNode(span);
          }
          const pageEl = span.closest<HTMLElement>('[data-word-page-index]');
          if (pageEl) {
            const idx = Number(pageEl.dataset['wordPageIndex']);
            if (Number.isFinite(idx)) pageIndex = idx;
          }
          const updatedPages = this.hooks.pages().map((page, i) =>
            bodies[i] ? { ...page, html: bodies[i].innerHTML } : page,
          );
          this.hooks.setPages(updatedPages);
        }
      }
    }

    const thread: DocumentCommentThread = {
      id,
      author: author.trim() || 'Revisor',
      text: trimmed,
      quote,
      createdAt: Date.now(),
      resolved: false,
      pageIndex,
      replies: [],
    };
    this.hooks.setComments([...this.hooks.comments(), thread]);
    this.hooks.setActiveCommentId(id);
    this.hooks.setCommentsPanelOpen(true);
    this.hooks.setStatusMessage('Comentario anclado agregado al documento.');
    this.hooks.scheduleAutoSave();
    return thread;
  }

  replyToComment(commentId: string, text: string, author = 'Revisor'): boolean {
    const trimmed = text.trim();
    if (!trimmed) return false;
    const prev = this.hooks.comments();
    let found = false;
    const reply: DocumentCommentReply = {
      id: this.nextId('reply'),
      author: author.trim() || 'Revisor',
      text: trimmed,
      createdAt: Date.now(),
    };
    const next = prev.map(thread => {
      if (thread.id !== commentId) return thread;
      found = true;
      return { ...thread, replies: [...thread.replies, reply] };
    });
    if (!found) return false;
    this.hooks.setComments(next);
    this.hooks.scheduleAutoSave();
    return true;
  }

  resolveComment(commentId: string, resolved = true): boolean {
    const prev = this.hooks.comments();
    let found = false;
    const next = prev.map(thread => {
      if (thread.id !== commentId) return thread;
      found = true;
      return {
        ...thread,
        resolved,
        resolvedAt: resolved ? Date.now() : undefined,
      };
    });
    if (!found) return false;
    this.hooks.setComments(next);
    this.hooks.setStatusMessage(resolved ? 'Comentario marcado como resuelto.' : 'Comentario reabierto.');
    this.hooks.scheduleAutoSave();
    return true;
  }

  deleteComment(commentId: string): boolean {
    const prev = this.hooks.comments();
    const next = prev.filter(t => t.id !== commentId);
    if (next.length === prev.length) return false;

    const canvas = this.hooks.canvasEnabled() ? this.hooks.canvasEditor() : undefined;
    if (canvas?.session) {
      if (canvas.session.removeCommentAnchor(commentId)) {
        canvas.publishNow();
      }
    } else if (typeof document !== 'undefined') {
      const bodies = this.hooks.liveBodies();
      let domChanged = false;
      for (const body of bodies) {
        for (const el of Array.from(body.querySelectorAll(`[data-word-comment-id="${commentId}"]`))) {
          domChanged = true;
          const parent = el.parentNode;
          if (!parent) continue;
          if (!el.classList.contains('word-comment-badge')) {
            while (el.firstChild) parent.insertBefore(el.firstChild, el);
          }
          parent.removeChild(el);
        }
      }
      if (domChanged) {
        this.hooks.setPages(
          this.hooks.pages().map((p, i) => (bodies[i] ? { ...p, html: bodies[i].innerHTML } : p)),
        );
      }
    }

    this.hooks.setComments(next);
    if (this.hooks.activeCommentId() === commentId) {
      this.hooks.setActiveCommentId(null);
    }
    this.hooks.setStatusMessage('Comentario eliminado.');
    this.hooks.scheduleAutoSave();
    return true;
  }

  selectComment(commentId: string): void {
    this.hooks.setActiveCommentId(commentId);
    const canvas = this.hooks.canvasEnabled() ? this.hooks.canvasEditor() : undefined;
    if (canvas?.session) {
      const loc = canvas.session.jumpToComment(commentId);
      if (loc) {
        canvas.refresh();
        this.scrollCanvasToLocation(loc);
        return;
      }
    }
    if (typeof document !== 'undefined') {
      for (const body of this.hooks.liveBodies()) {
        const target = body.querySelector<HTMLElement>(`[data-word-comment-id="${commentId}"]`);
        if (target) {
          target.scrollIntoView({ behavior: 'smooth', block: 'center' });
          return;
        }
      }
    }
    const thread = this.hooks.comments().find(c => c.id === commentId);
    if (thread?.pageIndex !== undefined) {
      this.hooks.jumpToPage(thread.pageIndex);
    }
  }

  toggleTrackChanges(enabled?: boolean): void {
    const next = enabled ?? !this.hooks.trackChangesEnabled();
    this.hooks.setTrackChangesEnabled(next);
    const session = this.hooks.canvasEnabled() ? this.hooks.canvasEditor()?.session : undefined;
    if (session) {
      session.trackChangesEnabled = next;
    }
    this.refreshRevisions();
    this.hooks.setStatusMessage(
      next
        ? 'Control de cambios activado: inserciones y eliminaciones quedarán marcadas.'
        : 'Control de cambios desactivado.',
    );
    this.hooks.scheduleAutoSave();
  }

  toggleHideCommentsOnExport(hide?: boolean): void {
    const next = hide ?? !this.hooks.hideCommentsOnExport();
    this.hooks.setHideCommentsOnExport(next);
    this.hooks.setStatusMessage(
      next
        ? 'Los comentarios se ocultarán al exportar (PDF, DOCX, HTML).'
        : 'Los comentarios volverán a incluirse al exportar.',
    );
    this.hooks.scheduleAutoSave();
  }

  jumpToRevision(revId: string): void {
    const canvas = this.hooks.canvasEnabled() ? this.hooks.canvasEditor() : undefined;
    if (canvas?.session) {
      const loc = canvas.session.jumpToRevision(revId);
      if (loc) {
        canvas.refresh();
        this.scrollCanvasToLocation(loc);
        return;
      }
    }
    const item = this.hooks.revisions().find(r => r.id === revId);
    if (item) {
      this.hooks.jumpToPage(item.pageIndex);
    }
  }

  private resolveRevisions(action: 'accept' | 'reject', revId?: string): boolean {
    if (this.hooks.isReadMode()) return false;
    const canvas = this.hooks.canvasEnabled() ? this.hooks.canvasEditor() : undefined;
    if (canvas?.session) {
      const ok = revId
        ? (action === 'accept' ? canvas.session.acceptRevision(revId) : canvas.session.rejectRevision(revId))
        : (action === 'accept' ? canvas.session.acceptAllRevisions() : canvas.session.rejectAllRevisions());
      if (!ok) {
        this.hooks.showToast('No hay cambios pendientes por revisar.');
        return false;
      }
      canvas.publishNow();
      this.refreshRevisions();
      this.hooks.setStatusMessage(
        revId
          ? (action === 'accept' ? 'Cambio aceptado.' : 'Cambio rechazado.')
          : (action === 'accept' ? 'Todos los cambios aceptados.' : 'Todos los cambios rechazados.'),
      );
      this.hooks.scheduleAutoSave();
      return true;
    }

    const pages = this.hooks.pages();
    let changedAny = false;
    const nextPages = pages.map(page => {
      const res = applyRevisionDecisionToHtml(page.html, action, revId);
      if (res.changed) changedAny = true;
      return res.changed ? { ...page, html: res.html } : page;
    });
    if (!changedAny) {
      this.hooks.showToast('No hay cambios pendientes por revisar.');
      return false;
    }
    this.hooks.setPages(nextPages);
    this.hooks.syncDomBodiesFromPages(nextPages);
    this.refreshRevisions();
    this.hooks.scheduleAutoSave();
    return true;
  }

  acceptRevision(revId: string): boolean { return this.resolveRevisions('accept', revId); }
  rejectRevision(revId: string): boolean { return this.resolveRevisions('reject', revId); }
  acceptAllRevisions(): boolean { return this.resolveRevisions('accept'); }
  rejectAllRevisions(): boolean { return this.resolveRevisions('reject'); }
}
