import { paginateMeasuredToc } from '../utils/toc-pagination';
import { preserveTocTypography, tocRowHeight } from '../utils/toc-typography';
import { styleApaTocHtml } from '../utils/apa-toc';
import { markDocumentSelection } from '../utils/document-selection';
import type { PureDocEditorComponent } from '../pure-doc-editor.component';
import type { WordEditorHooks } from './word-editor-hooks';
import { rebuildTableOfContents } from '../utils/table-of-contents';
import type { HeadingItem } from '../models/word-document.model';

type Host = Pick<PureDocEditorComponent, 'activePageIndex' | 'activeTemplateId' | 'styleTemplates' | 'documentReady' | 'importedTocEntries' | 'maxBodyContentHeightPx' | 'isReadMode' | 'pushUndoSnapshot' | 'pages' | 'headings' | 'i18n'>;
type Hooks = Pick<WordEditorHooks, 'reflowDocument' | 'getLivePagesSnapshot' | 'renderDocumentPages' | 'wordCompat' | 'collectDocData' | 'scheduleAutoSave' | 'showToast' | 'liveBodies' | 'pendingRenderPages' | 'loadedNoteId' | 'undoStack'>;
export class WordTocController {
  constructor(private readonly editor: Host, private readonly hooks: Hooks) {}
  private pendingApa = false;
  private signature = '';
  private signatureNote: string | null = null;
  private headingSignature(): string {
    const body=this.hooks.liveBodies()[0];
    return JSON.stringify([body?.clientWidth,body?.clientHeight,this.editor.maxBodyContentHeightPx(),this.editor.headings().filter(h => !h.fromTocEntry).map(h => [h.id,h.text,h.level,h.pageIndex])]);
  }
  private pendingNote: string | null = null;
  private pendingUndo: unknown;

  /** Part of the caller's existing undo transaction; never creates a missing TOC. */
  refreshApa(): void {
    if (!this.editor.documentReady() || this.editor.isReadMode()) return;
    const template = this.editor.styleTemplates().find(t => t.id === this.editor.activeTemplateId());
    if (template?.academicStyle !== 'apa7') return;
    const pages = this.hooks.pendingRenderPages || this.hooks.getLivePagesSnapshot();
    if (!pages.some(page => /word-toc-page-section|data-native-word-toc|data-word-toc=/.test(page.html))) return;
    this.pendingApa = true; this.pendingNote = this.hooks.loadedNoteId; this.pendingUndo = this.hooks.undoStack.at(-1);
    this.rebuildAutomatically();
  }
  afterFlow(): void {
    if (!this.editor.documentReady() || this.editor.isReadMode()) return;
    const signature = this.headingSignature();
    if (this.pendingApa) {
      this.pendingApa = false;
      if (this.pendingNote === this.hooks.loadedNoteId && this.pendingUndo === this.hooks.undoStack.at(-1)) this.rebuildAutomatically(true);
    } else if ((this.signatureNote === this.hooks.loadedNoteId && this.signature && this.signature !== signature)
      || this.signatureNote !== this.hooks.loadedNoteId && this.editor.pages().some(page => /word-toc-page-section|data-native-word-toc/.test(page.html))
        && ((this.hooks.liveBodies()[0]?.clientWidth || 0) >= 200 || this.editor.pages().some(page => /word-toc-header[^>]*>[^<]*continuaci/i.test(page.html)))) {
      this.rebuildAutomatically(true);
    }
    this.signatureNote = this.hooks.loadedNoteId;
    this.signature = this.headingSignature();
  }
  private buildPages(headings: HeadingItem[], entries: number, source: string): string[] {
    const template=this.editor.styleTemplates().find(t=>t.id===this.editor.activeTemplateId());
    const format=(html:string)=>template?.academicStyle==='apa7' ? styleApaTocHtml(html,template) : preserveTocTypography(html,source);
    const complete=format(this.hooks.wordCompat.buildPaginatedTocPagesHtml(headings,Math.max(3,headings.length+2),0)[0]);
    const bodies=this.hooks.liveBodies();
    const body=bodies.find(body=>body.querySelector('.word-toc-page-section')) || bodies[0];
    return paginateMeasuredToc(complete,body,this.editor.maxBodyContentHeightPx())
      || this.hooks.wordCompat.buildPaginatedTocPagesHtml(headings,entries,0).map(format);
  }
  private rebuildAutomatically(settled = false): void {
    const template = this.editor.styleTemplates().find(t => t.id === this.editor.activeTemplateId());
    const apa = template?.academicStyle === 'apa7';
    const active = this.editor.pages()[this.editor.activePageIndex()]?.id;
    const pages = this.hooks.pendingRenderPages || this.hooks.getLivePagesSnapshot();
    if (!pages.some(page => /word-toc-page-section|data-native-word-toc|data-word-toc=/.test(page.html))) return;
    if (!this.hooks.pendingRenderPages) { markDocumentSelection(this.hooks.liveBodies()); pages.splice(0,pages.length,...this.hooks.getLivePagesSnapshot()); }
    const source = pages.find(page => /word-toc-page-section|data-native-word-toc/.test(page.html))?.html || '';
    const entries = Math.max(1, Math.floor((this.editor.maxBodyContentHeightPx() - 80) / (apa ? template.rules.P.fontSizePt * 96 / 72 * 2 : tocRowHeight(source))));
    const result = rebuildTableOfContents(pages, this.editor.activePageIndex(), false,
      headings => this.buildPages(headings,entries,source));
    if (!result.found) return;
    this.editor.importedTocEntries.set([]);
    this.hooks.renderDocumentPages(result.pages, !settled);
    const index = result.pages.findIndex(page => page.id === active);
    this.editor.activePageIndex.set(index >= 0 ? index : result.index);
    this.hooks.scheduleAutoSave(this.hooks.collectDocData());
  }
  update(insert = false): void {
    this.pendingApa = false;
    if (!this.editor.documentReady() || this.editor.isReadMode()) return;
    this.hooks.reflowDocument();
    const template = this.editor.styleTemplates().find(t => t.id === this.editor.activeTemplateId());
    const apa = template?.academicStyle === 'apa7';
    const source = this.editor.pages().find(page => /word-toc-page-section|data-native-word-toc/.test(page.html))?.html || '';
    const rowHeight = apa ? template.rules.P.fontSizePt * 96 / 72 * 2 : tocRowHeight(source);
    const entries = Math.max(1, Math.floor((this.editor.maxBodyContentHeightPx() - 80) / rowHeight));
    const build = (headings: HeadingItem[]) => this.buildPages(headings,entries,source);
    const pages = this.hooks.getLivePagesSnapshot();
    const result = rebuildTableOfContents(pages, this.editor.activePageIndex(), insert, build);
    if (!result.found && !insert) { this.hooks.showToast(this.editor.i18n.t('word.toc.no_index')); return; }
    this.editor.pushUndoSnapshot(pages);
    this.editor.importedTocEntries.set([]);
    this.hooks.renderDocumentPages(result.pages);
    this.editor.activePageIndex.set(result.index);
    this.hooks.scheduleAutoSave(this.hooks.collectDocData());
    this.hooks.showToast(this.editor.i18n.t('word.toc.updated', { count: result.headings.length }));
  }
}
