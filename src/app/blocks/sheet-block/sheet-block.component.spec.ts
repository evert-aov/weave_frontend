import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { SheetBlockComponent } from './sheet-block.component';
import { NotesService } from '../../core/services/notes.service';
import { ThemeService } from '../../core/services/theme.service';
import { I18nService } from '../../core/services/i18n.service';
import { AiDocumentService } from '../../core/services/ai-document.service';
import { Block } from '../../core/models/block.model';

describe('SheetBlockComponent (Canvas)', () => {
  function setup(isDark = false, isReadingMode = false) {
    const updateBlockContent = vi.fn();
    const isDarkSig = signal(isDark);
    const readingSig = signal(isReadingMode);
    const notesServiceStub = {
      isReadingMode: readingSig,
      currentNote: signal({ _id: 'note-1', title: 'Test' }),
      updateBlockContent,
    };
    const themeServiceStub = { isDark: isDarkSig };
    const i18nStub = { currentLang: signal<'es' | 'en'>('es') };
    const aiDocumentsStub = { register: vi.fn(() => () => {}) };

    TestBed.configureTestingModule({
      imports: [SheetBlockComponent],
      providers: [
        { provide: NotesService, useValue: notesServiceStub },
        { provide: ThemeService, useValue: themeServiceStub },
        { provide: I18nService, useValue: i18nStub },
        { provide: AiDocumentService, useValue: aiDocumentsStub },
      ],
    });

    const fixture = TestBed.createComponent(SheetBlockComponent);
    const block: Block = {
      id: 'block-sheet-1',
      type: 'sheet',
      content: {},
      order: 0,
    };
    fixture.componentInstance.block = block;
    fixture.detectChanges();

    return { fixture, component: fixture.componentInstance, isDarkSig, readingSig, updateBlockContent };
  }

  it('renders the sheet block using Canvas instead of HTML tables and preserves accessibility summary', () => {
    const { fixture, component } = setup();
    const el: HTMLElement = fixture.nativeElement;

    expect(el.querySelector('table')).toBeNull();
    const canvas = el.querySelector('canvas');
    expect(canvas).toBeTruthy();
    expect(canvas?.getAttribute('role')).toBe('grid');
    expect(canvas?.getAttribute('aria-rowcount')).toBe('12');
    expect(canvas?.getAttribute('aria-colcount')).toBe('8');

    // Evaluates default sample formula =SUMA(D2:D3) -> 145
    expect(component.getCellDisplay(3, 3)).toContain('145');
  });

  it('keeps editable cells light in dark mode while darkening chrome/headers on Canvas frame', () => {
    const { component } = setup(true, false);
    const frame = component.renderCanvas();
    expect(frame).toBeTruthy();
    expect(frame!.isDarkChrome).toBe(true);
    expect(frame!.palette.cellBg).toBe('#ffffff');
    expect(frame!.palette.headerBg).toBe('#1e293b');
  });

  it('supports cell editing via positioned light input and schedules save on commit', async () => {
    vi.useFakeTimers();
    try {
      const { fixture, component, updateBlockContent } = setup(true, false);
      component.onCellDblClick(1, 1); // B2 = '3'
      fixture.detectChanges();

      expect(component.isEditing).toBe(true);
      const input = fixture.nativeElement.querySelector('input') as HTMLInputElement | null;
      expect(input).toBeTruthy();
      expect(input?.classList.contains('bg-white')).toBe(true);
      expect(input?.classList.contains('text-slate-900')).toBe(true);

      component.editingValue = '10';
      component.commitEdit();
      expect(component.getCellDisplay(1, 1)).toBe('10');
      expect(component.getCellDisplay(3, 1)).toContain('150'); // =B2*C2 => 10*15

      vi.advanceTimersByTime(450);
      expect(updateBlockContent).toHaveBeenCalledWith('block-sheet-1', expect.objectContaining({ data: component.grid }));
    } finally {
      vi.useRealTimers();
    }
  });

  it('blocks cell editing in reading mode and updates zoom factor cleanly', () => {
    const { fixture, component } = setup(false, true);
    component.onCellClick(2, 2);
    component.onCellDblClick(2, 2);
    expect(component.isEditing).toBe(false);
    expect(component.selectedCell).toEqual({ col: 0, row: 0 });

    component.zoomIn();
    expect(component.currentZoom()).toBe(1.1);
    fixture.detectChanges();
    const canvas = fixture.nativeElement.querySelector('canvas') as HTMLCanvasElement;
    expect(canvas.style.width).toBe(`${Math.round(component.contentWidth * 1.1)}px`);
  });
});
