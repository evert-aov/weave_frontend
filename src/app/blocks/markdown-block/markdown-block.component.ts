import { formatMarkdown, MarkdownFormat, MarkdownSelection } from '../../shared/markdown/markdown-formatting';
import { AfterViewInit, Component, ElementRef, EventEmitter, Output, Input, OnDestroy, OnInit, ViewChild, effect, inject, signal } from '@angular/core';
import { Block } from '../../core/models/block.model';
import { NotesService } from '../../core/services/notes.service';
import { DocumentReferenceService } from '../../core/services/document-reference.service';
import { documentHref } from '../../core/utils/document-link';
import { CodeMirrorRuntime, CodeMirrorRuntimeService } from '../../shared/markdown/codemirror-runtime.service';
import { livePreviewExtensions } from '../../shared/markdown/live-preview';
import { markdownHtml, markdownParts, normalizeLiveMarkdown, richHtmlToMarkdown } from '../../shared/markdown/markdown-document';

@Component({
  selector: 'app-markdown-block', standalone: true,
  templateUrl: './markdown-block.component.html', styleUrl: './markdown-block.component.scss',
})
export class MarkdownBlockComponent implements OnInit, AfterViewInit, OnDestroy {
  @Input({ required: true }) block!: Block;
  @Output() richTextRequested = new EventEmitter<void>();
  @ViewChild('fallback') fallback?: ElementRef<HTMLTextAreaElement>;
  @ViewChild('host', { static: true }) host!: ElementRef<HTMLElement>;
  readonly notes = inject(NotesService);
  private readonly runtime = inject(CodeMirrorRuntimeService);
  private readonly references = inject(DocumentReferenceService);
  readonly ready = signal(false);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly vimError = signal('');
  readonly live = signal(true);
  readonly vimEnabled = signal(false);
  readonly vimLoading = signal(false);
  readonly headingLevel = signal('0');
  readonly formatActions: { value: MarkdownFormat; label: string; icon: string }[] = [
    { value: 'bold', label: 'Negrita', icon: 'M6 4h7a4 4 0 0 1 0 8H6zm0 8h8a4 4 0 0 1 0 8H6z' },
    { value: 'italic', label: 'Cursiva', icon: 'M10 4h10M4 20h10M15 4 9 20' },
    { value: 'strike', label: 'Tachado', icon: 'M18 6c-1-3-10-3-11 1-1 4 9 4 10 8 1 5-9 7-12 2M3 12h18' },
    { value: 'code', label: 'Código en línea', icon: 'm8 6-6 6 6 6m8-12 6 6-6 6m-3-14-2 16' },
    { value: 'bullet', label: 'Lista con viñetas', icon: 'M9 5h12M9 12h12M9 19h12M3 5h1M3 12h1M3 19h1' },
    { value: 'ordered', label: 'Lista numerada', icon: 'M10 5h11M10 12h11M10 19h11M3 3h1v5M2 12c0-3 4-3 4 0l-4 5h4' },
    { value: 'quote', label: 'Cita', icon: 'M4 5h5v7H4zm11 0h5v7h-5zM9 12c0 5-2 7-5 7m16-7c0 5-2 7-5 7' },
  ];
  readonly source = signal('');
  readonly readingHtml = signal('');
  private cm?: CodeMirrorRuntime;
  private view: any;
  private display: any;
  private editing: any;
  private vimCompartment: any;
  private vimExtension: any;
  private ownerNoteId?: string;
  private destroyed = false;
  private savedSource = '';
  private timer?: ReturnType<typeof setTimeout>;
  private vimRequest = 0;
  private wantsVim = false;

  constructor() {
    effect(() => {
      const reading = this.notes.isReadingMode();
      if (reading) this.flush();
      this.configureEditing(reading);
    });
  }
  ngOnInit(): void {
    this.ownerNoteId = this.notes.currentNote()?._id;
    const stored = this.block.content?.['format'] !== 'richtext' && typeof this.block.content?.['markdown'] === 'string'
      ? this.block.content['markdown'] : richHtmlToMarkdown(this.block.content?.['html'] || '');
    this.source.set(normalizeLiveMarkdown(stored.replace(/\r\n?/g, '\n')));
    this.savedSource = this.source(); this.readingHtml.set(markdownHtml(this.source()));
    try { this.wantsVim = localStorage.getItem('weave_markdown_vim') === 'true'; } catch {}
  }
  ngAfterViewInit(): void {
    const styles = this.block.content?.['blockStyles'] || {};
    const container = this.host.nativeElement.parentElement!;
    for (const tag of ['p','h1','h2','h3','h4','h5','h6']) {
      for (const [property, variable] of [['color','color'],['fontSize','size'],['fontFamily','font']]) {
        const value = styles[tag]?.[property];
        if (typeof value === 'string') container.style.setProperty(`--custom-${tag}-${variable}`, value);
      }
    }
    void this.loadEditor();
  }
  async loadEditor(): Promise<void> {
    if (this.loading() || this.destroyed || this.view) return;
    this.loading.set(true); this.error.set('');
    try {
      const cm = await this.runtime.load();
      if (this.destroyed) return;
      const hadFocus = this.host.nativeElement.parentElement?.contains(document.activeElement);
      this.cm = cm; this.editing = new cm.Compartment(); this.vimCompartment = new cm.Compartment();
      const preview = livePreviewExtensions(cm, () => this.useRichText()); this.display = preview.display;
      this.view = new cm.EditorView({
        parent: this.host.nativeElement,
        state: cm.EditorState.create({ doc: this.source(), extensions: [
          this.vimCompartment.of([]), this.editing.of(this.editableExtensions(this.notes.isReadingMode())),
          cm.history(), cm.drawSelection(), cm.EditorView.lineWrapping,
          cm.keymap.of([...cm.defaultKeymap, ...cm.historyKeymap, ...cm.searchKeymap, cm.indentWithTab]),
          preview.extensions,
          cm.EditorView.contentAttributes.of({ 'aria-label': 'Texto Markdown del bloque', spellcheck: 'true' }),
          cm.EditorView.updateListener.of((update: any) => {
            if (update.docChanged || update.selectionSet) this.updateHeading(update.state.doc.toString(), update.state.selection.main.from);
            if (update.docChanged && !this.destroyed && !this.notes.isReadingMode()) this.changeSource(update.state.doc.toString());
          }),
          cm.EditorView.domEventHandlers({ blur: () => { this.flush(); return false; } }),
        ] }),
      });
      this.ready.set(true); this.configureEditing(this.notes.isReadingMode());
      if (hadFocus) this.view.focus();
      if (this.wantsVim) void this.enableVim();
    } catch {
      this.view?.destroy(); this.view = undefined;
      this.error.set('No se pudo cargar CodeMirror. Puedes seguir escribiendo aquí o volver al texto enriquecido.');
    } finally { if (!this.destroyed) this.loading.set(false); }
  }
  private editableExtensions(reading: boolean): any[] {
    return [this.cm!.EditorState.readOnly.of(reading), this.cm!.EditorView.editable.of(!reading)];
  }
  private configureEditing(reading: boolean): void {
    if (!this.view) return;
    this.view.dispatch({ effects: [
      this.editing.reconfigure(this.editableExtensions(reading)),
      this.display.of({ live: this.live(), readonly: reading }),
      this.vimCompartment.reconfigure(!reading && this.vimEnabled() ? this.vimExtension : []),
    ] });
  }
  toggleLive(): void {
    this.live.update(value => !value); this.configureEditing(this.notes.isReadingMode());
  }
  changeSource(value: string): void {
    if (this.destroyed || this.notes.isReadingMode()) return;
    this.source.set(value.replace(/\r\n?/g, '\n'));
    clearTimeout(this.timer); this.timer = setTimeout(() => this.flush(), 250);
  }
  flush(): void {
    clearTimeout(this.timer); this.timer = undefined;
    if (this.source() === this.savedSource || !this.ownerNoteId) return;
    const html = markdownHtml(this.source()); this.readingHtml.set(html);
    this.notes.updateBlockContent(this.block.id, { format: 'markdown', markdown: this.source(), html }, this.ownerNoteId);
    this.savedSource = this.source();
  }
  useRichText(): void {
    if (this.notes.isReadingMode() || this.destroyed) return;
    this.flush();
    this.notes.updateBlockContent(this.block.id, { format: 'richtext', html: markdownHtml(this.source()) }, this.ownerNoteId);
    this.richTextRequested.emit();
  }
  toggleVim(): void {
    if (!this.ready() || this.notes.isReadingMode()) return;
    if (this.vimEnabled() || this.vimLoading()) {
      this.vimRequest++; this.wantsVim = false; this.vimEnabled.set(false); this.vimLoading.set(false);
      this.configureEditing(false); this.saveVimPreference(false); this.view.focus();
    } else { this.wantsVim = true; void this.enableVim(); }
  }
  private async enableVim(): Promise<void> {
    const request = ++this.vimRequest; this.vimLoading.set(true); this.vimError.set('');
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const plugin = await Promise.race([
        this.cm!.loadVim(),
        new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('timeout')), 15000); }),
      ]);
      if (this.destroyed || request !== this.vimRequest) return;
      this.vimExtension = plugin.vim({ status: true }); this.vimEnabled.set(true);
      this.configureEditing(this.notes.isReadingMode()); this.saveVimPreference(true);
    } catch {
      if (!this.destroyed && request === this.vimRequest) { this.vimEnabled.set(false); this.vimError.set('No se pudo cargar Vim. El editor sigue disponible.'); }
    } finally { clearTimeout(timer); if (!this.destroyed && request === this.vimRequest) this.vimLoading.set(false); }
  }
  private saveVimPreference(enabled: boolean): void {
    try { localStorage.setItem('weave_markdown_vim', String(enabled)); } catch {}
  }
  insertReference(): void {
    if (this.notes.isReadingMode()) return;
    const selection = this.selection();
    const position = selection ? { from: selection.from, to: selection.to } : { from: this.source().length, to: this.source().length };
    const previousSource = this.source();
    this.references.open(this.ownerNoteId!, target => {
      if (this.destroyed || this.notes.isReadingMode() || this.notes.currentNote()?._id !== this.ownerNoteId) return;
      const label = target.title.replace(/([\\\[\]])/g, '\\$1');
      const text = `[${label}](${documentHref(target._id)})`;
      // If the source changed while the picker was open, insert at the current caret.
      this.insert(text, this.source() === previousSource ? position : undefined);
    });
  }
  private selection(): MarkdownSelection {
    if (this.view) return this.view.state.selection.main;
    const textarea = this.fallback?.nativeElement;
    return { from: textarea?.selectionStart ?? this.source().length, to: textarea?.selectionEnd ?? this.source().length };
  }
  refreshSelection(): void { this.updateHeading(this.source(), this.selection().from); }
  private updateHeading(source: string, position: number): void {
    const line = source.slice(source.lastIndexOf('\n', position - 1) + 1).split('\n')[0];
    this.headingLevel.set(String(line.match(/^(#{1,6})\s/)?.[1].length || 0));
  }
  format(value: MarkdownFormat): void {
    if (this.destroyed || this.notes.isReadingMode()) return;
    const selection = this.selection();
    if (this.live() && markdownParts(this.source()).some(part => part.type === 'html' &&
      selection.from < part.to && selection.to >= part.from)) {
      this.useRichText(); return;
    }
    const edit = formatMarkdown(this.source(), selection, value);
    if (this.view) {
      this.view.dispatch({ changes: { from: edit.from, to: edit.to, insert: edit.insert }, selection: { anchor: edit.anchor, head: edit.head }, scrollIntoView: true });
      this.view.focus();
    } else {
      this.changeSource(this.source().slice(0, edit.from) + edit.insert + this.source().slice(edit.to));
      const textarea = this.fallback?.nativeElement;
      if (textarea) { textarea.value = this.source(); textarea.focus(); textarea.setSelectionRange(edit.anchor, edit.head); }
      this.refreshSelection();
    }
    this.flush();
  }
  setHeading(value: string): void { this.format(`h${Number(value)}`); }
  history(redo = false): void {
    if (!this.view || this.notes.isReadingMode()) return;
    const command = this.cm!.historyKeymap.find(binding => binding.key === (redo ? 'Mod-y' : 'Mod-z'))?.run;
    command?.(this.view); this.view.focus(); this.flush();
  }
  insertTable(): void { this.insert('\n\n| Columna 1 | Columna 2 |\n| --- | --- |\n|  |  |\n'); }
  private insert(text: string, at?: { from: number; to: number }): void {
    if (this.notes.isReadingMode()) return;
    if (this.view) {
      const range = at || this.view.state.selection.main;
      this.view.dispatch({ changes: { from: range.from, to: range.to, insert: text }, selection: { anchor: range.from + text.length }, scrollIntoView: true });
      this.view.focus();
    } else {
      const range = at || this.selection();
      this.changeSource(this.source().slice(0, range.from) + text + this.source().slice(range.to));
    }
    this.flush();
  }
  ngOnDestroy(): void {
    this.flush(); this.destroyed = true; this.vimRequest++; this.view?.destroy(); this.view = undefined;
  }
}
