import { describe, expect, it } from 'vitest';
import { DEFAULT_LAYOUT_CONFIG } from '../constants/word-document.constants';
import type { DocumentPage } from '../models/word-document.model';
import {
  findLogicalSectionStartPageIndex,
  formatPageNumber,
  groupDocumentSectionSpans,
  resolveDocumentPageSections,
  resolvePageDynamicTokens,
} from './page-section-layout';

describe('page-section-layout utilities', () => {
  it('formats decimal, roman-lower and roman-upper page numbers accurately', () => {
    expect(formatPageNumber(1, 'decimal')).toBe('1');
    expect(formatPageNumber(14, 'decimal')).toBe('14');
    expect(formatPageNumber(1, 'roman-lower')).toBe('i');
    expect(formatPageNumber(4, 'roman-lower')).toBe('iv');
    expect(formatPageNumber(9, 'roman-lower')).toBe('ix');
    expect(formatPageNumber(14, 'roman-upper')).toBe('XIV');
    expect(formatPageNumber(0, 'roman-lower')).toBe('i');
    expect(formatPageNumber(4500, 'roman-upper')).toBe('4500');
  });

  it('replaces dynamic {{page}} and {{totalPages}} tokens cleanly', () => {
    expect(resolvePageDynamicTokens('Pág. {{page}} de {{totalPages}}', 'iii', '12')).toBe('Pág. iii de 12');
    expect(resolvePageDynamicTokens('{{ page }} / {{ pages }}', '1', '5')).toBe('1 / 5');
    expect(resolvePageDynamicTokens('Sin tokens', '2', '8')).toBe('Sin tokens');
  });

  it('resolves thesis sections: cover differentFirstPage, roman preliminaries, arabic body restart and landscape appendix', () => {
    const pages: DocumentPage[] = [
      { id: 'cover', html: '<p>Portada</p>' },
      { id: 'prelim-1', html: '<p>Índice</p>', breakBefore: 'manual', sectionBreak: 'nextPage', sectionConfig: { pageNumberFormat: 'roman-lower', restartPageNumbering: 1 } },
      { id: 'prelim-2', html: '<p>Resumen</p>', breakBefore: 'manual' },
      { id: 'cap-1', html: '<h1>Capítulo 1</h1>', breakBefore: 'manual', sectionBreak: 'nextPage', sectionConfig: { pageNumberFormat: 'decimal', restartPageNumbering: 1 } },
      { id: 'cap-2', html: '<p>Continuación</p>' },
      { id: 'annex', html: '<p>Anexo tabla</p>', breakBefore: 'manual', sectionBreak: 'nextPage', sectionConfig: { orientation: 'landscape' } },
    ];

    const resolved = resolveDocumentPageSections(pages, {
      ...DEFAULT_LAYOUT_CONFIG,
      differentFirstPage: true,
    });

    expect(resolved).toHaveLength(6);
    // Cover page: section 0, header/footer suppressed on first page only
    expect(resolved[0].sectionIndex).toBe(0);
    expect(resolved[0].suppressHeaderFooter).toBe(true);
    expect(resolved[0].formattedPageNumber).toBe('1');

    // Prelim pages: section 1, lowercase roman i & ii, same portrait dimensions
    expect(resolved[1].sectionIndex).toBe(1);
    expect(resolved[1].suppressHeaderFooter).toBe(false);
    expect(resolved[1].formattedPageNumber).toBe('i');
    expect(resolved[2].sectionIndex).toBe(1);
    expect(resolved[2].formattedPageNumber).toBe('ii');

    // Main body: section 2, restarted at decimal 1 & 2 even across manual/auto breaks
    expect(resolved[3].sectionIndex).toBe(2);
    expect(resolved[3].formattedPageNumber).toBe('1');
    expect(resolved[4].sectionIndex).toBe(2);
    expect(resolved[4].formattedPageNumber).toBe('2');

    // Landscape annex: section 3, continues numbering at 3, width > height
    expect(resolved[5].sectionIndex).toBe(3);
    expect(resolved[5].formattedPageNumber).toBe('3');
    expect(resolved[5].orientation).toBe('landscape');
    expect(resolved[5].widthPx).toBeGreaterThan(resolved[5].heightPx);
    expect(resolved[0].widthPx).toBeLessThan(resolved[0].heightPx);

    expect(findLogicalSectionStartPageIndex(pages, 2)).toBe(1);
    expect(findLogicalSectionStartPageIndex(pages, 4)).toBe(3);

    const spans = groupDocumentSectionSpans(pages, { ...DEFAULT_LAYOUT_CONFIG, differentFirstPage: true });
    expect(spans.map(s => [s.startPageIndex, s.endPageIndex])).toEqual([[0, 0], [1, 2], [3, 4], [5, 5]]);
  });
});
