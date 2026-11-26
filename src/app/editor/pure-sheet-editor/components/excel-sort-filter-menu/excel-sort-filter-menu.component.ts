import { LucideDynamicIcon, provideLucideIcons } from '../../../../shared/components/ng-lucide-icon.directive';
import { Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { lucideX, lucideArrowUp, lucideArrowDown, lucideFilter, lucideFilterX } from '@ng-icons/lucide';
import { ThemeService } from '../../../../core/services/theme.service';
import { I18nService } from '../../../../core/services/i18n.service';

@Component({
  selector: 'app-excel-sort-filter-menu',
  standalone: true,
  imports: [CommonModule, LucideDynamicIcon],
  providers: [
    provideLucideIcons({ lucideX,
      lucideArrowUp,
      lucideArrowDown,
      lucideFilter,
      lucideFilterX, }),
  ],
  templateUrl: './excel-sort-filter-menu.component.html',
  styleUrls: ['./excel-sort-filter-menu.component.css'],
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
