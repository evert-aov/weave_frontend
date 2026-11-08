import { Component, EventEmitter, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ExcelFunctionInfo } from '../../models/excel.model';
import { EXCEL_FUNCTIONS } from '../../constants/excel.constants';
import { ThemeService } from '../../../../core/services/theme.service';
import { I18nService } from '../../../../core/services/i18n.service';

@Component({
  selector: 'app-excel-functions-drawer',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './excel-functions-drawer.component.html',
  styleUrls: ['./excel-functions-drawer.component.scss']
})
export class ExcelFunctionsDrawerComponent {
  @Output() insertFunction = new EventEmitter<string>();
  @Output() close = new EventEmitter<void>();

  readonly themeService = inject(ThemeService);
  readonly i18n = inject(I18nService);

  readonly allFunctions = EXCEL_FUNCTIONS;
  searchQuery = '';
  selectedCategory = 'Todas';

  get categories(): string[] {
    const cats = Array.from(new Set(this.allFunctions.map((f) => f.category)));
    return ['Todas', ...cats];
  }

  get filteredFunctions(): ExcelFunctionInfo[] {
    const q = this.searchQuery.trim().toLowerCase();
    return this.allFunctions.filter((fn) => {
      const matchCat =
        this.selectedCategory === 'Todas' || fn.category === this.selectedCategory;
      const matchQuery =
        !q ||
        fn.nameEs.toLowerCase().includes(q) ||
        fn.nameEn.toLowerCase().includes(q) ||
        fn.description.toLowerCase().includes(q) ||
        fn.category.toLowerCase().includes(q);
      return matchCat && matchQuery;
    });
  }

  insert(fn: ExcelFunctionInfo): void {
    const name = fn.nameEn;
    this.insertFunction.emit(`=${name}()`);
    this.close.emit();
  }
}
