import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output, inject, signal } from '@angular/core';
import {
  LucideCheckCircle2,
  LucideChevronDown,
  LucideChevronRight,
  LucideDynamicIcon,
  LucideFileText,
  LucideListTree,
  LucideSearch,
  LucideTable,
  provideLucideIcons,
} from '@lucide/angular';
import { HeadingItem, TableItem } from '../../models/word-document.model';
import { I18nService } from '../../../../core/services/i18n.service';

export interface TocHeadingRow {
  item: HeadingItem;
  key: string;
  hasChildren: boolean;
  collapsed: boolean;
}

const LEVEL_BADGE_COLORS: Record<number, string> = {
  1: 'bg-blue-100 text-blue-800 border-blue-200',
  2: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  3: 'bg-slate-100 text-slate-700 border-slate-200',
  4: 'bg-slate-50 text-slate-600 border-slate-200',
  5: 'bg-slate-50 text-slate-500 border-slate-200',
  6: 'bg-slate-50 text-slate-400 border-slate-200',
};

@Component({
  selector: 'app-word-toc-sidebar',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LucideDynamicIcon],
  providers: [
    provideLucideIcons(
      LucideListTree,
      LucideFileText,
      LucideCheckCircle2,
      LucideChevronDown,
      LucideChevronRight,
      LucideTable,
      LucideSearch
    ),
  ],
  templateUrl: './word-toc-sidebar.component.html',
  styleUrls: ['./word-toc-sidebar.component.scss'],
})
export class WordTocSidebarComponent {
  readonly i18n = inject(I18nService, { optional: true });

  t(key: string, params?: Record<string, string | number>): string {
    return this.i18n?.t ? this.i18n.t(key, params) : key;
  }

  @Input() darkMode = false;
  @Input() headings: HeadingItem[] = [];
  @Input() tables: TableItem[] = [];
  @Input() hasDetectedDocxToc?: boolean;
  @Input() tocPageNumber?: number;
  @Input() isOpen = false;
  @Output() jumpToPage = new EventEmitter<number>();
  @Output() selectHeading = new EventEmitter<{ id: string; pageIndex: number }>();
  @Output() selectTable = new EventEmitter<TableItem>();
  @Output() close = new EventEmitter<void>();

  readonly levelBadgeColors = LEVEL_BADGE_COLORS;
  readonly activeMode = signal<'headings' | 'tables'>('headings');
  readonly searchQuery = signal<string>('');
  readonly collapsedKeys = signal<ReadonlySet<string>>(new Set());

  private normalizeSearch(value: string): string {
    return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  }

  private headingKey(item: HeadingItem, index: number): string {
    return item.id ? `${item.id}:${index}` : `h:${item.level}:${index}`;
  }

  get visibleHeadings(): TocHeadingRow[] {
    const q = this.normalizeSearch(this.searchQuery().trim());
    if (q) {
      const matched: TocHeadingRow[] = [];
      for (let i = 0; i < this.headings.length; i++) {
        const item = this.headings[i];
        if (this.normalizeSearch(item.text).includes(q)) {
          matched.push({ item, key: this.headingKey(item, i), hasChildren: false, collapsed: false });
        }
      }
      return matched;
    }

    const collapsed = this.collapsedKeys();
    const rows: TocHeadingRow[] = [];
    let hiddenBelowLevel: number | null = null;
    for (let i = 0; i < this.headings.length; i++) {
      const item = this.headings[i];
      if (hiddenBelowLevel !== null) {
        if (item.level > hiddenBelowLevel) continue;
        hiddenBelowLevel = null;
      }
      const hasChildren = i + 1 < this.headings.length && this.headings[i + 1].level > item.level;
      const key = this.headingKey(item, i);
      const isCollapsed = hasChildren && collapsed.has(key);
      rows.push({ item, key, hasChildren, collapsed: isCollapsed });
      if (isCollapsed) {
        hiddenBelowLevel = item.level;
      }
    }
    return rows;
  }

  get filteredHeadings(): HeadingItem[] {
    return this.visibleHeadings.map(r => r.item);
  }

  get hasCollapsibleHeadings(): boolean {
    for (let i = 0; i < this.headings.length - 1; i++) {
      if (this.headings[i + 1].level > this.headings[i].level) return true;
    }
    return false;
  }

  get allHeadingsCollapsed(): boolean {
    const collapsed = this.collapsedKeys();
    let anyParent = false;
    for (let i = 0; i < this.headings.length - 1; i++) {
      if (this.headings[i + 1].level > this.headings[i].level) {
        anyParent = true;
        if (!collapsed.has(this.headingKey(this.headings[i], i))) return false;
      }
    }
    return anyParent;
  }

  toggleHeadingCollapse(key: string, event: MouseEvent): void {
    event.stopPropagation();
    event.preventDefault();
    this.collapsedKeys.update(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  toggleAllHeadingsCollapse(): void {
    if (this.allHeadingsCollapsed) {
      this.collapsedKeys.set(new Set());
      return;
    }
    const allParents = new Set<string>();
    for (let i = 0; i < this.headings.length - 1; i++) {
      if (this.headings[i + 1].level > this.headings[i].level) {
        allParents.add(this.headingKey(this.headings[i], i));
      }
    }
    this.collapsedKeys.set(allParents);
  }

  get filteredTables(): TableItem[] {
    const q = this.normalizeSearch(this.searchQuery().trim());
    if (!q) return this.tables;
    return this.tables.filter((t) => this.normalizeSearch(t.title).includes(q));
  }

  badgeColor(level: number): string {
    return this.levelBadgeColors[level] || this.levelBadgeColors[3];
  }

  paddingLeft(level: number): number {
    return Math.max(0,level - (this.headings.some(h=>h.level===0)?0:1)) * 10 + 8;
  }

  jump(pageNumber: number): void {
    this.jumpToPage.emit(pageNumber - 1);
  }

  selectHeadingItem(item: HeadingItem): void {
    this.selectHeading.emit({ id: item.id, pageIndex: item.pageIndex });
  }
}
