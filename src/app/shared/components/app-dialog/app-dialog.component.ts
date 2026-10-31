import { Component, ElementRef, Input, OnChanges, OnDestroy, ViewChild, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DialogService } from '../../../core/services/dialog.service';
import { I18nService } from '../../../core/services/i18n.service';
import { DialogRequest } from '../../../core/models/dialog.model';
import { IconComponent } from '../icon/icon.component';

@Component({
  selector: 'app-dialog', standalone: true, imports: [FormsModule, IconComponent],
  templateUrl: './app-dialog.component.html', styleUrl: './app-dialog.component.scss',
})
export class AppDialogComponent implements OnChanges, OnDestroy {
  @Input({ required: true }) request!: DialogRequest;
  @ViewChild('dialog') dialog?: ElementRef<HTMLElement>;
  readonly dialogs = inject(DialogService);
  readonly i18n = inject(I18nService);
  readonly value = signal('');
  private readonly previousFocus = document.activeElement as HTMLElement | null;
  private destroyed = false;

  constructor() {
    effect(() => {
      if (this.dialogs.busy()) queueMicrotask(() => {
        if (!this.destroyed && this.dialogs.busy()) this.dialog?.nativeElement.focus({ preventScroll: true });
      });
    });
  }

  ngOnChanges(): void {
    this.value.set(this.request.initialValue ?? '');
    // ngModel escribe el valor en una microtarea; seleccionar después evita seleccionar un input vacío.
    queueMicrotask(() => queueMicrotask(() => {
      if (this.destroyed) return;
      const root = this.dialog?.nativeElement;
      const target = root?.querySelector<HTMLElement>(this.request.destructive ? '[data-dialog-cancel]' : '[data-dialog-autofocus]')
        ?? root?.querySelector<HTMLElement>('button:not([disabled])');
      target?.focus();
      if (target instanceof HTMLInputElement) target.select();
    }));
  }

  onInput(value: string): void { this.value.set(value); this.dialogs.error.set(''); }
  submit(event: Event): void { event.preventDefault(); void this.dialogs.submit(this.value()); }

  onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); this.dialogs.close(); return; }
    if (event.key !== 'Tab') return;
    const controls = Array.from(this.dialog?.nativeElement.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled])') ?? []);
    const first = controls[0], last = controls.at(-1);
    if (!first) { event.preventDefault(); return; }
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    const active = document.activeElement;
    if (this.previousFocus?.isConnected && (active === document.body || (active && this.dialog?.nativeElement.contains(active)))) {
      this.previousFocus.focus({ preventScroll: true });
    }
  }
}
