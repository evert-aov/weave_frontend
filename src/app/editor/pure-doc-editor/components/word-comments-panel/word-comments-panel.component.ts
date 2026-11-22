import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DocumentCommentThread, DocumentRevisionItem } from '../../models/word-document.model';

export type CommentFilterMode = 'all' | 'open' | 'resolved';

@Component({
  selector: 'app-word-comments-panel',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  templateUrl: './word-comments-panel.component.html',
})
export class WordCommentsPanelComponent {
  @Input() darkMode = false;
  @Input() readOnly = false;
  @Input() comments: DocumentCommentThread[] = [];
  @Input() activeCommentId: string | null = null;
  @Input() trackChangesEnabled = false;
  @Input() hideCommentsOnExport = false;
  @Input() revisions: DocumentRevisionItem[] = [];

  @Output() close = new EventEmitter<void>();
  @Output() createComment = new EventEmitter<string>();
  @Output() replyComment = new EventEmitter<{ commentId: string; text: string }>();
  @Output() resolveComment = new EventEmitter<{ commentId: string; resolved: boolean }>();
  @Output() deleteComment = new EventEmitter<string>();
  @Output() selectComment = new EventEmitter<string>();
  @Output() toggleTrackChanges = new EventEmitter<void>();
  @Output() toggleHideCommentsOnExport = new EventEmitter<void>();
  @Output() acceptRevision = new EventEmitter<string>();
  @Output() rejectRevision = new EventEmitter<string>();
  @Output() acceptAllRevisions = new EventEmitter<void>();
  @Output() rejectAllRevisions = new EventEmitter<void>();
  @Output() jumpToRevision = new EventEmitter<string>();

  readonly filter = signal<CommentFilterMode>('all');
  readonly draftComment = signal('');
  readonly replyDrafts = signal<Record<string, string>>({});
  readonly replyingId = signal<string | null>(null);

  filteredComments(): DocumentCommentThread[] {
    const mode = this.filter();
    if (mode === 'open') return this.comments.filter(c => !c.resolved);
    if (mode === 'resolved') return this.comments.filter(c => c.resolved);
    return this.comments;
  }

  openCount(): number {
    return this.comments.filter(c => !c.resolved).length;
  }

  submitComment(): void {
    const text = this.draftComment().trim();
    if (!text) return;
    this.createComment.emit(text);
    this.draftComment.set('');
  }

  setReplyDraft(commentId: string, value: string): void {
    this.replyDrafts.update(prev => ({ ...prev, [commentId]: value }));
  }

  getReplyDraft(commentId: string): string {
    return this.replyDrafts()[commentId] || '';
  }

  submitReply(commentId: string): void {
    const text = this.getReplyDraft(commentId).trim();
    if (!text) return;
    this.replyComment.emit({ commentId, text });
    this.setReplyDraft(commentId, '');
    this.replyingId.set(null);
  }

  formatDate(ts: number): string {
    try {
      return new Date(ts).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  }
}
