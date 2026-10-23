import { Component, EventEmitter, Input, Output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  LucideCheckCircle2,
  LucideDynamicIcon,
  LucideFilePlus2,
  LucideFileText,
  LucideListTree,
  LucidePlusCircle,
  LucideSearch,
  LucideTable,
  provideLucideIcons,
} from '@lucide/angular';
import { HeadingItem, TableItem } from '../../models/word-document.model';

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
  imports: [CommonModule, LucideDynamicIcon],
  providers: [
    provideLucideIcons(
      LucideListTree,
      LucidePlusCircle,
      LucideFileText,
      LucideFilePlus2,
      LucideCheckCircle2,
      LucideTable,
      LucideSearch
    ),
  ],
  templateUrl: './word-toc-sidebar.component.html',
  styleUrls: ['./word-toc-sidebar.component.scss'],
})
export class WordTocSidebarComponent {
  @Input() headings: HeadingItem[] = [];
  @Input() tables: TableItem[] = [];
  @Input() hasDetectedDocxToc?: boolean;
  @Input() tocPageNumber?: number;
  @Input() isOpen = false;
  @Output() jumpToPage = new EventEmitter<number>();
  @Output() selectHeading = new EventEmitter<{ id: string; pageIndex: number }>();
  @Output() selectTable = new EventEmitter<TableItem>();
  @Output() insertTocInDocument = new EventEmitter<void>();
  @Output() addNewPage = new EventEmitter<void>();
  @Output() close = new EventEmitter<void>();

  readonly levelBadgeColors = LEVEL_BADGE_COLORS;
  readonly activeMode = signal<'headings' | 'tables'>('headings');
  readonly searchQuery = signal<string>('');

  get filteredHeadings(): HeadingItem[] {
    const q = this.searchQuery().trim().toLowerCase();
    if (!q) return this.headings;
    return this.headings.filter((h) => h.text.toLowerCase().includes(q));
  }

  get filteredTables(): TableItem[] {
    const q = this.searchQuery().trim().toLowerCase();
    if (!q) return this.tables;
    return this.tables.filter((t) => t.title.toLowerCase().includes(q));
  }

  badgeColor(level: number): string {
    return this.levelBadgeColors[level] || this.levelBadgeColors[3];
  }

  paddingLeft(level: number): number {
    return (level - 1) * 10 + 8;
  }

  jump(pageNumber: number): void {
    this.jumpToPage.emit(pageNumber - 1);
  }

  onMouseDown(event: MouseEvent): void {
    event.preventDefault();
  }

  selectHeadingItem(item: HeadingItem): void {
    this.selectHeading.emit({ id: item.id, pageIndex: item.pageIndex });
  }
}
