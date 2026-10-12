import {
  Component,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NotesService } from '../../core/services/notes.service';
import { I18nService } from '../../core/services/i18n.service';
import { IconComponent } from '../../shared/components/icon/icon.component';
import { BlockRailComponent } from '../block-rail/block-rail.component';
import { SlashMenuComponent } from '../slash-menu/slash-menu.component';
import { TextBlockComponent } from '../../blocks/text-block/text-block.component';
import { CanvasBlockComponent } from '../../blocks/canvas-block/canvas-block.component';
import { LatexBlockComponent } from '../../blocks/latex-block/latex-block.component';
import { ImageBlockComponent } from '../../blocks/image-block/image-block.component';
import { SheetBlockComponent } from '../../blocks/sheet-block/sheet-block.component';
import { CodeBlockComponent } from '../../blocks/code-block/code-block.component';
import { MermaidBlockComponent } from '../../blocks/mermaid-block/mermaid-block.component';
import { BlockType } from '../../core/models/block.model';

/**
 * Editor Principal del Documento de Weave.
 * Orquesta los bloques utilizando un layout con canalón independiente para que los controles
 * nunca se sobrepongan a las letras o contenido escrito.
 */
@Component({
  selector: 'app-document-editor',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    IconComponent,
    BlockRailComponent,
    SlashMenuComponent,
    TextBlockComponent,
    CanvasBlockComponent,
    LatexBlockComponent,
    ImageBlockComponent,
    SheetBlockComponent,
    CodeBlockComponent,
    MermaidBlockComponent,
  ],
  template: `
    <div class="document-scroll">
      @if (notesService.currentNote(); as note) {
        <article class="document" [class.reading-mode]="notesService.isReadingMode()">
          <!-- Metadatos de la nota -->
          <div class="doc-meta">
            <span class="space-badge">{{ note.space }}</span>
            <span>{{ i18n.t('doc.updated') }}</span>
          </div>

          <!-- Título principal -->
          <h1
            [attr.contenteditable]="!notesService.isReadingMode()"
            (blur)="onTitleBlur($event)"
            [textContent]="note.title"
            class="font-display"
          ></h1>

          <!-- Resumen / Lead del documento -->
          <p
            class="lead"
            [attr.contenteditable]="!notesService.isReadingMode()"
            (blur)="onLeadBlur($event)"
            [textContent]="note.lead || i18n.t('doc.lead_placeholder')"
          ></p>

          <!-- Etiquetas interactivas -->
          <div class="tags">
            @for (tag of note.tags; track tag) {
              <span class="tag-chip">{{ tag }}</span>
            }
            @if (!notesService.isReadingMode()) {
              <button type="button" class="add-tag-btn" (click)="addTagPrompt()" [title]="i18n.t('doc.add_tag')">
                <app-icon name="plus" [size]="12"></app-icon>
              </button>
            }
          </div>

          <div class="divider"></div>

          <!-- Lista secuencial de bloques con canalón dedicado (sin sobreposición) -->
          <div class="blocks-container">
            @for (block of note.blocks; track block.id; let idx = $index) {
              <div class="block-row" [attr.data-block-id]="block.id">
                <!-- Canalón de control completamente fuera del texto -->
                @if (!notesService.isReadingMode()) {
                  <div class="block-gutter">
                    <app-block-rail
                      (addBelow)="openSlashMenuAt(idx)"
                      (moveUp)="notesService.moveBlock(block.id, 'up')"
                      (moveDown)="notesService.moveBlock(block.id, 'down')"
                      (deleteBlock)="notesService.removeBlock(block.id)"
                    ></app-block-rail>
                  </div>
                }

                <!-- Contenido limpio del bloque -->
                <div class="block-content">
                  @switch (block.type) {
                    @case ('text') {
                      <app-text-block [block]="block"></app-text-block>
                    }
                    @case ('canvas') {
                      <app-canvas-block [block]="block"></app-canvas-block>
                    }
                    @case ('latex') {
                      <app-latex-block [block]="block"></app-latex-block>
                    }
                    @case ('image') {
                      <app-image-block [block]="block"></app-image-block>
                    }
                    @case ('sheet') {
                      <app-sheet-block [block]="block"></app-sheet-block>
                    }
                    @case ('code') {
                      <app-code-block [block]="block"></app-code-block>
                    }
                    @case ('mermaid') {
                      <app-mermaid-block [block]="block"></app-mermaid-block>
                    }
                  }
                </div>
              </div>
            } @empty {
              <div class="empty-doc-placeholder">
                <p>{{ i18n.t('doc.empty_note') }}</p>
              </div>
            }
          </div>

          <!-- Línea de inserción rápida y menú slash -->
          @if (!notesService.isReadingMode()) {
            <div class="drop-line" (click)="showSlashMenu.set(!showSlashMenu())">
              <span>{{ i18n.t('doc.drop_here') }}</span>
            </div>

            @if (showSlashMenu()) {
              <app-slash-menu
                (selectBlock)="onSlashSelect($event)"
                (closeMenu)="showSlashMenu.set(false)"
              ></app-slash-menu>
            }
          }

          <div class="bottom-space"></div>
        </article>
      } @else {
        <div class="no-note-selected">
          <p>{{ i18n.t('doc.empty_note') }}</p>
          <button type="button" class="btn-create" (click)="createNewNote()">
            <app-icon name="plus" [size]="14"></app-icon>
            {{ i18n.t('topbar.new_note') }}
          </button>
        </div>
      }
    </div>
  `,
  styles: [
    `
      .document-scroll {
        height: calc(100vh - 58px);
        overflow-y: auto;
        background: var(--bg);
        padding: 0;
      }
      .document {
        width: min(860px, calc(100% - 60px));
        margin: 0 auto;
        padding: 50px 30px 120px;
      }
      .doc-meta {
        display: flex;
        gap: 12px;
        align-items: center;
        margin-bottom: 16px;
        padding-left: 44px;
      }
      .doc-meta span:first-child {
        color: var(--accent);
        font-size: 9px;
        letter-spacing: 0.13em;
        font-weight: 700;
      }
      .doc-meta span:last-child {
        font-size: 9px;
        color: var(--faint);
      }
      h1 {
        margin: 0;
        max-width: 720px;
        font-size: 40px;
        line-height: 1.15;
        letter-spacing: -0.025em;
        color: var(--text);
        outline: none;
        padding-left: 44px;
      }
      h1:empty::before {
        content: 'Untitled Note';
        color: var(--faint);
      }
      .lead {
        max-width: 720px;
        font-size: 15px;
        line-height: 1.55;
        color: var(--muted);
        margin: 18px 0;
        outline: none;
        padding-left: 44px;
      }
      .tags {
        display: flex;
        gap: 6px;
        align-items: center;
        flex-wrap: wrap;
        padding-left: 44px;
      }
      .tag-chip {
        font-size: 9px;
        font-weight: 600;
        color: var(--muted);
        padding: 4px 9px;
        border: 1px solid var(--border);
        background: var(--panel);
        border-radius: 12px;
      }
      .add-tag-btn {
        width: 22px;
        height: 22px;
        display: grid;
        place-items: center;
        color: var(--faint);
        border-radius: 50%;
        background: var(--panel);
        border: 1px solid var(--border);
      }
      .add-tag-btn:hover {
        color: var(--accent);
        border-color: var(--accent);
      }
      .divider {
        height: 1px;
        background: var(--border);
        margin: 26px 0 24px 44px;
      }
      .blocks-container {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      /* Modo Lectura Inmersivo */
      .document.reading-mode {
        max-width: 820px;
        padding-top: 36px;
      }
      .document.reading-mode .doc-meta,
      .document.reading-mode h1,
      .document.reading-mode .lead,
      .document.reading-mode .tags,
      .document.reading-mode .divider {
        padding-left: 0;
        margin-left: 0;
      }
      .document.reading-mode .block-row {
        margin-bottom: 6px;
      }
      .document.reading-mode .blocks-container {
        gap: 6px;
      }
      .block-row {
        display: flex;
        align-items: flex-start;
        width: 100%;
        position: relative;
      }
      .block-gutter {
        width: 44px;
        flex-shrink: 0;
        display: flex;
        justify-content: flex-end;
        padding-right: 8px;
        padding-top: 4px;
        user-select: none;
      }
      .block-content {
        flex: 1;
        min-width: 0;
      }
      .drop-line {
        height: 2px;
        background: var(--accent);
        margin: 28px 0 28px 44px;
        position: relative;
        opacity: 0.7;
        cursor: pointer;
        transition: opacity 0.2s ease;
      }
      .drop-line:hover {
        opacity: 1;
      }
      .drop-line::before {
        content: '';
        position: absolute;
        left: -3px;
        top: -3px;
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: var(--accent);
      }
      .drop-line span {
        position: absolute;
        left: 50%;
        top: -9px;
        transform: translateX(-50%);
        background: var(--accent);
        color: #ffffff;
        border-radius: 8px;
        padding: 2px 8px;
        font-size: 8px;
        font-weight: 600;
      }
      .bottom-space {
        height: 240px;
      }
      .empty-doc-placeholder {
        padding: 40px;
        text-align: center;
        color: var(--faint);
        border: 1px dashed var(--border);
        border-radius: 8px;
        margin-left: 44px;
      }
      .no-note-selected {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        height: 70vh;
        gap: 16px;
        color: var(--muted);
      }
      .btn-create {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 8px 16px;
        background: var(--accent);
        color: #fff;
        border-radius: 7px;
        font-size: 12px;
        font-weight: 600;
      }
    `,
  ],
})
export class DocumentEditorComponent {
  readonly notesService = inject(NotesService);
  readonly i18n = inject(I18nService);

  readonly showSlashMenu = signal<boolean>(false);
  private insertAfterIndex?: number;

  onTitleBlur(event: FocusEvent): void {
    const el = event.target as HTMLElement;
    const text = el.innerText.trim();
    if (text) {
      this.notesService.updateMeta({ title: text });
    }
  }

  onLeadBlur(event: FocusEvent): void {
    const el = event.target as HTMLElement;
    const text = el.innerText.trim();
    this.notesService.updateMeta({ lead: text });
  }

  addTagPrompt(): void {
    const tag = prompt(this.i18n.t('doc.add_tag'));
    if (tag && tag.trim()) {
      const currentTags = this.notesService.currentNote()?.tags || [];
      if (!currentTags.includes(tag.trim())) {
        this.notesService.updateMeta({ tags: [...currentTags, tag.trim()] });
      }
    }
  }

  openSlashMenuAt(index: number): void {
    this.insertAfterIndex = index;
    this.showSlashMenu.set(true);
  }

  onSlashSelect(type: BlockType): void {
    this.notesService.addBlock(type, this.insertAfterIndex);
    this.showSlashMenu.set(false);
    this.insertAfterIndex = undefined;
  }

  createNewNote(): void {
    this.notesService.createNote().subscribe();
  }
}
