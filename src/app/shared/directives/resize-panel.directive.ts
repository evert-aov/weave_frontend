import { Directive, ElementRef, inject, input, output } from '@angular/core';

/** Ajusta un panel mediante arrastre o teclado sin acoplarlo a la navegación ni al chat. */
@Directive({
  selector: '[appResizePanel]',
  standalone: true,
  host: {
    role: 'separator',
    tabindex: '0',
    'aria-orientation': 'vertical',
    '[attr.aria-label]': 'resizeLabel()',
    '[attr.aria-valuenow]': 'width()',
    '[attr.aria-valuemin]': 'resizeMin()',
    '[attr.aria-valuemax]': 'resizeMax()',
    '(pointerdown)': 'startResize($event)',
    '(pointermove)': 'resize($event)',
    '(pointerup)': 'stopResize($event)',
    '(lostpointercapture)': 'clearResize()',
    '(keydown)': 'resizeWithKeyboard($event)',
    '(dblclick)': 'resetWidth()',
  },
})
export class ResizePanelDirective {
  readonly width = input.required<number>({ alias: 'appResizePanel' });
  readonly resizeMin = input(240);
  readonly resizeMax = input(440);
  readonly resizeDefault = input(288);
  readonly resizeDirection = input<1 | -1>(1);
  readonly resizeLabel = input('Resize panel');
  readonly panelWidthChange = output<number>();
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  private drag: { pointerId: number; x: number; width: number } | null = null;

  startResize(event: PointerEvent): void {
    if (event.button !== 0) return;
    event.preventDefault();
    this.drag = { pointerId: event.pointerId, x: event.clientX, width: this.width() };
    this.element.nativeElement.setPointerCapture(event.pointerId);
    this.element.nativeElement.classList.add('resizing');
  }

  resize(event: PointerEvent): void {
    if (!this.drag || this.drag.pointerId !== event.pointerId) return;
    this.emitWidth(this.drag.width + (event.clientX - this.drag.x) * this.resizeDirection());
  }

  stopResize(event: PointerEvent): void {
    if (this.element.nativeElement.hasPointerCapture(event.pointerId)) {
      this.element.nativeElement.releasePointerCapture(event.pointerId);
    }
    this.clearResize();
  }

  clearResize(): void {
    this.drag = null;
    this.element.nativeElement.classList.remove('resizing');
  }

  resizeWithKeyboard(event: KeyboardEvent): void {
    let next: number;
    switch (event.key) {
      case 'ArrowLeft': next = this.width() - 16 * this.resizeDirection(); break;
      case 'ArrowRight': next = this.width() + 16 * this.resizeDirection(); break;
      case 'Home': next = this.resizeMin(); break;
      case 'End': next = this.resizeMax(); break;
      default: return;
    }
    event.preventDefault();
    this.emitWidth(next);
  }

  resetWidth(): void {
    this.emitWidth(this.resizeDefault());
  }

  private emitWidth(value: number): void {
    this.panelWidthChange.emit(Math.max(this.resizeMin(), Math.min(this.resizeMax(), value)));
  }
}
