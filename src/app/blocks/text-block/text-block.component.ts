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
import { NotesService } from '../../core/services/notes.service';
import { AuthService } from '../../core/services/auth.service';
import { Block } from '../../core/models/block.model';
import { I18nService } from '../../core/services/i18n.service';
import { IconComponent } from '../../shared/components/icon/icon.component';

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
      p: { color: '#22c55e', fontSize: '13.5px', fontFamily: "'Courier New', Courier, monospace" },
      h1: { color: '#ef4444', fontSize: '15px', fontFamily: "'Courier New', Courier, monospace" },
      h2: { color: '#10b981', fontSize: '14px', fontFamily: "'Courier New', Courier, monospace" },
      h3: { color: '#f59e0b', fontSize: '13px', fontFamily: "'Courier New', Courier, monospace" },
      h4: { color: '#3b82f6', fontSize: '12px', fontFamily: "'Courier New', Courier, monospace" },
      h5: { color: '#8b5cf6', fontSize: '11.5px', fontFamily: "'Courier New', Courier, monospace" },
      h6: { color: '#ec4899', fontSize: '11px', fontFamily: "'Courier New', Courier, monospace" },
    },
    isDefault: true,
  },
  {
    id: 'tpl-editorial',
    name: 'Editorial Caslon',
    styles: {
      p: { color: '#334155', fontSize: '15px', fontFamily: "'Georgia', serif" },
      h1: { color: '#5b50e6', fontSize: '26px', fontFamily: "'Libre Caslon Display', Georgia, serif" },
      h2: { color: '#172033', fontSize: '21px', fontFamily: "'Libre Caslon Display', Georgia, serif" },
      h3: { color: '#697386', fontSize: '17px', fontFamily: "'DM Sans', sans-serif" },
      h4: { color: '#5b50e6', fontSize: '15px', fontFamily: "'DM Sans', sans-serif" },
    },
    isDefault: true,
  },
  {
    id: 'tpl-cyber',
    name: 'Cyber Monospace',
    styles: {
      p: { color: '#94a3b8', fontSize: '13.5px', fontFamily: "'JetBrains Mono', monospace" },
      h1: { color: '#3b82f6', fontSize: '24px', fontFamily: "'JetBrains Mono', monospace" },
      h2: { color: '#8b5cf6', fontSize: '19px', fontFamily: "'JetBrains Mono', monospace" },
      h3: { color: '#10b981', fontSize: '16px', fontFamily: "'JetBrains Mono', monospace" },
      h4: { color: '#f59e0b', fontSize: '14px', fontFamily: "'JetBrains Mono', monospace" },
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
  template: `
    <div
      class="text-block-root"
      [class.focused]="isFocused"
      [class.reading-mode]="notesService.isReadingMode()"
      (click)="onRootClick($event)"
      [style.--custom-p-color]="blockStyles.p?.color || null"
      [style.--custom-p-size]="blockStyles.p?.fontSize || null"
      [style.--custom-p-font]="blockStyles.p?.fontFamily || null"
      [style.--custom-h1-color]="blockStyles.h1?.color || null"
      [style.--custom-h1-size]="blockStyles.h1?.fontSize || null"
      [style.--custom-h1-font]="blockStyles.h1?.fontFamily || null"
      [style.--custom-h2-color]="blockStyles.h2?.color || null"
      [style.--custom-h2-size]="blockStyles.h2?.fontSize || null"
      [style.--custom-h2-font]="blockStyles.h2?.fontFamily || null"
      [style.--custom-h3-color]="blockStyles.h3?.color || null"
      [style.--custom-h3-size]="blockStyles.h3?.fontSize || null"
      [style.--custom-h3-font]="blockStyles.h3?.fontFamily || null"
      [style.--custom-h4-color]="blockStyles.h4?.color || null"
      [style.--custom-h4-size]="blockStyles.h4?.fontSize || null"
      [style.--custom-h4-font]="blockStyles.h4?.fontFamily || null"
      [style.--custom-h5-color]="blockStyles.h5?.color || null"
      [style.--custom-h5-size]="blockStyles.h5?.fontSize || null"
      [style.--custom-h5-font]="blockStyles.h5?.fontFamily || null"
      [style.--custom-h6-color]="blockStyles.h6?.color || null"
      [style.--custom-h6-size]="blockStyles.h6?.fontSize || null"
      [style.--custom-h6-font]="blockStyles.h6?.fontFamily || null"
    >
      <!-- Barra de herramientas superior estilo Trilium (siempre arriba, sticky) -->
      @if (editor && !notesService.isReadingMode()) {
        <div class="trilium-top-toolbar" (mousedown)="$event.preventDefault()">
          <div class="toolbar-group">
            <button
              type="button"
              class="tb-btn"
              [class.active]="editor.isActive('paragraph')"
              (click)="setParagraph()"
              title="Texto normal"
            >
              ¶
            </button>
            <button
              type="button"
              class="tb-btn"
              [class.active]="editor.isActive('heading', { level: 1 })"
              (click)="toggleHeading(1)"
              title="Título 1 (H1)"
            >
              H1
            </button>
            <button
              type="button"
              class="tb-btn"
              [class.active]="editor.isActive('heading', { level: 2 })"
              (click)="toggleHeading(2)"
              title="Título 2 (H2)"
            >
              H2
            </button>
            <button
              type="button"
              class="tb-btn"
              [class.active]="editor.isActive('heading', { level: 3 })"
              (click)="toggleHeading(3)"
              title="Título 3 (H3)"
            >
              H3
            </button>
            <button
              type="button"
              class="tb-btn"
              [class.active]="editor.isActive('heading', { level: 4 })"
              (click)="toggleHeading(4)"
              title="Título 4 (H4)"
            >
              H4
            </button>
            <button
              type="button"
              class="tb-btn"
              [class.active]="editor.isActive('heading', { level: 5 })"
              (click)="toggleHeading(5)"
              title="Título 5 (H5)"
            >
              H5
            </button>
            <button
              type="button"
              class="tb-btn"
              [class.active]="editor.isActive('heading', { level: 6 })"
              (click)="toggleHeading(6)"
              title="Título 6 (H6)"
            >
              H6
            </button>
          </div>

          <span class="tb-divider"></span>

          <div class="toolbar-group">
            <button
              type="button"
              class="tb-btn"
              [class.active]="editor.isActive('bold')"
              (click)="editor.chain().focus().toggleBold().run()"
              title="Negrita (Ctrl+B)"
            >
              <b>B</b>
            </button>
            <button
              type="button"
              class="tb-btn"
              [class.active]="editor.isActive('italic')"
              (click)="editor.chain().focus().toggleItalic().run()"
              title="Cursiva (Ctrl+I)"
            >
              <i>I</i>
            </button>
            <button
              type="button"
              class="tb-btn"
              [class.active]="editor.isActive('strike')"
              (click)="editor.chain().focus().toggleStrike().run()"
              title="Tachado"
            >
              <s>S</s>
            </button>
            <button
              type="button"
              class="tb-btn"
              [class.active]="editor.isActive('code')"
              (click)="editor.chain().focus().toggleCode().run()"
              title="Código en línea"
            >
              &lt;/&gt;
            </button>
          </div>

          <span class="tb-divider"></span>

          <div class="toolbar-group">
            <button
              type="button"
              class="tb-btn"
              [class.active]="editor.isActive('bulletList')"
              (click)="editor.chain().focus().toggleBulletList().run()"
              title="Lista con viñetas"
            >
              • Lista
            </button>
            <button
              type="button"
              class="tb-btn"
              [class.active]="editor.isActive('orderedList')"
              (click)="editor.chain().focus().toggleOrderedList().run()"
              title="Lista numerada"
            >
              1. Num
            </button>
            <button
              type="button"
              class="tb-btn"
              [class.active]="editor.isActive('taskList')"
              (click)="editor.chain().focus().toggleTaskList().run()"
              title="Lista de tareas (Checklist)"
            >
              ☑ Tareas
            </button>
          </div>

          <span class="tb-divider"></span>

          <div class="toolbar-group">
            <button
              type="button"
              class="tb-btn"
              [class.active]="editor.isActive('blockquote')"
              (click)="editor.chain().focus().toggleBlockquote().run()"
              title="Cita estilo tarjeta"
            >
              ❝ Cita
            </button>
            <button
              type="button"
              class="tb-btn"
              [class.active]="editor.isActive('codeBlock')"
              (click)="editor.chain().focus().toggleCodeBlock().run()"
              title="Bloque de código"
            >
              💻 Bloque
            </button>
            <button
              type="button"
              class="tb-btn"
              (click)="editor.chain().focus().setHorizontalRule().run()"
              title="Línea divisoria"
            >
              — HR
            </button>
          </div>

          <span class="tb-divider"></span>

          <div class="toolbar-group">
            <!-- Botón Inspector de Estilos y Plantillas -->
            <button
              type="button"
              class="tb-btn style-toggle-btn"
              [class.active]="showStylePanel()"
              (click)="toggleStylePanel($event)"
              title="Personalizar estilos para H1..H6 o aplicar plantillas"
            >
              <app-icon name="palette" [size]="13"></app-icon>
              <span>{{ i18n.currentLang() === 'es' ? 'Estilos & Plantillas' : 'Styles & Templates' }}</span>
            </button>
          </div>

          <span class="tb-divider"></span>

          <div class="toolbar-group history-group">
            <button
              type="button"
              class="tb-btn"
              (click)="editor.chain().focus().undo().run()"
              [disabled]="!editor.can().undo()"
              title="Deshacer (Ctrl+Z)"
            >
              <app-icon name="undo" [size]="13"></app-icon>
            </button>
            <button
              type="button"
              class="tb-btn"
              (click)="editor.chain().focus().redo().run()"
              [disabled]="!editor.can().redo()"
              title="Rehacer (Ctrl+Y)"
            >
              <app-icon name="redo" [size]="13"></app-icon>
            </button>
          </div>
        </div>

        <!-- Panel Emergente para Personalizar Estilos de H1..H6 y Plantillas -->
        <!-- Se detiene la propagación de click, mousedown y keydown para evitar el bug de robo de foco -->
        @if (showStylePanel() && !notesService.isReadingMode()) {
          <div
            class="style-inspector-panel"
            (click)="$event.stopPropagation()"
            (mousedown)="$event.stopPropagation()"
            (keydown)="$event.stopPropagation()"
          >
            <!-- Cabecera y selector de pestaña -->
            <div class="panel-header">
              <div class="panel-tabs">
                <button
                  type="button"
                  class="tab-btn"
                  [class.active]="activeTab() === 'customize'"
                  (click)="activeTab.set('customize')"
                >
                  <app-icon name="sliders" [size]="13"></app-icon>
                  <span>{{ i18n.currentLang() === 'es' ? 'Personalizar' : 'Customize' }}</span>
                </button>
                <button
                  type="button"
                  class="tab-btn"
                  [class.active]="activeTab() === 'templates'"
                  (click)="activeTab.set('templates')"
                >
                  <app-icon name="folder" [size]="13"></app-icon>
                  <span>{{ i18n.currentLang() === 'es' ? 'Plantillas' : 'Templates' }}</span>
                </button>
              </div>
              <button type="button" class="close-panel-btn" (click)="showStylePanel.set(false)" title="Cerrar">
                <app-icon name="close" [size]="13"></app-icon>
              </button>
            </div>

            <!-- Pestaña 1: Personalizar H1 .. H6 -->
            @if (activeTab() === 'customize') {
              <!-- Selector de Elemento Objetivo (Texto normal o H1 a H6) -->
              <div class="field-row">
                <label class="field-label">{{ i18n.currentLang() === 'es' ? 'Elemento' : 'Element' }}:</label>
                <div class="segmented-control">
                  @for (el of targetElements; track el) {
                    <button
                      type="button"
                      [class.active]="selectedElement() === el"
                      (click)="selectedElement.set(el)"
                    >
                      {{ el === 'p' ? (i18n.currentLang() === 'es' ? 'Texto' : 'Body') : el.toUpperCase() }}
                    </button>
                  }
                </div>
              </div>

              <!-- Selector de Color -->
              <div class="field-row">
                <label class="field-label">{{ i18n.currentLang() === 'es' ? 'Color' : 'Color' }}:</label>
                <div class="color-options">
                  <button
                    type="button"
                    class="color-chip"
                    [style.background]="'#ef4444'"
                    (click)="setCurrentElementColor('#ef4444')"
                    title="Rojo (Red)"
                  ></button>
                  <button
                    type="button"
                    class="color-chip"
                    [style.background]="'#3b82f6'"
                    (click)="setCurrentElementColor('#3b82f6')"
                    title="Azul (Blue)"
                  ></button>
                  <button
                    type="button"
                    class="color-chip"
                    [style.background]="'#10b981'"
                    (click)="setCurrentElementColor('#10b981')"
                    title="Verde (Green)"
                  ></button>
                  <button
                    type="button"
                    class="color-chip"
                    [style.background]="'#f59e0b'"
                    (click)="setCurrentElementColor('#f59e0b')"
                    title="Ámbar (Amber)"
                  ></button>
                  <button
                    type="button"
                    class="color-chip"
                    [style.background]="'#8b5cf6'"
                    (click)="setCurrentElementColor('#8b5cf6')"
                    title="Púrpura (Purple)"
                  ></button>
                  <button
                    type="button"
                    class="color-chip"
                    [style.background]="'var(--text)'"
                    (click)="setCurrentElementColor('')"
                    title="Por defecto"
                  ></button>
                  <input
                    type="color"
                    [value]="getCurrentElementColor() || '#ef4444'"
                    (change)="onCustomColorChange($event)"
                    class="custom-color-input"
                    title="Color personalizado"
                  />
                  <span class="color-preview-text" [style.color]="getCurrentElementColor() || 'inherit'">
                    {{ getCurrentElementColor() || 'Auto' }}
                  </span>
                </div>
              </div>

              <!-- Selector de Tamaño de Fuente (Soporta entrada manual de px libre de bugs) -->
              <div class="field-row">
                <label class="field-label">{{ i18n.currentLang() === 'es' ? 'Tamaño (px)' : 'Size (px)' }}:</label>
                <div class="size-options">
                  <button
                    type="button"
                    class="size-pill"
                    [class.active]="getCurrentElementSize() === '13px'"
                    (click)="setCurrentElementSize('13px')"
                  >
                    13px
                  </button>
                  <button
                    type="button"
                    class="size-pill"
                    [class.active]="getCurrentElementSize() === '15px'"
                    (click)="setCurrentElementSize('15px')"
                  >
                    15px
                  </button>
                  <button
                    type="button"
                    class="size-pill"
                    [class.active]="getCurrentElementSize() === '18px'"
                    (click)="setCurrentElementSize('18px')"
                  >
                    18px
                  </button>
                  <button
                    type="button"
                    class="size-pill"
                    [class.active]="getCurrentElementSize() === '24px'"
                    (click)="setCurrentElementSize('24px')"
                  >
                    24px
                  </button>
                  <input
                    type="text"
                    [ngModel]="getCurrentElementSize()"
                    (ngModelChange)="onManualSizeInput($event)"
                    (click)="$event.stopPropagation()"
                    (keydown)="$event.stopPropagation()"
                    placeholder="ej. 15px"
                    class="custom-size-input"
                    title="Introduce un tamaño exacto (ej. 15px)"
                  />
                </div>
              </div>

              <!-- Selector de Tipografía -->
              <div class="field-row">
                <label class="field-label">{{ i18n.currentLang() === 'es' ? 'Fuente' : 'Font' }}:</label>
                <select
                  class="font-select"
                  [value]="getCurrentElementFont() || ''"
                  (change)="onCustomFontChange($event)"
                >
                  <option value="">Por defecto (DM Sans)</option>
                  <option value="'Courier New', Courier, monospace">Courier New (Monospace)</option>
                  <option value="'JetBrains Mono', monospace">JetBrains Mono (Code)</option>
                  <option value="'Libre Caslon Display', Georgia, serif">Libre Caslon (Serif Editorial)</option>
                  <option value="Georgia, serif">Georgia</option>
                  <option value="Arial, sans-serif">Arial</option>
                </select>
              </div>

              <!-- Acciones de Personalización -->
              <div class="panel-actions">
                <button type="button" class="btn-reset" (click)="resetCurrentElementStyle()">
                  <app-icon name="refresh" [size]="12"></app-icon>
                  <span>{{ i18n.currentLang() === 'es' ? 'Restablecer Nivel' : 'Reset Level' }}</span>
                </button>
                <button type="button" class="btn-save" (click)="showStylePanel.set(false)">
                  <app-icon name="check" [size]="12"></app-icon>
                  <span>{{ i18n.currentLang() === 'es' ? 'Listo' : 'Done' }}</span>
                </button>
              </div>
            }

            <!-- Pestaña 2: Plantillas de Estilo Guardadas -->
            @if (activeTab() === 'templates') {
              <div class="templates-list-wrapper">
                <div class="templates-header">
                  <span>{{ i18n.currentLang() === 'es' ? 'Plantillas Disponibles:' : 'Available Templates:' }}</span>
                </div>

                <div class="templates-list">
                  @for (tpl of allTemplates(); track tpl.id) {
                    <div class="template-item">
                      <div class="template-info" (click)="applyTemplate(tpl)">
                        <span class="template-name">{{ tpl.name }}</span>
                        <div class="template-chips-preview">
                          @if (tpl.styles.p?.color) {
                            <span class="preview-dot" [style.background]="tpl.styles.p?.color" title="Texto"></span>
                          }
                          @if (tpl.styles.h1?.color) {
                            <span class="preview-dot" [style.background]="tpl.styles.h1?.color" title="H1"></span>
                          }
                          <span class="preview-desc">
                            {{ tpl.styles.p?.fontSize || tpl.styles.h1?.fontSize || '14px' }} · {{ (tpl.styles.p?.fontFamily || tpl.styles.h1?.fontFamily || 'DM Sans').split(',')?.[0]?.replace("'", "") }}
                          </span>
                        </div>
                      </div>

                      <div class="template-actions">
                        <button type="button" class="btn-apply-tpl" (click)="applyTemplate(tpl)">
                          <app-icon name="check" [size]="11"></app-icon>
                          <span>{{ i18n.currentLang() === 'es' ? 'Aplicar' : 'Apply' }}</span>
                        </button>
                        @if (!tpl.isDefault) {
                          <button
                            type="button"
                            class="btn-delete-tpl"
                            (click)="deleteCustomTemplate(tpl.id)"
                            title="Eliminar plantilla"
                          >
                            <app-icon name="trash" [size]="12"></app-icon>
                          </button>
                        }
                      </div>
                    </div>
                  }
                </div>

                <!-- Guardar Estilo Actual como Nueva Plantilla -->
                <div class="save-template-box">
                  <label class="field-label">
                    {{ i18n.currentLang() === 'es' ? 'Guardar estilo actual como plantilla:' : 'Save current as template:' }}
                  </label>
                  <div class="save-tpl-form">
                    <input
                      type="text"
                      [(ngModel)]="newTemplateName"
                      (click)="$event.stopPropagation()"
                      (keydown)="$event.stopPropagation()"
                      (keydown.enter)="saveCurrentAsTemplate()"
                      [placeholder]="i18n.currentLang() === 'es' ? 'Nombre de plantilla (ej. Mis Títulos Rojos)' : 'Template name'"
                      class="tpl-name-input"
                    />
                    <button
                      type="button"
                      class="btn-save-tpl"
                      (click)="saveCurrentAsTemplate()"
                      [disabled]="!newTemplateName.trim()"
                    >
                      <app-icon name="save" [size]="12"></app-icon>
                      <span>{{ i18n.currentLang() === 'es' ? 'Guardar' : 'Save' }}</span>
                    </button>
                  </div>
                </div>
              </div>
            }
          </div>
        }
      }

      <!-- Superficie de notas despejada: el texto comienza de inmediato arriba -->
      <div #editorElement class="tiptap-surface"></div>
    </div>
  `,
  styles: [
    `
      .text-block-root {
        position: relative;
        width: 100%;
        cursor: text;
        background: transparent;
        border-radius: 8px;
        transition: border-color 0.15s ease;
        margin: 6px 0;
      }
      .text-block-root.reading-mode {
        border-color: transparent !important;
        margin: 2px 0;
        cursor: default;
      }
      .text-block-root.reading-mode .trilium-top-toolbar,
      .text-block-root.reading-mode .style-inspector-panel {
        display: none !important;
      }

      /* Barra superior de herramientas fija / sticky arriba inspirada en Trilium Classic */
      .trilium-top-toolbar {
        position: sticky;
        top: 6px;
        z-index: 50;
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 3px;
        padding: 5px 10px;
        background: color-mix(in srgb, var(--bg) 92%, var(--panel));
        backdrop-filter: blur(14px);
        -webkit-backdrop-filter: blur(14px);
        border: 1px solid var(--border);
        border-radius: 7px;
        margin-bottom: 8px;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
        opacity: 0.95;
        transition: opacity 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;
      }
      .text-block-root.focused .trilium-top-toolbar {
        opacity: 1;
        border-color: var(--border-strong);
        box-shadow: 0 4px 14px rgba(0, 0, 0, 0.08);
      }

      .toolbar-group {
        display: inline-flex;
        align-items: center;
        gap: 2px;
      }

      .tb-btn {
        padding: 3px 6px;
        border-radius: 5px;
        font-size: 11.5px;
        font-weight: 500;
        color: var(--muted);
        line-height: 1.2;
        background: transparent;
        border: 1px solid transparent;
        transition: all 0.1s ease;
        user-select: none;
      }
      .tb-btn:hover {
        background: var(--soft);
        color: var(--text);
      }
      .tb-btn:active {
        transform: scale(0.92);
      }
      .tb-btn.active {
        background: var(--accent-soft);
        color: var(--accent);
        border-color: color-mix(in srgb, var(--accent) 25%, transparent);
        font-weight: 600;
      }
      .tb-btn:disabled {
        opacity: 0.35;
        pointer-events: none;
      }

      .style-toggle-btn {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        font-weight: 600;
        color: var(--accent);
      }

      .tb-divider {
        width: 1px;
        height: 14px;
        background: var(--border);
        margin: 0 4px;
      }

      /* Panel emergente Inspector de Estilos y Plantillas */
      .style-inspector-panel {
        position: absolute;
        top: 48px;
        right: 8px;
        z-index: 60;
        width: 330px;
        background: var(--bg);
        border: 1px solid var(--border);
        border-radius: 9px;
        padding: 14px;
        box-shadow: 0 10px 28px rgba(0, 0, 0, 0.14);
        animation: fadeIn 0.12s ease;
      }
      .panel-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 12px;
        padding-bottom: 8px;
        border-bottom: 1px solid var(--border);
      }
      .panel-tabs {
        display: flex;
        gap: 4px;
      }
      .tab-btn {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        font-size: 11px;
        font-weight: 600;
        padding: 4px 9px;
        border-radius: 5px;
        color: var(--muted);
        background: transparent;
        cursor: pointer;
        transition: all 0.15s ease;
      }
      .tab-btn.active {
        background: var(--soft);
        color: var(--accent);
      }
      .close-panel-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 22px;
        height: 22px;
        color: var(--faint);
        border-radius: 4px;
        cursor: pointer;
        transition: all 0.15s ease;
      }
      .close-panel-btn:hover {
        color: var(--text);
        background: var(--soft);
      }
      .field-row {
        margin-bottom: 12px;
      }
      .field-label {
        display: block;
        font-size: 10.5px;
        font-weight: 600;
        color: var(--muted);
        margin-bottom: 5px;
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }
      .segmented-control {
        display: flex;
        background: var(--soft);
        padding: 2px;
        border-radius: 6px;
        gap: 2px;
      }
      .segmented-control button {
        flex: 1;
        padding: 4px 0;
        font-size: 10.5px;
        font-weight: 600;
        color: var(--muted);
        border-radius: 4px;
        transition: all 0.1s ease;
      }
      .segmented-control button.active {
        background: var(--bg);
        color: var(--accent);
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
      }
      .color-options {
        display: flex;
        align-items: center;
        gap: 6px;
        flex-wrap: wrap;
      }
      .color-chip {
        width: 20px;
        height: 20px;
        border-radius: 50%;
        border: 2px solid var(--bg);
        box-shadow: 0 0 0 1px var(--border);
        cursor: pointer;
        transition: transform 0.1s ease;
      }
      .color-chip:hover {
        transform: scale(1.15);
      }
      .custom-color-input {
        width: 24px;
        height: 24px;
        padding: 0;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        background: transparent;
      }
      .color-preview-text {
        font-size: 11px;
        font-family: 'JetBrains Mono', monospace;
        font-weight: 600;
        margin-left: 4px;
      }
      .size-options {
        display: flex;
        align-items: center;
        gap: 4px;
        flex-wrap: wrap;
      }
      .size-pill {
        padding: 3px 8px;
        border-radius: 4px;
        font-size: 11px;
        background: var(--soft);
        color: var(--muted);
        border: 1px solid var(--border);
      }
      .size-pill.active {
        background: var(--accent-soft);
        color: var(--accent);
        border-color: var(--accent);
        font-weight: 600;
      }
      .custom-size-input {
        width: 72px;
        padding: 4px 7px;
        font-size: 11px;
        border: 1px solid var(--border-strong);
        border-radius: 4px;
        background: var(--bg);
        color: var(--text);
        font-family: 'JetBrains Mono', monospace;
      }
      .custom-size-input:focus {
        border-color: var(--accent);
        outline: none;
      }
      .font-select {
        width: 100%;
        padding: 5px 8px;
        font-size: 11.5px;
        border: 1px solid var(--border);
        border-radius: 5px;
        background: var(--bg);
        color: var(--text);
        outline: none;
      }
      .panel-actions {
        display: flex;
        justify-content: space-between;
        margin-top: 14px;
        padding-top: 10px;
        border-top: 1px solid var(--border);
      }
      .btn-reset {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        font-size: 10.5px;
        color: var(--muted);
        padding: 3px 8px;
        border-radius: 4px;
        cursor: pointer;
        transition: all 0.15s ease;
      }
      .btn-reset:hover {
        color: #ef4444;
      }
      .btn-save {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        font-size: 11px;
        font-weight: 600;
        color: #ffffff;
        background: var(--accent);
        padding: 4px 14px;
        border-radius: 5px;
        cursor: pointer;
        transition: all 0.15s ease;
      }

      /* Pestaña de Plantillas */
      .templates-list-wrapper {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      .templates-header {
        font-size: 10.5px;
        font-weight: 700;
        color: var(--muted);
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }
      .templates-list {
        display: flex;
        flex-direction: column;
        gap: 6px;
        max-height: 180px;
        overflow-y: auto;
      }
      .template-item {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 6px 10px;
        background: var(--soft);
        border: 1px solid var(--border);
        border-radius: 6px;
        transition: border-color 0.15s ease;
      }
      .template-item:hover {
        border-color: var(--accent);
      }
      .template-info {
        cursor: pointer;
        flex: 1;
      }
      .template-name {
        display: block;
        font-size: 11.5px;
        font-weight: 600;
        color: var(--text);
      }
      .template-chips-preview {
        display: flex;
        align-items: center;
        gap: 5px;
        margin-top: 2px;
      }
      .preview-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        display: inline-block;
      }
      .preview-desc {
        font-size: 9.5px;
        color: var(--faint);
      }
      .template-actions {
        display: flex;
        align-items: center;
        gap: 4px;
      }
      .btn-apply-tpl {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        font-size: 10px;
        font-weight: 600;
        padding: 3px 8px;
        border-radius: 4px;
        background: var(--accent-soft);
        color: var(--accent);
        cursor: pointer;
        transition: all 0.15s ease;
      }
      .btn-delete-tpl {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 22px;
        height: 22px;
        border-radius: 4px;
        color: var(--faint);
        cursor: pointer;
        transition: all 0.15s ease;
      }
      .btn-delete-tpl:hover {
        color: #ef4444;
        background: rgba(239, 68, 68, 0.1);
      }
      .save-template-box {
        margin-top: 10px;
        padding-top: 10px;
        border-top: 1px dashed var(--border);
      }
      .save-tpl-form {
        display: flex;
        gap: 6px;
        margin-top: 4px;
      }
      .tpl-name-input {
        flex: 1;
        padding: 4px 8px;
        font-size: 11px;
        border: 1px solid var(--border);
        border-radius: 5px;
        background: var(--bg);
        color: var(--text);
      }
      .btn-save-tpl {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        font-size: 11px;
        font-weight: 600;
        padding: 4px 10px;
        background: var(--accent);
        color: #ffffff;
        border-radius: 5px;
        cursor: pointer;
        transition: all 0.15s ease;
      }
      .btn-save-tpl:disabled {
        opacity: 0.45;
        cursor: not-allowed;
      }

      /* Superficie editorial limpia */
      .tiptap-surface {
        outline: none;
        font-size: 15.5px;
        line-height: 1.7;
        color: var(--text);
        letter-spacing: -0.01px;
        padding: 2px 0;
      }

      ::ng-deep .tiptap-surface .ProseMirror {
        outline: none;
        min-height: 36px;
      }

      ::ng-deep .tiptap-surface p {
        font-family: var(--custom-p-font, 'DM Sans', sans-serif) !important;
        font-size: var(--custom-p-size, 14.5px) !important;
        color: var(--custom-p-color, var(--text)) !important;
        line-height: 1.68;
        margin: 0 0 8px 0;
      }
      ::ng-deep .tiptap-surface p:last-child {
        margin-bottom: 0;
      }

      ::ng-deep .tiptap-surface li,
      ::ng-deep .tiptap-surface .task-item {
        font-family: var(--custom-p-font, inherit);
        font-size: var(--custom-p-size, inherit);
        color: var(--custom-p-color, inherit);
      }

      /* Encabezados H1 .. H6 con variables CSS personalizables e indicadores Markdown sutiles */
      ::ng-deep .tiptap-surface h1 {
        font-family: var(--custom-h1-font, 'DM Sans', sans-serif) !important;
        font-size: var(--custom-h1-size, 24px) !important;
        color: var(--custom-h1-color, var(--text)) !important;
        font-weight: 600;
        line-height: 1.3;
        margin: 22px 0 8px;
        border-bottom: 1px solid var(--border);
        padding-bottom: 4px;
      }
      ::ng-deep .tiptap-surface h1::before {
        content: '# ';
        color: var(--custom-h1-color, var(--faint));
        opacity: 0.6;
        font-weight: 400;
      }

      ::ng-deep .tiptap-surface h2 {
        font-family: var(--custom-h2-font, 'DM Sans', sans-serif) !important;
        font-size: var(--custom-h2-size, 20px) !important;
        color: var(--custom-h2-color, var(--text)) !important;
        font-weight: 600;
        line-height: 1.35;
        margin: 18px 0 6px;
      }
      ::ng-deep .tiptap-surface h2::before {
        content: '## ';
        color: var(--custom-h2-color, var(--faint));
        opacity: 0.6;
        font-weight: 400;
      }

      ::ng-deep .tiptap-surface h3 {
        font-family: var(--custom-h3-font, 'DM Sans', sans-serif) !important;
        font-size: var(--custom-h3-size, 17px) !important;
        color: var(--custom-h3-color, var(--text)) !important;
        font-weight: 600;
        line-height: 1.4;
        margin: 14px 0 4px;
      }
      ::ng-deep .tiptap-surface h3::before {
        content: '### ';
        color: var(--custom-h3-color, var(--faint));
        opacity: 0.6;
        font-weight: 400;
      }

      ::ng-deep .tiptap-surface h4 {
        font-family: var(--custom-h4-font, 'DM Sans', sans-serif) !important;
        font-size: var(--custom-h4-size, 15px) !important;
        color: var(--custom-h4-color, var(--text)) !important;
        font-weight: 600;
        line-height: 1.45;
        margin: 12px 0 4px;
      }
      ::ng-deep .tiptap-surface h4::before {
        content: '#### ';
        color: var(--custom-h4-color, var(--faint));
        opacity: 0.6;
        font-weight: 400;
      }

      ::ng-deep .tiptap-surface h5 {
        font-family: var(--custom-h5-font, 'DM Sans', sans-serif) !important;
        font-size: var(--custom-h5-size, 13.5px) !important;
        color: var(--custom-h5-color, var(--text)) !important;
        font-weight: 600;
        line-height: 1.45;
        margin: 10px 0 3px;
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }
      ::ng-deep .tiptap-surface h5::before {
        content: '##### ';
        color: var(--custom-h5-color, var(--faint));
        opacity: 0.6;
        font-weight: 400;
      }

      ::ng-deep .tiptap-surface h6 {
        font-family: var(--custom-h6-font, 'DM Sans', sans-serif) !important;
        font-size: var(--custom-h6-size, 12px) !important;
        color: var(--custom-h6-color, var(--muted)) !important;
        font-weight: 600;
        line-height: 1.5;
        margin: 8px 0 2px;
        text-transform: uppercase;
        letter-spacing: 0.06em;
      }
      ::ng-deep .tiptap-surface h6::before {
        content: '###### ';
        color: var(--custom-h6-color, var(--faint));
        opacity: 0.6;
        font-weight: 400;
      }

      /* Listas tradicionales */
      ::ng-deep .tiptap-surface ul:not([data-type='taskList']) {
        padding-left: 24px;
        margin: 6px 0 10px;
      }
      ::ng-deep .tiptap-surface ol {
        padding-left: 24px;
        margin: 6px 0 10px;
      }
      ::ng-deep .tiptap-surface li {
        margin-bottom: 3px;
      }

      /* Checklists / Task Lists interactivas estilo Trilium */
      ::ng-deep .tiptap-surface ul[data-type='taskList'] {
        list-style: none;
        padding-left: 4px;
        margin: 6px 0 10px;
      }
      ::ng-deep .tiptap-surface ul[data-type='taskList'] li {
        display: flex;
        align-items: flex-start;
        gap: 9px;
        margin-bottom: 4px;
      }
      ::ng-deep .tiptap-surface ul[data-type='taskList'] li > label {
        user-select: none;
        cursor: pointer;
        margin-top: 3px;
        flex-shrink: 0;
      }
      ::ng-deep .tiptap-surface ul[data-type='taskList'] li > div {
        flex: 1;
      }
      ::ng-deep .tiptap-surface ul[data-type='taskList'] li input[type='checkbox'] {
        appearance: none;
        width: 16px;
        height: 16px;
        border: 1.5px solid var(--border-strong);
        border-radius: 4px;
        background: transparent;
        cursor: pointer;
        position: relative;
        transition: all 0.15s ease;
        margin: 0;
      }
      ::ng-deep .tiptap-surface ul[data-type='taskList'] li input[type='checkbox']:hover {
        border-color: var(--accent);
        box-shadow: 0 0 0 4px color-mix(in srgb, var(--accent) 18%, transparent);
      }
      ::ng-deep .tiptap-surface ul[data-type='taskList'] li input[type='checkbox']:checked {
        background: var(--accent);
        border-color: var(--accent);
      }
      ::ng-deep .tiptap-surface ul[data-type='taskList'] li input[type='checkbox']:checked::after {
        content: '';
        position: absolute;
        top: 2px;
        left: 4.5px;
        width: 4px;
        height: 7.5px;
        border: solid white;
        border-width: 0 2px 2px 0;
        transform: rotate(45deg);
      }
      ::ng-deep .tiptap-surface ul[data-type='taskList'] li[data-checked='true'] > div {
        text-decoration: line-through;
        color: var(--muted);
      }

      /* Citas editoriales estilo tarjeta Trilium con comillas gigantes */
      ::ng-deep .tiptap-surface blockquote {
        background: var(--panel);
        border: 1px solid var(--border);
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.02);
        border-radius: 10px;
        padding: 0.9em 2.2em;
        position: relative;
        margin: 12px 0;
        font-style: normal;
        color: var(--text);
      }
      ::ng-deep .tiptap-surface blockquote::before {
        content: '“';
        position: absolute;
        top: -4px;
        left: 10px;
        font-size: 38px;
        line-height: 1;
        opacity: 0.15;
        font-family: Georgia, serif;
        pointer-events: none;
        color: var(--text);
      }
      ::ng-deep .tiptap-surface blockquote::after {
        content: '”';
        position: absolute;
        bottom: -20px;
        right: 14px;
        font-size: 38px;
        line-height: 1;
        opacity: 0.15;
        font-family: Georgia, serif;
        pointer-events: none;
        color: var(--text);
      }
      ::ng-deep .tiptap-surface blockquote p:last-child {
        margin-bottom: 0;
      }

      /* Código en línea y bloques de código */
      ::ng-deep .tiptap-surface code {
        font-family: 'JetBrains Mono', monospace;
        font-size: 12.5px;
        background: var(--soft);
        padding: 2px 6px;
        border-radius: 4px;
        color: var(--accent);
      }

      ::ng-deep .tiptap-surface pre {
        background: #131722;
        color: #e2e8f0;
        font-family: 'JetBrains Mono', monospace;
        padding: 12px 16px;
        border-radius: 8px;
        margin: 12px 0;
        overflow-x: auto;
        font-size: 13px;
        line-height: 1.6;
        position: relative;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
      }
      ::ng-deep .tiptap-surface pre code {
        background: transparent;
        color: inherit;
        padding: 0;
        border-radius: 0;
      }

      /* Línea divisoria HR */
      ::ng-deep .tiptap-surface hr {
        border: none;
        border-top: 1px solid var(--border);
        margin: 18px 0;
      }

      /* Placeholder sutil */
      ::ng-deep .tiptap-surface p.is-editor-empty:first-child::before {
        content: attr(data-placeholder);
        float: left;
        color: var(--faint);
        pointer-events: none;
        height: 0;
      }
    `,
  ],
})
export class TextBlockComponent implements OnInit, OnDestroy {
  @Input({ required: true }) block!: Block;
  @ViewChild('editorElement', { static: true })
  editorElement!: ElementRef<HTMLDivElement>;

  private readonly notesService = inject(NotesService);
  private readonly authService = inject(AuthService);
  readonly i18n = inject(I18nService);

  editor?: Editor;
  isFocused = false;
  private updateDebounceTimer?: any;

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

  newTemplateName = '';
  readonly allTemplates = signal<StyleTemplate[]>([]);

  constructor() {
    effect(() => {
      const isReading = this.notesService.isReadingMode();
      if (this.editor) {
        this.editor.setEditable(!isReading);
        if (isReading) {
          this.showStylePanel.set(false);
          this.isFocused = false;
        }
      }
    });
  }

  ngOnInit(): void {
    const initialContent = this.block.content?.['html'] || '<p></p>';

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
      ],
      content: initialContent,
      onUpdate: ({ editor }) => {
        clearTimeout(this.updateDebounceTimer);
        this.updateDebounceTimer = setTimeout(() => {
          const html = editor.getHTML();
          this.notesService.updateBlockContent(this.block.id, {
            html,
            blockStyles: this.blockStyles,
          });
        }, 500);
      },
      onFocus: () => {
        this.isFocused = true;
      },
      onBlur: () => {
        this.isFocused = false;
        if (this.editor) {
          clearTimeout(this.updateDebounceTimer);
          const html = this.editor.getHTML();
          if (html !== this.block.content?.['html']) {
            this.notesService.updateBlockContent(this.block.id, {
              html,
              blockStyles: this.blockStyles,
            });
          }
        }
      },
    });
  }

  onRootClick(event: MouseEvent): void {
    if (this.notesService.isReadingMode()) return;
    // Si el clic ocurrió fuera del panel de estilos, enfocar el editor
    if (!this.showStylePanel()) {
      this.focusEditor();
    }
  }

  focusEditor(): void {
    if (this.editor && !this.editor.isFocused && !this.showStylePanel()) {
      this.editor.commands.focus();
    }
  }

  setParagraph(): void {
    this.editor?.chain().focus().setParagraph().run();
  }

  toggleHeading(level: 1 | 2 | 3 | 4 | 5 | 6): void {
    this.editor?.chain().focus().toggleHeading({ level }).run();
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
    this.blockStyles = { ...this.blockStyles };
    const html = this.editor?.getHTML() || this.block.content?.['html'] || '';
    this.notesService.updateBlockContent(this.block.id, {
      html,
      blockStyles: this.blockStyles,
    });
  }

  ngOnDestroy(): void {
    clearTimeout(this.updateDebounceTimer);
    this.editor?.destroy();
  }
}
