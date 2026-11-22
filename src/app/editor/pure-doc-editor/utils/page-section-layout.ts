import { PAPER_FORMAT_PRESETS } from '../constants/word-document.constants';
import {
  DocumentLayoutConfig,
  DocumentPage,
  PageNumberFormat,
  PageOrientation,
  SectionPageConfig,
} from '../models/word-document.model';

export interface ResolvedPageSectionInfo {
  pageIndex: number;
  sectionIndex: number;
  pageInSectionIndex: number;
  sectionPageCount: number;
  pageNumber: number;
  formattedPageNumber: string;
  formattedTotalPages: string;
  pageNumberFormat: PageNumberFormat;
  differentFirstPage: boolean;
  suppressHeaderFooter: boolean;
  orientation: PageOrientation;
  widthPx: number;
  heightPx: number;
  headerHtml: string;
  footerHtml: string;
  hasSectionBreak: boolean;
  restartPageNumbering?: number;
}

export interface DocumentSectionSpan {
  sectionIndex: number;
  startPageIndex: number;
  endPageIndex: number;
  firstPageInfo: ResolvedPageSectionInfo;
}

const ROMAN_TABLE: readonly [number, string][] = [
  [1000, 'M'],
  [900, 'CM'],
  [500, 'D'],
  [400, 'CD'],
  [100, 'C'],
  [90, 'XC'],
  [50, 'L'],
  [40, 'XL'],
  [10, 'X'],
  [9, 'IX'],
  [5, 'V'],
  [4, 'IV'],
  [1, 'I'],
];

const TOKEN_PAGE_RE = /\{\{\s*page\s*\}\}/gi;
const TOKEN_TOTAL_RE = /\{\{\s*(?:totalPages|pages|total)\s*\}\}/gi;

/** Formats a 1-based page number according to the configured numbering style. */
export function formatPageNumber(num: number, format: PageNumberFormat = 'decimal'): string {
  const safe = Number.isFinite(num) ? Math.max(1, Math.trunc(num)) : 1;
  if (format === 'decimal' || safe > 3999) {
    return String(safe);
  }
  let remainder = safe;
  let roman = '';
  for (const [value, symbol] of ROMAN_TABLE) {
    while (remainder >= value) {
      roman += symbol;
      remainder -= value;
    }
  }
  return format === 'roman-lower' ? roman.toLowerCase() : roman;
}

/** Replaces dynamic `{{page}}` and `{{totalPages}}` tokens in plain text. */
export function resolvePageDynamicTokens(
  text: string,
  formattedPage: string,
  formattedTotalPages: string,
): string {
  if (!text || !text.includes('{{')) return text;
  return text
    .replace(TOKEN_PAGE_RE, formattedPage)
    .replace(TOKEN_TOTAL_RE, formattedTotalPages);
}

/** Replaces dynamic page tokens inside HTML markup (e.g. `.word-page-number`, DOM footers). */
export function resolvePageDynamicHtml(
  html: string,
  formattedPage: string,
  formattedTotalPages: string,
): string {
  if (!html || !html.includes('{{')) return html;
  return html
    .replace(TOKEN_PAGE_RE, formattedPage)
    .replace(TOKEN_TOTAL_RE, formattedTotalPages);
}

/** Returns page dimensions in CSS pixels (96 DPI) for a layout config and target orientation. */
export function resolveSectionDimensionsPx(
  layoutConfig: DocumentLayoutConfig,
  orientation: PageOrientation,
): { widthPx: number; heightPx: number } {
  const preset = PAPER_FORMAT_PRESETS[layoutConfig.paperFormatId] || PAPER_FORMAT_PRESETS['letter'];
  const rawW =
    layoutConfig.paperFormatId === 'custom' && layoutConfig.customWidthPx
      ? layoutConfig.customWidthPx
      : preset.widthPx;
  const rawH =
    layoutConfig.paperFormatId === 'custom' && layoutConfig.customHeightPx
      ? layoutConfig.customHeightPx
      : preset.heightPx;
  return orientation === 'landscape'
    ? { widthPx: Math.max(rawW, rawH), heightPx: Math.min(rawW, rawH) }
    : { widthPx: Math.min(rawW, rawH), heightPx: Math.max(rawW, rawH) };
}

/** Finds the 0-based start page index of the logical section containing `pageIndex`. */
export function findLogicalSectionStartPageIndex(
  pages: readonly DocumentPage[],
  pageIndex: number,
): number {
  const clamped = Math.max(0, Math.min(pageIndex, Math.max(0, pages.length - 1)));
  for (let i = clamped; i >= 1; i--) {
    if (pages[i]?.sectionBreak === 'nextPage') return i;
  }
  return 0;
}

/** Checks structural equality between two optional section configurations. */
export function sameSectionConfig(a?: SectionPageConfig, b?: SectionPageConfig): boolean {
  if (a === b) return true;
  if (!a && !b) return true;
  if (!a || !b) return false;
  return (
    a.differentFirstPage === b.differentFirstPage &&
    a.pageNumberFormat === b.pageNumberFormat &&
    a.restartPageNumbering === b.restartPageNumbering &&
    a.orientation === b.orientation &&
    a.headerHtml === b.headerHtml &&
    a.footerHtml === b.footerHtml
  );
}

/**
 * Resolves per-page section membership, numbering format/restarts, cover-page suppression,
 * orientation dimensions, and header/footer HTML for the full document.
 */
export function resolveDocumentPageSections(
  pages: readonly DocumentPage[],
  layoutConfig: DocumentLayoutConfig,
): ResolvedPageSectionInfo[] {
  if (!pages.length) return [];

  const sectionRanges: Array<{
    sectionIndex: number;
    startPageIndex: number;
    endPageIndex: number;
    secConfig?: SectionPageConfig;
  }> = [];

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    if (i === 0 || page.sectionBreak === 'nextPage') {
      sectionRanges.push({
        sectionIndex: sectionRanges.length,
        startPageIndex: i,
        endPageIndex: i,
        secConfig: page.sectionConfig,
      });
    } else {
      sectionRanges[sectionRanges.length - 1].endPageIndex = i;
    }
  }

  const resolved: ResolvedPageSectionInfo[] = new Array(pages.length);
  const formattedTotalPages = String(pages.length);

  let prevSectionFormat: PageNumberFormat = layoutConfig.pageNumberFormat ?? 'decimal';
  let lastPageNumber = 0;

  for (const range of sectionRanges) {
    const isFirstSection = range.sectionIndex === 0;
    const secConfig = range.secConfig;
    const sectionPageCount = range.endPageIndex - range.startPageIndex + 1;

    const differentFirstPage =
      secConfig?.differentFirstPage !== undefined
        ? Boolean(secConfig.differentFirstPage)
        : isFirstSection
          ? Boolean(layoutConfig.differentFirstPage)
          : false;

    const pageNumberFormat: PageNumberFormat =
      secConfig?.pageNumberFormat ?? (isFirstSection ? (layoutConfig.pageNumberFormat ?? 'decimal') : prevSectionFormat);
    prevSectionFormat = pageNumberFormat;

    const restartPageNumbering =
      secConfig?.restartPageNumbering !== undefined
        ? secConfig.restartPageNumbering
        : isFirstSection
          ? layoutConfig.pageNumberStart
          : undefined;

    const orientation: PageOrientation = secConfig?.orientation ?? layoutConfig.orientation;
    const { widthPx, heightPx } = resolveSectionDimensionsPx(layoutConfig, orientation);

    const headerHtml = secConfig?.headerHtml !== undefined ? secConfig.headerHtml : layoutConfig.headerHtml;
    const footerHtml = secConfig?.footerHtml !== undefined ? secConfig.footerHtml : layoutConfig.footerHtml;

    for (let pIdx = range.startPageIndex; pIdx <= range.endPageIndex; pIdx++) {
      const pageInSectionIndex = pIdx - range.startPageIndex;
      const pageNumber =
        pageInSectionIndex === 0
          ? restartPageNumbering !== undefined && Number.isFinite(restartPageNumbering) && restartPageNumbering >= 1
            ? Math.trunc(restartPageNumbering)
            : lastPageNumber + 1
          : lastPageNumber + 1;
      lastPageNumber = pageNumber;

      resolved[pIdx] = {
        pageIndex: pIdx,
        sectionIndex: range.sectionIndex,
        pageInSectionIndex,
        sectionPageCount,
        pageNumber,
        formattedPageNumber: formatPageNumber(pageNumber, pageNumberFormat),
        formattedTotalPages,
        pageNumberFormat,
        differentFirstPage,
        suppressHeaderFooter: differentFirstPage && pageInSectionIndex === 0,
        orientation,
        widthPx,
        heightPx,
        headerHtml,
        footerHtml,
        hasSectionBreak: !isFirstSection && pageInSectionIndex === 0,
        restartPageNumbering: pageInSectionIndex === 0 ? restartPageNumbering : undefined,
      };
    }
  }

  return resolved;
}

/** Groups resolved per-page metadata into contiguous logical Word sections (for DOCX export). */
export function groupDocumentSectionSpans(
  pages: readonly DocumentPage[],
  layoutConfig: DocumentLayoutConfig,
): DocumentSectionSpan[] {
  const infos = resolveDocumentPageSections(pages, layoutConfig);
  const spans: DocumentSectionSpan[] = [];
  for (const info of infos) {
    const prev = spans.at(-1);
    if (!prev || prev.sectionIndex !== info.sectionIndex) {
      spans.push({
        sectionIndex: info.sectionIndex,
        startPageIndex: info.pageIndex,
        endPageIndex: info.pageIndex,
        firstPageInfo: info,
      });
    } else {
      prev.endPageIndex = info.pageIndex;
    }
  }
  return spans;
}
