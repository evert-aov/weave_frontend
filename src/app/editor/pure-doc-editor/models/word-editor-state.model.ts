import type { BibliographicSource } from './academic.model';
import type { DocumentState } from '../engine/document-model';
import {
  DocumentCommentThread,
  DocumentLayoutConfig,
  DocumentPage,
  HeadingItem,
  DocumentViewMode,
  PageMovementMode,
  StyleTemplate,
} from '../models/word-document.model';

export interface HistorySnapshot {
  pages: DocumentPage[];
  activePageIndex: number;
  templates: StyleTemplate[];
  activeTemplateId: string;
  headingNumbering: boolean;
  bibliographicSources?: BibliographicSource[];
  layoutConfig?: DocumentLayoutConfig;
  importedTocEntries?: HeadingItem[];
}

export interface SerializedDocSectionModel {
  id: string;
  breakBefore?: 'manual';
  state: DocumentState;
  pageIds: string[];
}

export interface DocDataV2 {
  v: 2;
  bibliographicSources?: BibliographicSource[];
  docTitle?: string;
  pages?: DocumentPage[];
  layoutConfig?: DocumentLayoutConfig;
  customTemplates?: StyleTemplate[];
  activeTemplateId?: string;
  viewMode?: DocumentViewMode;
  pageMovement?: PageMovementMode;
  showRuler?: boolean;
  showGridlines?: boolean;
  zoom?: number;
  darkMode?: boolean;
  darkCanvas?: boolean;
  headingNumbering?: boolean;
  comments?: DocumentCommentThread[];
  trackChangesEnabled?: boolean;
  hideCommentsOnExport?: boolean;
}

export interface DocDataV3 extends Omit<DocDataV2, 'v'> {
  v: 3;
  modelSections?: SerializedDocSectionModel[];
}

export type AnyDocData = DocDataV2 | DocDataV3;

export interface TableResizeState {
  pageIndex: number;
  table: HTMLTableElement;
  row: HTMLTableRowElement;
  cell: HTMLTableCellElement;
  mode: 'row' | 'column';
  index: number;
  startX: number;
  startY: number;
  tableWidth: number;
  rowHeight: number;
  columnWidths: number[];
}
