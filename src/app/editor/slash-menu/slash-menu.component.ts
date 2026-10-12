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
  template: `
    <div class="slash-wrap">
      <div class="slash-input">
        <span>/</span>
        <span class="caret"></span>
      </div>
      <div class="slash-menu">
        <div class="slash-title">
          <span>{{ i18n.t('slash.insert_title') }}</span>
          <kbd>ESC</kbd>
        </div>
        <div class="command-list">
          @for (item of items; track item.command; let idx = $index) {
            <button
              type="button"
              class="command-item"
              [class.highlight]="selectedIndex() === idx"
              (mouseenter)="selectedIndex.set(idx)"
              (click)="onSelect(item.type)"
            >
              <span class="cmd-icon">
                <app-icon [name]="item.icon" [size]="16"></app-icon>
              </span>
              <span class="cmd-copy">
                <strong>{{ i18n.t(item.titleKey) }}</strong>
                <small>{{ i18n.t(item.descKey) }}</small>
              </span>
              <code>{{ item.command }}</code>
            </button>
          }
        </div>
        <div class="slash-footer">
          <span><kbd>↑</kbd><kbd>↓</kbd> {{ i18n.t('slash.navigate') }}</span>
          <span><kbd>↵</kbd> {{ i18n.t('slash.select') }}</span>
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      .slash-wrap {
        position: relative;
        margin-top: 24px;
        z-index: 20;
      }
      .slash-input {
        height: 29px;
        display: flex;
        align-items: center;
        gap: 1px;
        font-size: 14px;
        color: var(--accent);
        font-weight: 600;
      }
      .caret {
        height: 18px;
        width: 1.5px;
        background: var(--accent);
        animation: blink 1s infinite;
      }
      .slash-menu {
        width: 410px;
        border: 1px solid var(--border);
        background: var(--bg);
        border-radius: 10px;
        box-shadow: 0 18px 50px rgba(15, 23, 42, 0.14),
          0 4px 12px rgba(15, 23, 42, 0.08);
        padding: 7px;
        position: absolute;
        top: 29px;
        left: 0;
        animation: fadeIn 0.15s ease;
      }
      .slash-title {
        padding: 7px 8px 8px;
        font-size: 9px;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: var(--faint);
        font-weight: 700;
        display: flex;
        justify-content: space-between;
      }
      .command-list {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }
      .command-item {
        display: flex;
        width: 100%;
        align-items: center;
        padding: 7px 8px;
        border-radius: 7px;
        text-align: left;
        gap: 10px;
        color: var(--text);
        transition: background 0.1s ease;
      }
      .command-item:hover,
      .command-item.highlight {
        background: var(--accent-soft);
      }
      .cmd-icon {
        width: 30px;
        height: 30px;
        display: grid;
        place-items: center;
        border: 1px solid var(--border);
        border-radius: 6px;
        background: var(--panel);
        color: var(--muted);
      }
      .command-item.highlight .cmd-icon {
        color: var(--accent);
        border-color: var(--accent);
      }
      .cmd-copy {
        display: flex;
        flex-direction: column;
        flex: 1;
      }
      .cmd-copy strong {
        font-size: 11px;
      }
      .cmd-copy small {
        font-size: 9px;
        color: var(--muted);
        margin-top: 2px;
      }
      code {
        font: 9px 'JetBrains Mono', monospace;
        color: var(--faint);
      }
      .slash-footer {
        border-top: 1px solid var(--border);
        margin-top: 6px;
        padding: 7px 8px 3px;
        display: flex;
        gap: 15px;
        font-size: 9px;
        color: var(--faint);
      }
      .slash-footer kbd {
        margin-right: 2px;
      }
    `,
  ],
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
