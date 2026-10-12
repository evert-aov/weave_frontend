import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { I18nService } from '../../core/services/i18n.service';

/**
 * Vista de Inicio de Sesión de Weave.
 */
@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="auth-page">
      <div class="auth-card">
        <div class="brand-header">
          <div class="brand-mark">W</div>
          <h2 class="font-display">{{ i18n.t('auth.login_title') }}</h2>
          <p>{{ i18n.t('auth.login_subtitle') }}</p>
        </div>

        @if (errorMessage()) {
          <div class="error-banner">
            {{ errorMessage() }}
          </div>
        }

        <form (ngSubmit)="onSubmit()" class="auth-form">
          <div class="form-group">
            <label>{{ i18n.t('auth.email') }}</label>
            <input
              type="email"
              [(ngModel)]="email"
              name="email"
              required
              placeholder="alex@weave.so"
              autocomplete="email"
            />
          </div>

          <div class="form-group">
            <label>{{ i18n.t('auth.password') }}</label>
            <input
              type="password"
              [(ngModel)]="password"
              name="password"
              required
              placeholder="••••••••"
              autocomplete="current-password"
            />
          </div>

          <button type="submit" [disabled]="isLoading()" class="submit-btn">
            {{ isLoading() ? '...' : i18n.t('auth.login_button') }}
          </button>
        </form>

        <div class="auth-footer">
          <span>{{ i18n.t('auth.no_account') }}</span>
          <a routerLink="/register">{{ i18n.t('auth.register_button') }}</a>
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      .auth-page {
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--canvas);
        padding: 20px;
      }
      .auth-card {
        width: 100%;
        max-width: 400px;
        background: var(--bg);
        border: 1px solid var(--border);
        border-radius: 12px;
        padding: 36px 32px;
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.05);
      }
      .brand-header {
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
        margin-bottom: 24px;
      }
      .brand-mark {
        width: 36px;
        height: 36px;
        border-radius: 10px;
        display: grid;
        place-items: center;
        color: white;
        font-weight: 700;
        font-family: serif;
        font-size: 18px;
        background: linear-gradient(145deg, #6458f1, #8c45e5);
        box-shadow: 0 4px 12px rgba(106, 91, 234, 0.25);
        margin-bottom: 14px;
      }
      h2 {
        font-size: 26px;
        margin: 0 0 6px;
        color: var(--text);
      }
      p {
        font-size: 12px;
        color: var(--muted);
        margin: 0;
      }
      .error-banner {
        background: #fef2f2;
        border: 1px solid #fecaca;
        color: #dc2626;
        padding: 8px 12px;
        border-radius: 6px;
        font-size: 11px;
        margin-bottom: 16px;
      }
      .auth-form {
        display: flex;
        flex-direction: column;
        gap: 16px;
      }
      .form-group {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      label {
        font-size: 11px;
        font-weight: 600;
        color: var(--text);
      }
      input {
        height: 36px;
        border: 1px solid var(--border);
        border-radius: 6px;
        padding: 0 12px;
        font-size: 12px;
        background: var(--panel);
        color: var(--text);
        outline: none;
      }
      input:focus {
        border-color: var(--accent);
      }
      .submit-btn {
        height: 38px;
        background: var(--accent);
        color: #ffffff;
        border-radius: 6px;
        font-size: 12px;
        font-weight: 600;
        margin-top: 8px;
        transition: opacity 0.15s ease;
      }
      .submit-btn:hover {
        opacity: 0.92;
      }
      .auth-footer {
        margin-top: 24px;
        display: flex;
        justify-content: center;
        gap: 6px;
        font-size: 11px;
        color: var(--muted);
      }
      .auth-footer a {
        color: var(--accent);
        font-weight: 600;
        text-decoration: none;
      }
      .auth-footer a:hover {
        text-decoration: underline;
      }
    `,
  ],
})
export class LoginComponent {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  readonly i18n = inject(I18nService);

  email = 'alex@weave.so';
  password = 'password123';
  readonly isLoading = signal<boolean>(false);
  readonly errorMessage = signal<string>('');

  onSubmit(): void {
    if (!this.email || !this.password) return;
    this.isLoading.set(true);
    this.errorMessage.set('');

    this.authService.login({ email: this.email, password: this.password }).subscribe({
      next: () => {
        this.isLoading.set(false);
      },
      error: (err) => {
        this.isLoading.set(false);
        this.errorMessage.set(
          err.error?.message || 'Invalid email or password. Please try again.',
        );
      },
    });
  }
}
