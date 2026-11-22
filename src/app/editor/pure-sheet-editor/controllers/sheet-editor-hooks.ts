import type { ChangeDetectorRef } from '@angular/core';
import type { SelectionRange } from '../models/excel.model';
import type { FormulaCalculationCache } from '../services/formula-engine.service';

/** Private editor operations exposed explicitly to the controllers that need them.
 * Getters read current state so undo, sheet changes and recalculation never leave stale caches.
 */
export interface SheetEditorHooks {
  readonly calculationCache: FormulaCalculationCache;
  readonly isDestroyed: boolean;
  readonly viewChanges: ChangeDetectorRef | null;
  readonly referenceDrag: {
    col: number; row: number; prefix: string; suffix: string;
    caret: number; input?: HTMLInputElement | HTMLTextAreaElement;
  } | undefined;
  pushUndoSnapshot(): void;
  stopInkReplay(): void;
  beginFormulaReference(col: number, row: number, event: MouseEvent): boolean;
  executeSmartFill(): void;
  expandMergedSelection(range: SelectionRange): SelectionRange;
  finishFormulaReference(): void;
  handleFormulaArrow(event: KeyboardEvent): boolean;
  updateFormulaReference(col: number, row: number): void;
  scheduleCanvasRender?(): void;
  scheduleFormulaRecalc?(): void;
}
