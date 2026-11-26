import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PureSheetEditorComponent } from './pure-sheet-editor.component';
import { ExcelRibbonComponent } from './components/excel-ribbon/excel-ribbon.component';
import { NotesService } from '../../core/services/notes.service';
import { ThemeService } from '../../core/services/theme.service';
import { I18nService } from '../../core/services/i18n.service';
import { AiDocumentService } from '../../core/services/ai-document.service';
import { AiService } from '../../core/services/ai.service';
import { Note } from '../../core/models/note.model';
import { ElementRef, signal } from '@angular/core';
import { TOTAL_COLS, TOTAL_ROWS } from './constants/editor.constants';
import { getCellId as cellId } from './services/formula-engine.service';

describe('PureSheetEditorComponent', () => {
  it('handles Ctrl + wheel within the grid without changing normal scrolling or wheel behavior elsewhere', async () => {
    const fixture = TestBed.createComponent(PureSheetEditorComponent);
    fixture.componentInstance.note = structuredClone(sampleNote);
    fixture.detectChanges();
    await fixture.whenStable();
    const editor = fixture.componentInstance;
    const grid = fixture.nativeElement.querySelector('[tabindex="0"]') as HTMLElement;
    const wheel = (deltaY: number, ctrlKey = true) => new WheelEvent('wheel', { deltaY, ctrlKey, bubbles: true, cancelable: true });
    const up = wheel(-100);
    grid.dispatchEvent(up);
    expect(up.defaultPrevented).toBe(true);
    expect(editor.currentZoom()).toBe(1.1);
    grid.dispatchEvent(wheel(100));
    expect(editor.currentZoom()).toBe(1);
    const normal = wheel(100, false);
    grid.dispatchEvent(normal);
    expect(normal.defaultPrevented).toBe(false);
    expect(editor.currentZoom()).toBe(1);
    editor.currentZoom.set(2);
    const limit = wheel(-100);
    grid.dispatchEvent(limit);
    expect(limit.defaultPrevented).toBe(true);
    expect(editor.currentZoom()).toBe(2);
    const outside = wheel(-100);
    fixture.nativeElement.dispatchEvent(outside);
    expect(outside.defaultPrevented).toBe(false);
    fixture.destroy();
  }, 20000);

  it('keeps the grid container unshifted and preserves logical scroll and cell overlay alignment across zoom changes', async () => {
    const fixture = TestBed.createComponent(PureSheetEditorComponent);
    fixture.componentInstance.note = structuredClone(sampleNote);
    fixture.detectChanges();
    await fixture.whenStable();

    const editor = fixture.componentInstance;
    const grid = fixture.nativeElement.querySelector('[tabindex="0"]') as HTMLElement;
    const world = grid.querySelector('.sheet-canvas-world') as HTMLElement;

    // Seed an explicit scrolled logical position before zooming
    grid.scrollLeft = 200;
    grid.scrollTop = 300;
    editor.onGridScroll();

    const baseWorldW = editor.inkCanvasWidth;
    const baseWorldH = editor.inkCanvasHeight;
    const box100 = editor.activeCellEditorBox;

    editor.handleChangeZoom(150);
    fixture.detectChanges();

    // Scroll container itself must never receive CSS zoom so its frame and scrollbars never shift
    expect(grid.style.zoom).toBe('');
    expect(world.style.width).toBe(`${Math.round(baseWorldW * 1.5)}px`);
    expect(world.style.height).toBe(`${Math.round(baseWorldH * 1.5)}px`);
    // DOM scrollTop/scrollLeft scale proportionally so logical scrollLeft/scrollTop remain anchored
    expect(grid.scrollLeft).toBe(300);
    expect(grid.scrollTop).toBe(450);
    expect(editor.scrollLeft).toBeCloseTo(200, 1);
    expect(editor.scrollTop).toBeCloseTo(300, 1);

    // Inline editor overlay scales consistently with Canvas cells at 150%
    editor.selectedCell = { col: 1, row: 2 };
    const boxAt100ForB3 = (() => {
      editor.currentZoom.set(1.0);
      return editor.activeCellEditorBox;
    })();
    editor.currentZoom.set(1.5);
    const boxAt150ForB3 = editor.activeCellEditorBox;
    expect(boxAt150ForB3.left).toBe(Math.round(boxAt100ForB3.left * 1.5));
    expect(boxAt150ForB3.top).toBe(Math.round(boxAt100ForB3.top * 1.5));
    expect(boxAt150ForB3.width).toBe(Math.round(boxAt100ForB3.width * 1.5));
    expect(boxAt150ForB3.height).toBe(Math.round(boxAt100ForB3.height * 1.5));
    expect(box100.width).toBeGreaterThan(0);

    // Resetting zoom returns cleanly to exact original scroll & world coordinates
    editor.resetZoom();
    fixture.detectChanges();
    expect(editor.currentZoom()).toBe(1);
    expect(grid.scrollLeft).toBe(200);
    expect(grid.scrollTop).toBe(300);
    expect(world.style.width).toBe(`${baseWorldW}px`);
    expect(world.style.height).toBe(`${baseWorldH}px`);

    fixture.destroy();
  }, 20000);

  let component: PureSheetEditorComponent;
  let mockNotesService: any;
  let mockThemeService: any;
  let mockI18nService: any;
  let mockAiDocumentService: any;
  let mockAiService: any;

  const sampleNote: Note = {
    _id: 'sheet-note-1',
    userId: 'user-1',
    title: 'Financial Model',
    space: 'default',
    tags: [],
    blocks: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    docType: 'sheet',
    docData: {
      sheets: [
        {
          id: 'sheet1',
          name: 'Ventas',
          type: 'grid',
          data: {
            A1: { raw: 'Ingresos', style: { bold: true } },
            B1: { raw: '1500' },
            A2: { raw: 'Gastos' },
            B2: { raw: '500' },
            A3: { raw: 'Beneficio' },
            B3: { raw: '=B1-B2' },
          },
        },
      ],
      activeSheetId: 'sheet1',
    },
  };

  beforeEach(() => {
    mockNotesService = {
      updateDocData: vi.fn(),
      updateTitle: vi.fn(),
      documentZoom: signal(1),
      isSidebarCollapsed: signal(false),
    };

    mockThemeService = {
      isDark: signal(false),
      toggleTheme: vi.fn(),
    };

    mockI18nService = new I18nService();
    mockI18nService.currentLang.set('es');
    vi.spyOn(mockI18nService, 't');

    mockAiDocumentService = {
      register: vi.fn(() => vi.fn()),
    };

    mockAiService = {
      toggleSidebar: vi.fn(),
      isSidebarOpen: signal(false),
    };

    TestBed.configureTestingModule({
      providers: [
        { provide: NotesService, useValue: mockNotesService },
        { provide: ThemeService, useValue: mockThemeService },
        { provide: I18nService, useValue: mockI18nService },
        { provide: AiDocumentService, useValue: mockAiDocumentService },
        { provide: AiService, useValue: mockAiService },
      ],
    });

    component = TestBed.runInInjectionContext(() => new PureSheetEditorComponent());
    component.note = { ...sampleNote };
  });

  it('renders PureSheetEditorComponent and ExcelRibbonComponent without throwing errors', () => {
    const fixture = TestBed.createComponent(PureSheetEditorComponent);
    fixture.componentInstance.note = { ...sampleNote };
    expect(() => fixture.detectChanges()).not.toThrow();
  });

  afterEach(() => {
    component.ngOnDestroy();
  });

  it('keeps controller history, formula caches and zoom isolated between editor instances', () => {
    component.ngOnInit();
    const second = TestBed.runInInjectionContext(() => new PureSheetEditorComponent());
    second.note = { ...sampleNote, _id: 'second-sheet' };
    second.ngOnInit();
    try {
      expect(component.getCellValue(1, 2)).toBe(1000);
      expect(second.getCellValue(1, 2)).toBe(1000);
      component.updateCurrentGrid(grid => ({ ...grid, B1: { raw: '2000' } }));
      component.zoomIn();
      expect(component.getCellValue(1, 2)).toBe(1500);
      expect(second.getCellValue(1, 2)).toBe(1000);
      expect(second.currentZoom()).toBe(1);
      expect(second.canUndo).toBe(false);
      component.handleUndo();
      expect(component.getCellValue(1, 2)).toBe(1000);
      expect(component.canRedo).toBe(true);
      expect(second.canRedo).toBe(false);
    } finally {
      second.ngOnDestroy();
    }
  });

  it('hydrates sheets and activeSheetId from note.docData on init', () => {
    component.ngOnInit();
    expect(component.sheets.length).toBe(1);
    expect(component.sheets[0].name).toBe('Ventas');
    expect(component.activeSheetId).toBe('sheet1');
    expect(component.activeSheet.data['A1']?.raw).toBe('Ingresos');
  });

  it('registers sheet AI adapter on init', () => {
    component.ngOnInit();
    expect(mockAiDocumentService.register).toHaveBeenCalled();
  });

  it('computes formulas and displays evaluated cell values', () => {
    component.ngOnInit();
    // B3 is col 1, row 2: =B1-B2 => 1500 - 500 = 1000
    const b3Val = component.getCellValue(1, 2);
    expect(b3Val).toBe(1000);
  });

  it('selects cells and calculates selection statistics', () => {
    component.ngOnInit();
    // Select range B1:B2 (values 1500 and 500)
    component.selectedCell = { col: 1, row: 0 }; // B1
    component.selectionRange = { startCol: 1, startRow: 0, endCol: 1, endRow: 1 }; // B1:B2

    const stats = component.selectionStats;
    expect(stats.count).toBe(2);
    expect(stats.sum).toBe('2,000');
    expect(stats.average).toBe('1,000');
  });

  it('handles inline cell editing lifecycle', () => {
    component.ngOnInit();
    component.selectedCell = { col: 0, row: 3 };
    component.selectionRange = { startCol: 0, startRow: 3, endCol: 0, endRow: 3 };
    component.startCellEdit('Nuevo Concepto');
    expect(component.isEditing).toBe(true);
    expect(component.editingValue).toBe('Nuevo Concepto');

    component.editingValue = 'Utilidad Neta';
    component.commitCellEdit();

    expect(component.isEditing).toBe(false);
    expect(component.activeSheet.data['A4']?.raw).toBe('Utilidad Neta');
  });

  it('normalizes typed percentage values and multiplies them cleanly in formulas', () => {
    component.ngOnInit();
    // Type 10% into I10 (col 8, row 9)
    component.selectedCell = { col: 8, row: 9 };
    component.selectionRange = { startCol: 8, startRow: 9, endCol: 8, endRow: 9 };
    component.startCellEdit('10%');
    component.commitCellEdit();

    expect(component.activeSheet.data['I10']?.raw).toBe('0.1');
    expect(component.activeSheet.data['I10']?.style?.numberFormat).toBe('percent');
    expect(component.formatCellDisplay(component.getCellValue(8, 9), component.activeSheet.data['I10']?.style)).toBe('10%');

    // Type =5*I10 into H11 (col 7, row 10)
    component.selectedCell = { col: 7, row: 10 };
    component.selectionRange = { startCol: 7, startRow: 10, endCol: 7, endRow: 10 };
    component.startCellEdit('=5*I10');
    component.commitCellEdit();

    expect(component.getCellValue(7, 10)).toBe(0.5);
  });

  it('cancels cell editing without altering content', () => {
    component.ngOnInit();
    component.selectedCell = { col: 0, row: 0 };
    component.selectionRange = { startCol: 0, startRow: 0, endCol: 0, endRow: 0 };
    component.startCellEdit('Modificado');
    component.cancelCellEdit();

    expect(component.isEditing).toBe(false);
    expect(component.activeSheet.data['A1']?.raw).toBe('Ingresos');
  });

  it('manages sheets: add, switch, rename, and delete', () => {
    component.ngOnInit();

    // Add new sheet
    component.addNewSheet();
    expect(component.sheets.length).toBe(2);
    const newSheet = component.sheets[1];
    expect(component.activeSheetId).toBe(newSheet.id);

    // Switch sheet
    component.switchSheet('sheet1');
    expect(component.activeSheetId).toBe('sheet1');

    // Rename sheet
    component.renameSheet(component.sheets[0], 'Resumen 2026');
    expect(component.sheets[0].name).toBe('Resumen 2026');

    // Delete new sheet
    component.deleteSheet(newSheet.id);
    expect(component.sheets.length).toBe(1);
    expect(component.activeSheetId).toBe('sheet1');
  });

  it('applies formatting commands (bold, italic, text color, alignment)', () => {
    component.ngOnInit();
    component.selectedCell = { col: 0, row: 1 }; // A2
    component.selectionRange = { startCol: 0, startRow: 1, endCol: 0, endRow: 1 };

    // Toggle bold
    component.applyStyleChange({ bold: true });
    expect(component.activeSheet.data['A2']?.style?.bold).toBe(true);

    // Set text alignment
    component.applyStyleChange({ align: 'center' });
    expect(component.activeSheet.data['A2']?.style?.align).toBe('center');

    // Set background color
    component.applyStyleChange({ bgColor: '#ffcc00' });
    expect(component.activeSheet.data['A2']?.style?.bgColor).toBe('#ffcc00');
  });

  it('supports undo and redo for cell data changes', () => {
    component.ngOnInit();
    component.selectedCell = { col: 0, row: 0 };
    component.selectionRange = { startCol: 0, startRow: 0, endCol: 0, endRow: 0 };

    // Modify cell
    component.startCellEdit();
    component.editingValue = 'Original';
    component.commitCellEdit();

    component.startCellEdit();
    component.editingValue = 'Cambiado';
    component.commitCellEdit();

    expect(component.activeSheet.data['A1']?.raw).toBe('Cambiado');
    expect(component.canUndo).toBe(true);

    // Undo
    component.handleUndo();
    expect(component.activeSheet.data['A1']?.raw).toBe('Original');
    expect(component.canRedo).toBe(true);

    // Redo
    component.handleRedo();
    expect(component.activeSheet.data['A1']?.raw).toBe('Cambiado');
  });

  it('persists changes via notesService.updateDocData with debounce', async () => {
    vi.useFakeTimers();
    component.ngOnInit();

    component.selectedCell = { col: 2, row: 2 };
    component.selectionRange = { startCol: 2, startRow: 2, endCol: 2, endRow: 2 };
    component.startCellEdit('Dato Guardado');
    component.commitCellEdit();

    expect(mockNotesService.updateDocData).not.toHaveBeenCalled();

    vi.advanceTimersByTime(600);

    expect(mockNotesService.updateDocData).toHaveBeenCalledWith(
      expect.objectContaining({
        sheets: expect.any(Array),
        activeSheetId: 'sheet1',
      }),
      'sheet-note-1'
    );
    vi.useRealTimers();
  });

  it('applies border presets and computes correct border styles', () => {
    component.ngOnInit();
    component.selectionRange = { startCol: 0, startRow: 0, endCol: 1, endRow: 1 };

    // Apply all borders
    component.applyBorderPreset({ preset: 'all', lineStyle: 'thin', color: '#000000' });
    const cellA1 = component.activeSheet.data['A1'];
    expect(cellA1?.style?.borders?.top).toEqual({ style: 'thin', color: '#000000' });
    expect(cellA1?.style?.borders?.bottom).toEqual({ style: 'thin', color: '#000000' });

    // Check getCellBorder returns 1px solid #000000
    expect(component.getCellBorder(0, 0, 'bottom')).toBe('1px solid #000000');

    // Apply thickOutside borders
    component.applyBorderPreset({ preset: 'thickOutside', lineStyle: 'thick', color: '#107c41' });
    expect(component.getCellBorder(0, 0, 'top')).toBe('3px solid #107c41');
    expect(component.getCellBorder(0, 0, 'left')).toBe('3px solid #107c41');

    // Apply doubleBottom border
    component.applyBorderPreset({ preset: 'bottomDouble', lineStyle: 'thin', color: '#000000' });
    expect(component.getCellBorder(0, 1, 'bottom')).toBe('3px double #000000');
  });

  it('applies style presets (good, bad, calculation, normal) properly', () => {
    component.ngOnInit();
    component.selectionRange = { startCol: 0, startRow: 0, endCol: 0, endRow: 0 };

    // Apply bad preset
    component.handleApplyPresetStyle('bad');
    let cellA1 = component.activeSheet.data['A1'];
    expect(cellA1?.style?.bgColor).toBe('#ffc7ce');
    expect(cellA1?.style?.textColor).toBe('#9c0006');
    expect(cellA1?.style?.preset).toBe('bad');

    // Apply good preset
    component.handleApplyPresetStyle('good');
    cellA1 = component.activeSheet.data['A1'];
    expect(cellA1?.style?.bgColor).toBe('#c6efce');
    expect(cellA1?.style?.textColor).toBe('#006100');
    expect(cellA1?.style?.preset).toBe('good');

    // Apply calculation preset
    component.handleApplyPresetStyle('calculation');
    cellA1 = component.activeSheet.data['A1'];
    expect(cellA1?.style?.bgColor).toBe('#f2f2f2');
    expect(cellA1?.style?.textColor).toBe('#fa7d00');
    expect(cellA1?.style?.bold).toBe(true);

    // Apply normal preset to reset
    component.handleApplyPresetStyle('normal');
    cellA1 = component.activeSheet.data['A1'];
    expect(cellA1?.style?.bgColor).toBeUndefined();
    expect(cellA1?.style?.textColor).toBeUndefined();
    expect(cellA1?.style?.bold).toBe(false);
    expect(cellA1?.style?.preset).toBeUndefined();
  });

  it('expands multi-cell selection with moveSelection when expand is true (Shift + Arrows)', () => {
    component.ngOnInit();
    component.selectedCell = { col: 1, row: 1 };
    component.selectionRange = { startCol: 1, startRow: 1, endCol: 1, endRow: 1 };

    // Shift + Down: should expand from row 1 to row 2
    component.moveSelection(0, 1, true);
    expect(component.selectedCell).toEqual({ col: 1, row: 1 });
    expect(component.selectionRange).toEqual({ startCol: 1, startRow: 1, endCol: 1, endRow: 2 });

    // Shift + Down again: should expand from row 2 to row 3
    component.moveSelection(0, 1, true);
    expect(component.selectionRange).toEqual({ startCol: 1, startRow: 1, endCol: 1, endRow: 3 });

    // Shift + Right: should expand from col 1 to col 2
    component.moveSelection(1, 0, true);
    expect(component.selectionRange).toEqual({ startCol: 1, startRow: 1, endCol: 2, endRow: 3 });

    // Regular Down (no shift): moves active cell to (1, 2) and resets selection
    component.moveSelection(0, 1, false);
    expect(component.selectedCell).toEqual({ col: 1, row: 2 });
    expect(component.selectionRange).toEqual({ startCol: 1, startRow: 2, endCol: 1, endRow: 2 });
  });

  it('selects multiple cells via mouse drag and correctly identifies perimeter edges', () => {
    component.ngOnInit();
    const mockMouseEvent = { button: 0, preventDefault: vi.fn(), shiftKey: false } as unknown as MouseEvent;

    // Start mouse drag at (1, 1) -> B2
    component.onCellMouseDown(1, 1, mockMouseEvent);
    expect(component.isSelecting).toBe(true);
    expect(component.selectedCell).toEqual({ col: 1, row: 1 });
    expect(mockMouseEvent.preventDefault).toHaveBeenCalled();

    // Drag to (2, 3) -> C4
    component.onCellMouseEnter(2, 3);
    expect(component.selectionRange).toEqual({ startCol: 1, startRow: 1, endCol: 2, endRow: 3 });

    // Verify perimeter edge helper calculations for range (1,1) to (2,3)
    // Top-left cell B2 (1, 1)
    expect(component.isTopSelectionEdge(1, 1)).toBe(true);
    expect(component.isLeftSelectionEdge(1, 1)).toBe(true);
    expect(component.isBottomSelectionEdge(1, 1)).toBe(false);
    expect(component.isRightSelectionEdge(1, 1)).toBe(false);

    // Top-right cell C2 (2, 1)
    expect(component.isTopSelectionEdge(2, 1)).toBe(true);
    expect(component.isRightSelectionEdge(2, 1)).toBe(true);
    expect(component.isBottomSelectionEdge(2, 1)).toBe(false);

    // Bottom-right cell C4 (2, 3)
    expect(component.isBottomSelectionEdge(2, 3)).toBe(true);
    expect(component.isRightSelectionEdge(2, 3)).toBe(true);
    expect(component.isBottomRightSelectionCorner(2, 3)).toBe(true);

    // End drag on global mouseup
    component.handleGlobalMouseUp();
    expect(component.isSelecting).toBe(false);
  });

  it('correctly sets and retrieves top and left cell borders with getEffectiveCellBorders', () => {
    component.ngOnInit();
    // Select cell B2 (1, 1)
    component.selectedCell = { col: 1, row: 1 };
    component.selectionRange = { startCol: 1, startRow: 1, endCol: 1, endRow: 1 };

    // Apply top border
    component.applyBorderPreset({ preset: 'top', lineStyle: 'medium', color: '#ff0000' });
    let borders = component.getEffectiveCellBorders(1, 1);
    expect(borders?.top).toEqual({ style: 'medium', color: '#ff0000' });

    // Apply left border
    component.applyBorderPreset({ preset: 'left', lineStyle: 'thick', color: '#0000ff' });
    borders = component.getEffectiveCellBorders(1, 1);
    expect(borders?.left).toEqual({ style: 'thick', color: '#0000ff' });
    // Top border preserved
    expect(borders?.top).toEqual({ style: 'medium', color: '#ff0000' });

    // Cell above (1, 0) does not have bottom border, so shouldSkipBorder is false
    expect(component.shouldSkipBorder(1, 1, 'top')).toBe(false);
    expect(component.shouldSkipBorder(1, 1, 'left')).toBe(false);
  });

  it('handles custom borders from the Format Cells modal', () => {
    component.ngOnInit();
    component.selectedCell = { col: 2, row: 2 };
    component.selectionRange = { startCol: 2, startRow: 2, endCol: 3, endRow: 3 };

    component.applyCustomBorders({
      top: { style: 'double', color: '#107c41' },
      left: { style: 'dashed', color: '#ff0000' },
      bottom: { style: 'thick', color: '#000000' },
    });

    const b2 = component.getEffectiveCellBorders(2, 2);
    expect(b2?.top).toEqual({ style: 'double', color: '#107c41' });
    expect(b2?.left).toEqual({ style: 'dashed', color: '#ff0000' });

    const c3 = component.getEffectiveCellBorders(3, 3);
    expect(c3?.bottom).toEqual({ style: 'thick', color: '#000000' });
  });

  it('correctly applies "all" borders preset across a range and manages edge sharing', () => {
    component.ngOnInit();
    // Select 2x2 range: cols 1..2, rows 1..2
    component.selectedCell = { col: 1, row: 1 };
    component.selectionRange = { startCol: 1, startRow: 1, endCol: 2, endRow: 2 };

    component.applyBorderPreset({ preset: 'all', lineStyle: 'thin', color: '#000000' });

    // Cell (1, 1): top-left of range
    const b11 = component.getEffectiveCellBorders(1, 1);
    expect(b11?.top).toEqual({ style: 'thin', color: '#000000' });
    expect(b11?.bottom).toEqual({ style: 'thin', color: '#000000' });
    expect(b11?.left).toEqual({ style: 'thin', color: '#000000' });
    expect(b11?.right).toEqual({ style: 'thin', color: '#000000' });

    // Cell (1, 1) top is not skipped because row 0 above has no bottom border
    expect(component.shouldSkipBorder(1, 1, 'top')).toBe(false);
    expect(component.shouldSkipBorder(1, 1, 'left')).toBe(false);

    // Cell (1, 2): row below (1, 1)
    // Its top is skipped because cell (1, 1) above already has matching bottom border
    expect(component.shouldSkipBorder(1, 2, 'top')).toBe(true);

    // Cell (2, 1): col right of (1, 1)
    // Its left is skipped because cell (1, 1) to the left already has matching right border
    expect(component.shouldSkipBorder(2, 1, 'left')).toBe(true);
  });
  it('keeps inserted artwork outside cells and restores its geometry through undo', () => {
    component.ngOnInit();
    const cells = JSON.stringify(component.activeSheet.data);
    component.insertArtwork('icon', 'heart');
    const icon = component.activeSheet.artwork![0];
    expect(icon.kind).toBe('icon');
    expect(JSON.stringify(component.activeSheet.data)).toBe(cells);
    component.beginArtworkChange();
    component.updateArtwork(icon, { x: 220, y: 140, width: 120, height: 90 });
    component.finishArtworkChange();
    expect(component.activeSheet.artwork![0].x).toBe(220);
    component.handleUndo();
    expect(component.activeSheet.artwork![0].x).toBe(100);
    component.handleRedo();
    expect(component.activeSheet.artwork![0].width).toBe(120);
    component.removeArtwork(icon.id);
    expect(component.activeSheet.artwork).toEqual([]);
    component.handleUndo();
    expect(component.activeSheet.artwork![0].itemId).toBe('heart');
  });

  it('passes the Insert chart category through to the actual chart dialog', () => {
    mockI18nService.currentLang.set('en');
    const fixture = TestBed.createComponent(PureSheetEditorComponent);
    fixture.componentInstance.note = { ...sampleNote };
    fixture.componentInstance.activeRibbonTab = 'Insert';
    fixture.detectChanges();
    const scatter = fixture.nativeElement.querySelector('button[title="Insert Scatter (X, Y) or Bubble Chart"]') as HTMLButtonElement;
    scatter.click();
    fixture.detectChanges();
    const category = fixture.nativeElement.querySelector('app-excel-chart-modal .category.selected') as HTMLElement;
    expect(category.textContent).toContain('Scatter');
    expect(fixture.nativeElement.querySelector('app-excel-chart-modal .subtype.selected')?.getAttribute('aria-label')).toBe('Scatter');
  });

  it('snapshots the selected range for chart preview and insertion, keeping existing charts separate', () => {
    component.ngOnInit();
    component.selectionRange = { startCol: 1, startRow: 0, endCol: 1, endRow: 2 };
    component.insertChartFromSelection({ category: 'line', subType: 'line' });
    const first = component.activeSheet.charts![0];
    component.selectionRange = { startCol: 3, startRow: 4, endCol: 4, endRow: 6 };
    component.handleOpenChartModal({ tab: 'all', category: 'column' });
    expect(component.chartSourceRange).toEqual({ startCol: 3, startRow: 4, endCol: 4, endRow: 6 });
    component.selectionRange = { startCol: 0, startRow: 0, endCol: 0, endRow: 0 };
    component.onChartModalSelect({ category: 'column', subType: 'clusteredColumn' });
    expect(component.activeSheet.charts!.length).toBe(2);
    expect(component.activeSheet.charts![1].range).toEqual({ startCol: 3, startRow: 4, endCol: 4, endRow: 6 });
    expect(first.category).toBe('line');
    component.selectedChartId = first.id;
    component.openSelectedChartType();
    component.onChartModalSelect({ category: 'pie', subType: 'pie2d' });
    expect(component.activeSheet.charts!.length).toBe(2);
    expect(component.activeSheet.charts![0].category).toBe('pie');
    expect(component.activeSheet.charts![0].range).toEqual({ startCol: 1, startRow: 0, endCol: 1, endRow: 2 });
  });

  it('stores ink independently of cells and supports undo without clearing data during replay', () => {
    component.ngOnInit();
    const cells = JSON.stringify(component.activeSheet.data);
    component.commitInkStrokes([{ id: 's1', penId: 'penRed', color: '#ef4444', strokeWidth: 3, opacity: 1, points: [{ x: 100, y: 200 }, { x: 200, y: 300 }] }]);
    expect(JSON.stringify(component.activeSheet.data)).toBe(cells);
    component.handleReplayInk();
    expect(component.activeSheet.inkStrokes!.length).toBe(1);
    expect(component.displayedInkStrokes).toEqual([]);
    component.handleClearDrawings();
    expect(component.activeSheet.inkStrokes).toEqual([]);
    component.handleUndo();
    expect(component.activeSheet.inkStrokes![0].points[1]).toEqual({ x: 200, y: 300 });
  });

  it('returns to Home when a chart is deselected and keeps other active tabs intact', () => {
    component.ngOnInit();
    component.insertChartFromSelection({ category: 'line', subType: 'line' });
    expect(component.activeRibbonTab).toBe('Chart Design');
    component.onCellMouseDown(2, 3, new MouseEvent('mousedown'));
    expect(component.selectedChartId).toBeNull();
    expect(component.activeRibbonTab).toBe('Home');
    component.activeRibbonTab = 'Draw';
    component.selectedChartId = null;
    expect(component.activeRibbonTab).toBe('Draw');
  });

  it('shows the chart style buttons and updates the selected chart range without changing cells', () => {
    component.ngOnInit();
    component.insertChartFromSelection({ category: 'line', subType: 'line' });
    const chart = component.selectedChart!;
    const fixture = TestBed.createComponent(ExcelRibbonComponent);
    fixture.componentRef.setInput('activeTab', 'Chart Design');
    fixture.componentRef.setInput('selectedChart', chart);
    fixture.detectChanges();
    const palettes = fixture.nativeElement.querySelectorAll('.chart-palette') as NodeListOf<HTMLButtonElement>;
    expect(palettes.length).toBe(4);
    expect(fixture.nativeElement.querySelectorAll('.ribbon-group').length).toBe(4);
    fixture.componentInstance.changeSelectedChartPalette.subscribe(value => component.changeSelectedChartPalette(value));
    palettes[2].click();
    expect(chart.colorPalette).toBe('warm');
    const data = JSON.stringify(component.activeSheet.data);
    component.selectionRange = { startCol: 0, startRow: 0, endCol: 1, endRow: 2 };
    fixture.componentInstance.useSelectedChartRange.subscribe(() => component.useSelectedChartRange());
    (fixture.nativeElement.querySelector('.chart-range-action') as HTMLButtonElement).click();
    expect(chart.range).toEqual(component.selectionRange);
    expect(JSON.stringify(component.activeSheet.data)).toBe(data);
  });

  it('highlights the selected chart source, preserves the current cell selection and saves an editable title', () => {
    component.ngOnInit();
    component.selectionRange = { startCol: 0, startRow: 0, endCol: 1, endRow: 2 };
    component.insertChartFromSelection({ category: 'line', subType: 'line' });
    component.selectionRange = { startCol: 5, startRow: 5, endCol: 5, endRow: 5 };
    expect(component.getSourceHighlight(1, 0)?.['borderTop']).toContain('#2e75b6');
    expect(component.getSourceHighlight(5, 5)).toBeNull();
    component.changeChartTitle('Monthly sales');
    expect(component.selectedChart?.chartTitle).toBe('Monthly sales');
    expect(component.selectionRange.startCol).toBe(5);
    component.selectedChartId = null;
    expect(component.getSourceHighlight(0, 0)).toBeNull();
    component.handleUndo();
    expect(component.activeSheet.charts![0].chartTitle).toBeUndefined();
  });

  it('accepts native HTML clipboard tables and expands the visible grid beyond its initial size', () => {
    component.ngOnInit();
    expect(component.totalCols).toBe(TOTAL_COLS);
    expect(component.totalRows).toBe(TOTAL_ROWS);
    const startCell = cellId(TOTAL_COLS - 1, TOTAL_ROWS - 1);
    const expandedCell = cellId(TOTAL_COLS, TOTAL_ROWS);
    component.selectedCell = { col: TOTAL_COLS - 1, row: TOTAL_ROWS - 1 };
    const event = new Event('paste', { cancelable: true }) as ClipboardEvent;
    Object.defineProperty(event, 'clipboardData', { value: { getData: (type: string) => type === 'text/html' ? '<table><tr><th>Name</th><th>Value</th></tr><tr><td>Item</td><td>12</td></tr></table>' : '' } });
    component.onGridPaste(event);
    expect(event.defaultPrevented).toBe(true);
    expect(component.activeSheet.data[expandedCell].raw).toBe('12');
    expect(component.activeSheet.data[startCell].style?.bold).toBe(true);
    expect(component.totalCols).toBe(TOTAL_COLS + 1);
    expect(component.totalRows).toBe(TOTAL_ROWS + 1);
    component.handleUndo();
    expect(component.activeSheet.data[expandedCell]).toBeUndefined();
  });

  it('pastes clipboard text when pressing Ctrl+V on a selected cell', async () => {
    component.ngOnInit();
    component.selectedCell = { col: 1, row: 2 };
    const originalClipboard = navigator.clipboard;
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        readText: vi.fn().mockResolvedValue('100\t200\n300\t400'),
      },
      configurable: true,
    });
    const event = new KeyboardEvent('keydown', { key: 'v', ctrlKey: true, cancelable: true });
    component.handleGlobalKeyDown(event);
    expect(event.defaultPrevented).toBe(true);
    await Promise.resolve();
    await Promise.resolve();
    expect(component.activeSheet.data['B3'].raw).toBe('100');
    expect(component.activeSheet.data['C3'].raw).toBe('200');
    expect(component.activeSheet.data['B4'].raw).toBe('300');
    expect(component.activeSheet.data['C4'].raw).toBe('400');
    Object.defineProperty(navigator, 'clipboard', { value: originalClipboard, configurable: true });
  });

  it('pastes via handlePaste using navigator.clipboard.read items', async () => {
    component.ngOnInit();
    component.selectedCell = { col: 0, row: 0 };
    const originalClipboard = navigator.clipboard;
    const mockItem = {
      types: ['text/plain'],
      getType: vi.fn().mockResolvedValue(new Blob(['Alpha\tBeta'], { type: 'text/plain' })),
    };
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        read: vi.fn().mockResolvedValue([mockItem]),
        readText: vi.fn().mockResolvedValue('fallback'),
      },
      configurable: true,
    });
    await component.handlePaste();
    expect(component.activeSheet.data['A1'].raw).toBe('Alpha');
    expect(component.activeSheet.data['B1'].raw).toBe('Beta');
    Object.defineProperty(navigator, 'clipboard', { value: originalClipboard, configurable: true });
  });

  it('inserts a dragged range into an unfinished formula without committing or moving the edited cell', () => {
    component.ngOnInit();
    component.selectedCell = { col: 2, row: 0 };
    component.startCellEdit('=SUMA()');
    const input = document.createElement('input');
    input.value = '=SUMA()'; input.setSelectionRange(6, 6);
    component.cellEditorInput = new ElementRef(input);
    component.onCellMouseDown(1, 0, new MouseEvent('mousedown'));
    component.onCellMouseEnter(1, 1);
    component.handleGlobalMouseUp();
    expect(component.isEditing).toBe(true);
    expect(component.selectedCell).toEqual({ col: 2, row: 0 });
    expect(component.editingValue).toBe('=SUMA(B1:B2)');
    expect(component.getSourceHighlight(1, 1)).not.toBeNull();
    expect(component.activeSheet.data['C1']).toBeUndefined();
    component.commitCellEdit();
    expect(component.getCellValue(2, 0)).toBe(2000);
  });

  it('uses arrows to choose formula references and Shift+arrows to extend them without moving the edited cell', () => {
    component.ngOnInit();
    component.selectedCell = { col: 2, row: 0 };
    component.startCellEdit('=SUMA()');
    const input = document.createElement('input'); input.value = '=SUMA()'; input.setSelectionRange(6, 6);
    component.cellEditorInput = new ElementRef(input);
    const arrow = (key: string, shiftKey = false) => {
      const event = new KeyboardEvent('keydown', { key, shiftKey, cancelable: true });
      Object.defineProperty(event, 'target', { value: input });
      component.handleGlobalKeyDown(event);
      return event;
    };
    expect(arrow('ArrowLeft').defaultPrevented).toBe(true);
    expect(component.editingValue).toBe('=SUMA(B1)');
    arrow('ArrowDown');
    arrow('ArrowDown', true);
    expect(component.editingValue).toBe('=SUMA(B2:B3)');
    expect(component.selectedCell).toEqual({ col: 2, row: 0 });
    component.commitCellEdit();
    expect(component.getCellValue(2, 0)).toBe(1500);
    component.startCellEdit('=1+2'); input.value = '=1+2'; input.setSelectionRange(4, 4);
    expect(arrow('ArrowLeft').defaultPrevented).toBe(false);
    expect(component.editingValue).toBe('=1+2');
  });

  it('moves the caret freely when reopening an existing formula instead of changing its references', () => {
    component.ngOnInit();
    component.activeSheet.data['D32'] = { raw: '=D13+D30' };
    component.selectedCell = { col: 3, row: 31 };
    component.startCellEdit();
    const input = document.createElement('input');
    input.value = component.editingValue; input.setSelectionRange(8, 8);
    component.cellEditorInput = new ElementRef(input);
    for (const key of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']) {
      for (const shiftKey of [false, true]) {
        const event = new KeyboardEvent('keydown', { key, shiftKey, cancelable: true });
        Object.defineProperty(event, 'target', { value: input });
        component.onCellEditorKeyDown(event); component.handleGlobalKeyDown(event);
        expect(event.defaultPrevented).toBe(false);
        expect(component.editingValue).toBe('=D13+D30');
      }
    }
    expect(component.selectedCell).toEqual({ col: 3, row: 31 });
    expect(component.activeSheet.data['D32'].raw).toBe('=D13+D30');
  });

  it('uses F2 to choose a reference with arrows and return to caret editing', () => {
    component.ngOnInit();
    component.activeSheet.data['D32'] = { raw: '=D13+D30' };
    component.selectedCell = { col: 3, row: 31 }; component.startCellEdit();
    const input = document.createElement('input'); input.value = component.editingValue; input.setSelectionRange(3, 3);
    component.cellEditorInput = new ElementRef(input);
    const key = (key: string, shiftKey = false) => {
      const event = new KeyboardEvent('keydown', { key, shiftKey, cancelable: true });
      Object.defineProperty(event, 'target', { value: input });
      component.onCellEditorKeyDown(event); component.handleGlobalKeyDown(event);
      return event;
    };
    expect(key('F2').defaultPrevented).toBe(true);
    key('ArrowDown');
    expect(component.editingValue).toBe('=D14+D30');
    key('ArrowDown', true);
    expect(component.editingValue).toBe('=D14:D15+D30');
    key('F2');
    expect(key('ArrowLeft').defaultPrevented).toBe(false);
    expect(component.editingValue).toBe('=D14:D15+D30');
    component.cancelCellEdit();
    expect(component.activeSheet.data['D32'].raw).toBe('=D13+D30');
  });

  it.each([
    ['=D13+D30', 2, 2, '=B5+D30'],
    ['=D13+D30', 5, 5, '=D13+B5'],
    ['=D13+D30', 6, 7, '=D13+B5'],
    ["=SUMA('Ventas'!$B$1:$B$3)+D30", 17, 17, '=SUMA(B5)+D30'],
  ])('replaces the whole operand with a mouse-picked cell in %s at %i:%i', (formula, start, end, expected) => {
    component.ngOnInit();
    component.activeSheet.data['D32'] = { raw: formula };
    component.selectedCell = { col: 3, row: 31 }; component.startCellEdit();
    const input = document.createElement('input'); input.value = formula; input.setSelectionRange(start, end);
    component.cellEditorInput = new ElementRef(input);
    const click = new MouseEvent('mousedown', { cancelable: true });
    component.onCellMouseDown(1, 4, click);
    component.handleGlobalMouseUp();
    expect(click.defaultPrevented).toBe(true);
    expect(component.isEditing).toBe(true);
    expect(component.editingValue).toBe(expected);
    expect(component.selectedCell).toEqual({ col: 3, row: 31 });
    expect(component.activeSheet.data['D32'].raw).toBe(formula);
  });

  it.each(['pointer', 'Home', 'End', 'ctrl-arrow'])('leaves reference selection when navigating formula text with %s', action => {
    component.ngOnInit();
    component.selectedCell = { col: 2, row: 0 }; component.startCellEdit('=');
    const input = document.createElement('input'); input.value = '='; input.setSelectionRange(1, 1);
    component.cellEditorInput = new ElementRef(input);
    const key = (key: string, ctrlKey = false) => {
      const event = new KeyboardEvent('keydown', { key, ctrlKey, cancelable: true });
      Object.defineProperty(event, 'target', { value: input });
      component.onCellEditorKeyDown(event); component.handleGlobalKeyDown(event);
      return event;
    };
    key('ArrowDown');
    expect(component.editingValue).toBe('=C2');
    if (action === 'pointer') component.onFormulaEditorPointerDown();
    else key(action === 'ctrl-arrow' ? 'ArrowLeft' : action, action === 'ctrl-arrow');
    expect(key('ArrowLeft').defaultPrevented).toBe(false);
    expect(component.editingValue).toBe('=C2');
  });

  it('selects a new operand with arrows after typing an operator in an existing formula', () => {
    component.ngOnInit();
    component.activeSheet.data['D32'] = { raw: '=D13+D30' };
    component.selectedCell = { col: 3, row: 31 }; component.startCellEdit();
    const input = document.createElement('input'); input.value = '=D13+'; input.setSelectionRange(5, 5);
    component.cellEditorInput = new ElementRef(input);
    const change = new Event('input'); Object.defineProperty(change, 'target', { value: input });
    component.onCellEditorInput(change);
    const arrow = new KeyboardEvent('keydown', { key: 'ArrowRight', cancelable: true });
    Object.defineProperty(arrow, 'target', { value: input }); component.handleGlobalKeyDown(arrow);
    expect(arrow.defaultPrevented).toBe(true);
    expect(component.editingValue).toBe('=D13+E32');
    expect(component.activeSheet.data['D32'].raw).toBe('=D13+D30');
  });

  it('starts editing on formula-bar focus so existing operands can be replaced without typing first', () => {
    component.ngOnInit();
    component.activeSheet.data['D32'] = { raw: '=D13+D30' };
    component.selectedCell = { col: 3, row: 31 };
    const input = document.createElement('input'); input.value = '=D13+D30';
    component.formulaBarInput = new ElementRef(input);
    document.body.append(input);
    try {
      input.focus(); input.setSelectionRange(7, 7); component.onFormulaBarFocus();
      expect(component.isEditing).toBe(true);
      const arrow = new KeyboardEvent('keydown', { key: 'ArrowLeft', cancelable: true });
      Object.defineProperty(arrow, 'target', { value: input });
      component.onFormulaBarKeyDown(arrow); component.handleGlobalKeyDown(arrow);
      expect(arrow.defaultPrevented).toBe(false);
      expect(component.editingValue).toBe('=D13+D30');
      component.onCellMouseDown(1, 0, new MouseEvent('mousedown'));
      component.onCellMouseEnter(1, 1); component.handleGlobalMouseUp();
      expect(component.editingValue).toBe('=D13+B1:B2');
      component.commitCellEdit();
      expect(component.activeSheet.data['D32'].raw).toBe('=D13+B1:B2');
    } finally { input.remove(); }
  });

  it('persists selected chart columns, highlights only those columns, and supports undo', () => {
    component.ngOnInit();
    component.selectionRange = { startCol: 0, startRow: 0, endCol: 4, endRow: 4 };
    component.insertChartFromSelection({ category: 'line', subType: 'line' });
    const chart = component.selectedChart!;
    component.configureChartData();
    expect(component.chartDataModalOpen).toBe(true);
    component.applyChartData({ range: chart.range, config: { xColumn: 2, seriesColumns: [0, 4], hasHeaders: true } });
    expect(component.selectedChart?.dataConfig?.seriesColumns).toEqual([0, 4]);
    expect(component.getSourceHighlight(0, 1)).not.toBeNull();
    expect(component.getSourceHighlight(1, 1)).toBeNull();
    expect(component.getSourceHighlight(2, 1)).not.toBeNull();
    expect(component.getSourceHighlight(4, 1)).not.toBeNull();
    expect(component.chartDataModalOpen).toBe(false);
    component.handleUndo();
    expect(component.selectedChart?.dataConfig).toBeUndefined();
  });

  it('saves chart appearance and independent mode without changing its data mapping, with undo', () => {
    component.ngOnInit();
    component.insertChartFromSelection({ category: 'line', subType: 'stackedLine' });
    const chart = component.selectedChart!;
    component.configureChartData(chart, 'appearance');
    expect(component.chartDataModalTab).toBe('appearance');
    component.applyChartData({ range: chart.range, config: { xColumn: null, seriesColumns: [0], hasHeaders: false }, appearance: { legendPosition: 'right', titlePosition: 'bottom', titleAlign: 'center' }, chartTitle: 'Costs', subType: 'line', dataEdited: false });
    expect(chart.subType).toBe('line');
    expect(chart.dataConfig).toBeUndefined();
    expect(chart.appearance?.legendPosition).toBe('right');
    component.handleUndo();
    expect(component.selectedChart?.appearance).toBeUndefined();
    expect(component.selectedChart?.subType).toBe('stackedLine');
  });

  it('uses the custom series color in the source table, saves it independently of cell styles and restores it through undo', () => {
    component.ngOnInit();
    component.selectionRange = { startCol: 0, startRow: 0, endCol: 1, endRow: 2 };
    component.insertChartFromSelection({ category: 'line', subType: 'line' });
    const cells = JSON.stringify(component.activeSheet.data);
    const chart = component.selectedChart!;
    component.applyChartData({ range: chart.range, config: { xColumn: 0, seriesColumns: [1], hasHeaders: false }, dataEdited: false, seriesColors: { 'column:1': '#ff5500' } });
    expect(component.selectedChart?.seriesColors?.['column:1']).toBe('#ff5500');
    expect(component.getSourceHighlight(1, 1)?.['backgroundColor']).toBe('#ff550018');
    expect(component.getSourceHighlight(1, 1)?.['borderLeft']).toContain('#ff5500');
    expect(JSON.stringify(component.activeSheet.data)).toBe(cells);
    component.handleUndo();
    expect(component.selectedChart?.seriesColors).toBeUndefined();
    expect(component.getSourceHighlight(1, 1)?.['borderLeft']).toContain('#2e75b6');
  });

  it('opens customization from Chart Styles and replaces custom colors with a preset, including the same preset', () => {
    component.ngOnInit();
    component.selectionRange = { startCol: 0, startRow: 0, endCol: 1, endRow: 2 };
    component.insertChartFromSelection({ category: 'line', subType: 'line' });
    const chart = component.selectedChart!;
    chart.colorPalette = 'cool'; chart.seriesColors = { 'column:1': '#ff5500' };
    const fixture = TestBed.createComponent(ExcelRibbonComponent);
    fixture.componentRef.setInput('selectedChart', chart); fixture.componentRef.setInput('activeTab', 'Chart Design'); fixture.detectChanges();
    const custom = fixture.nativeElement.querySelector('.chart-customize') as HTMLButtonElement;
    expect(custom.getAttribute('aria-pressed')).toBe('true');
    expect(fixture.nativeElement.querySelector('.chart-palette.active')).toBeNull();
    fixture.componentInstance.configureChartAppearance.subscribe(() => component.configureChartData(chart, 'appearance'));
    custom.click();
    expect(component.chartDataModalOpen).toBe(true);
    expect(component.chartDataModalTab).toBe('appearance');
    component.chartDataModalOpen = false;
    fixture.componentInstance.changeSelectedChartPalette.subscribe(value => component.changeSelectedChartPalette(value));
    (fixture.nativeElement.querySelectorAll('.chart-palette')[3] as HTMLButtonElement).click(); fixture.detectChanges();
    expect(chart.colorPalette).toBe('cool');
    expect(chart.seriesColors).toBeUndefined();
    expect(component.getSourceHighlight(1, 1)?.['borderLeft']).toContain('#0070c0');
    expect(custom.getAttribute('aria-pressed')).toBe('false');
    component.handleUndo();
    expect(component.selectedChart?.seriesColors?.['column:1']).toBe('#ff5500');
    expect(component.getSourceHighlight(1, 1)?.['borderLeft']).toContain('#ff5500');
  });

  it('picks and evaluates a range from another worksheet while saving only to the original edited cell', () => {
    component.ngOnInit();
    component.sheets.push({ id: 'costs', name: 'Costos 2026', type: 'grid', data: { B3: { raw: '10' }, B4: { raw: '20' } } });
    const originId = component.activeSheetId;
    component.selectedCell = { col: 2, row: 0 }; component.startCellEdit('=SUMA()');
    const input = document.createElement('input'); input.value = '=SUMA()'; input.setSelectionRange(6, 6);
    component.cellEditorInput = new ElementRef(input);
    component.switchSheet('costs');
    expect(component.isEditing).toBe(true);
    expect(component.editingOnActiveSheet).toBe(false);
    component.onCellMouseDown(1, 2, new MouseEvent('mousedown'));
    component.onCellMouseEnter(1, 3); component.handleGlobalMouseUp();
    expect(component.editingValue).toBe("=SUMA('Costos 2026'!B3:B4)");
    expect(component.getSourceHighlight(1, 3)).not.toBeNull();
    component.commitCellEdit();
    expect(component.activeSheetId).toBe(originId);
    expect(component.selectedCell).toEqual({ col: 2, row: 0 });
    expect(component.getCellValue(2, 0)).toBe(30);
    expect(component.sheets[1].data['B3'].raw).toBe('10');
    expect(component.sheets[1].data['B4'].raw).toBe('20');
    component.sheets[1].data = { ...component.sheets[1].data, B3: { raw: '15' } };
    expect(component.getCellValue(2, 0)).toBe(35);
  });

  it('traces a foreign reference, selects its source range and returns to the originating formula', () => {
    component.ngOnInit();
    component.sheets.push({ id: 'summary', name: 'Resumen', type: 'grid', data: { C1: { raw: "=SUMA('Ventas'!B1:B2)" } } });
    component.switchSheet('summary'); component.selectedCell = { col: 2, row: 0 };
    component.traceFormulaReferences();
    expect(component.activeSheetId).toBe('sheet1');
    expect(component.selectionRange).toEqual({ startCol: 1, endCol: 1, startRow: 0, endRow: 1 });
    expect(component.referenceTrace?.targets.length).toBe(1);
    component.returnFromTrace();
    expect(component.activeSheetId).toBe('summary');
    expect(component.selectedCell).toEqual({ col: 2, row: 0 });
    component.switchSheet('sheet1'); component.selectedCell = { col: 1, row: 1 };
    component.traceFormulaReferences('dependents');
    expect(component.referenceTrace?.targets.some(target => target.sheetId === 'summary')).toBe(true);
  });

  it('updates qualified formulas when a worksheet is renamed and cancels cross-sheet edits safely', () => {
    component.ngOnInit();
    component.sheets.push({ id: 'summary', name: 'Resumen', type: 'grid', data: { C1: { raw: '=Ventas!B1' } } });
    component.renameSheet(component.sheets[0], 'Ventas 2026');
    component.switchSheet('summary');
    expect(component.activeSheet.data['C1'].raw).toBe("='Ventas 2026'!B1");
    expect(component.getCellValue(2, 0)).toBe(1500);
    component.selectedCell = { col: 3, row: 0 }; component.startCellEdit('=');
    component.switchSheet('sheet1'); component.cancelCellEdit();
    expect(component.activeSheetId).toBe('summary');
    expect(component.activeSheet.data['D1']).toBeUndefined();
  });

  it('uses arrow keys on another worksheet and commits back to the original destination', () => {
    component.ngOnInit();
    component.sheets.push({ id: 'costs', name: 'Costos', type: 'grid', data: { B3: { raw: '45' } } });
    const originId = component.activeSheetId;
    component.selectedCell = { col: 2, row: 0 }; component.startCellEdit('=');
    const input = document.createElement('input'); input.value = '='; input.setSelectionRange(1, 1);
    component.cellEditorInput = new ElementRef(input); component.formulaBarInput = new ElementRef(input);
    component.switchSheet('costs');
    for (const key of ['ArrowDown', 'ArrowDown', 'ArrowRight']) {
      const event = new KeyboardEvent('keydown', { key, cancelable: true }); Object.defineProperty(event, 'target', { value: input }); component.handleGlobalKeyDown(event);
    }
    expect(component.editingValue).toBe("='Costos'!B3");
    component.commitCellEdit();
    expect(component.activeSheetId).toBe(originId);
    expect(component.selectedCell).toEqual({ col: 2, row: 0 });
    expect(component.getCellValue(2, 0)).toBe(45);
  });

  it('imports worksheets atomically and supports undo without replacing existing data', async () => {
    component.ngOnInit();
    const xlsx = await import('./services/xlsx-import');
    const read = vi.spyOn(xlsx, 'importXlsxWorkbook').mockResolvedValue([{ id: 'imported', name: 'Importada', type: 'grid', data: { A1: { raw: '42' } } }]);
    const original = JSON.stringify(component.sheets);
    const input = { files: [{ name: 'book.xlsx', size: 12, arrayBuffer: async () => new ArrayBuffer(0) }], value: 'book.xlsx' };
    try {
      await component.importXlsxFile({ target: input } as unknown as Event);
      expect(read).toHaveBeenCalled();
      expect(component.sheets.length).toBe(2);
      expect(component.activeSheetId).toBe('imported');
      expect(input.value).toBe('');
      expect(component.xlsxFailed).toBe(false);
      component.handleUndo();
      expect(JSON.stringify(component.sheets)).toBe(original);
    } finally { read.mockRestore(); }
  });

  it('leaves the workbook unchanged when an XLSX cannot be read', async () => {
    component.ngOnInit();
    const xlsx = await import('./services/xlsx-import');
    const read = vi.spyOn(xlsx, 'importXlsxWorkbook').mockRejectedValue(new Error('invalid zip'));
    const original = JSON.stringify(component.sheets);
    try {
      await component.importXlsxFile({ target: { files: [{ name: 'broken.xlsx', size: 5, arrayBuffer: async () => new ArrayBuffer(0) }], value: '' } } as unknown as Event);
      expect(component.xlsxFailed).toBe(true);
      expect(component.xlsxBusy).toBe(false);
      expect(JSON.stringify(component.sheets)).toBe(original);
    } finally { read.mockRestore(); }
  });

  it('renders a bounded viewport across 14 sparse worksheets without dropping far-away cells', () => {
    const fixture = TestBed.createComponent(PureSheetEditorComponent);
    const sheets = Array.from({ length: 14 }, (_, index) => ({
      id: `large-${index}`, name: `Hoja ${index}`, type: 'grid', data: {
        A1: { raw: String(index) }, XFD1048576: { raw: '', style: { bgColor: '#FFFF00' } },
      },
    }));
    fixture.componentInstance.note = { ...sampleNote, docData: { sheets, activeSheetId: sheets[0].id } };
    fixture.detectChanges();
    const editor = fixture.componentInstance;
    for (const sheet of sheets) {
      (fixture.nativeElement.querySelector(`[data-sheet-id="${sheet.id}"]`) as HTMLElement).click();
      fixture.detectChanges();
      const frame = editor.canvasGrid!.lastFrame()!;
      expect(frame.cells.length).toBeLessThan(1000);
      expect(frame.cells.find(c => c.col === 0 && c.row === 0)?.text.trim()).toBe(sheet.data.A1.raw);
      expect(editor.activeSheet.data['XFD1048576']).toBeDefined();
      expect(editor.totalRows).toBe(1048576);
      expect(editor.totalCols).toBe(16384);
    }
  }, 30000);

  it('invalidates visible formula results when a source worksheet changes', () => {
    component.ngOnInit();
    component.sheets = [
      { id: 'summary', name: 'Resumen', type: 'grid', data: { A1: { raw: '=Datos!A1' } } },
      { id: 'data', name: 'Datos', type: 'grid', data: { A1: { raw: '2' } } },
    ];
    component.activeSheetId = 'summary';
    expect(component.getCellValue(0, 0)).toBe(2);
    component.sheets[1].data = { A1: { raw: '9' } };
    expect(component.getCellValue(0, 0)).toBe(9);
    component.handleUndo();
  });

  it('computes selection statistics for a sparse sheet without scanning its empty rectangle', () => {
    component.ngOnInit();
    component.activeSheet.data = { A1: { raw: '2' }, XFD1048576: { raw: '3' } };
    component.selectionRange = { startCol: 0, startRow: 0, endCol: 16383, endRow: 1048575 };
    expect(component.selectionStats).toMatchObject({ count: 2, numCount: 2, sum: '5' });
  });

  it('renders actual cell coordinates after horizontal and vertical scrolling', async () => {
    const fixture = TestBed.createComponent(PureSheetEditorComponent);
    fixture.componentInstance.note = { ...sampleNote, docData: {
      sheets: [{ id: 'sparse', name: 'Extensa', type: 'grid', data: { A1: { raw: 'Inicio' }, XFD1048576: { raw: 'Final' } } }], activeSheetId: 'sparse',
    } };
    fixture.detectChanges();
    await fixture.whenStable();
    await new Promise<void>(resolve => setTimeout(resolve, 0));
    const container = fixture.componentInstance.gridContainer!.nativeElement;
    const canvasGrid = fixture.componentInstance.canvasGrid!;
    container.scrollTop = 1048575 * 24; container.scrollLeft = 16383 * 84;
    container.dispatchEvent(new Event('scroll'));
    fixture.detectChanges();
    let frame = canvasGrid.lastFrame()!;
    expect(frame.cells.find(c => c.col === 16383 && c.row === 1048575)?.text.trim()).toBe('Final');
    expect(frame.cells.length).toBeLessThan(1000);
    container.scrollTop = 0; container.scrollLeft = 0; container.dispatchEvent(new Event('scroll'));
    fixture.detectChanges();
    frame = canvasGrid.lastFrame()!;
    expect(frame.cells.find(c => c.col === 0 && c.row === 0)?.text.trim()).toBe('Inicio');
  });

  it('reveals an offscreen precedent on another sheet after switching worksheets', async () => {
    const fixture = TestBed.createComponent(PureSheetEditorComponent);
    fixture.componentInstance.note = { ...sampleNote, docData: { sheets: [
      { id: 'summary', name: 'Resumen', type: 'grid', data: { A1: { raw: '=Datos!AA5000' } } },
      { id: 'source', name: 'Datos', type: 'grid', data: { AA5000: { raw: '123' } } },
    ], activeSheetId: 'summary' } };
    fixture.detectChanges();
    (fixture.nativeElement.querySelector('button[title="Ir a las celdas de origen de esta fórmula"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    await new Promise<void>(resolve => setTimeout(resolve, 0));
    fixture.detectChanges();
    expect(fixture.componentInstance.activeSheetId).toBe('source');
    const frame = fixture.componentInstance.canvasGrid!.lastFrame()!;
    expect(frame.cells.find(c => c.col === 26 && c.row === 4999)?.text.trim()).toBe('123');
  });

  it('keeps typing and navigation keys in a worksheet name and commits on Enter', async () => {
    const fixture = TestBed.createComponent(PureSheetEditorComponent);
    fixture.componentInstance.note = { ...sampleNote };
    fixture.detectChanges();
    const editor = fixture.componentInstance;
    const name = fixture.nativeElement.querySelector('.sheet-tab-name') as HTMLElement;
    const previousGrid = JSON.stringify(editor.activeSheet.data);
    name.focus();
    for (const [index, key] of [...'Presupuesto'].entries()) {
      name.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
      name.textContent = 'Presupuesto'.slice(0, index + 1);
    }
    for (const key of ['ArrowLeft', 'ArrowRight', 'Backspace']) name.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
    await new Promise<void>(resolve => setTimeout(resolve, 20));
    expect(editor.isEditing).toBe(false);
    expect(document.activeElement).toBe(name);
    name.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    fixture.detectChanges();
    expect(editor.activeSheet.name).toBe('Presupuesto');
    expect(JSON.stringify(editor.activeSheet.data)).toBe(previousGrid);
    editor.handleUndo();
    expect(editor.activeSheet.name).toBe('Ventas');
  });

  it('cancels a worksheet rename with Escape and restores empty names on blur', () => {
    const fixture = TestBed.createComponent(PureSheetEditorComponent);
    fixture.componentInstance.note = { ...sampleNote };
    fixture.detectChanges();
    const name = fixture.nativeElement.querySelector('.sheet-tab-name') as HTMLElement;
    name.focus(); name.textContent = 'Borrador';
    name.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    expect(fixture.componentInstance.activeSheet.name).toBe('Ventas');
    expect(name.textContent).toBe('Ventas');
    name.focus(); name.textContent = '';
    name.blur();
    expect(name.textContent).toBe('Ventas');
    expect(fixture.componentInstance.isEditing).toBe(false);
  });

  it('preserves formula reference picking when clicking another worksheet name', async () => {
    const fixture = TestBed.createComponent(PureSheetEditorComponent);
    fixture.componentInstance.note = { ...sampleNote, docData: { sheets: [
      { id: 'summary', name: 'Resumen', type: 'grid', data: {} },
      { id: 'data', name: 'Datos', type: 'grid', data: { A1: { raw: '15' } } },
    ], activeSheetId: 'summary' } };
    fixture.detectChanges();
    const editor = fixture.componentInstance;
    editor.gridContainer!.nativeElement.dispatchEvent(new KeyboardEvent('keydown', { key: '=', bubbles: true, cancelable: true }));
    fixture.detectChanges();
    await fixture.whenStable();
    const input = editor.cellEditorInput!.nativeElement;
    input.focus(); input.setSelectionRange(1, 1);
    const name = fixture.nativeElement.querySelector('[data-sheet-id="data"] .sheet-tab-name') as HTMLElement;
    expect(name.getAttribute('contenteditable')).toBe('false');
    name.click(); fixture.detectChanges();
    expect(editor.activeSheetId).toBe('data');
    expect(editor.isEditing).toBe(true);
    expect(editor.editingValue).toBe('=');
    expect(editor.formulaOriginLabel).toBe('Resumen!A1');
  });

  it('combines and separates cells in one undo step while retaining covered values', () => {
    component.ngOnInit();
    const original = JSON.stringify(component.activeSheet.data);
    component.selectionRange = { startCol: 0, startRow: 0, endCol: 1, endRow: 1 };
    component.toggleMerge();
    expect(component.activeSheet.merges).toEqual([{ startCol: 0, startRow: 0, endCol: 1, endRow: 1 }]);
    expect(component.activeSheet.data['B1'].raw).toBe('1500');
    expect(component.activeSheet.data['A1'].style?.align).toBe('center');
    expect(component.selectionIsMerged).toBe(true);
    component.handleUndo();
    expect(component.activeSheet.merges).toBeUndefined();
    expect(JSON.stringify(component.activeSheet.data)).toBe(original);
    component.handleRedo();
    component.selectedCell = { col: 0, row: 0 };
    component.selectionRange = { startCol: 0, startRow: 0, endCol: 0, endRow: 0 };
    component.toggleMerge();
    expect(component.activeSheet.merges).toEqual([]);
    expect(component.activeSheet.data['B1'].raw).toBe('1500');
  });

  it('expands overlapping combinations without producing intersecting merged regions', () => {
    component.ngOnInit();
    component.activeSheet.merges = [{ startCol: 0, startRow: 0, endCol: 1, endRow: 1 }];
    component.selectionRange = { startCol: 1, startRow: 1, endCol: 3, endRow: 2 };
    expect(component.selectionIsMerged).toBe(false);
    component.toggleMerge();
    expect(component.activeSheet.merges).toEqual([{ startCol: 0, startRow: 0, endCol: 3, endRow: 2 }]);
  });

  it('renders merged spans, edits the anchor, and restores the individual cells on separation', () => {
    const fixture = TestBed.createComponent(PureSheetEditorComponent);
    fixture.componentInstance.note = { ...sampleNote, docData: { sheets: [{ id: 's', name: 'Combinada', type: 'grid',
      data: { A1: { raw: 'Cabecera' }, B1: { raw: 'Conservado' } },
      merges: [{ startCol: 0, startRow: 0, endCol: 1, endRow: 1 }],
    }], activeSheetId: 's' } };
    fixture.detectChanges();
    const canvas = fixture.nativeElement.querySelector('app-excel-canvas-grid canvas') as HTMLCanvasElement;
    let frame = fixture.componentInstance.canvasGrid!.lastFrame()!;
    const anchor = frame.cells.find(c => c.col === 0 && c.row === 0)!;
    expect(anchor.colSpan).toBe(2); expect(anchor.rowSpan).toBe(2);
    expect(anchor.text.trim()).toBe('Cabecera');
    expect(frame.cells.find(c => c.col === 1 && c.row === 0)).toBeUndefined();
    expect(frame.cells.find(c => c.col === 0 && c.row === 1)).toBeUndefined();
    canvas.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true, clientX: 60, clientY: 36 }));
    fixture.detectChanges();
    expect(fixture.componentInstance.selectionRange).toEqual({ startCol: 0, startRow: 0, endCol: 1, endRow: 1 });
    const separate = fixture.nativeElement.querySelector('button[title="Separar celdas"]') as HTMLButtonElement;
    separate.click(); fixture.detectChanges();
    frame = fixture.componentInstance.canvasGrid!.lastFrame()!;
    expect(frame.cells.find(c => c.col === 1 && c.row === 0)?.text.trim()).toBe('Conservado');
  });

  it('navigates over merged interiors and collects their outside borders', () => {
    component.ngOnInit();
    component.activeSheet.merges = [{ startCol: 0, startRow: 0, endCol: 2, endRow: 1 }];
    component.activeSheet.data = { A1: { raw: 'Título' }, C1: { raw: '', style: { borders: { right: { style: 'double', color: '#123456' } } } }, A2: { raw: '', style: { borders: { bottom: { style: 'thin', color: '#654321' } } } } };
    component.selectedCell = { col: 0, row: 0 };
    component.moveSelection(1, 0); expect(component.selectedCell).toEqual({ col: 3, row: 0 });
    component.moveSelection(-1, 0); expect(component.selectedCell).toEqual({ col: 0, row: 0 });
    component.moveSelection(0, 1); expect(component.selectedCell).toEqual({ col: 0, row: 2 });
    expect(component.getEffectiveCellBorders(0, 0)).toMatchObject({ right: { style: 'double', color: '#123456' }, bottom: { style: 'thin', color: '#654321' } });
  });

  it('clips very large imported merges to the viewport while retaining the original anchor', async () => {
    const fixture = TestBed.createComponent(PureSheetEditorComponent);
    fixture.componentInstance.note = { ...sampleNote, docData: { sheets: [{ id: 's', name: 'Grande', type: 'grid',
      data: { A1: { raw: 'Título grande' } }, merges: [{ startCol: 0, startRow: 0, endCol: 16383, endRow: 1048575 }],
    }], activeSheetId: 's' } };
    fixture.detectChanges();
    await fixture.whenStable(); await new Promise<void>(resolve => setTimeout(resolve, 0));
    const editor = fixture.componentInstance;
    expect(editor.totalRows).toBe(1048576); expect(editor.totalCols).toBe(16384);
    expect(editor.canvasGrid!.lastFrame()!.cells.length).toBe(1);
    const container = editor.gridContainer!.nativeElement;
    container.scrollTop = 10000; container.scrollLeft = 5000; container.dispatchEvent(new Event('scroll')); fixture.detectChanges();
    const frame = editor.canvasGrid!.lastFrame()!;
    const anchor = frame.cells[0];
    expect(anchor.col).toBe(0); expect(anchor.row).toBe(0);
    expect(anchor.text.trim()).toBe('Título grande');
    expect(anchor.rowSpan).toBeLessThan(50); expect(anchor.colSpan).toBeLessThan(25);
    expect(frame.cells.length).toBe(1);
  });

  it('styles the visible anchor of a large combination without materializing its covered cells', () => {
    component.ngOnInit();
    component.activeSheet.data = { A1: { raw: 'Título' } };
    const region = { startCol: 0, startRow: 0, endCol: 16383, endRow: 1048575 };
    component.activeSheet.merges = [region]; component.selectionRange = { ...region };
    component.applyStyleChange({ bold: true, bgColor: '#FFFF00' });
    expect(Object.keys(component.activeSheet.data)).toEqual(['A1']);
    expect(component.activeSheet.data['A1'].style).toMatchObject({ bold: true, bgColor: '#FFFF00' });
    component.handleClearContent();
    expect(component.activeSheet.data['A1'].raw).toBe('');
    expect(component.activeSheet.merges).toEqual([region]);
  });

  it('completes canonical function names without losing the editor caret or resetting keyboard navigation', async () => {
    const fixture = TestBed.createComponent(PureSheetEditorComponent);
    fixture.componentInstance.note = { ...sampleNote }; fixture.detectChanges();
    const editor = fixture.componentInstance;
    editor.gridContainer!.nativeElement.dispatchEvent(new KeyboardEvent('keydown', { key: '=', bubbles: true })); fixture.detectChanges();
    await fixture.whenStable();
    const input = editor.cellEditorInput!.nativeElement;
    const normalKey = new KeyboardEvent('keydown', { key: 'B', bubbles: true, cancelable: true }); input.dispatchEvent(normalKey); expect(normalKey.defaultPrevented).toBe(false);
    input.value = '=BUSCARX'; input.setSelectionRange(8, 8); input.dispatchEvent(new Event('input', { bubbles: true })); fixture.detectChanges();
    expect(editor.completionItems[0].insert).toBe('XLOOKUP');
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })); fixture.detectChanges();
    expect(editor.editingValue).toBe('=XLOOKUP()'); expect(input.selectionStart).toBe(9);
    input.value = '=SU'; input.setSelectionRange(3, 3); input.dispatchEvent(new Event('input', { bubbles: true })); fixture.detectChanges();
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
    input.dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowDown', bubbles: true }));
    expect(editor.completionIndex).toBe(1);
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    input.dispatchEvent(new KeyboardEvent('keyup', { key: 'Escape', bubbles: true }));
    expect(editor.completionItems).toEqual([]); expect(editor.isEditing).toBe(true);
  });

  it('completes existing text from the same column and commits the accepted value', async () => {
    const fixture = TestBed.createComponent(PureSheetEditorComponent);
    fixture.componentInstance.note = { ...sampleNote, docData: { sheets: [{ id: 's', name: 'Datos', type: 'grid', data: { A1: { raw: 'Laptop' }, A2: { raw: 'Lamp' } } }], activeSheetId: 's' } };
    fixture.detectChanges(); const editor = fixture.componentInstance;
    const canvas = fixture.nativeElement.querySelector('app-excel-canvas-grid canvas') as HTMLCanvasElement;
    // Click cell A3 (col 0, row 2): x = 40 + 42 = 82, y = 24 + 48 + 12 = 84
    canvas.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true, clientX: 82, clientY: 84 }));
    editor.gridContainer!.nativeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'L', bubbles: true })); fixture.detectChanges();
    await new Promise<void>(resolve => setTimeout(resolve, 20)); fixture.detectChanges();
    expect(editor.completionItems.map(i => i.label)).toEqual(['Laptop','Lamp']);
    const input = editor.cellEditorInput!.nativeElement;
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
    expect(editor.editingValue).toBe('Laptop'); expect(editor.selectedCell).toEqual({ col: 0, row: 2 }); expect(editor.completionItems).toEqual([]);
    fixture.detectChanges(); await fixture.whenStable();
    editor.cellEditorInput!.nativeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    expect(editor.activeSheet.data['A3'].raw).toBe('Laptop');
  });

  it('uses the selected language for merge, trace and XLSX controls', () => {
    const fixture = TestBed.createComponent(PureSheetEditorComponent);
    fixture.componentInstance.note = { ...sampleNote }; fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('button[title="Ir a las celdas de origen de esta fórmula"]').textContent.trim()).toBe('Rastrear');
    mockI18nService.currentLang.set('en'); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('button[title="Go to the source cells of this formula"]').textContent.trim()).toBe('Trace');
    expect([...fixture.nativeElement.querySelectorAll('app-excel-ribbon button[title]')].map((button: any) => button.title)).toContain('Merge & Center');
    const file = [...fixture.nativeElement.querySelectorAll('.ribbon-tab')].find((button: any) => button.textContent.trim() === 'File') as HTMLButtonElement;
    file.click(); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('button[title="Add worksheets from an .xlsx file"]').textContent).toContain('Import XLSX');
  });

  it('persists defined names and structured tables, recalculating references after edits and undo', () => {
    component.ngOnInit(); component.activeSheet.data = { A1: { raw: 'Importe' }, A2: { raw: '10' }, A3: { raw: '20' }, C1: { raw: '=SUM(Ingresos)+SUM(Ventas[Importe])' } };
    component.selectionRange = { startCol: 0, endCol: 0, startRow: 0, endRow: 2 };
    component.createStructuredTable({ name: 'Ventas', headers: true });
    component.saveDefinedName({ name: 'Ingresos', reference: 'A2:A3', scope: 'workbook' });
    expect(component.namesError).toBe(''); expect(component.getCellValue(2, 0)).toBe(60);
    expect(component.activeSheet.workbookNames!['Ingresos']).toBe("'Ventas'!A2:A3");
    component.removeStructuredTable('Ventas'); expect(component.getCellValue(2, 0)).toBe('#¡REF!');
    component.handleUndo(); expect(component.getCellValue(2, 0)).toBe(60);
    component.renameSheet(component.activeSheet, 'Datos nuevos');
    expect(component.getCellValue(2, 0)).toBe(60);
    expect(component.activeSheet.workbookNames!['Ingresos']).toBe("'Datos nuevos'!A2:A3");
  });

  it('extends the viewport for dynamic arrays and protects their generated cells from typing', () => {
    const spilledRowCount = TOTAL_ROWS + 50;
    component.ngOnInit(); component.activeSheet.data = { A1: { raw: `=SEQUENCE(${spilledRowCount})` } };
    expect(component.totalRows).toBe(spilledRowCount); expect(component.getCellValue(0, spilledRowCount - 1)).toBe(spilledRowCount);
    component.selectedCell = { col: 0, row: 1 }; component.startCellEdit('x');
    expect(component.isEditing).toBe(false); expect(component.editorNotice).toContain('A1');
    expect(component.activeSheet.data['A2']).toBeUndefined();
    component.applyPastedCells([[{ raw: 'blocked' }]]);
    expect(component.activeSheet.data['A2']).toBeUndefined();
    component.renameSheet(component.activeSheet, 'Nueva');
    expect(component.getCellValue(0, spilledRowCount - 1)).toBe(spilledRowCount);
  });

  it('opens the cell context menu and inserts a blank row with undo',async()=>{
    const fixture=TestBed.createComponent(PureSheetEditorComponent);fixture.componentInstance.note=structuredClone(sampleNote);
    fixture.detectChanges();await fixture.whenStable();fixture.detectChanges();
    const editor=fixture.componentInstance,host=fixture.nativeElement as HTMLElement;
    const canvas = host.querySelector('app-excel-canvas-grid canvas') as HTMLCanvasElement;
    // Right-click cell B2 (col 1, row 1): x = 40 + 84 + 42 = 166, y = 24 + 24 + 12 = 60
    const event=new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:166,clientY:60});canvas.dispatchEvent(event);fixture.detectChanges();
    expect(event.defaultPrevented).toBe(true);expect(editor.selectedCell).toEqual({col:1,row:1});
    const buttons=Array.from(host.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'));
    expect(buttons).toHaveLength(8);expect(buttons.map(b=>b.textContent)).toContain('Insertar fila arriba');
    expect(buttons.map(b=>b.textContent)).toContain('Ocultar fila');
    expect(buttons.map(b=>b.textContent)).toContain('Insertar nota');
    expect(buttons.map(b=>b.textContent)).toContain('Insertar hipervínculo');
    buttons[0].click();fixture.detectChanges();
    expect(host.querySelector('[role="menu"]')).toBeNull();
    expect(editor.activeSheet.data['B2']).toBeUndefined();expect(editor.activeSheet.data['B3'].raw).toBe('500');
    editor.handleUndo();expect(editor.activeSheet.data['B2'].raw).toBe('500');fixture.destroy();
  });
  it('inserts a blank column to the right of the clicked cell',()=>{
    component.note=structuredClone(sampleNote);component.ngOnInit();
    component.openCellContextMenu(0,0,new MouseEvent('contextmenu',{cancelable:true}));
    component.insertFromCellContext('columnRight');
    expect(component.activeSheet.data['B1']).toBeUndefined();expect(component.activeSheet.data['C1'].raw).toBe('1500');
    component.handleUndo();expect(component.activeSheet.data['B1'].raw).toBe('1500');
  });

  it('drags and resizes embedded chart in multiple directions and triggers auto save', () => {
    component.note = structuredClone(sampleNote);
    component.ngOnInit();
    const saveSpy = vi.spyOn(component, 'scheduleAutoSave');

    // Insert a chart
    component.selectionRange = { startCol: 0, startRow: 0, endCol: 1, endRow: 1 };
    component.insertChartFromSelection({ category: 'line', subType: 'line' });
    expect(component.activeSheet.charts?.length).toBe(1);
    const chart = component.activeSheet.charts![0];
    chart.x = 100;
    chart.y = 80;
    chart.width = 480;
    chart.height = 300;
    saveSpy.mockClear();

    // 1. Begin drag
    component.beginDragChart(chart, new MouseEvent('mousedown', { clientX: 200, clientY: 150 }));
    expect(component.draggingChart).toBeTruthy();
    expect(component.selectedChartId).toBe(chart.id);

    // Mouse move: move by +50, +30
    component.handleGlobalMouseMove(new MouseEvent('mousemove', { clientX: 250, clientY: 180 }));
    expect(chart.x).toBe(150);
    expect(chart.y).toBe(110);

    // Mouse up: finishes drag and triggers auto save
    component.handleGlobalMouseUp();
    expect(component.draggingChart).toBeNull();
    expect(saveSpy).toHaveBeenCalledTimes(1);
    saveSpy.mockClear();

    // 2. Multi-handle resize: SE (bottom-right)
    component.beginResizeChart(chart, 'se', new MouseEvent('mousedown', { clientX: 630, clientY: 410 }));
    component.handleGlobalMouseMove(new MouseEvent('mousemove', { clientX: 680, clientY: 460 }));
    expect(chart.width).toBe(530);
    expect(chart.height).toBe(350);
    component.handleGlobalMouseUp();
    expect(saveSpy).toHaveBeenCalledTimes(1);
    saveSpy.mockClear();

    // 3. Multi-handle resize: NW (top-left) - moves x and y, and resizes width and height
    component.beginResizeChart(chart, 'nw', new MouseEvent('mousedown', { clientX: 150, clientY: 110 }));
    component.handleGlobalMouseMove(new MouseEvent('mousemove', { clientX: 120, clientY: 90 }));
    expect(chart.x).toBe(120);
    expect(chart.y).toBe(90);
    expect(chart.width).toBe(560);
    expect(chart.height).toBe(370);
    component.handleGlobalMouseUp();
    expect(saveSpy).toHaveBeenCalledTimes(1);
  });

  it('updates existing chart category/subtype without recreating it at default coordinates', () => {
    component.note = structuredClone(sampleNote);
    component.ngOnInit();

    // Insert initial chart
    component.selectionRange = { startCol: 0, startRow: 0, endCol: 1, endRow: 1 };
    component.insertChartFromSelection({ category: 'column', subType: 'clusteredColumn' });
    const chart = component.activeSheet.charts![0];
    chart.x = 350;
    chart.y = 220;
    chart.width = 600;
    chart.height = 400;
    component.selectedChartId = chart.id;

    // Change chart type while selected
    component.onChartModalSelect({ category: 'scatter', subType: 'scatterStraightLinesMarkers' });
    expect(component.activeSheet.charts?.length).toBe(1);
    expect(component.activeSheet.charts![0].id).toBe(chart.id);
    expect(component.activeSheet.charts![0].category).toBe('scatter');
    expect(component.activeSheet.charts![0].subType).toBe('scatterStraightLinesMarkers');
    expect(component.activeSheet.charts![0].x).toBe(350);
    expect(component.activeSheet.charts![0].y).toBe(220);
    expect(component.activeSheet.charts![0].width).toBe(600);
    expect(component.activeSheet.charts![0].height).toBe(400);
  });

  it('flushes pending auto save upon component destruction', () => {
    component.note = structuredClone(sampleNote);
    component.ngOnInit();
    const updateSpy = vi.spyOn(mockNotesService, 'updateDocData');

    component.scheduleAutoSave();
    expect(updateSpy).not.toHaveBeenCalled();

    // Destroying flushes immediately
    component.ngOnDestroy();
    expect(updateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        sheets: component.sheets,
        activeSheetId: component.activeSheetId,
      }),
      sampleNote._id
    );
  });

  it('darkens Excel chrome and headers in dark mode while keeping editable cells light', async () => {
    mockThemeService.isDark.set(true);
    const fixture = TestBed.createComponent(PureSheetEditorComponent);
    const editor = fixture.componentInstance;
    editor.note = structuredClone(sampleNote);
    fixture.detectChanges();
    await fixture.whenStable();

    const hostEl = fixture.nativeElement as HTMLElement;
    const rootShell = hostEl.firstElementChild as HTMLElement;
    const canvas = hostEl.querySelector('app-excel-canvas-grid canvas') as HTMLCanvasElement;
    const frame = editor.canvasGrid!.lastFrame()!;

    expect(canvas).toBeTruthy();
    expect(rootShell.classList.contains('bg-slate-900')).toBe(true);
    expect(frame.isDarkChrome).toBe(true);
    expect(frame.palette.headerBg).toBe('#1e293b');
    expect(frame.palette.cellBg).toBe('#ffffff');
    expect(frame.palette.cellText).toBe('#1e293b');
    expect(frame.palette.gridline).toBe('#e2e8f0');

    // Inline editor over editable cell also stays light
    editor.selectedCell = { col: 0, row: 0 };
    editor.selectionRange = { startCol: 0, startRow: 0, endCol: 0, endRow: 0 };
    editor.startCellEdit('Ingresos');
    fixture.detectChanges();
    const cellInput = hostEl.querySelector('.sheet-canvas-world input[aria-autocomplete="list"]') as HTMLInputElement;
    expect(cellInput).toBeTruthy();
    expect(cellInput.classList.contains('bg-white')).toBe(true);
    expect(cellInput.classList.contains('text-slate-900')).toBe(true);
    expect(cellInput.classList.contains('bg-slate-800')).toBe(false);

    // Default borders and gridlines contrast against white cells
    expect(editor.getCellBorder(1, 0, 'top')).toBe('1px solid #e2e8f0');
    editor.applyBorderPreset({ preset: 'all', lineStyle: 'thin', color: '' });
    expect(editor.getCellBorder(0, 0, 'top')).toBe('1px solid #000000');

    fixture.destroy();
  });

  it('preserves full cell formatting on copy/paste and cut/paste even when system clipboard only provides plain text or denies read', async () => {
    component.ngOnInit();
    component.activeSheet.data = {
      A1: {
        raw: '1250',
        style: {
          bold: true,
          italic: true,
          bgColor: '#fef08a',
          textColor: '#991b1b',
          align: 'right',
          fontFamily: 'Georgia',
          fontSize: 14,
          numberFormat: 'currency',
          decimals: 2,
          borders: {
            top: { style: 'thick', color: '#000000' },
            bottom: { style: 'double', color: '#107c41' },
          },
        },
      },
      B1: { raw: '0.25', style: { numberFormat: 'percent', bgColor: '#dcfce7' } },
    };

    const originalClipboard = navigator.clipboard;
    let clipboardText = '';
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        write: vi.fn().mockRejectedValue(new Error('ClipboardItem blocked')),
        writeText: vi.fn(async (text: string) => { clipboardText = text; }),
        readText: vi.fn(async () => clipboardText),
      },
      configurable: true,
    });

    try {
      // 1. Copy A1:B1 and paste into C3 via plain-text fallback
      component.selectedCell = { col: 0, row: 0 };
      component.selectionRange = { startCol: 0, startRow: 0, endCol: 1, endRow: 0 };
      await component.handleCopy();
      component.selectedCell = { col: 2, row: 2 };
      component.selectionRange = { startCol: 2, startRow: 2, endCol: 2, endRow: 2 };
      await component.handlePaste();

      expect(component.activeSheet.data['C3']).toEqual(component.activeSheet.data['A1']);
      expect(component.activeSheet.data['D3']).toEqual(component.activeSheet.data['B1']);
      // Pasted border objects must not share references with source
      expect(component.activeSheet.data['C3'].style?.borders).not.toBe(component.activeSheet.data['A1'].style?.borders);

      // 2. Cut A1:B1 and paste into E5 (even when readText throws permission denied)
      (navigator.clipboard.readText as any).mockRejectedValueOnce(new Error('permission denied'));
      component.selectedCell = { col: 0, row: 0 };
      component.selectionRange = { startCol: 0, startRow: 0, endCol: 1, endRow: 0 };
      await component.handleCut();

      expect(component.activeSheet.data['A1']).toBeUndefined();
      expect(component.activeSheet.data['B1']).toBeUndefined();

      component.selectedCell = { col: 4, row: 4 };
      component.selectionRange = { startCol: 4, startRow: 4, endCol: 4, endRow: 4 };
      await component.handlePaste();

      expect(component.activeSheet.data['E5'].raw).toBe('1250');
      expect(component.activeSheet.data['E5'].style).toEqual(component.activeSheet.data['C3'].style);
      expect(component.activeSheet.data['F5'].raw).toBe('0.25');
      expect(component.activeSheet.data['F5'].style).toEqual(component.activeSheet.data['D3'].style);

      // 3. External plain text overrides stale internal clipboard instead of applying old styles
      clipboardText = '999';
      component.selectedCell = { col: 6, row: 6 };
      await component.handlePaste();
      expect(component.activeSheet.data['G7'].raw).toBe('999');
      expect(component.activeSheet.data['G7'].style).toBeUndefined();
    } finally {
      Object.defineProperty(navigator, 'clipboard', { value: originalClipboard, configurable: true });
    }
  });

  it('auto-fits column and row dimensions on divider double-click and opens header context menu', async () => {
    const fixture = TestBed.createComponent(PureSheetEditorComponent);
    const editor = fixture.componentInstance;
    editor.note = {
      ...sampleNote,
      docData: {
        sheets: [
          {
            id: 's1',
            name: 'AutoFit',
            type: 'grid',
            data: {
              A1: { raw: 'Descripción muy extensa para autoajustar columna A' },
              A2: { raw: 'Línea 1\nLínea 2\nLínea 3', style: { wrapText: true } },
            },
          },
        ],
        activeSheetId: 's1',
      },
    };
    fixture.detectChanges();
    await fixture.whenStable();

    const canvas = fixture.nativeElement.querySelector('app-excel-canvas-grid canvas') as HTMLCanvasElement;
    // Double-click right boundary of col A header (x = 40 + 84 = 124, y = 10)
    canvas.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, clientX: 40 + 84, clientY: 10 }));
    fixture.detectChanges();
    expect(editor.activeSheet.colWidths?.[0]).toBeGreaterThan(84);

    // Double-click bottom boundary of row 2 header (x = 15, y = 24 + 48 = 72)
    canvas.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, clientX: 15, clientY: 24 + 48 }));
    fixture.detectChanges();
    expect(editor.activeSheet.rowHeights?.[1]).toBeGreaterThan(24);

    // Undo restores previous row height
    editor.handleUndo();
    expect(editor.activeSheet.rowHeights?.[1]).toBeUndefined();

    // Right-click col B header selects column B and opens context menu
    const colBCenterX = 40 + editor.getColWidth(0) + 20;
    canvas.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: colBCenterX, clientY: 10 }));
    fixture.detectChanges();
    expect(editor.cellContextMenu).toBeTruthy();

    fixture.destroy();
  });

  it('keeps revealCell clear of frozen panes and clears clipboard highlight on Escape', async () => {
    const fixture = TestBed.createComponent(PureSheetEditorComponent);
    const editor = fixture.componentInstance;
    editor.note = structuredClone(sampleNote);
    fixture.detectChanges();
    await fixture.whenStable();

    editor.activeSheet.freezePanes = { cols: 2, rows: 1 };
    const container = editor.gridContainer!.nativeElement;
    container.scrollLeft = 500;
    container.scrollTop = 200;

    // Revealing col 2 (right after frozen cols A:B) brings scrollLeft back to 0, not behind A:B
    editor.revealCell(2, 1);
    expect(container.scrollLeft).toBe(0);
    expect(container.scrollTop).toBe(0);

    // Copy + Escape clears internal clipboard matrix highlight
    await editor.handleCopy();
    expect(editor.activeClipboardMatrix).toBeTruthy();
    editor.handleGlobalKeyDown(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(editor.activeClipboardMatrix).toBeNull();

    fixture.destroy();
  });

  it('skips redundant Canvas repaints when state signature is unchanged and paints on interaction', async () => {
    const fixture = TestBed.createComponent(PureSheetEditorComponent);
    const editor = fixture.componentInstance;
    editor.note = structuredClone(sampleNote);
    fixture.detectChanges();
    await fixture.whenStable();

    const gridComp = editor.canvasGrid!;
    const countAfterInit = gridComp.paintCount;

    // Repeated view checks or renderNow(false) with identical signature must skip redundant repaints
    fixture.detectChanges();
    gridComp.renderNow(false);
    gridComp.renderNow(false);
    expect(gridComp.paintCount).toBe(countAfterInit);

    // Moving selection invalidates signature and paints once
    editor.selectedCell = { col: 2, row: 3 };
    editor.selectionRange = { startCol: 2, startRow: 3, endCol: 2, endRow: 3 };
    gridComp.renderNow(false);
    expect(gridComp.paintCount).toBe(countAfterInit + 1);

    fixture.destroy();
  });

  it('applies cloned formatting via Format Painter on selection mouseup, supports Escape cancel and undo', async () => {
    const fixture = TestBed.createComponent(PureSheetEditorComponent);
    const editor = fixture.componentInstance;
    editor.note = structuredClone(sampleNote);
    fixture.detectChanges();
    await fixture.whenStable();

    // Source cell A1 has bold + custom fill + border
    editor.selectedCell = { col: 0, row: 0 };
    editor.selectionRange = { startCol: 0, startRow: 0, endCol: 0, endRow: 0 };
    editor.applyStyleChange({
      bold: true,
      bgColor: '#fef3c7',
      borders: { bottom: { style: 'double', color: '#059669' } },
    });

    editor.handleFormatPainter();
    expect(editor.hasCopiedFormat).toBe(true);

    // Select range B1:C1 on Canvas & release mouse to paint format
    editor.onCellMouseDown(1, 0, new MouseEvent('mousedown', { button: 0 }));
    editor.onCellMouseEnter(2, 0);
    editor.handleGlobalMouseUp();
    fixture.detectChanges();

    expect(editor.hasCopiedFormat).toBe(false);
    expect(editor.activeSheet.data['B1']?.style?.bold).toBe(true);
    expect(editor.activeSheet.data['B1']?.style?.bgColor).toBe('#fef3c7');
    expect(editor.activeSheet.data['C1']?.style?.borders?.bottom).toEqual({ style: 'double', color: '#059669' });

    // Mutating painted cell borders does not mutate A1 source borders
    editor.activeSheet.data['B1']!.style!.borders!.bottom!.color = '#dc2626';
    expect(editor.activeSheet.data['A1']?.style?.borders?.bottom?.color).toBe('#059669');

    // Undo restores previous clean state
    editor.handleUndo();
    expect(editor.activeSheet.data['B1']?.style?.bgColor).toBeUndefined();

    // Escape cancels armed Format Painter without modifying cells
    editor.handleFormatPainter();
    expect(editor.hasCopiedFormat).toBe(true);
    editor.handleGlobalKeyDown(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(editor.hasCopiedFormat).toBe(false);

    fixture.destroy();
  });

  it('supports extended Home, Ctrl+Home, End, Ctrl+End and PageDown/PageUp navigation', async () => {
    const fixture = TestBed.createComponent(PureSheetEditorComponent);
    const editor = fixture.componentInstance;
    editor.note = {
      ...sampleNote,
      docData: {
        sheets: [
          {
            id: 's1',
            name: 'Nav',
            type: 'grid',
            data: {
              A1: { raw: 'ColA' },
              D1: { raw: 'ColD' },
              E25: { raw: 'EndCorner' },
            },
          },
        ],
        activeSheetId: 's1',
      },
    };
    fixture.detectChanges();
    await fixture.whenStable();

    // End in row 0 moves to D1 (col 3)
    editor.handleGlobalKeyDown(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    expect(editor.selectedCell).toEqual({ col: 3, row: 0 });

    // Home returns to A1 (col 0)
    editor.handleGlobalKeyDown(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
    expect(editor.selectedCell).toEqual({ col: 0, row: 0 });

    // PageDown scrolls down by viewport page step, PageUp returns to row 0
    editor.handleGlobalKeyDown(new KeyboardEvent('keydown', { key: 'PageDown', bubbles: true }));
    const afterPageDownRow = editor.selectedCell.row;
    expect(afterPageDownRow).toBeGreaterThanOrEqual(8);
    editor.handleGlobalKeyDown(new KeyboardEvent('keydown', { key: 'PageUp', bubbles: true }));
    expect(editor.selectedCell.row).toBe(0);

    // Ctrl+End jumps to E25 (col 4, row 24), Ctrl+Home returns to A1
    editor.handleGlobalKeyDown(new KeyboardEvent('keydown', { key: 'End', ctrlKey: true, bubbles: true }));
    expect(editor.selectedCell).toEqual({ col: 4, row: 24 });
    editor.handleGlobalKeyDown(new KeyboardEvent('keydown', { key: 'Home', ctrlKey: true, bubbles: true }));
    expect(editor.selectedCell).toEqual({ col: 0, row: 0 });

    fixture.destroy();
  });

  it('opens column filter popover from Canvas filter button click and toggles column filter values', async () => {
    const fixture = TestBed.createComponent(PureSheetEditorComponent);
    const editor = fixture.componentInstance;
    editor.note = {
      ...sampleNote,
      docData: {
        sheets: [
          {
            id: 's1',
            name: 'Filter',
            type: 'grid',
            data: {
              A1: { raw: 'Categoría' },
              A2: { raw: 'Norte' },
              A3: { raw: 'Sur' },
            },
          },
        ],
        activeSheetId: 's1',
      },
    };
    editor.filtersEnabled = true;
    fixture.detectChanges();
    await fixture.whenStable();

    const frame = editor.canvasGrid!.lastFrame()!;
    const btn = frame.filterButtons.find(b => b.col === 0 && b.row === 0)!;
    expect(btn).toBeTruthy();

    const canvas = fixture.nativeElement.querySelector('app-excel-canvas-grid canvas') as HTMLCanvasElement;
    canvas.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: btn.x + btn.size / 2, clientY: btn.y + btn.size / 2 }));
    fixture.detectChanges();

    expect(editor.filterMenuState?.options).toEqual(['Norte', 'Sur']);
    expect(fixture.nativeElement.querySelector('.column-filter-popover')).toBeTruthy();

    editor.toggleFilterOption(0, 'Sur');
    fixture.detectChanges();

    const updatedFrame = editor.canvasGrid!.lastFrame()!;
    expect(updatedFrame.cells.find(c => c.col === 0 && c.row === 1)?.filteredOut).toBe(false);
    expect(updatedFrame.cells.find(c => c.col === 0 && c.row === 2)?.filteredOut).toBe(true);

    editor.clearColumnFilter(0);
    fixture.detectChanges();
    expect(editor.columnFilters[0]).toBeUndefined();
    expect(editor.filterMenuState).toBeNull();

    fixture.destroy();
  });

  it('inserts interactive Canvas checkboxes and toggles them on click, Space key and undo', async () => {
    const fixture = TestBed.createComponent(PureSheetEditorComponent);
    const editor = fixture.componentInstance;
    editor.note = structuredClone(sampleNote);
    fixture.detectChanges();
    await fixture.whenStable();

    editor.selectedCell = { col: 0, row: 0 };
    editor.selectionRange = { startCol: 0, startRow: 0, endCol: 0, endRow: 0 };
    editor.handleInsertCheckbox();
    fixture.detectChanges();

    expect(editor.activeSheet.data['A1']?.raw).toBe('FALSE');
    expect(editor.activeSheet.data['A1']?.style?.checkbox).toBe(true);

    const frame = editor.canvasGrid!.lastFrame()!;
    const cb = frame.checkboxes.find(item => item.col === 0 && item.row === 0)!;
    expect(cb).toBeTruthy();

    // Click Canvas checkbox toggles FALSE -> TRUE without opening text edit mode
    const canvas = fixture.nativeElement.querySelector('app-excel-canvas-grid canvas') as HTMLCanvasElement;
    canvas.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: cb.x + cb.size / 2, clientY: cb.y + cb.size / 2 }));
    fixture.detectChanges();
    expect(editor.isEditing).toBe(false);
    expect(editor.activeSheet.data['A1']?.raw).toBe('TRUE');

    // Pressing Space toggles TRUE -> FALSE
    editor.handleGlobalKeyDown(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    expect(editor.activeSheet.data['A1']?.raw).toBe('FALSE');

    // Undo restores previous TRUE state
    editor.handleUndo();
    expect(editor.activeSheet.data['A1']?.raw).toBe('TRUE');

    fixture.destroy();
  });

  it('synchronously refreshes the Canvas frame when view display toggles change', async () => {
    const fixture = TestBed.createComponent(PureSheetEditorComponent);
    const editor = fixture.componentInstance;
    editor.note = {
      ...sampleNote,
      docData: {
        sheets: [
          {
            id: 's1',
            name: 'ViewToggles',
            type: 'grid',
            data: {
              A1: { raw: '10' },
              B1: { raw: '=A1*2' },
            },
          },
        ],
        activeSheetId: 's1',
      },
    };
    fixture.detectChanges();
    await fixture.whenStable();

    const initialPaints = editor.canvasGrid!.paintCount;

    editor.toggleGridlines();
    expect(editor.showGridlines).toBe(false);
    expect(editor.canvasGrid!.lastFrame()!.showGridlines).toBe(false);
    expect(editor.canvasGrid!.paintCount).toBe(initialPaints + 1);

    editor.toggleHeadings();
    expect(editor.showHeadings).toBe(false);
    expect(editor.canvasGrid!.lastFrame()!.showHeadings).toBe(false);
    expect(editor.canvasGrid!.lastFrame()!.headerW).toBe(0);

    editor.toggleShowFormulas();
    expect(editor.showFormulasInCells).toBe(true);
    const b1 = editor.canvasGrid!.lastFrame()!.cells.find(c => c.col === 1 && c.row === 0);
    expect(b1?.text).toBe('=A1*2');

    fixture.destroy();
  });

  it('keeps freeze panes disabled by default when loading saved sheets and never persists active freeze panes', async () => {
    const fixture = TestBed.createComponent(PureSheetEditorComponent);
    const editor = fixture.componentInstance;
    editor.note = {
      ...sampleNote,
      docData: {
        sheets: [
          { id: 's1', name: 'Hoja1', type: 'grid', data: { A1: { raw: 'Encabezado 1' } }, freezePanes: { rows: 3, cols: 2 } },
          { id: 's2', name: 'Hoja2', type: 'grid', data: { A1: { raw: 'Encabezado 2' } }, freezePanes: { rows: 1, cols: 0 } },
        ],
        activeSheetId: 's1',
      },
    };
    fixture.detectChanges();
    await fixture.whenStable();

    expect(editor.sheets[0].freezePanes).toBeUndefined();
    expect(editor.sheets[1].freezePanes).toBeUndefined();
    expect(editor.canvasGrid!.lastFrame()!.frozenRows).toBe(0);
    expect(editor.canvasGrid!.lastFrame()!.frozenCols).toBe(0);

    // Enabling Freeze Panes manually works in-session, without persisting it in saved docData
    editor.handleSetFreezePanes({ rows: 2, cols: 0 });
    expect(editor.activeSheet.freezePanes).toEqual({ rows: 2, cols: 0 });
    expect(editor.canvasGrid!.lastFrame()!.frozenRows).toBe(2);

    const notesSvc = TestBed.inject(NotesService);
    const updateDocSpy = vi.spyOn(notesSvc, 'updateDocData');
    editor.flushAutoSave();
    expect(updateDocSpy).toHaveBeenCalled();
    const persistedDoc = updateDocSpy.mock.calls[0][0] as { sheets: { freezePanes?: unknown }[] };
    expect(persistedDoc.sheets[0].freezePanes).toBeUndefined();

    editor.switchSheet('s2');
    fixture.detectChanges();
    expect(editor.activeSheetId).toBe('s2');
    expect(editor.canvasGrid!.lastFrame()!.frozenRows).toBe(0);

    editor.switchSheet('s1');
    fixture.detectChanges();
    expect(editor.canvasGrid!.lastFrame()!.frozenRows).toBe(2);

    editor.handleUnfreezePanes();
    expect(editor.activeSheet.freezePanes).toBeUndefined();
    expect(editor.canvasGrid!.lastFrame()!.frozenRows).toBe(0);

    fixture.destroy();
  });

  it('keeps sheet tabs in a single horizontally scrollable row and switches sheets from the right-corner list selector', async () => {
    const fixture = TestBed.createComponent(PureSheetEditorComponent);
    const editor = fixture.componentInstance;
    editor.note = {
      ...sampleNote,
      docData: {
        sheets: [
          { id: 's1', name: 'Inversión Total', type: 'grid', data: {} },
          { id: 's2', name: 'Flujo de Caja', type: 'grid', data: {} },
          { id: 's3', name: 'Gráfico Anual', type: 'chart', data: {} },
        ],
        activeSheetId: 's1',
      },
    };
    fixture.detectChanges();
    await fixture.whenStable();

    const scrollStrip = fixture.nativeElement.querySelector('.sheet-tabs-scroll') as HTMLElement;
    scrollStrip.dispatchEvent(new WheelEvent('wheel', { deltaY: 80, bubbles: true, cancelable: true }));
    expect(scrollStrip).toBeTruthy();

    const toggleBtn = fixture.nativeElement.querySelector('[data-testid="sheet-list-toggle"]') as HTMLButtonElement;
    expect(toggleBtn).toBeTruthy();
    expect(toggleBtn.getAttribute('aria-expanded')).toBe('false');
    expect(fixture.nativeElement.querySelector('.sheet-list-popover')).toBeNull();

    toggleBtn.click();
    fixture.detectChanges();

    expect(toggleBtn.getAttribute('aria-expanded')).toBe('true');
    const options = Array.from(fixture.nativeElement.querySelectorAll('.sheet-list-popover [role="option"]')) as HTMLButtonElement[];
    expect(options.map(o => o.textContent?.trim())).toEqual(['Inversión Total', 'Flujo de Caja', 'Gráfico Anual']);
    expect(options[0].getAttribute('aria-selected')).toBe('true');
    expect(options[2].getAttribute('aria-selected')).toBe('false');

    options[2].click();
    fixture.detectChanges();

    expect(editor.activeSheetId).toBe('s3');
    expect(editor.sheetListOpen).toBe(false);
    expect(fixture.nativeElement.querySelector('.sheet-list-popover')).toBeNull();

    // Clicking outside closes the popover when open
    toggleBtn.click();
    fixture.detectChanges();
    expect(editor.sheetListOpen).toBe(true);
    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    fixture.detectChanges();
    expect(editor.sheetListOpen).toBe(false);

    fixture.destroy();
  });

  it('opens Find & Replace with Ctrl+F, replaces across workbook, and supports undo', async () => {
    const fixture = TestBed.createComponent(PureSheetEditorComponent);
    const editor = fixture.componentInstance;
    editor.note = {
      ...sampleNote,
      docData: {
        sheets: [
          { id: 's1', name: 'Hoja1', type: 'grid', data: { A1: { raw: 'Costo Base' }, A2: { raw: 'Base Fija' } } },
          { id: 's2', name: 'Hoja2', type: 'grid', data: { B2: { raw: 'Base Anual' } } },
        ],
        activeSheetId: 's1',
      },
    };
    fixture.detectChanges();
    await fixture.whenStable();

    editor.gridContainer!.nativeElement.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'f', ctrlKey: true, bubbles: true, cancelable: true })
    );
    fixture.detectChanges();
    expect(editor.findReplaceModalOpen).toBe(true);

    editor.replaceAllFindMatches({
      query: 'Base',
      replaceWith: 'Meta',
      scope: 'workbook',
      matchCase: false,
      wholeCell: false,
      searchIn: 'raw',
    });
    fixture.detectChanges();
    expect(editor.sheets[0].data['A1'].raw).toBe('Costo Meta');
    expect(editor.sheets[1].data['B2'].raw).toBe('Meta Anual');

    editor.findReplaceModalOpen = false;
    editor.handleUndo();
    expect(editor.sheets[0].data['A1'].raw).toBe('Costo Base');
    expect(editor.sheets[1].data['B2'].raw).toBe('Base Anual');

    fixture.destroy();
  });

  it('renders in-cell validation dropdown on Canvas, allows option selection, and rejects invalid commits', async () => {
    const fixture = TestBed.createComponent(PureSheetEditorComponent);
    const editor = fixture.componentInstance;
    editor.note = {
      ...sampleNote,
      docData: {
        sheets: [
          { id: 's1', name: 'Control', type: 'grid', data: { A1: { raw: 'Pendiente' }, B1: { raw: '5' } } },
        ],
        activeSheetId: 's1',
      },
    };
    fixture.detectChanges();
    await fixture.whenStable();

    editor.selectedCell = { col: 0, row: 0 };
    editor.selectionRange = { startCol: 0, startRow: 0, endCol: 0, endRow: 0 };
    editor.applyDataValidationRule({
      type: 'list',
      formula1: 'Pendiente, Aprobado, Rechazado',
      showDropdown: true,
      allowBlank: false,
    });
    fixture.detectChanges();

    const frame = editor.canvasGrid!.lastFrame()!;
    expect(frame.validationButtons.some((b) => b.col === 0 && b.row === 0)).toBe(true);

    editor.toggleValidationDropdown(0, 0);
    fixture.detectChanges();
    const opts = Array.from(
      fixture.nativeElement.querySelectorAll('[data-testid="validation-cell-dropdown"] [role="option"]')
    ) as HTMLButtonElement[];
    expect(opts.map((el) => el.textContent?.trim())).toEqual(['Pendiente', 'Aprobado', 'Rechazado']);

    opts[1].click();
    fixture.detectChanges();
    expect(editor.activeSheet.data['A1'].raw).toBe('Aprobado');
    expect(editor.validationMenuState).toBeNull();

    // Reject invalid direct edit on validated cell
    editor.startCellEdit('Invalido');
    editor.commitCellEdit();
    expect(editor.activeSheet.data['A1'].raw).toBe('Aprobado');
    expect(editor.editorNotice).toContain('Valor no válido');

    fixture.destroy();
  });

  it('executes Data ribbon tools: Remove Duplicates, Text to Columns, and PivotTable creation', async () => {
    const fixture = TestBed.createComponent(PureSheetEditorComponent);
    const editor = fixture.componentInstance;
    editor.note = {
      ...sampleNote,
      docData: {
        sheets: [
          {
            id: 's1',
            name: 'Datos',
            type: 'grid',
            data: {
              A1: { raw: 'Area' },
              B1: { raw: 'Monto' },
              A2: { raw: 'Norte' },
              B2: { raw: '100' },
              A3: { raw: 'Norte' },
              B3: { raw: '100' },
              A4: { raw: 'Sur' },
              B4: { raw: '250' },
              D1: { raw: 'Juan, Ventas, 30' },
            },
          },
        ],
        activeSheetId: 's1',
      },
    };
    fixture.detectChanges();
    await fixture.whenStable();

    const tabs = Array.from(fixture.nativeElement.querySelectorAll('.ribbon-tab')) as HTMLButtonElement[];
    const dataTab = tabs.find((btn) => btn.textContent?.trim() === 'Datos' || btn.textContent?.trim() === 'Data');
    expect(dataTab).toBeTruthy();
    dataTab!.click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="data-validation-btn"]')).toBeTruthy();

    // Remove duplicates on A1:B4
    editor.selectionRange = { startCol: 0, startRow: 0, endCol: 1, endRow: 3 };
    editor.applyRemoveDuplicates({ columns: [0, 1], hasHeaders: true });
    expect(editor.activeSheet.data['A3'].raw).toBe('Sur');
    expect(editor.activeSheet.data['A4']).toBeUndefined();

    // Text to Columns on D1
    editor.selectionRange = { startCol: 3, startRow: 0, endCol: 3, endRow: 0 };
    editor.applyTextToColumnsTool({
      comma: true,
      semicolon: false,
      tab: false,
      space: false,
      custom: '',
      treatConsecutiveAsOne: false,
    });
    expect(editor.activeSheet.data['D1'].raw).toBe('Juan');
    expect(editor.activeSheet.data['E1'].raw).toBe('Ventas');
    expect(editor.activeSheet.data['F1'].raw).toBe('30');

    // PivotTable on A1:B3 -> creates a new sheet
    editor.applyPivotTable({
      range: { startCol: 0, startRow: 0, endCol: 1, endRow: 2 },
      rowCol: 0,
      colCol: null,
      valueCol: 1,
      aggregation: 'sum',
      destination: 'newSheet',
    });
    expect(editor.sheets.length).toBe(2);
    expect(editor.activeSheet.name).toContain('Tabla dinámica');
    expect(editor.activeSheet.data['A2'].raw).toBe('Norte');
    expect(editor.activeSheet.data['B2'].raw).toBe('100');
    expect(editor.activeSheet.data['B4'].raw).toBe('350');

    fixture.destroy();
  });

  it('supports Stage 2 cell notes (Shift+F2 / context menu / undo), sparklines, and conditional formatting rules', async () => {
    const fixture = TestBed.createComponent(PureSheetEditorComponent);
    const editor = fixture.componentInstance;
    editor.note = {
      ...sampleNote,
      docData: {
        sheets: [
          {
            id: 's1',
            name: 'Notas y Mini',
            type: 'grid',
            data: {
              A1: { raw: '10' },
              B1: { raw: '40' },
              C1: { raw: '25' },
              D1: { raw: '80' },
            },
          },
        ],
        activeSheetId: 's1',
      },
    };
    fixture.detectChanges();
    await fixture.whenStable();

    // Open note editor on A1 via Shift+F2
    editor.selectedCell = { col: 0, row: 0 };
    editor.handleGlobalKeyDown(new KeyboardEvent('keydown', { key: 'F2', shiftKey: true, cancelable: true }));
    fixture.detectChanges();
    expect(editor.commentEditorState?.cellId).toBe('A1');
    const noteInput = fixture.nativeElement.querySelector('[data-testid="cell-comment-input"]') as HTMLTextAreaElement;
    expect(noteInput).toBeTruthy();

    editor.commentEditorState!.text = 'Meta Q1 revisada';
    (fixture.nativeElement.querySelector('[data-testid="cell-comment-save"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(editor.activeSheet.comments?.['A1']?.text).toBe('Meta Q1 revisada');
    expect(editor.commentEditorState).toBeNull();

    // Hover indicator & delete via context menu, then Undo restores
    editor.hoverCommentCell({ col: 0, row: 0 });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="cell-comment-tooltip"]')?.textContent).toContain('Meta Q1 revisada');

    editor.openCellContextMenu(0, 0, new MouseEvent('contextmenu', { clientX: 50, clientY: 50 }));
    fixture.detectChanges();
    const deleteCommentBtn = fixture.nativeElement.querySelector('[data-testid="ctx-comment-delete"]') as HTMLButtonElement;
    expect(deleteCommentBtn).toBeTruthy();
    deleteCommentBtn.click();
    fixture.detectChanges();
    expect(editor.activeSheet.comments).toBeUndefined();

    editor.handleUndo();
    fixture.detectChanges();
    expect(editor.activeSheet.comments?.['A1']?.text).toBe('Meta Q1 revisada');

    // Switch to Insert tab and open Sparklines modal
    const tabs = Array.from(fixture.nativeElement.querySelectorAll('.ribbon-tab')) as HTMLButtonElement[];
    const insertTab = tabs.find((btn) => btn.textContent?.trim() === 'Insert' || btn.textContent?.trim() === 'Insertar');
    expect(insertTab).toBeTruthy();
    insertTab!.click();
    fixture.detectChanges();

    editor.selectionRange = { startCol: 0, startRow: 0, endCol: 3, endRow: 0 };
    const sparkBtn = fixture.nativeElement.querySelector('[data-testid="insert-sparkline-btn"]') as HTMLButtonElement;
    expect(sparkBtn).toBeTruthy();
    sparkBtn.click();
    fixture.detectChanges();
    expect(editor.sparklineModalOpen).toBe(true);

    const applySparkBtn = fixture.nativeElement.querySelector('[data-testid="sparkline-apply-btn"]') as HTMLButtonElement;
    expect(applySparkBtn).toBeTruthy();
    applySparkBtn.click();
    fixture.detectChanges();
    expect(editor.activeSheet.sparklines?.['E1']?.type).toBe('line');

    // Add and remove Stage 2 conditional rules cleanly
    editor.addConditionalRule({
      id: 'rule-db',
      range: { startCol: 0, startRow: 0, endCol: 3, endRow: 0 },
      type: 'dataBar',
      dataBarColor: '#059669',
    });
    expect(editor.activeSheet.conditionalRules?.length).toBe(1);
    editor.removeConditionalRule('rule-db');
    expect(editor.activeSheet.conditionalRules?.length).toBe(0);

    fixture.destroy();
  });

  it('supports Stage 3 multiline Alt+Enter, Paste Special, hidden rows/cols navigation, and sheet tab management', async () => {
    const fixture = TestBed.createComponent(PureSheetEditorComponent);
    const editor = fixture.componentInstance;
    editor.note = {
      ...sampleNote,
      docData: {
        sheets: [
          {
            id: 's1',
            name: 'Principal',
            type: 'grid',
            data: {
              A1: { raw: '10', style: { bold: true, bgColor: '#fef3c7' } },
              B1: { raw: '20', style: { textColor: '#047857' } },
              A2: { raw: '=A1+B1', style: { bold: true } },
            },
          },
          {
            id: 's2',
            name: 'Resumen',
            type: 'grid',
            data: {},
          },
        ],
        activeSheetId: 's1',
      },
    };
    fixture.detectChanges();
    await fixture.whenStable();

    // 1. Multiline Alt+Enter editing swaps to textarea and expands row height on commit
    editor.selectedCell = { col: 2, row: 0 };
    editor.startCellEdit('Primera');
    fixture.detectChanges();
    editor.onCellEditorKeyDown(new KeyboardEvent('keydown', { key: 'Enter', altKey: true, cancelable: true }));
    expect(editor.editingValue).toBe('Primera\n');
    editor.editingValue = 'Primera\nSegunda\nTercera';
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.sheet-canvas-world textarea')).toBeTruthy();
    editor.commitCellEdit();
    expect(editor.activeSheet.data['C1'].raw).toBe('Primera\nSegunda\nTercera');
    expect((editor.activeSheet.rowHeights?.[0] ?? 24)).toBeGreaterThanOrEqual(56);

    // 2. Paste Special (values, formats, transpose)
    editor.clipboard.setInternalMatrix({
      mode: 'copy',
      sheetId: 's1',
      range: { minCol: 0, maxCol: 1, minRow: 0, maxRow: 1 },
      cells: [
        [{ raw: '10', style: { bold: true, bgColor: '#fef3c7' } }, { raw: '20', style: { textColor: '#047857' } }],
        [{ raw: '=A1+B1', style: { bold: true } }, { raw: '' }],
      ],
      merges: [],
      tsvSignature: '10\t20\n30\t',
    });

    editor.selectedCell = { col: 0, row: 4 };
    editor.activeSheet.data['A5'] = { raw: 'Prev', style: { italic: true } };
    await editor.applyPasteSpecial('values');
    expect(editor.activeSheet.data['A5'].raw).toBe('10');
    expect(editor.activeSheet.data['A5'].style?.italic).toBe(true);
    expect(editor.activeSheet.data['A6'].raw).toBe('30');

    editor.selectedCell = { col: 0, row: 7 };
    editor.activeSheet.data['A8'] = { raw: 'MantenerTexto' };
    await editor.applyPasteSpecial('formats');
    expect(editor.activeSheet.data['A8'].raw).toBe('MantenerTexto');
    expect(editor.activeSheet.data['A8'].style?.bgColor).toBe('#fef3c7');

    editor.selectedCell = { col: 4, row: 0 };
    await editor.applyPasteSpecial('transpose');
    expect(editor.activeSheet.data['E1'].raw).toBe('10');
    expect(editor.activeSheet.data['F1'].raw).toBe('=A1+B1');
    expect(editor.activeSheet.data['E2'].raw).toBe('20');

    // 3. Hide / Unhide rows & columns + Arrow navigation skips hidden indices
    editor.selectedCell = { col: 1, row: 1 };
    editor.selectionRange = { startCol: 1, startRow: 1, endCol: 1, endRow: 1 };
    editor.hideSelectedCols();
    expect(editor.activeSheet.hiddenCols).toEqual([1]);
    expect(editor.selectedCell.col).toBe(2);
    editor.moveSelection(-1, 0);
    expect(editor.selectedCell.col).toBe(0); // skipped hidden col 1

    editor.hideSelectedRows();
    expect(editor.activeSheet.hiddenRows).toEqual([1]);
    expect(editor.selectedCell.row).toBe(2);
    editor.unhideCols();
    editor.unhideRows();
    expect(editor.activeSheet.hiddenCols).toBeUndefined();
    expect(editor.activeSheet.hiddenRows).toBeUndefined();

    // 4. Duplicate sheet, reorder tabs & set tabColor
    editor.setSheetTabColor('s1', '#0284c7');
    expect(editor.sheets[0].tabColor).toBe('#0284c7');
    editor.duplicateSheet('s1');
    expect(editor.sheets.length).toBe(3);
    expect(editor.sheets[1].name).toContain('Principal');
    const dupId = editor.sheets[1].id;
    editor.moveSheet(dupId, 1);
    expect(editor.sheets[2].id).toBe(dupId);

    fixture.destroy();
  });

  it('supports cell hyperlinks (Ctrl+K, sanitization, safe window.open) and textRotation formatting', async () => {
    const fixture = TestBed.createComponent(PureSheetEditorComponent);
    const editor = fixture.componentInstance;
    editor.note = structuredClone(sampleNote);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    // Open hyperlink popover with Ctrl+K
    editor.selectedCell = { col: 0, row: 0 };
    editor.selectionRange = { startCol: 0, startRow: 0, endCol: 0, endRow: 0 };
    editor.handleGlobalKeyDown(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, cancelable: true }));
    expect(editor.hyperlinkEditorState?.cellId).toBe('A1');

    // Reject javascript: scheme
    editor.hyperlinkEditorState!.url = 'javascript:alert(1)';
    editor.saveCellHyperlink();
    expect(editor.hyperlinkEditorState?.error).toBeTruthy();
    expect(editor.activeSheet.data['A1']?.hyperlink).toBeUndefined();

    // Save valid bare domain (normalizes to https://)
    editor.hyperlinkEditorState!.url = 'weave.app/docs';
    editor.hyperlinkEditorState!.label = 'Documentación';
    editor.saveCellHyperlink();
    expect(editor.hyperlinkEditorState).toBeNull();
    expect(editor.activeSheet.data['A1']).toMatchObject({ raw: 'Documentación', hyperlink: 'https://weave.app/docs' });

    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    editor.openCellHyperlink(0, 0);
    expect(openSpy).toHaveBeenCalledWith('https://weave.app/docs', '_blank', 'noopener,noreferrer');
    openSpy.mockRestore();

    // Remove hyperlink and undo
    editor.removeCellHyperlink(0, 0);
    expect(editor.activeSheet.data['A1']?.hyperlink).toBeUndefined();
    editor.handleUndo();
    expect(editor.activeSheet.data['A1']?.hyperlink).toBe('https://weave.app/docs');

    // Apply textRotation formatting
    editor.applyStyleChange({ textRotation: 45 });
    expect(editor.activeSheet.data['A1']?.style?.textRotation).toBe(45);

    fixture.destroy();
  });

  it('enforces sheet protection on locked cells while allowing unlocked cells and supports row/col outline grouping', async () => {
    const fixture = TestBed.createComponent(PureSheetEditorComponent);
    const editor = fixture.componentInstance;
    editor.note = structuredClone(sampleNote);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    // Seed A1 (locked by default) and unlock B1 before protecting
    editor.activeSheet.data['A1'] = { raw: 'Protegida' };
    editor.selectedCell = { col: 1, row: 0 };
    editor.selectionRange = { startCol: 1, startRow: 0, endCol: 1, endRow: 0 };
    editor.toggleSelectionLocked();
    expect(editor.activeSheet.data['B1']?.style?.locked).toBe(false);

    editor.toggleSheetProtection();
    expect(editor.activeSheet.protected).toBe(true);

    // Locked cell A1 blocks edit, clear, and styling
    editor.selectedCell = { col: 0, row: 0 };
    editor.selectionRange = { startCol: 0, startRow: 0, endCol: 0, endRow: 0 };
    editor.startCellEdit();
    expect(editor.isEditing).toBe(false);
    expect(editor.editorNotice).toContain('protegida');
    editor.handleClearContent();
    expect(editor.activeSheet.data['A1']?.raw).toBe('Protegida');
    editor.applyStyleChange({ bold: true });
    expect(editor.activeSheet.data['A1']?.style?.bold).toBeUndefined();

    // Unlocked cell B1 allows edit and styling even with sheet protected
    editor.selectedCell = { col: 1, row: 0 };
    editor.selectionRange = { startCol: 1, startRow: 0, endCol: 1, endRow: 0 };
    editor.startCellEdit();
    expect(editor.isEditing).toBe(true);
    editor.editingValue = 'Permitida';
    editor.commitCellEdit();
    expect(editor.activeSheet.data['B1']?.raw).toBe('Permitida');
    editor.applyStyleChange({ bold: true });
    expect(editor.activeSheet.data['B1']?.style?.bold).toBe(true);

    // Group & collapse rows 1..2, then expand & ungroup
    editor.selectedCell = { col: 0, row: 1 };
    editor.selectionRange = { startCol: 0, startRow: 1, endCol: 0, endRow: 2 };
    editor.groupSelection('row');
    expect(editor.activeSheet.rowGroups).toEqual([{ start: 1, end: 2, collapsed: false }]);

    editor.toggleOutlineGroup('row', 0);
    expect(editor.activeSheet.rowGroups).toEqual([{ start: 1, end: 2, collapsed: true }]);
    expect(editor.activeSheet.hiddenRows).toEqual([1, 2]);
    expect(editor.selectedCell.row).toBe(3);

    editor.toggleOutlineGroup('row', 0);
    expect(editor.activeSheet.hiddenRows).toBeUndefined();

    editor.selectedCell = { col: 0, row: 1 };
    editor.selectionRange = { startCol: 0, startRow: 1, endCol: 0, endRow: 2 };
    editor.ungroupSelection('row');
    expect(editor.activeSheet.rowGroups).toBeUndefined();

    fixture.destroy();
  });

  it('announces protection, validation, hyperlinks, outline groups and pointer cursor for outlineToggle in Canvas a11y', async () => {
    const fixture = TestBed.createComponent(PureSheetEditorComponent);
    const editor = fixture.componentInstance;
    editor.note = structuredClone(sampleNote);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    editor.activeSheet.freezePanes = { cols: 1, rows: 1 };
    editor.activeSheet.data['A1'] = { raw: 'KPI', hyperlink: 'https://weave.app' };
    editor.activeSheet.validations = { A1: { type: 'list', formula1: 'Alta,Baja', showDropdown: true } };
    editor.selectedCell = { col: 0, row: 0 };
    editor.selectionRange = { startCol: 0, startRow: 0, endCol: 0, endRow: 2 };
    editor.groupSelection('row');
    editor.selectionRange = { startCol: 0, startRow: 0, endCol: 0, endRow: 0 };
    editor.toggleSheetProtection();
    editor.canvasGrid?.renderNow(true);
    fixture.detectChanges();

    const a11yCell = fixture.nativeElement.querySelector('#sheet-a11y-active-cell') as HTMLElement;
    expect(a11yCell.getAttribute('aria-readonly')).toBe('true');
    const summary = a11yCell.textContent || '';
    expect(summary).toContain('protegida de solo lectura');
    expect(summary).toContain('enlace https://weave.app');
    expect(summary).toContain('con lista desplegable de validación');
    expect(summary).toContain('panel inmovilizado');
    expect(summary).toContain('en grupo de filas');

    expect((editor.canvasGrid as any).cursorForHit({ kind: 'outlineToggle', axis: 'row', groupIndex: 0 })).toBe('pointer');
    fixture.destroy();
  });

  it('runs background recalculation and hydrates cell.computed safely on recalculateSheet', async () => {
    const fixture = TestBed.createComponent(PureSheetEditorComponent);
    fixture.componentInstance.note = structuredClone(sampleNote);
    fixture.detectChanges();
    await fixture.whenStable();
    const editor = fixture.componentInstance;

    editor.activeSheet.data = {
      A1: { raw: '15' },
      A2: { raw: '25' },
      A3: { raw: '=SUM(A1:A2)' },
    };
    editor.recalculateSheet();
    await Promise.resolve();
    await Promise.resolve();

    expect(editor.activeSheet.data['A3'].computed).toBe(40);
    expect(editor.getCellValue(0, 2)).toBe(40);
    fixture.destroy();
  });

  it('persists pivot definition and recomputes target range when refreshPivotTables runs', () => {
    component.ngOnInit();
    component.activeSheet.data = {
      A1: { raw: 'Area' },
      B1: { raw: 'Monto' },
      A2: { raw: 'Ventas' },
      B2: { raw: '100' },
      A3: { raw: 'Ventas' },
      B3: { raw: '50' },
    };

    component.applyPivotTable({
      range: { startCol: 0, startRow: 0, endCol: 1, endRow: 2 },
      rowCol: 0,
      colCol: null,
      valueCol: 1,
      aggregation: 'sum',
      destination: 'newSheet',
    });

    expect(component.activeSheet.pivotTables).toHaveLength(1);
    expect(component.getCellValue(1, 1)).toBe(150);

    // Update source cell on first sheet, then refresh PivotTable
    component.sheets[0].data['B3'] = { raw: '200' };
    component.refreshPivotTables();
    expect(component.getCellValue(1, 1)).toBe(300);
    expect(component.editorNotice).toContain('actualizada');
  });

  it('keeps bottom tabs strictly on a single row and connects keyboard grid focus to #sheet-a11y-active-cell', async () => {
    const fixture = TestBed.createComponent(PureSheetEditorComponent);
    const editor = fixture.componentInstance;
    editor.note = {
      ...structuredClone(sampleNote),
      docData: {
        sheets: Array.from({ length: 18 }, (_, i) => ({
          id: `s-${i}`,
          name: `Hoja Larga Numero ${i + 1}`,
          type: 'grid' as const,
          data: i === 0 ? { A1: { raw: 'Inicio' }, B1: { raw: 'Meta' } } : {},
        })),
        activeSheetId: 's-0',
      },
    };
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    const footer = host.querySelector('.sheet-footer') as HTMLElement;
    const tabsScroll = host.querySelector('.sheet-tabs-scroll') as HTMLElement;
    expect(footer.className).toContain('flex-nowrap');
    expect(footer.className).toContain('max-h-9');
    expect(tabsScroll.querySelectorAll('.sheet-tab')).toHaveLength(18);

    // Open All Sheets dropdown and switch to the 12th sheet
    (host.querySelector('[data-testid="sheet-list-toggle"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(host.querySelectorAll('[data-sheet-list-id]')).toHaveLength(18);
    (host.querySelector('[data-sheet-list-id="s-11"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(editor.activeSheetId).toBe('s-11');

    // Switch back and test keyboard navigation + focusable ARIA grid contract
    editor.switchSheet('s-0');
    editor.canvasGrid?.renderNow(true);
    fixture.detectChanges();

    const gridEl = host.querySelector('[role="grid"]') as HTMLElement;
    expect(gridEl.getAttribute('tabindex')).toBe('0');
    expect(gridEl.getAttribute('aria-rowcount')).toBe('1000');
    expect(gridEl.getAttribute('aria-colcount')).toBe('100');
    expect(gridEl.getAttribute('aria-activedescendant')).toBe('sheet-a11y-active-cell');

    const a11yCell = gridEl.querySelector('#sheet-a11y-active-cell') as HTMLElement;
    expect(a11yCell).toBeTruthy();
    expect(a11yCell.getAttribute('data-active-cell')).toBe('A1');

    gridEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    editor.canvasGrid?.renderNow(true);
    fixture.detectChanges();
    expect(a11yCell.getAttribute('data-active-cell')).toBe('B1');
    expect(a11yCell.getAttribute('aria-colindex')).toBe('2');
    expect(a11yCell.textContent).toContain('B1: Meta');

    fixture.destroy();
  });

  it('initializes a newly created Excel note with a single empty sheet', () => {
    const emptyNote: Note = {
      ...structuredClone(sampleNote),
      _id: 'sheet-note-empty',
      docData: undefined,
    };
    component.note = emptyNote;
    component.ngOnInit();

    expect(component.sheets).toHaveLength(1);
    expect(component.sheets[0].id).toBe('sheet1');
    expect(component.sheets[0].name).toBe('Sheet1');
    expect(component.sheets[0].type).toBe('grid');
    expect(component.sheets[0].data).toEqual({});
    expect(component.activeSheetId).toBe('sheet1');
  });

});
