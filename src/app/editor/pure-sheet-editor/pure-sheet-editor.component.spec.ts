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
  });

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
    component.selectedCell = { col: 25, row: 99 };
    const event = new Event('paste', { cancelable: true }) as ClipboardEvent;
    Object.defineProperty(event, 'clipboardData', { value: { getData: (type: string) => type === 'text/html' ? '<table><tr><th>Name</th><th>Value</th></tr><tr><td>Item</td><td>12</td></tr></table>' : '' } });
    component.onGridPaste(event);
    expect(event.defaultPrevented).toBe(true);
    expect(component.activeSheet.data['AA101'].raw).toBe('12');
    expect(component.activeSheet.data['Z100'].style?.bold).toBe(true);
    expect(component.totalCols).toBe(27);
    expect(component.totalRows).toBe(101);
    component.handleUndo();
    expect(component.activeSheet.data['AA101']).toBeUndefined();
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
      expect(fixture.nativeElement.querySelectorAll('td[data-cell-id]').length).toBeLessThan(1000);
      expect(fixture.nativeElement.querySelector('[data-cell-id="A1"]').textContent.trim()).toBe(sheet.data.A1.raw);
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
    container.scrollTop = 1048575 * 24; container.scrollLeft = 16383 * 84;
    container.dispatchEvent(new Event('scroll'));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-cell-id="XFD1048576"]').textContent.trim()).toBe('Final');
    expect(fixture.nativeElement.querySelectorAll('td[data-cell-id]').length).toBeLessThan(1000);
    container.scrollTop = 0; container.scrollLeft = 0; container.dispatchEvent(new Event('scroll'));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-cell-id="A1"]').textContent.trim()).toBe('Inicio');
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
    expect(fixture.nativeElement.querySelector('[data-cell-id="AA5000"]').textContent.trim()).toBe('123');
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
    const anchor = fixture.nativeElement.querySelector('[data-cell-id="A1"]') as HTMLTableCellElement;
    expect(anchor.colSpan).toBe(2); expect(anchor.rowSpan).toBe(2);
    expect(anchor.textContent.trim()).toBe('Cabecera');
    expect(fixture.nativeElement.querySelector('[data-cell-id="B1"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('[data-cell-id="A2"]')).toBeNull();
    anchor.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true }));
    fixture.detectChanges();
    expect(fixture.componentInstance.selectionRange).toEqual({ startCol: 0, startRow: 0, endCol: 1, endRow: 1 });
    const separate = fixture.nativeElement.querySelector('button[title="Separar celdas"]') as HTMLButtonElement;
    separate.click(); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-cell-id="B1"]').textContent.trim()).toBe('Conservado');
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
    expect(fixture.nativeElement.querySelectorAll('td[data-cell-id]').length).toBe(1);
    const container = editor.gridContainer!.nativeElement;
    container.scrollTop = 10000; container.scrollLeft = 5000; container.dispatchEvent(new Event('scroll')); fixture.detectChanges();
    const anchor = fixture.nativeElement.querySelector('[data-cell-id="A1"]') as HTMLTableCellElement;
    expect(anchor.textContent.trim()).toBe('Título grande');
    expect(anchor.rowSpan).toBeLessThan(50); expect(anchor.colSpan).toBeLessThan(25);
    expect(fixture.nativeElement.querySelectorAll('td[data-cell-id]').length).toBe(1);
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
    (fixture.nativeElement.querySelector('[data-cell-id="A3"]') as HTMLElement).dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true }));
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
    component.ngOnInit(); component.activeSheet.data = { A1: { raw: '=SEQUENCE(150)' } };
    expect(component.totalRows).toBe(150); expect(component.getCellValue(0, 149)).toBe(150);
    component.selectedCell = { col: 0, row: 1 }; component.startCellEdit('x');
    expect(component.isEditing).toBe(false); expect(component.editorNotice).toContain('A1');
    expect(component.activeSheet.data['A2']).toBeUndefined();
    component.applyPastedCells([[{ raw: 'blocked' }]]);
    expect(component.activeSheet.data['A2']).toBeUndefined();
    component.renameSheet(component.activeSheet, 'Nueva');
    expect(component.getCellValue(0, 149)).toBe(150);
  });

});
