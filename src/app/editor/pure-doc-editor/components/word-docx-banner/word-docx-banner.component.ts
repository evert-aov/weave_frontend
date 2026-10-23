import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  LucideDynamicIcon,
  LucideFileCheck2,
  LucideHeading,
  LucideImage,
  LucideLayers,
  LucideListTree,
  LucideType,
  LucideX,
  provideLucideIcons,
} from '@lucide/angular';
import { DocxDocumentProperties } from '../../models/word-document.model';

@Component({
  selector: 'app-word-docx-banner',
  standalone: true,
  imports: [CommonModule, LucideDynamicIcon],
  providers: [
    provideLucideIcons(
      LucideFileCheck2,
      LucideType,
      LucideLayers,
      LucideHeading,
      LucideImage,
      LucideListTree,
      LucideX
    ),
  ],
  templateUrl: './word-docx-banner.component.html',
  styleUrls: ['./word-docx-banner.component.scss'],
})
export class WordDocxBannerComponent {
  @Input() properties: DocxDocumentProperties | null = null;
  @Output() jumpToTocPage = new EventEmitter<number>();
  @Output() close = new EventEmitter<void>();

  get totalHeadings(): number {
    const p = this.properties;
    if (!p) return 0;
    const c = p.headingCounts;
    return c.h1 + c.h2 + c.h3 + c.h4 + c.h5 + c.h6;
  }

  handleTocClick(): void {
    const p = this.properties;
    if (p && p.hasTableOfContents && p.tocPageNumber) {
      this.jumpToTocPage.emit(p.tocPageNumber - 1);
    }
  }

  formatSizes(sizes: number[]): string {
    return sizes
      .slice(0, 4)
      .map((s) => `${s}pt`)
      .join(', ');
  }
}
