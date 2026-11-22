import type { SheetEditorHooks } from './sheet-editor-hooks';
import { callFunction } from '../services/calc-functions';
import { parseNumericLiteral } from '../services/calc-types';
import { BorderEdge, BorderLineStyle, BorderPreset, CellBorders, CellStyle, MergeRegion, NumberFormat, PresetStyle, SelectionRange } from '../models/excel.model';
import { getCellId } from '../services/formula-engine.service';
import type { PureSheetEditorComponent } from '../pure-sheet-editor.component';

type SheetFormattingControllerHost = Pick<PureSheetEditorComponent,
  | 'activeSheet'
  | 'commitCellEdit'
  | 'getCell'
  | 'guardEditableRange'
  | 'normalizedRange'
  | 'scheduleAutoSave'
  | 'selectedCell'
  | 'selectionRange'
  | 'showGridlines'
  | 'themeService'
  | 'updateCurrentGrid'>;
type SheetFormattingControllerHooks = Pick<SheetEditorHooks,
  | 'pushUndoSnapshot'>;

/** Formatting behavior scoped to one editor instance. */
export class SheetFormattingController {
  constructor(private readonly editor: SheetFormattingControllerHost, private readonly hooks: SheetFormattingControllerHooks) {}

  applyStyleChange(patch: Partial<CellStyle>): void {
    let { minCol, maxCol, minRow, maxRow } = this.editor.normalizedRange;
    if (!this.editor.guardEditableRange(minCol, maxCol, minRow, maxRow)) return;
    const merged = this.mergedRegion(minCol, minRow);
    if (merged && merged.startCol === minCol && merged.startRow === minRow && merged.endCol === maxCol && merged.endRow === maxRow) {
      maxCol = minCol; maxRow = minRow;
    }
    this.editor.updateCurrentGrid((prev) => {
      const next = { ...prev };
      for (let r = minRow; r <= maxRow; r++) {
        for (let c = minCol; c <= maxCol; c++) {
          const id = getCellId(c, r);
          const cell = next[id] || { raw: '' };
          next[id] = {
            ...cell,
            style: { ...(cell.style || {}), ...patch },
          };
        }
      }
      return next;
    });
  }

  private rawCellBorders(col: number, row: number): CellBorders | undefined {
    const cell = this.editor.getCell(col, row);
    if (cell?.style?.borders) return cell.style.borders;
    if (cell?.style?.border) {
      const edge: BorderEdge = { style: 'thin', color: '#000000' };
      return { top: edge, right: edge, bottom: edge, left: edge };
    }
    return undefined;
  }

  getEffectiveCellBorders(col: number, row: number): CellBorders | undefined {
    const borders = this.rawCellBorders(col, row), merged = this.mergedRegion(col, row);
    if (!merged) return borders;
    const topLeft = this.rawCellBorders(merged.startCol, merged.startRow);
    const topRight = this.rawCellBorders(merged.endCol, merged.startRow);
    const bottomLeft = this.rawCellBorders(merged.startCol, merged.endRow);
    const result = { top: topLeft?.top, left: topLeft?.left, right: topRight?.right, bottom: bottomLeft?.bottom };
    return Object.values(result).some(Boolean) ? result : undefined;
  }

  shouldSkipBorder(col: number, row: number, edge: 'top' | 'left'): boolean {
    const cur = this.getEffectiveCellBorders(col, row);
    if (!cur) return false;

    if (edge === 'top' && row > 0) {
      const above = this.getEffectiveCellBorders(col, row - 1)?.bottom;
      return Boolean(
        cur.top &&
        above &&
        above.style === cur.top.style &&
        above.color === cur.top.color
      );
    }

    if (edge === 'left' && col > 0) {
      const leftNeighbor = this.getEffectiveCellBorders(col - 1, row)?.right;
      return Boolean(
        cur.left &&
        leftNeighbor &&
        leftNeighbor.style === cur.left.style &&
        leftNeighbor.color === cur.left.color
      );
    }

    return false;
  }

  applyCustomBorders(borders: CellBorders): void {
    const { minCol, maxCol, minRow, maxRow } = this.editor.normalizedRange;
    this.hooks.pushUndoSnapshot();

    this.editor.updateCurrentGrid((prev) => {
      const next = { ...prev };
      for (let r = minRow; r <= maxRow; r++) {
        for (let c = minCol; c <= maxCol; c++) {
          const id = getCellId(c, r);
          const cell = next[id] || { raw: '' };
          const prevBorders: CellBorders = { ...(cell.style?.borders || {}) };

          const updatedBorders: CellBorders = {
            ...prevBorders,
            ...(r === minRow && borders.top ? { top: borders.top } : {}),
            ...(r === maxRow && borders.bottom ? { bottom: borders.bottom } : {}),
            ...(c === minCol && borders.left ? { left: borders.left } : {}),
            ...(c === maxCol && borders.right ? { right: borders.right } : {}),
          };

          next[id] = {
            ...cell,
            style: { ...(cell.style || {}), borders: updatedBorders },
          };
        }
      }
      return next;
    });
  }

  getCellBorder(col: number, row: number, edge: 'top' | 'bottom' | 'left' | 'right'): string {
    const cell = this.editor.getCell(col, row);
    const borders = cell?.style?.borders;
    const defaultGrid = this.editor.showGridlines
      ? '1px solid #e2e8f0'
      : '1px solid transparent';

    const borderEdge = borders?.[edge];
    if (borderEdge) {
      const color = borderEdge.color || '#000000';
      const style = borderEdge.style || 'thin';
      if (style === 'double') return `3px double ${color}`;
      if (style === 'thick') return `3px solid ${color}`;
      if (style === 'medium') return `2px solid ${color}`;
      if (style === 'dashed') return `1px dashed ${color}`;
      if (style === 'dotted') return `1px dotted ${color}`;
      return `1px solid ${color}`;
    }

    if (cell?.style?.border) {
      return '1px solid #000000';
    }

    return defaultGrid;
  }

  applyBorderPreset(event: { preset: BorderPreset; lineStyle: BorderLineStyle; color: string }): void {
    const { preset, lineStyle, color } = event;
    const { minCol, maxCol, minRow, maxRow } = this.editor.normalizedRange;

    const effectiveColor = color || '#000000';
    const stdEdge: BorderEdge = { style: lineStyle || 'thin', color: effectiveColor };
    const thickEdge: BorderEdge = { style: 'thick', color: effectiveColor };
    const doubleEdge: BorderEdge = { style: 'double', color: effectiveColor };

    this.hooks.pushUndoSnapshot();

    this.editor.updateCurrentGrid((prev) => {
      const next = { ...prev };
      for (let r = minRow; r <= maxRow; r++) {
        for (let c = minCol; c <= maxCol; c++) {
          const id = getCellId(c, r);
          const cell = next[id] || { raw: '' };
          const prevBorders: CellBorders = { ...(cell.style?.borders || {}) };

          const isTop = r === minRow;
          const isBottom = r === maxRow;
          const isLeft = c === minCol;
          const isRight = c === maxCol;

          let updatedBorders: CellBorders = prevBorders;

          switch (preset) {
            case 'none':
              updatedBorders = {};
              break;
            case 'bottom':
              if (isBottom) updatedBorders = { ...prevBorders, bottom: stdEdge };
              break;
            case 'top':
              if (isTop) updatedBorders = { ...prevBorders, top: stdEdge };
              break;
            case 'left':
              if (isLeft) updatedBorders = { ...prevBorders, left: stdEdge };
              break;
            case 'right':
              if (isRight) updatedBorders = { ...prevBorders, right: stdEdge };
              break;
            case 'all':
              updatedBorders = {
                top: stdEdge,
                bottom: stdEdge,
                left: stdEdge,
                right: stdEdge,
              };
              break;
            case 'outside':
              updatedBorders = {
                ...prevBorders,
                ...(isTop ? { top: stdEdge } : {}),
                ...(isBottom ? { bottom: stdEdge } : {}),
                ...(isLeft ? { left: stdEdge } : {}),
                ...(isRight ? { right: stdEdge } : {}),
              };
              break;
            case 'thickOutside':
              updatedBorders = {
                ...prevBorders,
                ...(isTop ? { top: thickEdge } : {}),
                ...(isBottom ? { bottom: thickEdge } : {}),
                ...(isLeft ? { left: thickEdge } : {}),
                ...(isRight ? { right: thickEdge } : {}),
              };
              break;
            case 'bottomDouble':
              if (isBottom) updatedBorders = { ...prevBorders, bottom: doubleEdge };
              break;
            case 'thickBottom':
              if (isBottom) updatedBorders = { ...prevBorders, bottom: thickEdge };
              break;
            case 'topBottom':
              updatedBorders = {
                ...prevBorders,
                ...(isTop ? { top: stdEdge } : {}),
                ...(isBottom ? { bottom: stdEdge } : {}),
              };
              break;
            case 'topThickBottom':
              updatedBorders = {
                ...prevBorders,
                ...(isTop ? { top: stdEdge } : {}),
                ...(isBottom ? { bottom: thickEdge } : {}),
              };
              break;
            case 'topDoubleBottom':
              updatedBorders = {
                ...prevBorders,
                ...(isTop ? { top: stdEdge } : {}),
                ...(isBottom ? { bottom: doubleEdge } : {}),
              };
              break;
          }

          next[id] = {
            ...cell,
            style: { ...(cell.style || {}), borders: updatedBorders },
          };
        }
      }
      return next;
    });
  }

  private mergeLookupSource?: MergeRegion[];

  private mergeLookup = new Map<string, MergeRegion | undefined>();

  mergedRegion(col: number, row: number): MergeRegion | undefined {
    const merges = this.editor.activeSheet.merges;
    if (!merges?.length) return undefined;
    if (merges !== this.mergeLookupSource || this.mergeLookup.size > 4096) { this.mergeLookupSource = merges; this.mergeLookup.clear(); }
    const key = `${col}:${row}`;
    if (!this.mergeLookup.has(key)) this.mergeLookup.set(key, merges.find(m => col >= m.startCol && col <= m.endCol && row >= m.startRow && row <= m.endRow));
    return this.mergeLookup.get(key);
  }

  expandMergedSelection(range: SelectionRange): SelectionRange {
    const result = { startCol: Math.min(range.startCol, range.endCol), endCol: Math.max(range.startCol, range.endCol), startRow: Math.min(range.startRow, range.endRow), endRow: Math.max(range.startRow, range.endRow) };
    let changed = true;
    while (changed) {
      changed = false;
      for (const m of this.editor.activeSheet.merges || []) {
        if (m.endCol < result.startCol || m.startCol > result.endCol || m.endRow < result.startRow || m.startRow > result.endRow) continue;
        if (m.startCol < result.startCol || m.endCol > result.endCol || m.startRow < result.startRow || m.endRow > result.endRow) {
          result.startCol = Math.min(result.startCol, m.startCol); result.endCol = Math.max(result.endCol, m.endCol);
          result.startRow = Math.min(result.startRow, m.startRow); result.endRow = Math.max(result.endRow, m.endRow); changed = true;
        }
      }
    }
    return result;
  }

  get selectionIsMerged(): boolean {
    const r = this.expandMergedSelection(this.editor.selectionRange);
    return !!this.editor.activeSheet.merges?.some(m => m.startCol === r.startCol && m.endCol === r.endCol && m.startRow === r.startRow && m.endRow === r.endRow);
  }

  toggleMerge(): void {
    this.editor.commitCellEdit();
    const range = this.expandMergedSelection(this.editor.selectionRange);
    const merges = this.editor.activeSheet.merges || [];
    const exact = merges.find(m => m.startCol === range.startCol && m.endCol === range.endCol && m.startRow === range.startRow && m.endRow === range.endRow);
    if (!exact && range.startCol === range.endCol && range.startRow === range.endRow) return;
    this.hooks.pushUndoSnapshot();
    const retained = merges.filter(m => m.endCol < range.startCol || m.startCol > range.endCol || m.endRow < range.startRow || m.startRow > range.endRow);
    this.editor.activeSheet.merges = exact ? retained : [...retained, range];
    if (!exact) {
      const id = getCellId(range.startCol, range.startRow), cell = this.editor.activeSheet.data[id] || { raw: '' };
      this.editor.activeSheet.data = { ...this.editor.activeSheet.data, [id]: { ...cell, style: { ...cell.style, align: 'center', verticalAlign: 'middle' } } };
    }
    this.editor.selectedCell = { col: range.startCol, row: range.startRow }; this.editor.selectionRange = range;
    this.editor.scheduleAutoSave();
  }

  formatCellDisplay(val: string | number, style?: CellStyle): string {
    if (val === '' || val === null || val === undefined) return '';
    const directNum = typeof val === 'number' ? val : Number(val);
    const parsedLit = Number.isNaN(directNum) && typeof val === 'string' ? parseNumericLiteral(val) : null;
    const num = !Number.isNaN(directNum) ? directNum : (parsedLit?.value ?? NaN);
    const isNum = !isNaN(num) && val !== '';

    if (isNum && (style?.numberFormat === 'date' || style?.numberFormat === 'datetime')) {
      try { return String(callFunction('TEXT', [() => num, () => style.numberFormat === 'datetime' ? 'yyyy-mm-dd hh:mm:ss' : 'yyyy-mm-dd'])); } catch { return String(val); }
    }
    if (isNum && style?.xlsxNumberFormat && /[ymdhs]/i.test(style.xlsxNumberFormat.replace(/"[^"]*"|\[[^\]]*\]/g, ''))) {
      try { return String(callFunction('TEXT', [() => num, () => style.xlsxNumberFormat!])); } catch { return String(val); }
    }
    if (isNum && style?.numberFormat === 'currency') {
      const dec = style.decimals ?? 2;
      return '$' + num.toLocaleString(undefined, { minimumFractionDigits: dec, maximumFractionDigits: dec });
    }
    if (isNum && style?.numberFormat === 'percent') {
      const minDec = style.decimals ?? 0;
      const maxDec = style.decimals ?? 2;
      return (num * 100).toLocaleString(undefined, { minimumFractionDigits: minDec, maximumFractionDigits: maxDec }) + '%';
    }
    if (isNum && style?.numberFormat === 'comma') {
      const dec = style.decimals ?? 2;
      return num.toLocaleString(undefined, { minimumFractionDigits: dec, maximumFractionDigits: dec });
    }
    if (typeof val === 'number') {
      return Number(val.toFixed(4)).toString();
    }
    return String(val);
  }

  handleApplyNumberFormat(format: NumberFormat): void {
    this.applyStyleChange({ numberFormat: format, xlsxNumberFormat: format === 'date' ? 'yyyy-mm-dd' : format === 'datetime' ? 'yyyy-mm-dd hh:mm:ss' : undefined });
  }

  handleApplyPresetStyle(styleName: PresetStyle): void {
    const { minCol, maxCol, minRow, maxRow } = this.editor.normalizedRange;
    this.hooks.pushUndoSnapshot();

    this.editor.updateCurrentGrid((prev) => {
      const next = { ...prev };
      for (let r = minRow; r <= maxRow; r++) {
        for (let c = minCol; c <= maxCol; c++) {
          const id = getCellId(c, r);
          const cell = next[id] || { raw: '' };
          let newStyle: CellStyle = { ...(cell.style || {}) };

          switch (styleName) {
            case 'normal':
              newStyle = {
                ...newStyle,
                preset: undefined,
                bgColor: undefined,
                textColor: undefined,
                bold: false,
                italic: false,
                underline: false,
                borders: undefined,
              };
              break;
            case 'bad':
              newStyle = {
                ...newStyle,
                preset: 'bad',
                bgColor: '#ffc7ce',
                textColor: '#9c0006',
              };
              break;
            case 'good':
              newStyle = {
                ...newStyle,
                preset: 'good',
                bgColor: '#c6efce',
                textColor: '#006100',
              };
              break;
            case 'neutral':
              newStyle = {
                ...newStyle,
                preset: 'neutral',
                bgColor: '#ffeb9c',
                textColor: '#9c6500',
              };
              break;
            case 'calculation':
              newStyle = {
                ...newStyle,
                preset: 'calculation',
                bgColor: '#f2f2f2',
                textColor: '#fa7d00',
                bold: true,
                borders: {
                  top: { style: 'thin', color: '#7f7f7f' },
                  bottom: { style: 'thin', color: '#7f7f7f' },
                  left: { style: 'thin', color: '#7f7f7f' },
                  right: { style: 'thin', color: '#7f7f7f' },
                },
              };
              break;
            case 'check':
              newStyle = {
                ...newStyle,
                preset: 'check',
                bgColor: '#a5a5a5',
                textColor: '#ffffff',
                bold: true,
                borders: {
                  bottom: { style: 'double', color: '#ffffff' },
                },
              };
              break;
          }

          next[id] = { ...cell, style: newStyle };
        }
      }
      return next;
    });
  }
}
