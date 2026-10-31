import { Component, EventEmitter, inject, Input, Output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  LucideDynamicIcon,
  provideLucideIcons,
  LucideLayoutGrid,
  LucideList,
  LucideGitCommit,
  LucideRefreshCw,
  LucideNetwork,
  LucideLayers,
  LucideTriangle,
  LucideImage,
  LucideHelpCircle,
  LucideX,
  LucideShapes,
  LucideCalendar,
} from '@lucide/angular';
import { SMARTART_ITEMS } from '../../constants/word-insert.constants';
import { SmartArtCategory, SmartArtItem } from '../../models/word-insert.model';
import { I18nService } from '../../../../core/services/i18n.service';

@Component({
  selector: 'app-word-smartart-modal',
  standalone: true,
  imports: [CommonModule, LucideDynamicIcon],
  providers: [
    provideLucideIcons(
      LucideLayoutGrid,
      LucideList,
      LucideGitCommit,
      LucideRefreshCw,
      LucideNetwork,
      LucideLayers,
      LucideTriangle,
      LucideImage,
      LucideHelpCircle,
      LucideX,
      LucideShapes,
      LucideCalendar,
    ),
  ],
  templateUrl: './word-smartart-modal.component.html',
  styleUrl: './word-smartart-modal.component.scss',
})
export class WordSmartArtModalComponent {
  private readonly i18n = inject(I18nService, { optional: true });

  @Input() isOpen = false;
  @Input() darkMode = false;
  @Output() selectItem = new EventEmitter<SmartArtItem>();
  @Output() close = new EventEmitter<void>();

  readonly allItems = SMARTART_ITEMS;
  readonly selectedCategory = signal<SmartArtCategory>('list');
  readonly selectedItem = signal<SmartArtItem>(SMARTART_ITEMS[0]);

  readonly categories: { id: SmartArtCategory; labelKey: string; fallback: string; icon: string }[] = [
    { id: 'all', labelKey: 'word.smartart.cat_all', fallback: 'Todos', icon: 'layout-grid' },
    { id: 'list', labelKey: 'word.smartart.cat_list', fallback: 'Lista', icon: 'list' },
    { id: 'process', labelKey: 'word.smartart.cat_process', fallback: 'Proceso', icon: 'git-commit' },
    { id: 'cycle', labelKey: 'word.smartart.cat_cycle', fallback: 'Ciclo', icon: 'refresh-cw' },
    { id: 'hierarchy', labelKey: 'word.smartart.cat_hierarchy', fallback: 'Jerarquía', icon: 'network' },
    { id: 'relationship', labelKey: 'word.smartart.cat_relationship', fallback: 'Relación', icon: 'layers' },
    { id: 'matrix', labelKey: 'word.smartart.cat_matrix', fallback: 'Matriz', icon: 'layout-grid' },
    { id: 'pyramid', labelKey: 'word.smartart.cat_pyramid', fallback: 'Pirámide', icon: 'triangle' },
    { id: 'picture', labelKey: 'word.smartart.cat_picture', fallback: 'Imagen', icon: 'image' },
  ];

  t(key: string, fallback?: string): string {
    return this.i18n?.t ? this.i18n.t(key) : fallback || key;
  }

  get filteredItems(): SmartArtItem[] {
    const cat = this.selectedCategory();
    if (cat === 'all') return this.allItems;
    return this.allItems.filter(item => item.category === cat);
  }

  setCategory(cat: SmartArtCategory): void {
    this.selectedCategory.set(cat);
    const filtered = this.filteredItems;
    if (filtered.length > 0 && !filtered.some(i => i.id === this.selectedItem()?.id)) {
      this.selectedItem.set(filtered[0]);
    }
  }

  chooseItem(item: SmartArtItem): void {
    this.selectedItem.set(item);
  }

  confirm(): void {
    const current = this.selectedItem();
    if (current) {
      this.selectItem.emit(current);
    }
  }
}
