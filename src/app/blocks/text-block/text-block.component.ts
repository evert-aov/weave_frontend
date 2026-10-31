import { AiDocumentService } from '../../core/services/ai-document.service';
import { domTextFields, applyHtmlText } from '../../core/utils/ai-edit-text';
import type { SelectionBookmark } from '@tiptap/pm/state';
import { markdownHtml } from '../../shared/markdown/markdown-document';
import {
  Component,
  Input,
  OnInit,
  OnDestroy,
  ElementRef,
  ViewChild,
  inject,
  signal,
  effect,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import { DOMParser as ProseMirrorDOMParser } from '@tiptap/pm/model';
import { handlePaste as pasteTableCells } from '@tiptap/pm/tables';
import { NotesService } from '../../core/services/notes.service';
import { AuthService } from '../../core/services/auth.service';
import { Block } from '../../core/models/block.model';
import { I18nService } from '../../core/services/i18n.service';
import { IconComponent } from '../../shared/components/icon/icon.component';
import { clipboardTableHtml } from '../../shared/utils/clipboard-table';
import { tableActions, TableAction, textTableExtensions } from './table.extensions';
import { DocumentReferenceService } from '../../core/services/document-reference.service';
import { documentHref, documentIdFromHref } from '../../core/utils/document-link';

export type StyleTargetElement = 'p' | 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';

export interface ElementStyleConfig {
  color?: string;
  fontSize?: string;
  fontFamily?: string;
}

export type BlockStyles = Partial<Record<StyleTargetElement, ElementStyleConfig>>;

export interface StyleTemplate {
  id: string;
  name: string;
  styles: BlockStyles;
  isDefault?: boolean;
}

/**
 * Plantillas predeterminadas de fábrica para estilos de bloques
 */
const DEFAULT_STYLE_TEMPLATES: StyleTemplate[] = [
  {
    id: 'tpl-default',
    name: 'Por Defecto Weave',
    styles: {},
    isDefault: true,
  },
  {
    id: 'tpl-terminal',
    name: 'Terminal Retro (Courier)',
    styles: {
      p: { color: '#22c55e', fontSize: '15px', fontFamily: "'Courier New', Courier, monospace" },
      h1: { color: '#ef4444', fontSize: '26px', fontFamily: "'Courier New', Courier, monospace" },
      h2: { color: '#10b981', fontSize: '22px', fontFamily: "'Courier New', Courier, monospace" },
      h3: { color: '#f59e0b', fontSize: '19px', fontFamily: "'Courier New', Courier, monospace" },
      h4: { color: '#3b82f6', fontSize: '17px', fontFamily: "'Courier New', Courier, monospace" },
      h5: { color: '#8b5cf6', fontSize: '15.5px', fontFamily: "'Courier New', Courier, monospace" },
      h6: { color: '#ec4899', fontSize: '14.5px', fontFamily: "'Courier New', Courier, monospace" },
    },
    isDefault: true,
  },
  {
    id: 'tpl-editorial',
    name: 'Editorial Caslon',
    styles: {
      p: { color: '#334155', fontSize: '16.5px', fontFamily: "'Georgia', serif" },
      h1: { color: '#5b50e6', fontSize: '28px', fontFamily: "'Libre Caslon Display', Georgia, serif" },
      h2: { color: '#172033', fontSize: '23px', fontFamily: "'Libre Caslon Display', Georgia, serif" },
      h3: { color: '#697386', fontSize: '19px', fontFamily: "'DM Sans', sans-serif" },
      h4: { color: '#5b50e6', fontSize: '17px', fontFamily: "'DM Sans', sans-serif" },
    },
    isDefault: true,
  },
  {
    id: 'tpl-cyber',
    name: 'Cyber Monospace',
    styles: {
      p: { color: '#94a3b8', fontSize: '15px', fontFamily: "'JetBrains Mono', monospace" },
      h1: { color: '#3b82f6', fontSize: '26px', fontFamily: "'JetBrains Mono', monospace" },
      h2: { color: '#8b5cf6', fontSize: '22px', fontFamily: "'JetBrains Mono', monospace" },
      h3: { color: '#10b981', fontSize: '19px', fontFamily: "'JetBrains Mono', monospace" },
      h4: { color: '#f59e0b', fontSize: '17px', fontFamily: "'JetBrains Mono', monospace" },
    },
    isDefault: true,
  },
];

/**
 * Bloque de Texto Enriquecido al estilo Trilium.
 * - Soporte completo de encabezados hasta H6.
 * - Barra de herramientas fija / sticky arriba sin tapar el texto.
 * - Panel de personalización con soporte de Plantillas de Estilos guardables.
 * - Aislamiento total de eventos para edición de píxeles y colores manuales sin robo de foco.
 */
@Component({
  selector: 'app-text-block',
  standalone: true,
  imports: [CommonModule, FormsModule, IconComponent],
  templateUrl: './text-block.component.html',
  styleUrls: ['./text-block.component.scss'],
})
export class TextBlockComponent implements OnInit, OnDestroy {
  @Input({ required: true }) block!: Block;
  @ViewChild('editorElement', { static: true })
  editorElement!: ElementRef<HTMLDivElement>;

  private readonly notesService = inject(NotesService);
  private readonly authService = inject(AuthService);
  private readonly references = inject(DocumentReferenceService);
  readonly i18n = inject(I18nService);

  private readonly aiDocuments = inject(AiDocumentService);
  private unregisterAi?: () => void;
  editor?: Editor;
  isFocused = false;
  private updateDebounceTimer?: ReturnType<typeof setTimeout>;
  private readonly editorRevision = signal(0);
  private ownerNoteId?: string;
  readonly isPreview = signal(false);
  private editingSelection?: SelectionBookmark;
  private lastSavedHtml = '';

  readonly showStylePanel = signal<boolean>(false);
  readonly activeTab = signal<'customize' | 'templates'>('customize');
  readonly selectedElement = signal<StyleTargetElement>('p');

  readonly targetElements: StyleTargetElement[] = ['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'];

  blockStyles: BlockStyles = {
    p: {},
    h1: {},
    h2: {},
    h3: {},
    h4: {},
    h5: {},
    h6: {},
  };

  setPreview(preview: boolean): void {
    const editor = this.editor;
    if (!editor || editor.isDestroyed || this.notesService.isReadingMode() || this.isPreview() === preview) return;
    this.flushContent();
    if (preview) {
      this.editingSelection = editor.state.selection.getBookmark();
      this.showStylePanel.set(false); this.isFocused = false;
      editor.commands.blur();
    }
    this.isPreview.set(preview);
    editor.setEditable(!preview, false);
    if (!preview) {
      if (this.editingSelection) editor.view.dispatch(editor.state.tr.setSelection(this.editingSelection.resolve(editor.state.doc)));
      editor.commands.focus(undefined, { scrollIntoView: false });
    }
  }

  private flushContent(force = false): void {
    clearTimeout(this.updateDebounceTimer); this.updateDebounceTimer = undefined;
    if (!this.editor || this.editor.isDestroyed) return;
    const html = this.editor.getHTML();
    if (!force && html === this.lastSavedHtml) return;
    this.notesService.updateBlockContent(this.block.id, {
      format: 'richtext', html, blockStyles: this.blockStyles,
    }, this.ownerNoteId);
    this.lastSavedHtml = html;
  }

  newTemplateName = '';
  readonly allTemplates = signal<StyleTemplate[]>([]);

  constructor() {
    effect(() => {
      const isReading = this.notesService.isReadingMode() || this.isPreview();
      if (this.editor) {
        if (this.editor.isEditable === isReading) this.editor.setEditable(!isReading, false);
        if (isReading) {
          this.showStylePanel.set(false);
          this.isFocused = false;
        }
      }
    });
  }

  ngOnInit(): void {
    this.unregisterAi = this.aiDocuments.register({
      owner: () => this.ownerNoteId,
      fields: () => this.editor ? domTextFields(this.editor.view.dom, `block:${this.block.id}`) : [],
      apply: values => {
        if (!this.editor) return;
        const html = applyHtmlText(this.editor.getHTML(), `block:${this.block.id}`, values);
        this.editor.commands.setContent(html); this.flushContent(true);
      },
    });
    this.ownerNoteId = this.notesService.currentNote()?._id;
    // Older Markdown documents keep their canonical content; migrate only after a real edit.
    const content = this.block.content || {};
    const initialContent = content['format'] === 'markdown' && typeof content['markdown'] === 'string'
      ? markdownHtml(content['markdown']) || '<p></p>' : content['html'] || '<p></p>';

    // Cargar estilos personalizados del bloque persistidos en MongoDB
    if (this.block.content?.['blockStyles']) {
      this.blockStyles = {
        p: { ...this.block.content['blockStyles']?.p },
        h1: { ...this.block.content['blockStyles']?.h1 },
        h2: { ...this.block.content['blockStyles']?.h2 },
        h3: { ...this.block.content['blockStyles']?.h3 },
        h4: { ...this.block.content['blockStyles']?.h4 },
        h5: { ...this.block.content['blockStyles']?.h5 },
        h6: { ...this.block.content['blockStyles']?.h6 },
      };
    }

    this.loadTemplates();

    this.editor = new Editor({
      element: this.editorElement.nativeElement,
      editable: !this.notesService.isReadingMode(),
      extensions: [
        StarterKit.configure({
          heading: {
            levels: [1, 2, 3, 4, 5, 6],
          },
        }),
        Placeholder.configure({
          placeholder:
            this.i18n.currentLang() === 'es'
              ? 'Escribe un texto o toma apuntes...'
              : 'Write text or take notes...',
        }),
        TaskList,
        TaskItem.configure({
          nested: true,
        }),
        ...textTableExtensions,
      ],
      content: initialContent,
      onTransaction: () => this.editorRevision.update((revision) => revision + 1),
      editorProps: {
        handleClick: (_view, _position, event) => {
          const target = event.target instanceof Element ? event.target : null;
          const link = target?.closest('a[href]');
          // ProseMirror procesa handleClick durante mouseup, antes del clic delegado del workspace.
          return !!link && !!documentIdFromHref(link.getAttribute('href') ?? '', window.location.origin);
        },
        transformPastedHTML: (html) => clipboardTableHtml(html, '') ?? html,
        handlePaste: (view, event) => {
          if (!view.editable || this.editor?.isActive('codeBlock') || this.editor?.isActive('code')) return false;
          const html = event.clipboardData?.getData('text/html') ?? '';
          // Las tablas HTML ya pasan por el parser y el plugin de selección de celdas.
          if (/<table[\s>]/i.test(html)) return false;
          const table = clipboardTableHtml(html, event.clipboardData?.getData('text/plain') ?? '');
          if (!table) return false;
          const container = document.createElement('div');
          container.innerHTML = table;
          const slice = ProseMirrorDOMParser.fromSchema(view.state.schema).parseSlice(container);
          if (!pasteTableCells(view, event, slice)) view.dispatch(view.state.tr.replaceSelection(slice).scrollIntoView());
          return true;
        },
      },
      onUpdate: () => {
        clearTimeout(this.updateDebounceTimer);
        this.updateDebounceTimer = setTimeout(() => this.flushContent(), 500);
      },
      onFocus: () => {
        this.isFocused = true;
      },
      onBlur: () => {
        this.isFocused = false;
        this.flushContent();
      },
    });
    // Settle schema normalization (e.g. the trailing paragraph after a table) before
    // recording the baseline. Merely previewing a legacy note must not save it.
    this.editor.view.dispatch(this.editor.state.tr.setMeta('addToHistory', false));
    clearTimeout(this.updateDebounceTimer); this.updateDebounceTimer = undefined;
    this.lastSavedHtml = this.editor.getHTML();
  }

  onRootClick(event: MouseEvent): void {
    if (!this.editor?.isEditable) return;
    // Si el clic ocurrió fuera del panel de estilos, enfocar el editor
    if (!this.showStylePanel()) {
      this.focusEditor();
    }
  }

  focusEditor(): void {
    if (this.editor?.isEditable && !this.editor.isFocused && !this.showStylePanel()) {
      this.editor.commands.focus();
    }
  }

  setParagraph(): void {
    if (this.editor?.isEditable) this.editor.chain().focus().setParagraph().run();
  }

  toggleHeading(level: 1 | 2 | 3 | 4 | 5 | 6): void {
    if (this.editor?.isEditable) this.editor.chain().focus().toggleHeading({ level }).run();
  }

  insertTable(): void {
    if (!this.editor?.isEditable || this.editor.isActive('table')) return;
    const cells = (type: string) => Array.from({ length: 3 }, () => ({ type, content: [{ type: 'paragraph' }] }));
    this.editor.chain().focus().insertContent([
      { type: 'table', content: Array.from({ length: 3 }, (_, row) => ({
        type: 'table_row', content: cells(row === 0 ? 'table_header' : 'table_cell'),
      })) },
      { type: 'paragraph' },
    ]).run();
  }

  tableAction(action: TableAction): void {
    if (!this.editor?.isEditable) return;
    this.editor.chain().focus().command(({ state, dispatch }) => tableActions[action](state, dispatch)).run();
  }

  canTableAction(action: TableAction): boolean {
    this.editorRevision();
    return !!this.editor?.isEditable && tableActions[action](this.editor.state);
  }

  isTableActive(): boolean {
    this.editorRevision();
    return !!this.editor?.isActive('table');
  }

  insertDocumentReference(): void {
    const editor = this.editor;
    if (!editor?.isEditable) return;
    const noteId = this.notesService.currentNote()?._id;
    if (!noteId) return;
    const { from, to } = editor.state.selection;
    this.references.open(noteId, (note) => {
      if (editor.isDestroyed || !editor.isEditable || this.notesService.currentNote()?._id !== noteId) return;
      const href = documentHref(note._id);
      if (from === to) {
        editor.chain().focus().setTextSelection(from).insertContent({
          type: 'text', text: note.title || 'Sin título', marks: [{ type: 'link', attrs: { href, target: null } }],
        }).unsetMark('link', { extendEmptyMarkRange: false }).run();
      } else editor.chain().focus().setTextSelection({ from, to }).setLink({ href, target: null }).run();
    }, () => { if (!editor.isDestroyed) editor.commands.focus(); });
  }

  /* Control del Panel de Estilos Personalizados */
  toggleStylePanel(event?: MouseEvent): void {
    if (event) {
      event.stopPropagation();
    }
    this.showStylePanel.set(!this.showStylePanel());
  }

  getCurrentElementColor(): string {
    const el = this.selectedElement();
    return this.blockStyles[el]?.color || '';
  }

  setCurrentElementColor(color: string): void {
    const el = this.selectedElement();
    if (!this.blockStyles[el]) {
      this.blockStyles[el] = {};
    }
    this.blockStyles[el]!.color = color;
    this.saveBlockStyles();
  }

  onCustomColorChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input) {
      this.setCurrentElementColor(input.value);
    }
  }

  getCurrentElementSize(): string {
    const el = this.selectedElement();
    return this.blockStyles[el]?.fontSize || '';
  }

  setCurrentElementSize(size: string): void {
    const el = this.selectedElement();
    if (!this.blockStyles[el]) {
      this.blockStyles[el] = {};
    }
    this.blockStyles[el]!.fontSize = size;
    this.saveBlockStyles();
  }

  onManualSizeInput(val: string): void {
    this.setCurrentElementSize(val ? val.trim() : '');
  }

  getCurrentElementFont(): string {
    const el = this.selectedElement();
    return this.blockStyles[el]?.fontFamily || '';
  }

  onCustomFontChange(event: Event): void {
    const select = event.target as HTMLSelectElement;
    if (select) {
      const el = this.selectedElement();
      if (!this.blockStyles[el]) {
        this.blockStyles[el] = {};
      }
      this.blockStyles[el]!.fontFamily = select.value;
      this.saveBlockStyles();
    }
  }

  resetCurrentElementStyle(): void {
    const el = this.selectedElement();
    this.blockStyles[el] = {};
    this.saveBlockStyles();
  }

  /* Gestión de Plantillas de Estilo */
  private getTemplatesStorageKey(): string {
    const uid = this.authService.currentUser()?.id || 'default';
    return `weave_user_style_templates_${uid}`;
  }

  private loadTemplates(): void {
    let customTemplates: StyleTemplate[] = [];
    try {
      const stored = localStorage.getItem(this.getTemplatesStorageKey());
      if (stored) {
        customTemplates = JSON.parse(stored);
      }
    } catch {
      customTemplates = [];
    }
    this.allTemplates.set([...DEFAULT_STYLE_TEMPLATES, ...customTemplates]);
  }

  applyTemplate(template: StyleTemplate): void {
    this.blockStyles = JSON.parse(JSON.stringify(template.styles || {}));
    this.saveBlockStyles();
  }

  saveCurrentAsTemplate(): void {
    const name = this.newTemplateName.trim();
    if (!name) return;

    const newTemplate: StyleTemplate = {
      id: `tpl-${Date.now()}`,
      name,
      styles: JSON.parse(JSON.stringify(this.blockStyles)),
      isDefault: false,
    };

    let userTemplates: StyleTemplate[] = [];
    try {
      const stored = localStorage.getItem(this.getTemplatesStorageKey());
      if (stored) {
        userTemplates = JSON.parse(stored);
      }
    } catch {
      userTemplates = [];
    }

    userTemplates.push(newTemplate);
    localStorage.setItem(this.getTemplatesStorageKey(), JSON.stringify(userTemplates));

    this.newTemplateName = '';
    this.loadTemplates();
  }

  deleteCustomTemplate(templateId: string): void {
    try {
      const stored = localStorage.getItem(this.getTemplatesStorageKey());
      if (stored) {
        const userTemplates: StyleTemplate[] = JSON.parse(stored);
        const filtered = userTemplates.filter((t) => t.id !== templateId);
        localStorage.setItem(this.getTemplatesStorageKey(), JSON.stringify(filtered));
        this.loadTemplates();
      }
    } catch {
      // Ignorar error
    }
  }

  private saveBlockStyles(): void {
    if (!this.editor?.isEditable) return;
    this.blockStyles = { ...this.blockStyles };
    this.flushContent(true);
  }

  ngOnDestroy(): void {
    this.unregisterAi?.();
    this.flushContent();
    this.editor?.destroy();
  }
}
