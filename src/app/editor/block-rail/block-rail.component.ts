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
  templateUrl: './block-rail.component.html',
  styleUrl: './block-rail.component.scss',
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
