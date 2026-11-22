import type { SheetEditorHooks } from './sheet-editor-hooks';
import { completions, completeValue, formulaSignature } from '../services/formula-completion';
import { parseFormula } from '../services/formula-parser';
import { parseNumericLiteral } from '../services/calc-types';
import { SelectionRange } from '../models/excel.model';
import { findWorksheetReferences, resolvedFormulaReferences, formatWorksheetReference, parseWorksheetReference, colLetterToIndex, cycleFormulaRefAtCursor, getCellSpill, getCellId, parseCellId } from '../services/formula-engine.service';
import { validateCellValue } from '../services/sheet-data-tools.service';
import type { SheetReferenceTarget, SheetReferenceTrace } from '../models/editor-reference.model';
import type { PureSheetEditorComponent } from '../pure-sheet-editor.component';

type SheetEditingControllerHost = Pick<PureSheetEditorComponent,
  | 'activeSheet'
  | 'activeSheetId'
  | 'cellEditorInput'
  | 'completionIndex'
  | 'completionItems'
  | 'completionLeft'
  | 'completionSignature'
  | 'completionTop'
  | 'editOrigin'
  | 'editingValue'
  | 'editorNotice'
  | 'formulaBarInput'
  | 'getCellValue'
  | 'getChartRangeString'
  | 'gridContainer'
  | 'guardEditableCell'
  | 'i18n'
  | 'inkLayer'
  | 'isEditing'
  | 'isSelecting'
  | 'moveSelection'
  | 'namesError'
  | 'namesModalOpen'
  | 'normalizedRange'
  | 'referenceTrace'
  | 'revealCell'
  | 'scheduleAutoSave'
  | 'selectedArtworkId'
  | 'selectedCell'
  | 'selectedChartId'
  | 'selectionRange'
  | 'sheets'
  | 'totalCols'
  | 'totalRows'
  | 'updateCurrentGrid'>;
type SheetEditingControllerHooks = Pick<SheetEditorHooks,
  | 'calculationCache'
  | 'pushUndoSnapshot'
  | 'scheduleCanvasRender'
  | 'stopInkReplay'
  | 'viewChanges'>;

/** Editing behavior scoped to one editor instance. */
export class SheetEditingController {
  constructor(private readonly editor: SheetEditingControllerHost, private readonly hooks: SheetEditingControllerHooks) {}

  private completionInput?: HTMLInputElement | HTMLTextAreaElement;
  // Reopening a formula edits its text. Only entering an operand or explicitly
  // choosing a reference makes arrow keys point at cells (F2 switches modes).
  private formulaInputMode: 'edit' | 'point' = 'edit';

  onFormulaEditorPointerDown(): void {
    this.formulaInputMode = 'edit';
    this.keyboardReference = undefined;
    this.pendingSheetReference = undefined;
  }

  onFormulaBarFocus(): void {
    if (this.editor.isEditing) return;
    this.onFormulaBarChange(this.editor.activeSheet.data[getCellId(this.editor.selectedCell.col, this.editor.selectedCell.row)]?.raw || '');
    this.formulaInputMode = 'edit';
  }

  private formulaInputChanged(input?: HTMLInputElement | HTMLTextAreaElement): void {
    this.keyboardReference = undefined;
    this.pendingSheetReference = undefined;
    const insertion = this.editor.editingValue.startsWith('=') ? this.referenceInsertion(input) : null;
    this.formulaInputMode = insertion && !insertion.token && input?.selectionStart === input?.selectionEnd ? 'point' : 'edit';
  }

  private handleFormulaModeKey(event: KeyboardEvent): boolean {
    if (event.key === 'F2' && !event.shiftKey && this.editor.isEditing) {
      event.preventDefault(); event.stopPropagation();
      this.formulaInputMode = this.formulaInputMode === 'edit' ? 'point' : 'edit';
      this.keyboardReference = undefined;
      this.closeCompletions();
      return true;
    }
    if (['Home', 'End', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key) &&
      (event.ctrlKey || event.metaKey || event.key === 'Home' || event.key === 'End')) this.onFormulaEditorPointerDown();
    return false;
  }

  refreshCompletions(input: HTMLInputElement | HTMLTextAreaElement): void {
    this.completionInput = input;
    const caret = input.selectionStart ?? input.value.length;
    this.editor.completionItems = completions(this.editor.editingValue, caret, this.editor.activeSheet.data, this.editor.selectedCell.col, this.editor.selectedCell.row, this.editor.sheets, this.editor.activeSheet, this.editor.i18n.currentLang());
    this.editor.completionIndex = 0; this.editor.completionSignature = this.editor.editingValue.startsWith('=') ? formulaSignature(this.editor.editingValue, caret) : '';
    const rect = input.getBoundingClientRect();
    this.editor.completionLeft = Math.max(8, Math.min(rect.left, window.innerWidth - 428));
    this.editor.completionTop = rect.bottom + 260 > window.innerHeight ? Math.max(8, rect.top - 260) : rect.bottom + 4;
  }

  onCellEditorInput(event: Event): void {
    const input = event.target as HTMLInputElement | HTMLTextAreaElement;
    this.editor.editingValue = input.value;
    this.formulaInputChanged(input);
    this.refreshCompletions(input);
  }

  onEditorKeyUp(event: KeyboardEvent): void {
    if (['ArrowLeft', 'ArrowRight', 'Home', 'End', 'F4'].includes(event.key)) {
      this.refreshCompletions(event.target as HTMLInputElement | HTMLTextAreaElement);
    }
  }

  closeCompletions(): void { this.editor.completionItems = []; this.editor.completionSignature = ''; }

  acceptCompletion(index = this.editor.completionIndex): void {
    const item = this.editor.completionItems[index], input = this.completionInput; if (!item || !input) return;
    const result = completeValue(this.editor.editingValue, item); this.editor.editingValue = result.value; input.value = result.value;
    input.focus({ preventScroll: true }); input.setSelectionRange(result.caret, result.caret); this.formulaInputChanged(input); this.refreshCompletions(input);
  }

  onCellEditorKeyDown(event: KeyboardEvent): void {
    if (this.handleFormulaModeKey(event)) return;
    if (event.key === 'Enter' && event.altKey) {
      event.preventDefault();
      event.stopPropagation();
      const input = event.target as HTMLInputElement | HTMLTextAreaElement | null;
      const start = input?.selectionStart ?? this.editor.editingValue.length;
      const end = input?.selectionEnd ?? start;
      this.editor.editingValue =
        this.editor.editingValue.slice(0, start) + '\n' + this.editor.editingValue.slice(end);
      this.closeCompletions();
      this.hooks.viewChanges?.markForCheck();
      setTimeout(() => {
        const nextInput = this.editor.cellEditorInput?.nativeElement;
        if (nextInput) {
          nextInput.value = this.editor.editingValue;
          nextInput.focus({ preventScroll: true });
          nextInput.setSelectionRange(start + 1, start + 1);
        }
        this.hooks.scheduleCanvasRender?.();
      }, 0);
      return;
    }
    this.onCompletionKeyDown(event);
  }

  onCompletionKeyDown(event: KeyboardEvent): boolean {
    if (!this.editor.completionItems.length) return false;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') this.editor.completionIndex = (this.editor.completionIndex + (event.key === 'ArrowDown' ? 1 : -1) + this.editor.completionItems.length) % this.editor.completionItems.length;
    else if (event.key === 'Tab' || event.key === 'Enter') this.acceptCompletion();
    else if (event.key === 'Escape') this.closeCompletions();
    else return false;
    event.preventDefault(); event.stopPropagation(); return true;
  }

  get selectionReference(): string { return formatWorksheetReference(this.editor.activeSheet.name, this.editor.getChartRangeString(this.editor.selectionRange)); }

  openNames(): void { this.closeCompletions(); this.editor.namesError = ''; this.editor.namesModalOpen = true; }

  private validDefinedName(name: string): boolean { const cell = parseCellId(name.toUpperCase()); return /^[\p{L}_][\p{L}\p{N}_.]*$/u.test(name) && !(cell && cell.col < 16384 && cell.row < 1048576) && !/^(TRUE|FALSE|R|C)$/i.test(name) && name.length <= 255; }

  saveDefinedName(change: { name: string; reference: string; scope: string }): void {
    const name = change.name.trim(); let reference = change.reference.trim();
    for (const ref of findWorksheetReferences(reference).reverse()) if (!ref.sheetName) reference = reference.slice(0, ref.index) + formatWorksheetReference(this.editor.activeSheet.name, ref.start + (ref.end ? ':' + ref.end : '')) + reference.slice(ref.index + ref.token.length);
    try { if (!this.validDefinedName(name) || !reference) throw new Error(); parseFormula(reference.replace(/^=/, '')); } catch { this.editor.namesError = 'excel.names.invalid'; return; }
    this.commitCellEdit(); this.hooks.pushUndoSnapshot();
    const target = change.scope === 'sheet' ? this.editor.activeSheet : this.editor.sheets[0], key = change.scope === 'sheet' ? 'definedNames' : 'workbookNames';
    const dictionary = { ...target[key] }; const previous = Object.keys(dictionary).find(n => n.toLowerCase() === name.toLowerCase()); if (previous) delete dictionary[previous];
    dictionary[name] = reference; target[key] = dictionary; this.editor.namesError = ''; this.editor.scheduleAutoSave();
  }

  removeDefinedName(change: { name: string; scope: string; sheetId: string }): void {
    const sheet = this.editor.sheets.find(s => s.id === change.sheetId); if (!sheet) return;
    this.hooks.pushUndoSnapshot(); const key = change.scope === 'sheet' ? 'definedNames' : 'workbookNames'; sheet[key] = { ...sheet[key] }; delete sheet[key]![change.name]; this.editor.scheduleAutoSave();
  }

  createStructuredTable(change: { name: string; headers: boolean }): void {
    const name = change.name.trim(); if (!this.validDefinedName(name) || this.editor.sheets.some(s => s.tables?.some(t => t.name.toLowerCase() === name.toLowerCase()) || Object.keys(s.workbookNames || {}).some(n => n.toLowerCase() === name.toLowerCase()) || Object.keys(s.definedNames || {}).some(n => n.toLowerCase() === name.toLowerCase()))) { this.editor.namesError = 'excel.names.invalid'; return; }
    const r = this.editor.normalizedRange, range = { startCol: r.minCol, endCol: r.maxCol, startRow: r.minRow, endRow: r.maxRow };
    const intersects = (other: SelectionRange) => other.startCol <= range.endCol && other.endCol >= range.startCol && other.startRow <= range.endRow && other.endRow >= range.startRow;
    if (this.editor.activeSheet.tables?.some(t => intersects(t.range)) || this.editor.activeSheet.merges?.some(intersects) || (r.maxRow - r.minRow + 1) * (r.maxCol - r.minCol + 1) > 250000) { this.editor.namesError = 'excel.names.overlap'; return; }
    this.commitCellEdit(); this.hooks.pushUndoSnapshot();
    const columns: string[] = [];
    for (let col = r.minCol; col <= r.maxCol; col++) { const base = change.headers ? String(this.editor.getCellValue(col, r.minRow) || `Column${col - r.minCol + 1}`) : `Column${col - r.minCol + 1}`; let label = base, suffix = 2; while (columns.some(c => c.toLowerCase() === label.toLowerCase())) label = base + suffix++; columns.push(label); }
    if (change.headers) {
      const grid = { ...this.editor.activeSheet.data };
      columns.forEach((label, index) => { const id = getCellId(r.minCol + index, r.minRow), cell = grid[id] || { raw: '' }; grid[id] = { ...cell, raw: label, style: { ...cell.style, bold: true } }; });
      this.editor.activeSheet.data = grid;
    }
    this.editor.activeSheet.tables = [...(this.editor.activeSheet.tables || []), { name, range, columns, hasHeaders: change.headers }];
    this.editor.namesError = ''; this.editor.scheduleAutoSave();
  }

  removeStructuredTable(name: string): void { this.hooks.pushUndoSnapshot(); this.editor.activeSheet.tables = this.editor.activeSheet.tables?.filter(t => t.name !== name); this.editor.scheduleAutoSave(); }

  insertDefinedName(name: string): void { this.editor.namesModalOpen = false; this.startCellEdit('=' + name); }

  private pendingSheetReference?: { prefix: string; suffix: string; token?: string; formula: string };

  private keyboardReference?: { prefix: string; suffix: string; anchorCol: number; anchorRow: number; col: number; row: number; formula: string; caret: number; sheetId?: string };

  referenceDrag?: { col: number; row: number; prefix: string; suffix: string; caret: number; input?: HTMLInputElement | HTMLTextAreaElement };

  get editingOnActiveSheet(): boolean { return !this.editor.editOrigin || this.editor.editOrigin.sheetId === this.editor.activeSheetId; }

  get formulaOriginLabel(): string {
    const origin = this.editor.editOrigin;
    return origin ? `${this.editor.sheets.find(sheet => sheet.id === origin.sheetId)?.name || ''}!${getCellId(origin.col, origin.row)}` : '';
  }

  private referenceEditorInput(): HTMLInputElement | HTMLTextAreaElement | undefined {
    const active = typeof document === 'undefined' ? null : document.activeElement;
    return active === this.editor.formulaBarInput?.nativeElement ? this.editor.formulaBarInput?.nativeElement : this.editingOnActiveSheet ? this.editor.cellEditorInput?.nativeElement || this.editor.formulaBarInput?.nativeElement : this.editor.formulaBarInput?.nativeElement;
  }

  returnToFormulaOrigin(): void { if (this.editor.editOrigin) this.switchSheet(this.editor.editOrigin.sheetId); }

  traceFormulaReferences(direction: 'precedents' | 'dependents' = 'precedents'): void {
    this.commitCellEdit();
    const sheet = this.editor.activeSheet, cellId = getCellId(this.editor.selectedCell.col, this.editor.selectedCell.row);
    const targets: SheetReferenceTarget[] = [];
    const add = (sheetName: string, start: string, end?: string) => {
      const target = this.editor.sheets.find(item => item.type === 'grid' && item.name.toLowerCase() === sheetName.toLowerCase());
      const first = parseCellId(start) || (/^\$?[A-Z]+$/i.test(start) ? { col: colLetterToIndex(start.replace(/\$/g, '')), row: 0 } : null), last = parseCellId(end || start) || (/^\$?[A-Z]+$/i.test(end || start) ? { col: colLetterToIndex((end || start).replace(/\$/g, '')), row: 1048575 } : null);
      if (!first || !last) return;
      const range: SelectionRange = { startCol: Math.min(first.col, last.col), endCol: Math.max(first.col, last.col), startRow: Math.min(first.row, last.row), endRow: Math.max(first.row, last.row) };
      const label = formatWorksheetReference(target?.name || sheetName, start + (end ? ':' + end : ''));
      if (!targets.some(item => item.label === label)) targets.push({ sheetId: target?.id || null, sheetName: target?.name || sheetName, range, label });
    };
    if (direction === 'precedents') {
      const formula = sheet.data[cellId]?.raw || '';
      if (formula.startsWith('=')) for (const ref of resolvedFormulaReferences(formula, sheet.data, cellId)) add(ref.sheetName || sheet.name, ref.start, ref.end);
    } else {
      for (const candidate of this.editor.sheets.filter(item => item.type === 'grid')) {
        for (const [id, cell] of Object.entries(candidate.data)) {
          if (!cell.raw.startsWith('=')) continue;
          const dependent = resolvedFormulaReferences(cell.raw, candidate.data, id).some(ref => {
            if ((ref.sheetName || candidate.name).toLowerCase() !== sheet.name.toLowerCase()) return false;
            const first = parseCellId(ref.start), last = parseCellId(ref.end || ref.start);
            return first && last && this.editor.selectedCell.col >= Math.min(first.col, last.col) && this.editor.selectedCell.col <= Math.max(first.col, last.col) && this.editor.selectedCell.row >= Math.min(first.row, last.row) && this.editor.selectedCell.row <= Math.max(first.row, last.row);
          });
          if (dependent) add(candidate.name, id);
        }
      }
    }
    this.editor.referenceTrace = { origin: { sheetId: sheet.id, sheetName: sheet.name, cellId }, direction, targets, message: targets.length ? targets.some(target => !target.sheetId) ? 'excel.trace.missing' : '' : direction === 'precedents' ? 'excel.trace.none' : 'excel.trace.no_dependents' };
    if (targets.length === 1 && targets[0].sheetId) this.navigateToReference(targets[0]);
  }

  navigateToReference(target: SheetReferenceTarget): void {
    if (!target.sheetId || !this.editor.sheets.some(sheet => sheet.id === target.sheetId)) return;
    this.switchSheet(target.sheetId); this.editor.selectedChartId = null; this.editor.selectedArtworkId = null; this.editor.inkLayer?.clearSelection();
    this.editor.selectedCell = { col: target.range.startCol, row: target.range.startRow }; this.editor.selectionRange = { ...target.range };
    setTimeout(() => {
      this.editor.revealCell(target.range.startCol, target.range.startRow);
      this.editor.gridContainer?.nativeElement.focus({ preventScroll: true });
    }, 0);
  }

  returnFromTrace(): void {
    const origin = this.editor.referenceTrace?.origin;
    const cell = origin ? parseCellId(origin.cellId) : null;
    if (origin && cell) this.navigateToReference({ sheetId: origin.sheetId, sheetName: origin.sheetName, label: origin.cellId, range: { startCol: cell.col, endCol: cell.col, startRow: cell.row, endRow: cell.row } });
  }

  isTracedCell(col: number, row: number): boolean {
    const trace = this.editor.referenceTrace;
    if (!trace) return false;
    if (trace.origin.sheetId === this.editor.activeSheet.id && trace.origin.cellId === getCellId(col, row)) return true;
    return trace.targets.some(target => target.sheetId === this.editor.activeSheet.id &&
      col >= target.range.startCol && col <= target.range.endCol &&
      row >= target.range.startRow && row <= target.range.endRow);
  }

  private referenceInsertion(input?: HTMLInputElement | HTMLTextAreaElement): { prefix: string; suffix: string; token?: string } | null {
    const start = input?.selectionStart ?? this.editor.editingValue.length;
    const end = input?.selectionEnd ?? start;
    const formula = this.editor.editingValue;
    // Replace the complete operand even when the caret is inside D30 or only
    // part of a qualified/range reference is selected. Preserve later operands.
    const reference = findWorksheetReferences(formula).find(ref => ref.index <= start && ref.index + ref.token.length >= end);
    const token = reference?.token;
    const prefix = formula.slice(0, reference?.index ?? start);
    const suffix = formula.slice(reference ? reference.index + reference.token.length : end);
    if (!/[=+\-*/^(,;:<>&]\s*$/.test(prefix) || (prefix.match(/"/g)?.length || 0) % 2) return null;
    return { prefix, suffix, token };
  }

  handleFormulaArrow(event: KeyboardEvent): boolean {
    if (event.key === 'F2') return this.handleFormulaModeKey(event);
    const directions: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    const delta = directions[event.key];
    if (!delta || event.ctrlKey || event.metaKey || event.altKey || !this.editor.isEditing || !this.editor.editingValue.trim().startsWith('=')) return false;
    if (this.formulaInputMode !== 'point') return false;
    const target = event.target;
    if ((target instanceof HTMLTextAreaElement && target !== this.editor.cellEditorInput?.nativeElement) || (target instanceof HTMLElement && target.isContentEditable)) return false;
    const input = target === this.editor.formulaBarInput?.nativeElement ? this.editor.formulaBarInput?.nativeElement : this.referenceEditorInput();
    if ((target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) && target !== input) return false;
    let state = this.keyboardReference;
    let fresh = false;
    if (!state || state.formula !== this.editor.editingValue || (input && input.selectionStart !== state.caret)) {
      const insertion = this.referenceInsertion(input) || (this.pendingSheetReference?.formula === this.editor.editingValue ? this.pendingSheetReference : undefined);
      if (!insertion) { this.formulaInputMode = 'edit'; this.keyboardReference = undefined; return false; }
      const reference = insertion.token ? parseWorksheetReference(insertion.token) : null;
      const start = reference ? parseCellId(reference.start) : this.editor.selectedCell;
      const end = reference ? parseCellId(reference.end || reference.start) : this.editor.selectedCell;
      const sheetId = reference?.sheetName ? this.editor.sheets.find(sheet => sheet.name.toLowerCase() === reference.sheetName!.toLowerCase())?.id : this.editor.activeSheetId;
      if (!sheetId) return false;
      if (!start || !end) return false;
      state = { prefix: insertion.prefix, suffix: insertion.suffix, anchorCol: start.col, anchorRow: start.row, col: end.col, row: end.row, sheetId, formula: this.editor.editingValue, caret: input?.selectionStart ?? this.editor.editingValue.length };
      fresh = !insertion.token;
    }
    event.preventDefault(); event.stopPropagation();
    this.editor.editOrigin ||= { sheetId: this.editor.activeSheetId, ...this.editor.selectedCell };
    if (state.sheetId && state.sheetId !== this.editor.activeSheetId) {
      this.editor.activeSheetId = state.sheetId;
      this.editor.selectedCell = this.editingOnActiveSheet && this.editor.editOrigin ? { col: this.editor.editOrigin.col, row: this.editor.editOrigin.row } : { col: state.col, row: state.row };
    }
    this.pendingSheetReference = undefined;
    state.col = Math.max(0, Math.min(this.editor.totalCols - 1, state.col + delta[0]));
    state.row = Math.max(0, Math.min(this.editor.totalRows - 1, state.row + delta[1]));
    if (!event.shiftKey || fresh) { state.anchorCol = state.col; state.anchorRow = state.row; }
    const first = getCellId(Math.min(state.anchorCol, state.col), Math.min(state.anchorRow, state.row));
    const last = getCellId(Math.max(state.anchorCol, state.col), Math.max(state.anchorRow, state.row));
    if (!this.editingOnActiveSheet) {
      this.editor.selectedCell = { col: state.col, row: state.row };
      this.editor.selectionRange = { startCol: state.anchorCol, startRow: state.anchorRow, endCol: state.col, endRow: state.row };
    }
    const reference = formatWorksheetReference(this.editor.editOrigin && this.editor.editOrigin.sheetId !== this.editor.activeSheetId ? this.editor.activeSheet.name : undefined, first === last ? first : `${first}:${last}`);
    this.editor.editingValue = state.prefix + reference + state.suffix;
    state.formula = this.editor.editingValue; state.caret = state.prefix.length + reference.length;
    this.keyboardReference = state;
    if (input) { input.value = this.editor.editingValue; input.setSelectionRange(state.caret, state.caret); }
    this.editor.revealCell(state.col, state.row);
    return true;
  }

  beginFormulaReference(col: number, row: number, event: MouseEvent): boolean {
    if (!this.editor.isEditing || !this.editor.editingValue.trim().startsWith('=')) return false;
    const input = this.referenceEditorInput();
    const insertion = this.referenceInsertion(input) || (this.pendingSheetReference?.formula === this.editor.editingValue ? this.pendingSheetReference : undefined);
    if (!insertion) return false;
    const { prefix, suffix } = insertion;
    this.formulaInputMode = 'point';
    this.keyboardReference = undefined; this.pendingSheetReference = undefined;
    this.editor.editOrigin ||= { sheetId: this.editor.activeSheetId, ...this.editor.selectedCell };
    event.preventDefault(); event.stopPropagation(); this.editor.isSelecting = false;
    this.referenceDrag = { col, row, prefix, suffix, caret: prefix.length, input };
    this.editor.selectedChartId = null;
    this.updateFormulaReference(col, row);
    return true;
  }

  updateFormulaReference(col: number, row: number): void {
    const drag = this.referenceDrag;
    if (!drag) return;
    const start = getCellId(Math.min(drag.col, col), Math.min(drag.row, row));
    const end = getCellId(Math.max(drag.col, col), Math.max(drag.row, row));
    if (!this.editingOnActiveSheet) {
      this.editor.selectedCell = { col, row };
      this.editor.selectionRange = { startCol: drag.col, startRow: drag.row, endCol: col, endRow: row };
    }
    const ref = formatWorksheetReference(this.editor.editOrigin && this.editor.editOrigin.sheetId !== this.editor.activeSheetId ? this.editor.activeSheet.name : undefined, start === end ? start : `${start}:${end}`);
    this.editor.editingValue = drag.prefix + ref + drag.suffix;
    drag.caret = drag.prefix.length + ref.length;
  }

  finishFormulaReference(): void {
    const drag = this.referenceDrag;
    if (!drag) return;
    this.referenceDrag = undefined;
    setTimeout(() => {
      if (!this.editor.isEditing) return;
      const input = drag.input?.isConnected ? drag.input : this.referenceEditorInput();
      input?.focus({ preventScroll: true }); input?.setSelectionRange(drag.caret, drag.caret);
    }, 0);
  }

  startCellEdit(initialChar?: string): void {
    const grid = this.editor.activeSheet.data, id = getCellId(this.editor.selectedCell.col, this.editor.selectedCell.row), spill = getCellSpill(id, grid, this.hooks.calculationCache);
    if (spill && spill.owner !== id) { this.editor.editorNotice = this.editor.i18n.t('excel.spill.edit_anchor', { cell: spill.owner }); return; }
    if (!this.editor.guardEditableCell(this.editor.selectedCell.col, this.editor.selectedCell.row)) return;
    this.editor.editorNotice = ''; this.closeCompletions();
    this.keyboardReference = undefined; this.pendingSheetReference = undefined;
    this.editor.editOrigin = { sheetId: this.editor.activeSheetId, ...this.editor.selectedCell };
    this.editor.isEditing = true;
    const cellId = getCellId(this.editor.selectedCell.col, this.editor.selectedCell.row);
    const existing = this.editor.activeSheet.data[cellId]?.raw || '';
    this.editor.editingValue = initialChar !== undefined ? initialChar : existing;
    this.formulaInputMode = initialChar !== undefined && initialChar.startsWith('=') ? 'point' : 'edit';
    this.hooks.viewChanges?.markForCheck();

    setTimeout(() => {
      if (!this.editor.isEditing) return;
      const input = this.referenceEditorInput();
      if (input) { input.value = this.editor.editingValue; input.focus(); const caret = /\(\)\s*$/.test(this.editor.editingValue) ? this.editor.editingValue.lastIndexOf(')') : this.editor.editingValue.length; input.setSelectionRange(caret, caret); this.refreshCompletions(input); this.hooks.viewChanges?.markForCheck(); }
    }, 10);
  }

  commitCellEdit(): void {
    this.formulaInputMode = 'edit';
    this.closeCompletions();
    this.keyboardReference = undefined;
    this.referenceDrag = undefined;
    if (!this.editor.isEditing) return;
    this.editor.isEditing = false;
    this.hooks.viewChanges?.markForCheck();
    const origin = this.editor.editOrigin;
    this.editor.editOrigin = undefined; this.pendingSheetReference = undefined;
    if (origin && !this.editor.sheets.some(sheet => sheet.id === origin.sheetId)) { this.editor.editingValue = ''; return; }
    if (origin && this.editor.sheets.some(sheet => sheet.id === origin.sheetId) && (this.editor.activeSheetId !== origin.sheetId || this.editor.selectedCell.col !== origin.col || this.editor.selectedCell.row !== origin.row)) {
      this.editor.activeSheetId = origin.sheetId; this.editor.selectedCell = { col: origin.col, row: origin.row };
      this.editor.selectionRange = { startCol: origin.col, endCol: origin.col, startRow: origin.row, endRow: origin.row };
    }
    const cellId = getCellId(this.editor.selectedCell.col, this.editor.selectedCell.row);
    if (!this.editor.guardEditableCell(this.editor.selectedCell.col, this.editor.selectedCell.row)) {
      this.editor.editingValue = '';
      return;
    }
    const val = this.editor.editingValue.trim();
    const validationRule = this.editor.activeSheet.validations?.[cellId];
    if (validationRule) {
      const check = validateCellValue(
        val,
        validationRule,
        this.editor.activeSheet,
        this.editor.sheets,
        this.hooks.calculationCache,
        this.editor.i18n.currentLang() === 'es' ? 'es' : 'en'
      );
      if (!check.valid) {
        this.editor.editingValue = '';
        this.editor.editorNotice = `${check.title}: ${check.message}`;
        return;
      }
    }

    this.editor.editorNotice = '';
    this.editor.updateCurrentGrid((prev) => {
      const next = { ...prev };
      if (val === '') {
        if (next[cellId]) {
          next[cellId] = { ...next[cellId], raw: '' };
        }
      } else {
        const prevCell = next[cellId] || { raw: '' };
        const parsedLiteral = !val.startsWith('=') ? parseNumericLiteral(val) : null;
        if (parsedLiteral?.isPercent) {
          const prevStyle = prevCell.style || {};
          const { xlsxType: _omitType, ...restCell } = prevCell;
          next[cellId] = {
            ...restCell,
            raw: String(parsedLiteral.value),
            style: {
              ...prevStyle,
              numberFormat: 'percent',
              ...(parsedLiteral.decimals > 0 && prevStyle.decimals === undefined
                ? { decimals: Math.min(8, parsedLiteral.decimals) }
                : {}),
            },
          };
        } else if (parsedLiteral?.isCurrency) {
          const prevStyle = prevCell.style || {};
          const { xlsxType: _omitType, ...restCell } = prevCell;
          next[cellId] = {
            ...restCell,
            raw: String(parsedLiteral.value),
            style: {
              ...prevStyle,
              numberFormat: 'currency',
            },
          };
        } else {
          const { xlsxType: _omitType, ...restCell } = prevCell;
          next[cellId] = {
            ...(parsedLiteral !== null ? restCell : prevCell),
            raw: parsedLiteral !== null && !val.startsWith('=') && val.includes(',') && !val.includes('.')
              ? String(parsedLiteral.value)
              : val,
          };
        }
      }
      return next;
    });
    if (val.includes('\n')) {
      const lineCount = val.split(/\r?\n/).length;
      const neededHeight = Math.min(240, Math.max(24, lineCount * 16 + 8));
      const curRow = this.editor.selectedCell.row;
      const curHeight = this.editor.activeSheet.rowHeights?.[curRow] ?? 24;
      if (curHeight < neededHeight) {
        this.editor.activeSheet.rowHeights = {
          ...(this.editor.activeSheet.rowHeights || {}),
          [curRow]: neededHeight,
        };
        this.hooks.scheduleCanvasRender?.();
      }
    }
  }

  cancelCellEdit(): void {
    this.formulaInputMode = 'edit';
    this.closeCompletions();
    const origin = this.editor.editOrigin;
    if (origin && this.editor.sheets.some(sheet => sheet.id === origin.sheetId) && (this.editor.activeSheetId !== origin.sheetId || this.editor.selectedCell.col !== origin.col || this.editor.selectedCell.row !== origin.row)) {
      this.editor.activeSheetId = origin.sheetId; this.editor.selectedCell = { col: origin.col, row: origin.row };
      this.editor.selectionRange = { startCol: origin.col, endCol: origin.col, startRow: origin.row, endRow: origin.row };
    }
    this.editor.editOrigin = undefined; this.pendingSheetReference = undefined;
    this.keyboardReference = undefined;
    this.referenceDrag = undefined;
    this.editor.isEditing = false;
    this.editor.editingValue = '';
    this.hooks.viewChanges?.markForCheck();
  }

  onFormulaBarChange(val: string): void {
    const grid = this.editor.activeSheet.data, id = getCellId(this.editor.selectedCell.col, this.editor.selectedCell.row), spill = getCellSpill(id, grid, this.hooks.calculationCache);
    if (spill && spill.owner !== id) { this.editor.editorNotice = this.editor.i18n.t('excel.spill.edit_anchor', { cell: spill.owner }); if (this.editor.formulaBarInput) this.editor.formulaBarInput.nativeElement.value = ''; return; }
    if (!this.editor.guardEditableCell(this.editor.selectedCell.col, this.editor.selectedCell.row)) {
      if (this.editor.formulaBarInput) this.editor.formulaBarInput.nativeElement.value = String(grid[id]?.raw ?? '');
      return;
    }
    this.editor.editingValue = val;
    if (!this.editor.isEditing) {
      this.editor.editOrigin = { sheetId: this.editor.activeSheetId, ...this.editor.selectedCell }; this.editor.isEditing = true;
    }
    this.formulaInputChanged(this.editor.formulaBarInput?.nativeElement);
  }

  onFormulaBarKeyDown(event: KeyboardEvent): void {
    if (this.handleFormulaModeKey(event)) return;
    if (this.onCompletionKeyDown(event)) return;
    if (event.key === 'Enter') {
      event.preventDefault();
      this.commitCellEdit();
      this.editor.moveSelection(0, 1);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      this.cancelCellEdit();
    } else if (event.key === 'F4') {
      event.preventDefault();
      const input = this.editor.formulaBarInput?.nativeElement;
      const pos = input?.selectionStart ?? null;
      const { formula, newCursorPos } = cycleFormulaRefAtCursor(this.editor.editingValue, pos);
      this.editor.editingValue = formula;
      setTimeout(() => input?.setSelectionRange(newCursorPos, newCursorPos), 0);
    }
  }

  switchSheet(id: string): void {
    this.closeCompletions();
    if (id === this.editor.activeSheetId) return;
    this.hooks.stopInkReplay(); this.editor.inkLayer?.clearSelection();
    const target = this.editor.sheets.find(sheet => sheet.id === id);
    if (!target) return;
    const input = this.referenceEditorInput();
    const insertion = this.editor.isEditing && this.editor.editingValue.trim().startsWith('=') && target.type === 'grid' ? this.referenceInsertion(input) || (this.pendingSheetReference?.formula === this.editor.editingValue ? this.pendingSheetReference : undefined) : null;
    if (insertion) {
      this.editor.editOrigin ||= { sheetId: this.editor.activeSheetId, ...this.editor.selectedCell };
      this.pendingSheetReference = { ...insertion, formula: this.editor.editingValue }; this.referenceDrag = undefined; this.keyboardReference = undefined;
      this.editor.activeSheetId = id; this.editor.selectedChartId = null; this.editor.isSelecting = false;
      this.editor.selectedCell = id === this.editor.editOrigin.sheetId ? { col: this.editor.editOrigin.col, row: this.editor.editOrigin.row } : { col: 0, row: 0 };
      this.editor.selectionRange = { startCol: this.editor.selectedCell.col, endCol: this.editor.selectedCell.col, startRow: this.editor.selectedCell.row, endRow: this.editor.selectedCell.row };
      const caret = input?.selectionStart ?? insertion.prefix.length + (insertion.token?.length || 0);
      setTimeout(() => { const editor = this.referenceEditorInput(); editor?.focus({ preventScroll: true }); editor?.setSelectionRange(caret, caret); }, 0);
      this.hooks.scheduleCanvasRender?.();
      return;
    }
    this.commitCellEdit(); this.editor.activeSheetId = id; this.editor.selectedChartId = null; this.editor.scheduleAutoSave();
    this.hooks.scheduleCanvasRender?.();
  }
}
