import {
  Component,
  ElementRef,
  HostListener,
  ViewChild,
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
import { FileBlockComponent } from '../../blocks/file-block/file-block.component';
import { BlockType } from '../../core/models/block.model';

import { PureSheetEditorComponent } from '../pure-sheet-editor/pure-sheet-editor.component';
import { PureDocEditorComponent } from '../pure-doc-editor/pure-doc-editor.component';
import { PureCanvasEditorComponent } from '../pure-canvas-editor/pure-canvas-editor.component';
import { PureSlideEditorComponent } from '../pure-slide-editor/pure-slide-editor.component';

/**
 * Editor Principal del Documento de Weave.
 * Orquesta los bloques utilizando un layout con canalón independiente para que los controles
 * nunca se sobrepongan a las letras o contenido escrito.
 * Permite reordenar bloques rápidamente arrastrando el tirador (:::) e insertar bloques
 * exactamente debajo del bloque activo.
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
    FileBlockComponent,
    PureSheetEditorComponent,
    PureDocEditorComponent,
    PureCanvasEditorComponent,
    PureSlideEditorComponent,
  ],
  templateUrl: './document-editor.component.html',
  styleUrl: './document-editor.component.scss',
})
export class DocumentEditorComponent {
  readonly notesService = inject(NotesService);
  readonly i18n = inject(I18nService);

  readonly showSlashMenu = signal<boolean>(false);
  readonly insertAfterIndex = signal<number | null>(null);
  readonly isBottomSlash = signal<boolean>(false);
  readonly activeBlockIndex = signal<number | null>(null);

  // Estados reactivos de arrastrar y soltar (Drag and Drop)
  readonly draggedBlockIndex = signal<number | null>(null);
  readonly dropTargetIndex = signal<number | null>(null);
  readonly dropPosition = signal<'before' | 'after'>('after');

  onTitleBlur(event: FocusEvent): void {
    const el = event.target as HTMLElement;
    const text = el.innerText.trim();
    if (text) {
      this.notesService.updateMeta({ title: text });
    }
  }

  onBlockClick(index: number): void {
    this.activeBlockIndex.set(index);
  }

  onBlockFocus(index: number): void {
    this.activeBlockIndex.set(index);
  }

  onAddBelow(index: number, event?: { shiftKey?: boolean }): void {
    this.activeBlockIndex.set(index);
    if (event?.shiftKey) {
      // Shift+clic: inserta directamente un bloque de texto debajo
      this.notesService.addBlock('text', index);
    } else {
      // Clic normal: despliega el menú slash justo debajo de este bloque
      this.openSlashMenuAt(index);
    }
  }

  openSlashMenuAt(index: number): void {
    this.insertAfterIndex.set(index);
    this.isBottomSlash.set(false);
    this.activeBlockIndex.set(index);
    this.showSlashMenu.set(true);
  }

  openSlashMenuAtBottom(lastIndex: number): void {
    this.insertAfterIndex.set(lastIndex >= 0 ? lastIndex : null);
    this.isBottomSlash.set(true);
    this.showSlashMenu.set(true);
  }

  closeSlashMenu(): void {
    this.showSlashMenu.set(false);
    this.insertAfterIndex.set(null);
    this.isBottomSlash.set(false);
  }

  onSlashSelect(type: BlockType): void {
    const target = this.insertAfterIndex();
    this.notesService.addBlock(type, target !== null ? target : undefined);
    this.closeSlashMenu();
  }

  // --- Funcionalidad de Arrastrar y Soltar Bloques (Drag & Drop) con Auto-Scroll ---
  @ViewChild('scrollContainer') scrollContainer?: ElementRef<HTMLElement>;

  private autoScrollRaf: number | null = null;
  private autoScrollSpeed = 0;

  @HostListener('window:dragover', ['$event'])
  onWindowDragOver(event: DragEvent): void {
    if (this.draggedBlockIndex() === null) return;
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }
    this.handleAutoScroll(event.clientY);
  }

  @HostListener('window:dragend')
  onWindowDragEnd(): void {
    this.onDragEnd();
  }

  onDragStart(index: number): void {
    this.draggedBlockIndex.set(index);
    this.dropTargetIndex.set(null);
    window.getSelection()?.removeAllRanges();
    document.body.classList.add('is-block-dragging');
  }

  onDragEnd(): void {
    this.stopAutoScroll();
    this.draggedBlockIndex.set(null);
    this.dropTargetIndex.set(null);
    document.body.classList.remove('is-block-dragging');
  }

  onContainerDragOver(event: DragEvent): void {
    if (this.draggedBlockIndex() === null) return;
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }
    this.handleAutoScroll(event.clientY);

    // Si el cursor se encuentra por encima del primer bloque o por debajo del último
    const container = this.scrollContainer?.nativeElement;
    if (!container) return;
    const blockRows = container.querySelectorAll('.block-row');
    if (blockRows.length > 0) {
      const firstRect = blockRows[0].getBoundingClientRect();
      const lastRect = blockRows[blockRows.length - 1].getBoundingClientRect();
      if (event.clientY < firstRect.top + 8) {
        this.dropTargetIndex.set(0);
        this.dropPosition.set('before');
      } else if (event.clientY > lastRect.bottom - 8) {
        this.dropTargetIndex.set(blockRows.length - 1);
        this.dropPosition.set('after');
      }
    }
  }

  onContainerDrop(event: DragEvent): void {
    event.preventDefault();
    this.stopAutoScroll();
    const fromIdx = this.draggedBlockIndex();
    const targetIdx = this.dropTargetIndex();
    if (fromIdx !== null && targetIdx !== null) {
      const finalTarget = this.calculateTargetIndex(fromIdx, targetIdx, this.dropPosition());
      if (fromIdx !== finalTarget) {
        this.notesService.moveBlockTo(fromIdx, finalTarget);
        this.activeBlockIndex.set(finalTarget);
      }
    }
    this.onDragEnd();
  }

  private handleAutoScroll(clientY: number): void {
    const container = this.scrollContainer?.nativeElement;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const threshold = 140; // 140px de umbral superior e inferior para autoscroll suave

    if (clientY < rect.top + threshold) {
      const dist = Math.max(0, clientY - rect.top);
      const intensity = (threshold - dist) / threshold;
      this.autoScrollSpeed = -Math.round(4 + intensity * 24);
      this.startAutoScroll();
    } else if (clientY > rect.bottom - threshold) {
      const dist = Math.max(0, rect.bottom - clientY);
      const intensity = (threshold - dist) / threshold;
      this.autoScrollSpeed = Math.round(4 + intensity * 24);
      this.startAutoScroll();
    } else {
      this.stopAutoScroll();
    }
  }

  private startAutoScroll(): void {
    if (this.autoScrollRaf !== null) return;
    const scrollStep = () => {
      if (this.draggedBlockIndex() === null || this.autoScrollSpeed === 0) {
        this.stopAutoScroll();
        return;
      }
      const container = this.scrollContainer?.nativeElement;
      if (container) {
        container.scrollTop += this.autoScrollSpeed;
      }
      this.autoScrollRaf = requestAnimationFrame(scrollStep);
    };
    this.autoScrollRaf = requestAnimationFrame(scrollStep);
  }

  private stopAutoScroll(): void {
    if (this.autoScrollRaf !== null) {
      cancelAnimationFrame(this.autoScrollRaf);
      this.autoScrollRaf = null;
    }
    this.autoScrollSpeed = 0;
  }

  onRowDragOver(event: DragEvent, index: number): void {
    if (this.draggedBlockIndex() === null) return;
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }
    this.handleAutoScroll(event.clientY);

    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const mid = rect.top + rect.height / 2;
    const position: 'before' | 'after' = event.clientY < mid ? 'before' : 'after';

    this.dropTargetIndex.set(index);
    this.dropPosition.set(position);
  }

  onRowDragLeave(event: DragEvent, index: number): void {
    const related = event.relatedTarget as HTMLElement;
    const current = event.currentTarget as HTMLElement;
    if (!related || !current.contains(related)) {
      if (this.dropTargetIndex() === index) {
        this.dropTargetIndex.set(null);
      }
    }
  }

  onRowDrop(event: DragEvent, index: number): void {
    event.preventDefault();
    event.stopPropagation();
    this.stopAutoScroll();
    const fromIdx = this.draggedBlockIndex();
    if (fromIdx === null) return;

    const pos = this.dropPosition();
    const targetIdx = this.calculateTargetIndex(fromIdx, index, pos);

    if (fromIdx !== targetIdx) {
      this.notesService.moveBlockTo(fromIdx, targetIdx);
      this.activeBlockIndex.set(targetIdx);
    }

    this.onDragEnd();
  }

  calculateTargetIndex(fromIndex: number, targetIdx: number, position: 'before' | 'after'): number {
    if (fromIndex === targetIdx) return fromIndex;
    if (fromIndex < targetIdx) {
      return position === 'before' ? targetIdx - 1 : targetIdx;
    } else {
      return position === 'before' ? targetIdx : targetIdx + 1;
    }
  }

  @HostListener('window:keydown', ['$event'])
  handleGlobalKeydown(event: KeyboardEvent): void {
    if (this.notesService.isReadingMode()) return;
    // Ctrl+Enter / Cmd+Enter: insertar bloque de texto debajo del bloque activo actual
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      const activeIdx = this.activeBlockIndex();
      if (activeIdx !== null && activeIdx !== undefined) {
        event.preventDefault();
        this.notesService.addBlock('text', activeIdx);
      }
    }
  }

  createNewNote(): void {
    this.notesService.createNote().subscribe();
  }
}
