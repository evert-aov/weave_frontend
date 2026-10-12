import { Component, EventEmitter, Input, Output, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IconComponent } from '../../shared/components/icon/icon.component';
import { I18nService } from '../../core/services/i18n.service';

/**
 * Rail de control de bloque.
 * Ubicado estrictamente en el canalón izquierdo (gutter) fuera del flujo de texto,
 * garantizando que NUNCA se sobreponga ni estorbe a la escritura.
 */
@Component({
  selector: 'app-block-rail',
  standalone: true,
  imports: [CommonModule, IconComponent],
  template: `
    <div class="rail-container" [class.menu-open]="isMenuOpen()">
      <!-- Botón rápido para insertar bloque debajo -->
      <button
        type="button"
        class="gutter-btn add-btn"
        (click)="addBelow.emit()"
        [title]="i18n.t('rail.add_block')"
      >
        <app-icon name="plus" [size]="13"></app-icon>
      </button>

      <!-- Botón tirador que despliega las opciones del bloque -->
      <button
        type="button"
        class="gutter-btn grip-btn"
        (click)="toggleMenu()"
        [title]="i18n.t('rail.drag')"
      >
        <span>⠿</span>
      </button>

      <!-- Menú contextual de acciones flotante (solo al abrir) -->
      @if (isMenuOpen()) {
        <div class="rail-dropdown">
          <button type="button" class="drop-action" (click)="onMoveUp()">
            <app-icon name="up" [size]="13"></app-icon>
            <span>{{ i18n.t('rail.move_up') }}</span>
          </button>
          <button type="button" class="drop-action" (click)="onMoveDown()">
            <app-icon name="down" [size]="13"></app-icon>
            <span>{{ i18n.t('rail.move_down') }}</span>
          </button>
          <div class="drop-divider"></div>
          <button type="button" class="drop-action delete-action" (click)="onDelete()">
            <app-icon name="trash" [size]="13"></app-icon>
            <span>{{ i18n.t('rail.delete') }}</span>
          </button>
        </div>
      }
    </div>
  `,
  styles: [
    `
      .rail-container {
        display: flex;
        align-items: center;
        gap: 2px;
        position: relative;
        opacity: 0;
        transition: opacity 0.15s ease;
      }
      :host-context(.block-row:hover) .rail-container,
      .rail-container.menu-open {
        opacity: 1;
      }
      .gutter-btn {
        width: 20px;
        height: 20px;
        display: grid;
        place-items: center;
        color: var(--faint);
        border-radius: 4px;
        background: transparent;
        transition: background 0.12s ease, color 0.12s ease;
      }
      .gutter-btn:hover {
        background: var(--soft);
        color: var(--text);
      }
      .grip-btn span {
        font-size: 14px;
        line-height: 1;
        color: var(--faint);
      }
      .grip-btn:hover span {
        color: var(--text);
      }
      .rail-dropdown {
        position: absolute;
        top: 24px;
        left: -4px;
        z-index: 50;
        background: var(--bg);
        border: 1px solid var(--border);
        border-radius: 8px;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
        padding: 4px;
        min-width: 130px;
        animation: fadeIn 0.12s ease;
      }
      .drop-action {
        width: 100%;
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 6px 8px;
        border-radius: 5px;
        font-size: 11px;
        color: var(--text);
        text-align: left;
      }
      .drop-action:hover {
        background: var(--soft);
      }
      .drop-divider {
        height: 1px;
        background: var(--border);
        margin: 3px 0;
      }
      .delete-action {
        color: #ef4444;
      }
      .delete-action:hover {
        background: #fef2f2;
        color: #dc2626;
      }
      body.dark .delete-action:hover {
        background: rgba(239, 68, 68, 0.15);
      }
    `,
  ],
})
export class BlockRailComponent {
  @Input() active = false;
  @Output() addBelow = new EventEmitter<void>();
  @Output() moveUp = new EventEmitter<void>();
  @Output() moveDown = new EventEmitter<void>();
  @Output() deleteBlock = new EventEmitter<void>();

  readonly i18n = inject(I18nService);
  readonly isMenuOpen = signal<boolean>(false);

  toggleMenu(): void {
    this.isMenuOpen.update((v) => !v);
  }

  onMoveUp(): void {
    this.isMenuOpen.set(false);
    this.moveUp.emit();
  }

  onMoveDown(): void {
    this.isMenuOpen.set(false);
    this.moveDown.emit();
  }

  onDelete(): void {
    this.isMenuOpen.set(false);
    this.deleteBlock.emit();
  }
}
