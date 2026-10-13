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
  private insertAfterIndex?: number;

  formatSpacePath(space?: string): string {
    if (!space) return 'General';
    return space.split('/').join(' / ');
  }

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
