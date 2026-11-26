import {
  AfterViewInit,
  ChangeDetectorRef,
  Component,
  ElementRef,
  Input,
  OnDestroy,
  OnInit,
  ViewChild,
  effect,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Block } from '../../core/models/block.model';
import { NotesService } from '../../core/services/notes.service';
import { ThemeService } from '../../core/services/theme.service';
import { I18nService } from '../../core/services/i18n.service';
import { AiDocumentService } from '../../core/services/ai-document.service';
import { sheetAiAdapter } from '../../shared/utils/ai-sheet-adapter';
import { CellStyle, SheetGrid } from '../../editor/pure-sheet-editor/models/excel.model';
import {
  colIndexToLetter,
  evaluateCellValueCached,
  getCellId,
} from '../../editor/pure-sheet-editor/services/formula-engine.service';
import { GridAxis } from '../../editor/pure-sheet-editor/services/grid-viewport';
import {
  SHEET_HEADER_COL_WIDTH,
  SHEET_HEADER_ROW_HEIGHT,
  SheetActiveEditorState,
  SheetCanvasFrame,
  SheetCanvasRenderer,
} from '../../editor/pure-sheet-editor/services/sheet-canvas-renderer';

const INITIAL_ROWS = 12;
const INITIAL_COLS = 8;
const DEFAULT_COL_WIDTH = 96;
const DEFAULT_ROW_HEIGHT = 24;

@Component({
  selector: 'app-sheet-block',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './sheet-block.component.html',
  styleUrls: ['./sheet-block.component.css'],
})
export class SheetBlockComponent implements OnInit, AfterViewInit, OnDestroy {
  @Input({ required: true }) block!: Block;

  @ViewChild('blockCanvas') blockCanvasRef?: ElementRef<HTMLCanvasElement>;
  @ViewChild('blockEditorInput') blockEditorInputRef?: ElementRef<HTMLInputElement>;

  readonly notesService = inject(NotesService);
  readonly themeService = inject(ThemeService);
  readonly i18n = inject(I18nService);
  private readonly aiDocuments = inject(AiDocumentService);
  private readonly cdr = inject(ChangeDetectorRef);

  readonly currentZoom = signal<number>(1.0);
  readonly readingHeight = signal<number>(200);
  readonly Math = Math;

  grid: SheetGrid = {};
  selectedCell: { col: number; row: number } = { col: 0, row: 0 };
  isEditing = false;
  editingValue = '';

  readonly totalRows = INITIAL_ROWS;
  readonly totalCols = INITIAL_COLS;
  readonly colLetters = Array.from({ length: INITIAL_COLS }, (_, i) => colIndexToLetter(i));
  readonly rowIndices = Array.from({ length: INITIAL_ROWS }, (_, i) => i);

  readonly colAxis = new GridAxis(INITIAL_COLS, DEFAULT_COL_WIDTH);
  readonly rowAxis = new GridAxis(INITIAL_ROWS, DEFAULT_ROW_HEIGHT);
  readonly contentWidth = SHEET_HEADER_COL_WIDTH + this.colAxis.offset(INITIAL_COLS);
  readonly contentHeight = SHEET_HEADER_ROW_HEIGHT + this.rowAxis.offset(INITIAL_ROWS);

  private readonly renderer = new SheetCanvasRenderer();
  private lastFrame: SheetCanvasFrame | null = null;
  private saveTimeout: ReturnType<typeof setTimeout> | null = null;
  private rafId = 0;
  private viewReady = false;
  private unregisterAi?: () => void;

  private calculationGrid?: SheetGrid;
  private calculationCache = new WeakMap();

  constructor() {
    effect(() => {
      this.themeService.isDark();
      this.notesService.isReadingMode();
      this.currentZoom();
      this.scheduleRender();
    });
  }

  ngOnInit(): void {
    this.loadData();
    this.registerAi();
  }

  ngAfterViewInit(): void {
    this.viewReady = true;
    this.renderCanvas();
  }

  ngOnDestroy(): void {
    if (this.saveTimeout) clearTimeout(this.saveTimeout);
    if (this.rafId && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(this.rafId);
    }
    this.unregisterAi?.();
  }

  get activeCellId(): string {
    return getCellId(this.selectedCell.col, this.selectedCell.row);
  }

  get activeCellA11yLabel(): string {
    const id = this.activeCellId;
    const raw = this.grid[id]?.raw || '';
    const display = this.getCellDisplay(this.selectedCell.col, this.selectedCell.row);
    const parts = [`${id}: ${display || 'vacío'}`];
    if (raw.startsWith('=')) parts.push(`fórmula ${raw}`);
    if (this.isEditing) parts.push(`editando "${this.editingValue}"`);
    return parts.join(', ');
  }

  get canvasA11ySummary(): string {
    const title = this.i18n.currentLang() === 'es' ? 'Hoja de cálculo' : 'Spreadsheet';
    return `${title}, ${this.activeCellA11yLabel}`;
  }

  get editorBoxRect(): { left: number; top: number; width: number; height: number } {
    const z = this.currentZoom();
    const { col, row } = this.selectedCell;
    const x = SHEET_HEADER_COL_WIDTH + this.colAxis.offset(col);
    const y = SHEET_HEADER_ROW_HEIGHT + this.rowAxis.offset(row);
    const w = this.colAxis.offset(col + 1) - this.colAxis.offset(col);
    const h = this.rowAxis.offset(row + 1) - this.rowAxis.offset(row);
    return {
      left: Math.round(x * z),
      top: Math.round(y * z),
      width: Math.round(w * z),
      height: Math.round(h * z),
    };
  }

  private loadData(): void {
    const raw = this.block.content?.['data'] || this.block.content?.['workbookData']?.data;
    if (raw && typeof raw === 'object') {
      this.grid = { ...raw };
    } else {
      // Default sample table in sheet block
      this.grid = {
        A1: { raw: 'Ítem', style: { bold: true } },
        B1: { raw: 'Cantidad', style: { bold: true, align: 'right' } },
        C1: { raw: 'Precio', style: { bold: true, align: 'right' } },
        D1: { raw: 'Total', style: { bold: true, align: 'right' } },

        A2: { raw: 'Artículo 1' },
        B2: { raw: '3', style: { align: 'right' } },
        C2: { raw: '15', style: { numberFormat: 'currency', align: 'right' } },
        D2: { raw: '=B2*C2', style: { bold: true, numberFormat: 'currency', align: 'right' } },

        A3: { raw: 'Artículo 2' },
        B3: { raw: '5', style: { align: 'right' } },
        C3: { raw: '20', style: { numberFormat: 'currency', align: 'right' } },
        D3: { raw: '=B3*C3', style: { bold: true, numberFormat: 'currency', align: 'right' } },

        A4: { raw: 'TOTAL', style: { bold: true } },
        D4: { raw: '=SUMA(D2:D3)', style: { bold: true, numberFormat: 'currency', align: 'right' } },
      };
    }
  }

  private registerAi(): void {
    this.unregisterAi?.();
    const ownerId = this.notesService.currentNote()?._id;
    this.unregisterAi = this.aiDocuments.register(
      sheetAiAdapter(
        () => ownerId,
        () => ({ data: this.grid }),
        (snapshot) => {
          if (snapshot.data) {
            this.grid = snapshot.data;
            this.renderCanvas();
            this.scheduleSave();
          }
        },
        () => `block:${this.block.id}:`
      )
    );
  }

  scheduleSave(): void {
    if (this.saveTimeout) clearTimeout(this.saveTimeout);
    this.saveTimeout = setTimeout(() => {
      this.notesService.updateBlockContent(this.block.id, { data: this.grid });
    }, 400);
  }

  getCellDisplay(col: number, row: number): string {
    if (this.calculationGrid !== this.grid) {
      this.calculationGrid = this.grid;
      this.calculationCache = new WeakMap();
    }
    const id = getCellId(col, row);
    const cell = this.grid[id];
    const val = evaluateCellValueCached(id, this.grid, this.calculationCache);
    return this.formatBlockDisplay(val, cell?.style);
  }

  private formatBlockDisplay(val: unknown, style?: CellStyle): string {
    if (val === '' || val === null || val === undefined) return '';
    const num = Number(val);
    if (!Number.isNaN(num) && style?.numberFormat === 'currency') {
      return '$' + num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    return String(val);
  }

  getCellStyle(col: number, row: number): Record<string, string> {
    const id = getCellId(col, row);
    const s = this.grid[id]?.style;
    return {
      fontWeight: s?.bold ? 'bold' : 'normal',
      fontStyle: s?.italic ? 'italic' : 'normal',
      textAlign: s?.align || 'left',
      backgroundColor: s?.bgColor || '',
      color: s?.textColor || '',
    };
  }

  onCellClick(col: number, row: number): void {
    if (this.notesService.isReadingMode()) return;
    if (this.isEditing) {
      if (this.selectedCell.col === col && this.selectedCell.row === row) return;
      this.commitEdit();
    }
    this.selectedCell = { col, row };
    this.renderCanvas();
  }

  onCellDblClick(col: number, row: number): void {
    if (this.notesService.isReadingMode()) return;
    if (this.isEditing && (this.selectedCell.col !== col || this.selectedCell.row !== row)) {
      this.commitEdit();
    }
    this.selectedCell = { col, row };
    const id = getCellId(col, row);
    this.editingValue = this.grid[id]?.raw || '';
    this.isEditing = true;
    this.cdr.markForCheck();
    this.renderCanvas();
    this.focusEditorInput();
  }

  onCanvasClick(event: MouseEvent): void {
    if (this.notesService.isReadingMode()) return;
    const hit = this.hitTestCanvasEvent(event);
    if (hit.kind === 'cell') {
      this.onCellClick(hit.col, hit.row);
      this.blockCanvasRef?.nativeElement.focus({ preventScroll: true });
    } else if (hit.kind === 'colHeader') {
      this.onCellClick(hit.col, 0);
    } else if (hit.kind === 'rowHeader') {
      this.onCellClick(0, hit.row);
    }
  }

  onCanvasDblClick(event: MouseEvent): void {
    if (this.notesService.isReadingMode()) return;
    const hit = this.hitTestCanvasEvent(event);
    if (hit.kind === 'cell') {
      this.onCellDblClick(hit.col, hit.row);
    }
  }

  onCanvasKeyDown(event: KeyboardEvent): void {
    if (this.notesService.isReadingMode() || this.isEditing) return;
    const { col, row } = this.selectedCell;
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      this.onCellClick(Math.min(this.totalCols - 1, col + 1), row);
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      this.onCellClick(Math.max(0, col - 1), row);
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.onCellClick(col, Math.min(this.totalRows - 1, row + 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.onCellClick(col, Math.max(0, row - 1));
    } else if (event.key === 'Tab') {
      event.preventDefault();
      const nextCol = event.shiftKey ? Math.max(0, col - 1) : Math.min(this.totalCols - 1, col + 1);
      this.onCellClick(nextCol, row);
    } else if (event.key === 'Enter' || event.key === 'F2') {
      event.preventDefault();
      this.onCellDblClick(col, row);
    } else if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      const id = getCellId(col, row);
      if (this.grid[id]?.raw) {
        this.grid[id] = { ...this.grid[id], raw: '' };
        this.calculationCache = new WeakMap();
        this.renderCanvas();
        this.scheduleSave();
      }
    } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      this.selectedCell = { col, row };
      this.editingValue = event.key;
      this.isEditing = true;
      this.cdr.markForCheck();
      this.renderCanvas();
      this.focusEditorInput(false);
    }
  }

  onEditorInput(): void {
    this.renderCanvas();
  }

  cancelEdit(): void {
    this.isEditing = false;
    this.cdr.markForCheck();
    this.renderCanvas();
    this.blockCanvasRef?.nativeElement.focus({ preventScroll: true });
  }

  commitEdit(): void {
    if (!this.isEditing) return;
    this.isEditing = false;
    this.cdr.markForCheck();
    const id = getCellId(this.selectedCell.col, this.selectedCell.row);
    const val = this.editingValue.trim();

    if (val === '') {
      if (this.grid[id]) this.grid[id] = { ...this.grid[id], raw: '' };
    } else {
      this.grid[id] = {
        ...(this.grid[id] || {}),
        raw: val,
      };
    }
    this.calculationCache = new WeakMap();
    this.renderCanvas();
    this.scheduleSave();
  }

  zoomIn(): void {
    this.currentZoom.update((z) => Math.min(Math.round((z + 0.1) * 10) / 10, 2.0));
  }

  zoomOut(): void {
    this.currentZoom.update((z) => Math.max(Math.round((z - 0.1) * 10) / 10, 0.5));
  }

  resetZoom(): void {
    this.currentZoom.set(1.0);
  }

  scheduleRender(): void {
    if (!this.viewReady || this.rafId) return;
    if (typeof requestAnimationFrame === 'function') {
      this.rafId = requestAnimationFrame(() => {
        this.rafId = 0;
        this.renderCanvas();
      });
    } else {
      this.renderCanvas();
    }
  }

  renderCanvas(): SheetCanvasFrame | null {
    if (this.calculationGrid !== this.grid) {
      this.calculationGrid = this.grid;
      this.calculationCache = new WeakMap();
    }
    const canvas = this.blockCanvasRef?.nativeElement;
    const ctx = canvas?.getContext('2d') ?? null;

    const inputEl = this.blockEditorInputRef?.nativeElement;
    const activeEditor: SheetActiveEditorState | null =
      this.isEditing && !this.notesService.isReadingMode()
        ? {
            col: this.selectedCell.col,
            row: this.selectedCell.row,
            value: this.editingValue,
            selectionStart: inputEl?.selectionStart ?? this.editingValue.length,
            selectionEnd: inputEl?.selectionEnd ?? this.editingValue.length,
            caretVisible: true,
            style: this.grid[this.activeCellId]?.style,
          }
        : null;

    const frame = this.renderer.buildFrame({
      grid: this.grid,
      calculationCache: this.calculationCache,
      colAxis: this.colAxis,
      rowAxis: this.rowAxis,
      totalCols: this.totalCols,
      totalRows: this.totalRows,
      scrollLeft: 0,
      scrollTop: 0,
      viewportWidth: this.contentWidth,
      viewportHeight: this.contentHeight,
      selectedCell: this.selectedCell,
      normalizedRange: {
        minCol: this.selectedCell.col,
        maxCol: this.selectedCell.col,
        minRow: this.selectedCell.row,
        maxRow: this.selectedCell.row,
      },
      merges: [],
      showHeadings: true,
      showGridlines: true,
      showFormulasInCells: false,
      isDarkChrome: this.themeService.isDark(),
      isEditing: this.isEditing,
      isFillDragging: false,
      filtersEnabled: false,
      activeEditor,
      formatDisplay: (val, style) => this.formatBlockDisplay(val, style),
      mergedRegion: () => undefined,
      getEffectiveBorders: (col, row) => this.grid[getCellId(col, row)]?.style?.borders,
      shouldSkipBorder: () => false,
      isTracedCell: () => false,
      getSourceHighlight: () => null,
    });

    this.lastFrame = frame;
    if (canvas && ctx) {
      const zoom = this.currentZoom();
      const dpr = Math.min(2, (typeof window !== 'undefined' ? window.devicePixelRatio : 1) || 1);
      const scale = zoom * dpr;
      const targetW = Math.max(1, Math.round(this.contentWidth * scale));
      const targetH = Math.max(1, Math.round(this.contentHeight * scale));
      if (canvas.width !== targetW) canvas.width = targetW;
      if (canvas.height !== targetH) canvas.height = targetH;
      this.renderer.paint(ctx, frame, scale);
    }
    return frame;
  }

  private hitTestCanvasEvent(event: MouseEvent) {
    const canvas = this.blockCanvasRef?.nativeElement;
    const rect = canvas?.getBoundingClientRect();
    const zoom = this.currentZoom() || 1;
    const localX = rect ? (event.clientX - rect.left) / zoom : event.offsetX / zoom;
    const localY = rect ? (event.clientY - rect.top) / zoom : event.offsetY / zoom;
    const frame = this.lastFrame ?? this.renderCanvas();
    return this.renderer.hitTest(localX, localY, {
      colAxis: this.colAxis,
      rowAxis: this.rowAxis,
      totalCols: this.totalCols,
      totalRows: this.totalRows,
      scrollLeft: 0,
      scrollTop: 0,
      viewportWidth: this.contentWidth,
      viewportHeight: this.contentHeight,
      showHeadings: true,
      frame: frame ?? undefined,
      mergedRegion: () => undefined,
    });
  }

  private focusEditorInput(selectAll = true): void {
    setTimeout(() => {
      const el = this.blockEditorInputRef?.nativeElement;
      if (!el) return;
      el.focus();
      if (selectAll) {
        el.select();
      } else {
        const end = el.value.length;
        el.setSelectionRange(end, end);
      }
      this.renderCanvas();
    }, 0);
  }
}
