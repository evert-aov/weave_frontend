import {
  Component,
  Input,
  OnInit,
  OnDestroy,
  ElementRef,
  ViewChild,
  inject,
  signal,
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
  template: `
    <div class="code-block-card">
      <!-- Barra superior con selector de lenguaje y botón copiar -->
      <div class="code-topbar">
        <div class="lang-selector">
          <i class="lang-dot"></i>
          <select [(ngModel)]="currentLanguage" (change)="onLanguageChange()">
            <option value="python">Python</option>
            <option value="typescript">TypeScript</option>
            <option value="javascript">JavaScript</option>
            <option value="json">JSON</option>
            <option value="html">HTML</option>
            <option value="css">CSS</option>
            <option value="sql">SQL</option>
          </select>
        </div>
        <button type="button" class="copy-btn" (click)="copyCode()">
          {{ isCopied() ? i18n.t('block.code.copied') : i18n.t('block.code.copy') }}
        </button>
      </div>

      <!-- Contenedor del editor Monaco -->
      <div #monacoContainer class="monaco-mount" [style.height.px]="editorHeight()"></div>

      <!-- Barra inferior de estado -->
      <div class="code-statusbar">
        <span>Ln {{ currentLine() }}, Col {{ currentCol() }}</span>
        <span>UTF-8 &nbsp;&nbsp; Spaces: 2</span>
      </div>
    </div>
  `,
  styles: [
    `
      .code-block-card {
        background: var(--code);
        border: 1px solid color-mix(in srgb, var(--border-strong) 45%, transparent);
        border-radius: 9px;
        color: #d7deea;
        overflow: hidden;
        box-shadow: 0 10px 26px rgba(0, 0, 0, 0.08);
        margin: 6px 0;
      }
      .code-topbar {
        height: 38px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0 14px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        font-size: 10px;
        color: #8993a7;
      }
      .lang-selector {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .lang-dot {
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: #e5b64d;
      }
      select {
        background: transparent;
        border: none;
        color: #d7deea;
        font-size: 11px;
        font-weight: 500;
        outline: none;
        cursor: pointer;
      }
      select option {
        background: #171a24;
        color: #ffffff;
      }
      .copy-btn {
        font-size: 10px;
        color: #8993a7;
        padding: 2px 8px;
        border-radius: 4px;
        transition: color 0.15s ease;
      }
      .copy-btn:hover {
        color: #ffffff;
        background: rgba(255, 255, 255, 0.08);
      }
      .monaco-mount {
        width: 100%;
        transition: height 0.1s ease;
      }
      .code-statusbar {
        display: flex;
        justify-content: space-between;
        padding: 6px 14px;
        background: rgba(255, 255, 255, 0.04);
        font-size: 9px;
        color: #687286;
        font-family: 'JetBrains Mono', monospace;
      }
    `,
  ],
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
