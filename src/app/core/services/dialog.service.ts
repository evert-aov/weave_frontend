import { Injectable, signal } from '@angular/core';
import { DialogRequest } from '../models/dialog.model';

/** Estado del modal compartido. Las operaciones de documentos permanecen en sus servicios. */
@Injectable({ providedIn: 'root' })
export class DialogService {
  readonly request = signal<DialogRequest | null>(null);
  readonly busy = signal(false);
  readonly error = signal('');

  open(request: DialogRequest): void {
    if (this.busy()) return;
    this.error.set(''); this.request.set(request);
  }

  back(): void {
    if (!this.busy()) {
      const previous = this.request()?.back?.();
      if (previous) this.open(previous);
    }
  }

  close(force = false): void {
    if (this.busy() && !force) return;
    const request = this.request();
    this.request.set(null); this.error.set(''); this.busy.set(false);
    request?.onCancel?.();
  }

  notice(title: string, message: string): void { this.open({ kind: 'notice', title, message }); }

  async submit(rawValue = ''): Promise<void> {
    const request = this.request();
    if (!request || this.busy()) return;
    const value = rawValue.trim();
    if (request.kind === 'input') {
      const error = !value ? (request.requiredMessage ?? 'Escribe un valor para continuar.')
        : value.length > (request.maxLength ?? 160) ? 'El valor es demasiado largo.' : request.validate?.(value);
      if (error) { this.error.set(error); return; }
    }
    if (request.kind === 'choice' && !request.choices?.some((choice) => choice.value === value)) return;
    this.busy.set(true); this.error.set('');
    try {
      const next = await request.onSubmit?.(value);
      if (this.request() !== request) return;
      this.busy.set(false);
      if (next) this.open(next);
      else this.request.set(null);
    } catch {
      if (this.request() === request) this.error.set(request.errorMessage ?? 'No se pudo completar la operación. Inténtalo de nuevo.');
    } finally {
      if (this.request() === request) this.busy.set(false);
    }
  }
}
