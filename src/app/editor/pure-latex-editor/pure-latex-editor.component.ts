import { AiDocumentService } from '../../core/services/ai-document.service';
import { cleanLatexSource } from '../../core/utils/ai-edit-text';
import { Component, Input, OnChanges, OnDestroy, ViewChild, computed, inject, signal } from '@angular/core';
import { FullscreenPanelDirective } from '../../shared/directives/fullscreen-panel.directive';
import { Note } from '../../core/models/note.model';
import { NotesService } from '../../core/services/notes.service';
import { IconComponent } from '../../shared/components/icon/icon.component';
import { MonacoLatexEditorComponent } from '../../shared/latex/monaco-latex-editor.component';
import { LatexPreviewComponent } from '../../shared/latex/latex-preview.component';
import { downloadLatexFile } from '../../shared/latex/latex-compiler.service';
import { EditorKeybindingsService } from '../../shared/monaco/editor-keybindings.service';

const TEMPLATE = String.raw`\documentclass[10pt,a4paper]{article}
\usepackage[utf8]{inputenc}
\usepackage[spanish]{babel}
\usepackage{amsmath,amssymb,geometry,multicol,booktabs,array}
\usepackage[siunitx]{circuitikz}
\usetikzlibrary{babel}
\geometry{margin=1.5cm}
\setlength{\parindent}{0pt}

\begin{document}

\end{document}
`;

@Component({
  selector: 'app-pure-latex-editor', standalone: true,
  imports: [FullscreenPanelDirective, IconComponent, MonacoLatexEditorComponent, LatexPreviewComponent],
  templateUrl: './pure-latex-editor.component.html', styleUrl: './pure-latex-editor.component.scss',
})
export class PureLatexEditorComponent implements OnChanges, OnDestroy {
  @Input({ required: true }) note!: Note;
  @ViewChild(LatexPreviewComponent) preview?: LatexPreviewComponent;
  readonly notes = inject(NotesService);
  private readonly keybindings = inject(EditorKeybindingsService);
  readonly fileError = signal('');
  readonly splitPercent = signal<number>(50);
  readonly isResizing = signal(false);
  readonly vimActive = computed(() => this.keybindings.vim());
  readonly fileName = computed(() => {
    const raw = (this.note?.title || 'documento').trim();
    return raw.toLowerCase().endsWith('.tex') ? raw : `${raw}.tex`;
  });
  source = '';
  private readonly aiDocuments = inject(AiDocumentService);
  private readonly unregisterAi = this.aiDocuments.register({
    owner: () => this.ownerId,
    fields: () => [{ id: 'latex:source', text: this.source }],
    apply: values => { const value = values.get('latex:source'); if (value !== undefined) this.change(cleanLatexSource(value, true)); },
  });
  private ownerId?: string;
  private destroyed = false;
  ngOnChanges(): void {
    if (this.ownerId === this.note._id) return;
    this.ownerId = this.note._id;
    this.source = typeof this.note.docData?.source === 'string' ? this.note.docData.source : '';
    this.fileError.set('');
  }
  change(value: string): void {
    if (this.destroyed || this.notes.isReadingMode()) return;
    if (value.length > 300000) { this.fileError.set('El documento supera 300 000 caracteres.'); return; }
    this.source = value; this.fileError.set('');
    this.notes.updateDocData({ version: 1, source: value }, this.ownerId);
  }
  insertTemplate(): void { if (!this.source.trim()) this.change(TEMPLATE); }
  downloadSource(): void { downloadLatexFile(new Blob([this.source], { type: 'application/x-tex;charset=utf-8' }), this.note.title, 'tex'); }
  toggleVim(): void { this.keybindings.setVim(!this.keybindings.vim()); }
  startSplitResize(event: PointerEvent): void {
    if (event.button !== 0) return;
    const target = event.currentTarget as HTMLElement;
    const container = target.closest('.latex-workspace') as HTMLElement;
    if (!container) return;
    event.preventDefault();
    target.setPointerCapture(event.pointerId);
    this.isResizing.set(true);

    const onPointerMove = (e: PointerEvent) => {
      const rect = container.getBoundingClientRect();
      if (rect.width <= 0) return;
      const percent = Math.min(80, Math.max(20, ((e.clientX - rect.left) / rect.width) * 100));
      this.splitPercent.set(Math.round(percent * 10) / 10);
    };
    const onPointerUp = (e: PointerEvent) => {
      try { target.releasePointerCapture(e.pointerId); } catch {}
      this.isResizing.set(false);
      target.removeEventListener('pointermove', onPointerMove);
      target.removeEventListener('pointerup', onPointerUp);
    };
    target.addEventListener('pointermove', onPointerMove);
    target.addEventListener('pointerup', onPointerUp);
  }
  resetSplit(): void { this.splitPercent.set(50); }
  async importSource(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement; const file = input.files?.[0]; input.value = '';
    if (!file || this.notes.isReadingMode()) return;
    if (!/\.tex$/i.test(file.name) || file.size > 1200000) { this.fileError.set('Selecciona un archivo .tex de hasta 1,2 MB.'); return; }
    const owner = this.ownerId; const before = this.source;
    try {
      const source = await file.text();
      if (owner !== this.ownerId || this.notes.isReadingMode()) return;
      if (this.source !== before) { this.fileError.set('El contenido cambió durante la importación. Vuelve a seleccionar el archivo.'); return; }
      this.change(source);
    } catch { this.fileError.set('No se pudo leer el archivo.'); }
  }
  keydown(event: KeyboardEvent): void {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault(); event.stopPropagation(); this.preview?.compile();
    }
  }
  ngOnDestroy(): void { this.unregisterAi(); this.destroyed = true; }
}
