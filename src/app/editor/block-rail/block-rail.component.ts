import {
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  Input,
  Output,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { IconComponent } from '../../shared/components/icon/icon.component';
import { I18nService } from '../../core/services/i18n.service';

/**
 * Rail de control de bloque.
 * Ubicado estrictamente en el canalón izquierdo (gutter) fuera del flujo de texto,
 * garantizando que NUNCA se sobreponga ni estorbe a la escritura.
 * Permite arrastrar el tirador (:::) para mover rápidamente o hacer clic para opciones.
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
  @Output() addBelow = new EventEmitter<{ shiftKey: boolean }>();
  @Output() moveUp = new EventEmitter<void>();
  @Output() moveDown = new EventEmitter<void>();
  @Output() deleteBlock = new EventEmitter<void>();
  @Output() dragStarted = new EventEmitter<DragEvent>();
  @Output() dragEnded = new EventEmitter<DragEvent>();

  readonly i18n = inject(I18nService);
  private readonly elementRef = inject(ElementRef);
  readonly isMenuOpen = signal<boolean>(false);
  private wasDragged = false;

  @HostListener('document:pointerdown', ['$event'])
  onDocumentPointerDown(event: PointerEvent): void {
    if (this.isMenuOpen()) {
      const target = event.target as HTMLElement;
      if (target && !this.elementRef.nativeElement.contains(target)) {
        this.isMenuOpen.set(false);
      }
    }
  }

  onAddClick(event: MouseEvent): void {
    event.stopPropagation();
    this.addBelow.emit({ shiftKey: event.shiftKey });
  }

  onMouseDown(event: MouseEvent): void {
    // Evita selección de texto en el bloque al hacer clic sobre el tirador
    window.getSelection()?.removeAllRanges();
  }

  onDragStart(event: DragEvent): void {
    this.wasDragged = true;
    this.isMenuOpen.set(false);
    window.getSelection()?.removeAllRanges();
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', 'block');
      const row = (event.target as HTMLElement).closest('.block-row') as HTMLElement;
      if (row && event.dataTransfer.setDragImage) {
        if (row.offsetHeight > 140) {
          const ghost = document.createElement('div');
          ghost.innerHTML = `<span style="font-weight: 700; margin-right: 6px;">⠿</span> Mover bloque`;
          ghost.style.cssText = 'position: fixed; top: -9999px; left: -9999px; background: #5b50e6; color: #fff; padding: 7px 14px; border-radius: 7px; font-size: 13px; font-family: sans-serif; box-shadow: 0 8px 24px rgba(0,0,0,0.25); pointer-events: none; z-index: 99999;';
          document.body.appendChild(ghost);
          event.dataTransfer.setDragImage(ghost, 20, 16);
          setTimeout(() => ghost.remove(), 0);
        } else {
          event.dataTransfer.setDragImage(row, 24, 24);
        }
      }
    }
    this.dragStarted.emit(event);
  }

  onDragEnd(event: DragEvent): void {
    this.dragEnded.emit(event);
    setTimeout(() => {
      this.wasDragged = false;
    }, 120);
  }

  toggleMenu(event?: MouseEvent): void {
    if (this.wasDragged) return;
    if (event) {
      event.stopPropagation();
    }
    this.isMenuOpen.update((v) => !v);
  }

  onMoveUp(event?: Event): void {
    event?.stopPropagation();
    this.moveUp.emit();
  }

  onMoveDown(event?: Event): void {
    event?.stopPropagation();
    this.moveDown.emit();
  }

  onDelete(event?: Event): void {
    event?.stopPropagation();
    this.isMenuOpen.set(false);
    this.deleteBlock.emit();
  }
}
