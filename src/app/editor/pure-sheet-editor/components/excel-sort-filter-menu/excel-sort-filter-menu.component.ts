import { Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  LucideDynamicIcon,
  provideLucideIcons,
  LucideX,
  LucideArrowUp,
  LucideArrowDown,
  LucideFilter,
  LucideFilterX,
} from '@lucide/angular';
import { ThemeService } from '../../../../core/services/theme.service';
import { I18nService } from '../../../../core/services/i18n.service';

@Component({
  selector: 'app-excel-sort-filter-menu',
  standalone: true,
  imports: [CommonModule, LucideDynamicIcon],
  providers: [
    provideLucideIcons(
      LucideX,
      LucideArrowUp,
      LucideArrowDown,
      LucideFilter,
      LucideFilterX,
    ),
  ],
  templateUrl: './excel-sort-filter-menu.component.html',
  styleUrls: ['./excel-sort-filter-menu.component.scss'],
})
export class ExcelSortFilterMenuComponent {
  @Input() filterActive = false;

  @Output() sortAsc = new EventEmitter<void>();
  @Output() sortDesc = new EventEmitter<void>();
  @Output() toggleFilter = new EventEmitter<void>();
  @Output() clearFilters = new EventEmitter<void>();
  @Output() close = new EventEmitter<void>();

  readonly themeService = inject(ThemeService);
  readonly i18n = inject(I18nService);
}
