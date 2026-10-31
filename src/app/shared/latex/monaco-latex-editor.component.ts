import { FullscreenPanelDirective } from '../directives/fullscreen-panel.directive';
import { IconComponent } from '../components/icon/icon.component';
import { AfterViewInit, Component, ElementRef, EventEmitter, Input, OnChanges, OnDestroy, Output, ViewChild, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type * as Monaco from 'monaco-editor';
import { ThemeService } from '../../core/services/theme.service';
import { MonacoRuntimeService, VimAdapter } from '../monaco/monaco-runtime.service';
import { EditorKeybindingsService } from '../monaco/editor-keybindings.service';
import { LatexAutocompleteDirective } from './latex-autocomplete.directive';
import { LATEX_DOCUMENT_LANGUAGE, LATEX_MATH_LANGUAGE, registerLatexLanguage } from './monaco-latex-language';

@Component({
  selector: 'app-monaco-latex-editor', standalone: true,
  host: { '[class.fill]': 'fill' },
  imports: [FormsModule, LatexAutocompleteDirective, FullscreenPanelDirective, IconComponent],
  template: `
    <div class="monaco-panel" appFullscreenPanel #fullscreen="fullscreenPanel" [class.fill]="fill">
    @if (showToolbar) {
    <div class="source-toolbar">
      <span>{{ ready() ? 'Monaco · LaTeX' : (loadError() ? 'Editor de respaldo' : 'Preparando Monaco…') }}</span>
      @if (showFullscreen) {
        <button type="button" (click)="fullscreen.toggle()" [attr.aria-pressed]="fullscreen.expanded()" [title]="fullscreen.expanded() ? 'Salir de pantalla completa' : 'Editor en pantalla completa'" aria-label="Pantalla completa del editor">
          <app-icon [name]="fullscreen.expanded() ? 'minimize' : 'maximize'" [size]="14" />
        </button>
      }
      <button type="button" (click)="toggleVim()" [disabled]="!ready() || readonly || vimLoading()"
        [attr.aria-pressed]="vimActive()" title="Activar o desactivar atajos Vim">{{ vimLoading() ? 'Cargando Vim…' : 'Vim' }}</button>
    </div>
    }
    @if (loadError()) { <p role="alert">{{ loadError() }} <button type="button" (click)="initialize()">Reintentar</button></p> }
    @if (vimError()) { <p role="alert">{{ vimError() }}</p> }
    @if (!ready()) {
      <textarea #fallback appLatexAutocomplete [latexDocument]="documentMode" [ngModel]="value" (ngModelChange)="fallbackChanged($event)"
        [readOnly]="readonly" [attr.aria-label]="label" [style.min-height.px]="height" spellcheck="false" maxlength="300000"
        (keydown)="fallbackKeydown($event)"></textarea>
    }
    <div #host class="monaco-host" [hidden]="!ready()" [style.height.px]="fill || fullscreen.expanded() ? null : actualHeight()"></div>
    <div #vimStatus class="vim-status" [hidden]="!vimActive()" aria-live="polite"></div>
    @if (vimActive()) { <span class="hint">i: insertar · Esc: normal · v: seleccionar · /: buscar · u: deshacer</span> }
    </div>
  `,
  styles: [`
    .monaco-panel.fill,.monaco-panel.panel-fullscreen { display:flex; flex-direction:column; height:100%; min-height:0; }
    .monaco-panel.panel-fullscreen { position:fixed; inset:0; z-index:10000; width:100%; background:var(--bg,#fff); color:var(--text); }
    .monaco-panel.panel-fullscreen .monaco-host,.monaco-panel.panel-fullscreen textarea { flex:1; min-height:0 !important; }
    :host.fill { display:flex; flex-direction:column; height:100%; min-height:0; }
    :host.fill .monaco-host, :host.fill textarea { flex:1; min-height:0 !important; }
    :host { display:block; min-width:0; }
    .source-toolbar { display:flex; align-items:center; justify-content:space-between; gap:8px; padding:6px 8px; font-size:11px; color:var(--muted); background:var(--panel); border:1px solid var(--border); border-radius:6px 6px 0 0; }
    button { border:1px solid var(--border); border-radius:4px; padding:3px 10px; color:var(--text); background:var(--bg); cursor:pointer; }
    button[aria-pressed=true] { color:var(--accent); border-color:var(--accent); background:var(--accent-soft); }
    button:disabled { opacity:.5; cursor:default; }
    button:focus-visible { outline:2px solid var(--accent); outline-offset:2px; }
    .monaco-host { width:100%; border:1px solid var(--border); }
    textarea { display:block; width:100%; box-sizing:border-box; padding:12px; font:13px/1.6 monospace; color:var(--text); background:var(--bg); border:1px solid var(--border); resize:vertical; }
    p { color:#dc2626; font-size:12px; padding:6px; }
    .vim-status,.hint { display:block; padding:4px 8px; font:11px/1.5 monospace; color:var(--muted); background:var(--panel); overflow-wrap:anywhere; }
    .vim-status[hidden] { display:none; }
    :host ::ng-deep .vim-status input { color:var(--text); background:var(--bg); border:1px solid var(--border); width:min(100%,400px); }
  `],
})
export class MonacoLatexEditorComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input() value = '';
  @Input() readonly = false;
  @Input() documentMode = false;
  @Input() height = 360;
  @Input() fill = false;
  @Input() showFullscreen = true;
  @Input() showToolbar = true;
  @Input() compact = false;
  @Input() label = 'Código LaTeX';
  @Output() valueChange = new EventEmitter<string>();
  @Output() submitEditor = new EventEmitter<void>();
  @ViewChild('host', {static:true}) host!: ElementRef<HTMLElement>;
  @ViewChild('vimStatus', {static:true}) vimStatus!: ElementRef<HTMLElement>;
  @ViewChild('fallback') fallback?: ElementRef<HTMLTextAreaElement>;
  private readonly runtime = inject(MonacoRuntimeService);
  readonly preferences = inject(EditorKeybindingsService);
  private readonly theme = inject(ThemeService);
  readonly ready = signal(false);
  readonly loadError = signal('');
  readonly vimError = signal('');
  readonly vimActive = signal(false);
  readonly vimLoading = signal(false);
  readonly actualHeight = signal(360);
  private monaco?: typeof Monaco;
  private editor?: Monaco.editor.IStandaloneCodeEditor;
  private model?: Monaco.editor.ITextModel;
  private vim?: VimAdapter;
  private readonly listeners: Monaco.IDisposable[] = [];
  private destroyed = false;
  private initializing = false;
  private syncing = false;
  private vimVersion = 0;
  private insertMode = false;
  private acceptedValue = '';

  constructor() {
    effect(() => { this.preferences.vim(); void this.syncVim(); });
    effect(() => {
      const dark = this.theme.isDark();
      this.monaco?.editor.setTheme(dark ? 'vs-dark' : 'vs');
    });
  }
  ngAfterViewInit(): void { void this.initialize(); }
  ngOnChanges(): void {
    this.actualHeight.set(this.compact ? Math.max(100, this.height) : this.height);
    if (!this.editor || !this.model) return;
    if (this.model.getValue() !== this.value) {
      this.syncing = true;
      this.model.setValue(this.value); this.acceptedValue = this.value;
      this.syncing = false;
    }
    this.editor.updateOptions({ readOnly:this.readonly, domReadOnly:this.readonly, ariaLabel:this.label });
    this.monaco!.editor.setModelLanguage(this.model, this.language());
    this.resize(); void this.syncVim();
  }
  private language(): string { return this.documentMode ? LATEX_DOCUMENT_LANGUAGE : LATEX_MATH_LANGUAGE; }

  async initialize(): Promise<void> {
    if (this.initializing || this.editor || this.destroyed) return;
    this.initializing = true; this.loadError.set('');
    try {
      const monaco = await this.runtime.load();
      if (this.destroyed) return;
      this.monaco = monaco; registerLatexLanguage(monaco);
      this.model = monaco.editor.createModel(this.value, this.language());
      this.acceptedValue = this.value;
      const fallbackFocused = this.fallback?.nativeElement === document.activeElement;
      const caret = this.fallback?.nativeElement.selectionStart ?? 0;
      this.editor = monaco.editor.create(this.host.nativeElement, {
        model:this.model, theme:this.theme.isDark() ? 'vs-dark' : 'vs', readOnly:this.readonly, domReadOnly:this.readonly,
        automaticLayout:true, ariaLabel:this.label, fontSize:13, lineHeight:21, minimap:{enabled:false},
        scrollBeyondLastLine:false, wordWrap:'on', lineNumbers:this.compact ? 'off' : 'on', tabSize:2,
        overviewRulerLanes:0, padding:{top:10,bottom:10}, tabCompletion:'on',
        quickSuggestions:{other:true,comments:false,strings:false}, acceptSuggestionOnEnter:'off',
        suggest:{showWords:false}, snippetSuggestions:'top', unicodeHighlight:{ambiguousCharacters:false},
      });
      // Register application shortcuts before monaco-vim, whose handler respects preventDefault.
      this.listeners.push(this.editor.onKeyDown(event => {
        const key = event.browserEvent;
        if ((key.ctrlKey || key.metaKey) && key.key === 'Enter') {
          event.preventDefault(); event.stopPropagation(); this.submitEditor.emit(); return;
        }
        if (key.key === 'Tab' && this.vim && this.insertMode) {
          const snippet = this.editor?.getContribution('snippetController2') as {isInSnippet():boolean;next():void;prev():void} | null;
          if (this.host.nativeElement.querySelector('.suggest-widget.visible')) {
            event.preventDefault(); event.stopPropagation(); this.editor?.trigger('latex', 'acceptSelectedSuggestion', {});
          } else if (snippet?.isInSnippet()) {
            event.preventDefault(); event.stopPropagation(); key.shiftKey ? snippet.prev() : snippet.next();
          }
        }
      }));
      this.listeners.push(this.model.onDidChangeContent(() => this.modelChanged()));
      this.listeners.push(this.editor.onDidContentSizeChange(() => this.resize()));
      this.ready.set(true); this.resize();
      if (fallbackFocused) { this.editor.setPosition(this.model.getPositionAt(caret)); this.editor.focus(); }
      void this.syncVim();
    } catch {
      this.listeners.splice(0).forEach(listener => listener.dispose());
      this.editor?.dispose(); this.model?.dispose(); this.editor = undefined; this.model = undefined;
      if (!this.destroyed) { this.ready.set(false); this.loadError.set('No se pudo cargar Monaco. Puedes seguir escribiendo y guardar aquí.'); }
    } finally { this.initializing = false; }
  }
  private modelChanged(): void {
    if (this.syncing || this.destroyed || !this.model) return;
    const value = this.model.getValue();
    if (this.readonly || value.length > 300000) {
      this.syncing = true; this.model.setValue(this.acceptedValue); this.syncing = false; return;
    }
    this.acceptedValue = value; this.value = value; this.valueChange.emit(value);
  }
  fallbackChanged(value: string): void {
    if (this.readonly || this.destroyed || value.length > 300000) return;
    this.value = value; this.acceptedValue = value; this.valueChange.emit(value);
  }
  fallbackKeydown(event: KeyboardEvent): void {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault(); event.stopPropagation(); this.submitEditor.emit();
    }
  }
  focus(): void { if (this.editor) this.editor.focus(); else this.fallback?.nativeElement.focus(); }
  insertSource(template: string): void {
    if (this.readonly || this.destroyed) return;
    const selection = this.editor?.getSelection();
    const area = this.fallback?.nativeElement;
    const start = selection && this.model ? this.model.getOffsetAt(selection.getStartPosition()) : area?.selectionStart ?? this.value.length;
    const end = selection && this.model ? this.model.getOffsetAt(selection.getEndPosition()) : area?.selectionEnd ?? start;
    const selected = this.value.slice(start, end);
    const text = selected ? template.replace(/\{(?:a|x|f\(x\))\}/, () => `{${selected}}`) : template;
    if (this.value.length - (end-start) + text.length > 300000) return;
    const placeholder = text.search(/\{[a-z0-9_]*\}/i);
    const cursor = start + (placeholder < 0 ? text.length : placeholder+1);
    if (this.editor && selection && this.model) {
      this.editor.pushUndoStop(); this.editor.executeEdits('latex-palette', [{range:selection,text}]); this.editor.pushUndoStop();
      this.editor.setPosition(this.model.getPositionAt(cursor)); this.editor.focus();
    } else {
      this.fallbackChanged(this.value.slice(0,start) + text + this.value.slice(end));
      if (area) { area.value = this.value; area.focus(); area.setSelectionRange(cursor,cursor); }
    }
  }
  toggleVim(): void { this.preferences.setVim(!this.vimActive()); void this.syncVim(); }
  private async syncVim(): Promise<void> {
    const enabled = this.preferences.vim();
    if (enabled && !this.readonly && this.vim) return;
    const version = ++this.vimVersion;
    this.vim?.dispose(); this.vim = undefined; this.vimActive.set(false); this.vimLoading.set(false);
    if (!enabled || this.readonly || !this.editor || this.destroyed) return;
    this.vimLoading.set(true); this.vimError.set('');
    try {
      const module = await this.runtime.loadVim();
      if (this.destroyed || version !== this.vimVersion || this.readonly || !this.preferences.vim()) return;
      this.vim = module.initVimMode(this.editor, this.vimStatus.nativeElement);
      this.insertMode = false;
      this.vim.on('vim-mode-change', mode => { this.insertMode = mode.mode === 'insert'; });
      this.vimActive.set(true);
    } catch (error) {
      if (!this.destroyed && version === this.vimVersion) this.vimError.set(error instanceof Error ? error.message : 'No se pudo cargar Vim.');
    } finally { if (!this.destroyed && version === this.vimVersion) this.vimLoading.set(false); }
  }
  private resize(): void {
    if (this.compact && this.editor) this.actualHeight.set(Math.min(420, Math.max(100, this.editor.getContentHeight())));
  }
  ngOnDestroy(): void {
    this.destroyed = true; this.vimVersion++;
    this.vim?.dispose(); this.listeners.forEach(listener=>listener.dispose());
    this.editor?.dispose(); this.model?.dispose();
  }
}
