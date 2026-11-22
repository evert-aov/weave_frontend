export type RibbonTab = 'file' | 'home' | 'insert' | 'layout' | 'styles' | 'references' | 'review' | 'view';

export type PaperFormatId =
  | 'a4'
  | 'letter'
  | 'oficio'
  | 'legal'
  | 'executive'
  | 'a5'
  | 'a3'
  | 'b5'
  | 'tabloid'
  | 'custom';

export type PageOrientation = 'portrait' | 'landscape';

export type PageBorderStyle = 'none' | 'solid' | 'double' | 'dashed' | 'dotted' | 'thick';

export type TextAlignment = 'left' | 'center' | 'right' | 'justify';

export type StyleTargetTag = 'P' | 'H1' | 'H2' | 'H3' | 'H4' | 'H5' | 'H6';

export type DocumentViewMode = 'print' | 'read' | 'web' | 'outline' | 'draft';

export type PageMovementMode = 'vertical' | 'sideBySide';

export type SectionColumnsPreset = '1' | '2' | '3' | 'left' | 'right';

export interface ElementStyleRule {
  target: StyleTargetTag;
  label: string;
  fontFamily: string;
  fontSizePt: number;
  align: TextAlignment;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  uppercase?: boolean;
  color: string;
  lineHeight: number;
  spaceBeforePt: number;
  spaceAfterPt: number;
  firstLineIndentPt: number;
  indentLeftPt?: number;
  indentRightPt?: number;
  strikeThrough?: boolean;
  backgroundColor?: string;
}

export interface ListStyleRule {
  marker: 'decimal' | 'disc' | 'circle' | 'square';
  indentLeftPt: number;
  hangingIndentPt: number;
  lineHeight: number;
  spaceBeforePt: number;
  spaceAfterPt: number;
}

export interface TableStyleRule {
  mode: 'inherit' | 'preserve' | 'custom';
  fontFamily: string;
  fontSizePt: number;
  lineHeight: number;
  align: TextAlignment;
  color: string;
  backgroundColor: string;
  borders: 'grid' | 'horizontal' | 'none';
  borderColor: string;
  borderWidthPt: number;
  cellPaddingPt: number;
  header: boolean;
  headerBold: boolean;
  headerAlign: TextAlignment;
  headerColor: string;
  headerBackgroundColor: string;
  bandedRows: boolean;
  bandColor: string;
  repeatHeader: boolean;
}

export interface StyleTemplate {
  id: string;
  name: string;
  description: string;
  isCustom?: boolean;
  rules: Record<StyleTargetTag, ElementStyleRule>;
  academicStyle?: 'apa7';
  listRules?: { ordered: ListStyleRule; unordered: ListStyleRule };
  tableStyle?: TableStyleRule;
}

export interface PageBorderConfig {
  style: PageBorderStyle;
  color: string;
  widthPt: number;
  offsetPx: number;
  top: boolean;
  bottom: boolean;
  left: boolean;
  right: boolean;
}

export interface PageMarginsConfig {
  topPx: number;
  rightPx: number;
  bottomPx: number;
  leftPx: number;
  label: string; // 'Normal', 'Estrecho', 'Moderado', 'Ancho', 'Personalizado', 'Detectado (.docx)'
}

export interface PaperFormatPreset {
  id: PaperFormatId;
  name: string;
  badge: string;
  widthCm: number;
  heightCm: number;
  widthPx: number; // At 96 DPI
  heightPx: number; // At 96 DPI
  widthTwips: number;
  heightTwips: number;
}

export interface ApaPageConfig {
  mode: 'student' | 'professional';
  runningHead: string;
  fontFamily: string;
  fontSizePt: number;
}

export type PageNumberFormat = 'decimal' | 'roman-lower' | 'roman-upper';

export interface SectionPageConfig {
  /** Suppresses headers/footers and page numbers on the first page of this section. */
  differentFirstPage?: boolean;
  /** Page numbering format for pages in this section. */
  pageNumberFormat?: PageNumberFormat;
  /** Optional 1-based page number restart on the first page of this section. */
  restartPageNumbering?: number;
  /** Per-section page orientation override. */
  orientation?: PageOrientation;
  /** Per-section header HTML override. */
  headerHtml?: string;
  /** Per-section footer HTML override. */
  footerHtml?: string;
}

export interface DocumentLayoutConfig {
  apa?: ApaPageConfig;
  paperFormatId: PaperFormatId;
  orientation: PageOrientation;
  customWidthPx?: number;
  customHeightPx?: number;
  customSizeLabel?: string;
  margins: PageMarginsConfig;
  pageBorder: PageBorderConfig;
  headerHtml: string;
  footerHtml: string;
  showHeaderFooter: boolean;
  differentFirstPage?: boolean;
  pageNumberFormat?: PageNumberFormat;
  pageNumberStart?: number;
  showLineNumbers?: boolean;
  hyphenation?: boolean;
  pageColor?: string;
  watermarkText?: string;
}

export interface HeadingItem {
  id: string;
  text: string;
  level: number; // 1 to 6
  pageIndex: number; // 0-based page index where this heading resides
  fontSizePt?: number;
  fontFamily?: string;
  fromTocEntry?: boolean;
}

export interface TableItem {
  id: string;
  title: string;
  rows: number;
  cols: number;
  pageIndex: number;
  tableIndexInPage: number;
}

export interface DocumentPage {
  id: string;
  html: string;
  /** Only user/imported page breaks stop automatic forward/backward text flow. */
  breakBefore?: 'manual';
  /** True when this page begins a new logical Word section (numbering/orientation/headers). */
  sectionBreak?: 'nextPage';
  /** Section-level layout properties applied starting at this page until the next sectionBreak. */
  sectionConfig?: SectionPageConfig;
}

export interface DocxDocumentProperties {
  fileName: string;
  title: string;
  author?: string;
  lastModifiedBy?: string;
  created?: string;
  modified?: string;
  application?: string;
  pageCount: number;
  officialPageCountPreserved: boolean;
  wordCount?: number;
  defaultFontFamily: string;
  defaultFontSizePt: number;
  detectedFonts: string[];
  detectedSizesPt: number[];
  headingCounts: {
    h1: number;
    h2: number;
    h3: number;
    h4: number;
    h5: number;
    h6: number;
  };
  detectedHeadingStylesSummary: string[];
  hasTableOfContents: boolean;
  tocEntriesCount: number;
  tocPageNumber?: number;
  imagesCount: number;
  tablesCount?: number;
  preservesTabsAndSpacing: boolean;
  pageSizeLabel: string;
  detectedPaperFormatId: PaperFormatId;
  detectedOrientation: PageOrientation;
  detectedMarginsLabel: string;
  hasCustomPageBorder: boolean;
  hasDocumentHeader: boolean;
  hasDocumentFooter: boolean;
}

export interface EditorActiveFormats {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strikeThrough: boolean;
  subscript: boolean;
  superscript: boolean;
  justifyLeft: boolean;
  justifyCenter: boolean;
  justifyRight: boolean;
  justifyFull: boolean;
  insertUnorderedList: boolean;
  insertOrderedList: boolean;
  heading: string; // 'P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6'
  fontName: string;
  fontSize: string;
  indentLeftCm: number;
  indentRightCm: number;
  firstLineIndentPt?: number;
  spaceBeforePt: number;
  spaceAfterPt: number;
  lineHeight: string;
}

export interface DocumentStats {
  words: number;
  characters: number;
  paragraphs: number;
  readingTimeMinutes: number;
  pages: number;
}

export interface DocumentCommentReply {
  id: string;
  author: string;
  text: string;
  createdAt: number;
}

export interface DocumentCommentThread {
  id: string;
  author: string;
  text: string;
  quote: string;
  createdAt: number;
  resolved: boolean;
  resolvedAt?: number;
  pageIndex?: number;
  replies: DocumentCommentReply[];
}

export interface DocumentRevisionItem {
  id: string;
  kind: 'ins' | 'del';
  text: string;
  author: string;
  createdAt: number;
  pageIndex: number;
  y: number;
}
