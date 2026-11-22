import type { ChangeDetectorRef } from '@angular/core';
import type { NotesService } from '../../../core/services/notes.service';
import type { ThemeService } from '../../../core/services/theme.service';
import type { WordCompatibilityService } from '../services/word-compatibility.service';
import type { LatexRendererService } from '../services/latex-renderer.service';
import type { ImageStoreService } from '../services/image-store.service';
import type { DocumentFlowService } from '../services/document-flow.service';
import type { DocumentPage } from '../models/word-document.model';
import type { DocumentReferenceService } from '../../../core/services/document-reference.service';
import type { DialogService } from '../../../core/services/dialog.service';
import type { AnyDocData, HistorySnapshot, SerializedDocSectionModel } from '../models/word-editor-state.model';
import type {
  CanvasEditSession,
  CanvasHistoryMeta,
} from '../engine/canvas-edit-session';

/** Explicit private capabilities used by the per-editor controllers. */
export interface WordEditorHooks {
  readonly applyActiveListRules: () => void;
  readonly applyPendingScroll: (headingId: string) => void;
  readonly canvasMeta?: () => CanvasHistoryMeta;
  readonly canvasMode?: () => boolean;
  readonly canvasSession?: () => CanvasEditSession | undefined;
  readonly captureHistory: () => HistorySnapshot;
  readonly cdr: ChangeDetectorRef | null;
  readonly collectDocData: () => AnyDocData;
  readonly commitCanvasMetaLayout?: () => void;
  readonly commitCanvasModelMutation?: (options?: { activePageIndex?: number }) => void;
  readonly composing: boolean;
  destroyed: boolean;
  readonly dialogs: DialogService;
  readonly documentFlow: DocumentFlowService;
  readonly ensureCanvasObjectIds?: () => void;
  readonly exportCanvasModelSections?: () => SerializedDocSectionModel[] | undefined;
  readonly finishDocumentMutation: () => void;
  readonly focusCanvas?: () => void;
  readonly getActivePageElement: () => HTMLDivElement | null;
  readonly getCanvasReadableText?: (pageIndex: number) => string | null;
  readonly getLivePagesSnapshot: () => DocumentPage[];
  readonly hasSelection?: () => boolean;
  readonly imageStore: ImageStoreService;
  readonly insertCanvasHtml?: (html: string, keepInlineCaret?: boolean) => boolean;
  lastFlowPages: DocumentPage[] | null;
  lastInputTime: number;
  readonly latexRenderer: LatexRendererService;
  readonly liveBodies: () => HTMLElement[];
  loadedNoteId: string | null;
  readonly notesService: NotesService;
  pendingRenderPages: DocumentPage[] | null;
  pendingTypingStyle: Record<string, string> | null;
  readonly prepareRibbonSelection: () => Range | null;
  readonly pushCanvasMetaHistory?: () => void;
  redoStack: HistorySnapshot[];
  readonly references: DocumentReferenceService;
  readonly refreshApaToc: () => void;
  readonly settleApaToc: () => void;
  readonly reflowDocument: (sourcePages?: DocumentPage[]) => boolean;
  readonly renderDocumentPages: (pages: DocumentPage[], reflowAfterRender?: boolean) => void;
  readonly restoreSelection: () => void;
  readonly samePages: (left: DocumentPage[], right: DocumentPage[] | null | undefined) => boolean;
  readonly saveSelection: () => void;
  savedRange: Range | null;
  readonly scheduleAutoSave: (payload: AnyDocData) => void;
  readonly scheduleDocumentFlow: (deferInput?: boolean) => void;
  readonly selectedText?: () => string;
  readonly setLoadedModelSections?: (sections: SerializedDocSectionModel[] | undefined) => void;
  readonly showToast: (msg: string) => void;
  readonly syncInnerHtml: () => void;
  readonly themeService: ThemeService | null;
  undoStack: HistorySnapshot[];
  readonly wordCompat: WordCompatibilityService;
}
