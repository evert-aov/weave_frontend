import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { I18nService } from '../../core/services/i18n.service';

/**
 * Vista de Registro de Nuevos Usuarios de Weave.
 */
@Component({
  selector: 'app-register',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './register.component.html',
})
export class RegisterComponent {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  readonly i18n = inject(I18nService);

  name = 'Alex Morgan';
  email = 'alex@weave.so';
  password = 'password123';
  readonly isLoading = signal<boolean>(false);
  readonly errorMessage = signal<string>('');

  onSubmit(): void {
    if (!this.name || !this.email || !this.password) return;
    this.isLoading.set(true);
    this.errorMessage.set('');

    this.authService
      .register({ name: this.name, email: this.email, password: this.password })
      .subscribe({
        next: () => {
          this.isLoading.set(false);
        },
        error: (err) => {
          this.isLoading.set(false);
          this.errorMessage.set(
            err.error?.message || 'Registration failed. Please try again.',
          );
        },
      });
  }
}
