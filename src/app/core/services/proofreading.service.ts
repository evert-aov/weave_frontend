import { Injectable, inject, signal } from '@angular/core';
import { I18nService } from './i18n.service';
import type { WritingLanguage } from '../utils/proofreading';

interface WritingNotice { owner: object; kind: 'correction' | 'repetition'; before: string; after?: string; undo?: () => void; }
@Injectable({ providedIn: 'root' })
export class ProofreadingService {
  private readonly i18n = inject(I18nService);
  readonly language = signal<WritingLanguage>(this.read('weave_writing_language') === 'en' ? 'en' : this.read('weave_writing_language') === 'es' ? 'es' : (this.i18n.currentLang?.() ?? 'es'));
  readonly enabled = signal(this.read('weave_autocorrect') !== 'false');
  readonly notice = signal<WritingNotice | null>(null);
  setLanguage(language: string): void {
    if (language !== 'es' && language !== 'en') return;
    this.language.set(language); this.write('weave_writing_language', language); this.notice.set(null);
  }
  toggle(): void { this.enabled.update(value => !value); this.write('weave_autocorrect', String(this.enabled())); }
  dismiss(owner?: object): void { if (!owner || this.notice()?.owner === owner) this.notice.set(null); }
  undo(): void { const notice = this.notice(); this.notice.set(null); notice?.undo?.(); }
  private read(key: string): string | null { try { return localStorage.getItem(key); } catch { return null; } }
  private write(key: string, value: string): void { try { localStorage.setItem(key, value); } catch { /* Preferencia solo en memoria. */ } }
}
