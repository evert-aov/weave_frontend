import {
  Component,
  EventEmitter,
  HostListener,
  Output,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { IconComponent, IconName } from '../../shared/components/icon/icon.component';
import { BlockType } from '../../core/models/block.model';
import { I18nService } from '../../core/services/i18n.service';

interface CommandItem {
  type: BlockType;
  icon: IconName;
  command: string;
  titleKey: string;
  descKey: string;
}

/**
 * Menú Slash flotante / barra de comandos.
 * Permite insertar bloques rápidamente mediante comandos de teclado o selección visual.
 */
@Component({
  selector: 'app-slash-menu',
  standalone: true,
  imports: [CommonModule, IconComponent],
  templateUrl: './slash-menu.component.html',
  styleUrl: './slash-menu.component.scss',
})
export class SlashMenuComponent {
  @Output() selectBlock = new EventEmitter<BlockType>();
  @Output() closeMenu = new EventEmitter<void>();

  readonly i18n = inject(I18nService);
  readonly selectedIndex = signal<number>(0);

  readonly items: CommandItem[] = [
    {
      type: 'text',
      icon: 'text',
      command: '/text',
      titleKey: 'slash.text_title',
      descKey: 'slash.text_desc',
    },
    {
      type: 'code',
      icon: 'code',
      command: '/code',
      titleKey: 'slash.code_title',
      descKey: 'slash.code_desc',
    },
    {
      type: 'sheet',
      icon: 'sheet',
      command: '/sheet',
      titleKey: 'slash.sheet_title',
      descKey: 'slash.sheet_desc',
    },
    {
      type: 'canvas',
      icon: 'canvas',
      command: '/canvas',
      titleKey: 'slash.canvas_title',
      descKey: 'slash.canvas_desc',
    },
    {
      type: 'latex',
      icon: 'sigma',
      command: '/latex',
      titleKey: 'slash.latex_title',
      descKey: 'slash.latex_desc',
    },
    {
      type: 'mermaid',
      icon: 'diagram',
      command: '/mermaid',
      titleKey: 'slash.mermaid_title',
      descKey: 'slash.mermaid_desc',
    },
    {
      type: 'image',
      icon: 'image',
      command: '/image',
      titleKey: 'slash.image_title',
      descKey: 'slash.image_desc',
    },
  ];

  @HostListener('window:keydown', ['$event'])
  handleKeyboardEvent(event: KeyboardEvent): void {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.selectedIndex.update((i) => (i + 1) % this.items.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.selectedIndex.update(
        (i) => (i - 1 + this.items.length) % this.items.length,
      );
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const current = this.items[this.selectedIndex()];
      if (current) {
        this.onSelect(current.type);
      }
    } else if (
      event.key === 'Escape' ||
      event.key === 'Backspace' ||
      event.key === 'Delete'
    ) {
      event.preventDefault();
      this.closeMenu.emit();
    }
  }

  onSelect(type: BlockType): void {
    this.selectBlock.emit(type);
  }
}
