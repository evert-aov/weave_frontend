import { AfterViewInit, Component, ElementRef, EventEmitter, Input, Output, ViewChild, inject } from '@angular/core';
import { LucideDynamicIcon, LucideX, LucideChevronUp, LucideChevronDown, provideLucideIcons } from '@lucide/angular';
import { I18nService } from '../../../../core/services/i18n.service';

export interface WordSearchConfig { query: string; replacement: string; matchCase: boolean; wholeWord: boolean; }
export type WordSearchAction = 'close' | 'next' | 'previous' | 'replace' | 'all';

@Component({
  selector: 'app-word-search-panel', standalone: true,
  imports: [LucideDynamicIcon],
  providers: [provideLucideIcons(LucideX, LucideChevronUp, LucideChevronDown)],
  template: `
    <section class="word-search-panel" [class.dark-mode]="darkMode" [attr.aria-label]="t('word.search.panel_label')" (keydown.escape)="action.emit('close')" (mousedown)="keepSelection($event)">
      <label>{{ t('word.search.find_label') }} <input #queryInput [attr.aria-label]="t('word.search.input_placeholder')" type="search" maxlength="1000" [value]="query" (input)="change.emit({ query: $any($event.target).value })" (keydown.enter)="action.emit($any($event).shiftKey ? 'previous' : 'next'); $event.preventDefault()" /></label>
      <button type="button" [title]="t('word.search.prev')" [attr.aria-label]="t('word.search.prev')" (click)="action.emit('previous')"><svg lucideIcon="chevron-up" [size]="16"></svg></button>
      <button type="button" [title]="t('word.search.next')" [attr.aria-label]="t('word.search.next')" (click)="action.emit('next')"><svg lucideIcon="chevron-down" [size]="16"></svg></button>
      <label><input type="checkbox" [checked]="matchCase" (change)="change.emit({ matchCase: $any($event.target).checked })" />{{ t('word.search.case') }}</label>
      <label><input type="checkbox" [checked]="wholeWord" (change)="change.emit({ wholeWord: $any($event.target).checked })" />{{ t('word.search.whole') }}</label>
      @if (mode === 'replace') {
        <label>{{ t('word.search.replace_label') }} <input [attr.aria-label]="t('word.search.replace_label')" [value]="replacement" (input)="change.emit({ replacement: $any($event.target).value })" (keydown.enter)="action.emit('replace'); $event.preventDefault()" /></label>
        <button type="button" (click)="action.emit('replace')">{{ t('word.search.replace_btn') }}</button>
        <button type="button" (click)="action.emit('all')">{{ t('word.search.all_btn') }}</button>
      }
      <span role="status">{{ status }}</span>
      <button type="button" [title]="t('word.search.close')" [attr.aria-label]="t('word.search.close')" (click)="action.emit('close')"><svg lucideIcon="x" [size]="16"></svg></button>
    </section>
  `,
  styles: `
    .word-search-panel { display: flex; flex-wrap: wrap; align-items: center; gap: 7px; padding: 8px 14px; background: #f8fafc; border-bottom: 1px solid #cbd5e1; color: #334155; font-size: 12px; transition: all 0.15s ease; }
    label { display: flex; align-items: center; gap: 5px; } input:not([type=checkbox]) { width: 170px; border: 1px solid #94a3b8; padding: 4px 6px; border-radius: 4px; background: white; color: #0f172a; }
    button { display: inline-flex; padding: 5px 7px; border: 1px solid #cbd5e1; border-radius: 4px; background: white; cursor: pointer; color: inherit; } button:hover { background: #dbeafe; }
    button:focus-visible,input:focus-visible { outline: 2px solid #2563eb; outline-offset: 1px; } span { margin-left: auto; }

    .word-search-panel.dark-mode {
      background: #18181b; border-bottom-color: #27272a; color: #e4e4e7;
      input:not([type=checkbox]) { background: #202024; border-color: #3f3f46; color: #f4f4f5; }
      button { background: #202024; border-color: #3f3f46; color: #e4e4e7; }
      button:hover { background: #27272a; border-color: #60a5fa; color: #60a5fa; }
    }
  `,
})
export class WordSearchPanelComponent implements AfterViewInit {
  readonly i18n = inject(I18nService, { optional: true });

  t(key: string, params?: Record<string, string | number>): string {
    return this.i18n?.t ? this.i18n.t(key, params) : key;
  }

  @Input() darkMode = false;
  @Input() mode: 'find' | 'replace' = 'find';
  @Input() query = '';
  @Input() replacement = '';
  @Input() matchCase = false;
  @Input() wholeWord = false;
  @Input() status = '';
  @Output() change = new EventEmitter<Partial<WordSearchConfig>>();
  @Output() action = new EventEmitter<WordSearchAction>();
  @ViewChild('queryInput') input?: ElementRef<HTMLInputElement>;
  ngAfterViewInit(): void { this.input?.nativeElement.focus(); this.input?.nativeElement.select(); }
  keepSelection(event: MouseEvent): void { if ((event.target as Element).closest('button')) event.preventDefault(); }
}
