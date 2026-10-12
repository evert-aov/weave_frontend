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
import loader from '@monaco-editor/loader';
import { Block } from '../../core/models/block.model';
import { NotesService } from '../../core/services/notes.service';
import { I18nService } from '../../core/services/i18n.service';
import { ThemeService } from '../../core/services/theme.service';

/**
 * Bloque de Código con Monaco Editor.
 * Configurado con scrollBeyondLastLine: false, altura automática según líneas y cambio de lenguaje.
 */
@Component({
  selector: 'app-code-block',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './code-block.component.html',
  styleUrls: ['./code-block.component.scss'],
})
export class CodeBlockComponent implements OnInit, OnDestroy {
  @Input({ required: true }) block!: Block;
  @ViewChild('monacoContainer', { static: true })
  monacoContainer!: ElementRef<HTMLDivElement>;

  private readonly notesService = inject(NotesService);
  private readonly themeService = inject(ThemeService);
  readonly i18n = inject(I18nService);

  readonly isCopied = signal<boolean>(false);
  readonly currentLine = signal<number>(1);
  readonly currentCol = signal<number>(1);
  readonly editorHeight = signal<number>(120);

  currentLanguage = 'python';
  private monacoEditor?: any;
  private syncTimeout?: any;

  constructor() {
    effect(() => {
      const isReading = this.notesService.isReadingMode();
      if (this.monacoEditor) {
        this.monacoEditor.updateOptions({
          readOnly: isReading,
          domReadOnly: isReading,
        });
      }
    });
  }

  ngOnInit(): void {
    this.currentLanguage = this.block.content?.['language'] || 'python';
    this.initMonaco();
  }

  ngOnDestroy(): void {
    clearTimeout(this.syncTimeout);
    if (this.monacoEditor) {
      this.monacoEditor.dispose();
    }
  }

  private initMonaco(): void {
    loader.init().then((monaco) => {
      const initialCode =
        this.block.content?.['code'] ||
        'def attention(query, key, value):\n    scores = query @ key.transpose(-2, -1)\n    weights = scores.softmax(dim=-1)\n    return weights @ value';

      this.monacoEditor = monaco.editor.create(
        this.monacoContainer.nativeElement,
        {
          value: initialCode,
          language: this.currentLanguage,
          theme: 'vs-dark',
          fontSize: 12,
          fontFamily: "'JetBrains Mono', monospace",
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          automaticLayout: true,
          lineNumbers: 'on',
          overviewRulerLanes: 0,
          hideCursorInOverviewRuler: true,
          renderLineHighlight: 'all',
          scrollbar: {
            vertical: 'hidden',
            horizontal: 'auto',
          },
        },
      );

      this.updateAutoHeight();

      // Ajuste automático de altura según la cantidad de líneas
      this.monacoEditor.onDidChangeModelContent(() => {
        this.updateAutoHeight();
        const code = this.monacoEditor.getValue();

        clearTimeout(this.syncTimeout);
        this.syncTimeout = setTimeout(() => {
          this.notesService.updateBlockContent(this.block.id, {
            code,
            language: this.currentLanguage,
          });
        }, 500);
      });

      // Actualizar cursor de línea y columna
      this.monacoEditor.onDidChangeCursorPosition((e: any) => {
        this.currentLine.set(e.position.lineNumber);
        this.currentCol.set(e.position.column);
      });
    });
  }

  onLanguageChange(): void {
    if (this.monacoEditor) {
      const monaco = (window as any).monaco;
      if (monaco) {
        monaco.editor.setModelLanguage(
          this.monacoEditor.getModel(),
          this.currentLanguage,
        );
      }
      this.notesService.updateBlockContent(this.block.id, {
        code: this.monacoEditor.getValue(),
        language: this.currentLanguage,
      });
    }
  }

  copyCode(): void {
    if (this.monacoEditor) {
      navigator.clipboard.writeText(this.monacoEditor.getValue()).then(() => {
        this.isCopied.set(true);
        setTimeout(() => this.isCopied.set(false), 2000);
      });
    }
  }

  private updateAutoHeight(): void {
    if (!this.monacoEditor) return;
    const lineCount = this.monacoEditor.getModel()?.getLineCount() || 1;
    const computedHeight = Math.max(80, Math.min(600, lineCount * 19 + 20));
    this.editorHeight.set(computedHeight);
    this.monacoEditor.layout();
  }
}
