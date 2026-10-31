import { Directive, ElementRef, HostListener, OnDestroy, inject, signal } from '@angular/core';

/** Amplía el panel sin recrear su editor, selección ni PDF. */
@Directive({ selector: '[appFullscreenPanel]', standalone: true, exportAs: 'fullscreenPanel',
  host: { '[class.panel-fullscreen]': 'expanded()', '[attr.data-expanded]': 'expanded()' },
})
export class FullscreenPanelDirective implements OnDestroy {
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  readonly expanded = signal(false);
  private previousFocus?: HTMLElement;
  private readonly changed = () => {
    if (!document.fullscreenElement && this.native) this.closeFallback();
  };
  private native = false;
  constructor() { document.addEventListener('fullscreenchange', this.changed); }
  async toggle(): Promise<void> {
    if (this.expanded()) {
      if (document.fullscreenElement === this.element.nativeElement) await document.exitFullscreen();
      this.closeFallback(); return;
    }
    this.previousFocus = document.activeElement as HTMLElement;
    this.expanded.set(true);
    try {
      if (this.element.nativeElement.requestFullscreen) {
        await this.element.nativeElement.requestFullscreen(); this.native = true;
      }
    } catch { /* El panel ocupa la ventana cuando no hay permiso de pantalla completa. */ }
    window.dispatchEvent(new Event('resize'));
  }
  @HostListener('document:keydown.escape') escape(): void {
    if (this.expanded() && !this.native) this.closeFallback();
  }
  private closeFallback(): void {
    this.native = false; this.expanded.set(false);
    this.previousFocus?.focus(); window.dispatchEvent(new Event('resize'));
  }
  ngOnDestroy(): void { document.removeEventListener('fullscreenchange', this.changed); }
}
