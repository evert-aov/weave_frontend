import { ComponentFixture, TestBed } from '@angular/core/testing';
import { WordTableToolbarComponent } from './word-table-toolbar.component';
import { I18nService } from '../../../../core/services/i18n.service';

describe('WordTableToolbarComponent', () => {
  let component: WordTableToolbarComponent;
  let fixture: ComponentFixture<WordTableToolbarComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [WordTableToolbarComponent],
      providers: [I18nService],
    }).compileComponents();

    fixture = TestBed.createComponent(WordTableToolbarComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('renders table toolbar with all customization groups when hasActiveTable is true', () => {
    fixture.componentRef.setInput('hasActiveTable', true);
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.style-options-group')).toBeTruthy();
    expect(el.querySelector('.presets-group')).toBeTruthy();
    expect(el.querySelector('.shading-group')).toBeTruthy();
    expect(el.querySelector('.borders-group')).toBeTruthy();
    expect(el.querySelector('.rows-cols-group')).toBeTruthy();
    expect(el.querySelector('.merge-group')).toBeTruthy();
    expect(el.querySelector('.align-group')).toBeTruthy();
  });

  it('renders empty state with quick insert button when hasActiveTable is false', () => {
    fixture.componentRef.setInput('hasActiveTable', false);
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.empty-state-group')).toBeTruthy();
    expect(el.querySelector('.style-options-group')).toBeNull();
  });

  it('emits modifyTable events for rows, cols, cell split and delete', () => {
    const emitted: string[] = [];
    component.modifyTable.subscribe((act) => emitted.push(act));

    component.modifyTable.emit('addRowAbove');
    component.modifyTable.emit('addRowBelow');
    component.modifyTable.emit('addColLeft');
    component.modifyTable.emit('addColRight');
    component.modifyTable.emit('splitCell');
    component.modifyTable.emit('delRow');
    component.modifyTable.emit('delCol');
    component.modifyTable.emit('delTable');

    expect(emitted).toEqual([
      'addRowAbove',
      'addRowBelow',
      'addColLeft',
      'addColRight',
      'splitCell',
      'delRow',
      'delCol',
      'delTable',
    ]);
  });

  it('emits applyTableStyle when selecting a preset style', () => {
    const emittedStyles: any[] = [];
    component.applyTableStyle.subscribe((val) => emittedStyles.push(val));

    const apaPreset = component.presets.find((p) => p.id === 'apa');
    expect(apaPreset).toBeDefined();
    component.selectPreset(apaPreset!);

    expect(emittedStyles.length).toBe(1);
    expect(emittedStyles[0].rule.borders).toBe('horizontal');
    expect(emittedStyles[0].rule.borderColor).toBe('#0f172a');
    expect(emittedStyles[0].fixed).toBe(true);
  });

  it('toggles header, bandedRows, headerBold and emits style update', () => {
    const emittedStyles: any[] = [];
    component.applyTableStyle.subscribe((val) => emittedStyles.push(val));

    const initialHeader = component.currentRule().header;
    component.toggleOption('header');
    expect(component.currentRule().header).toBe(!initialHeader);
    expect(emittedStyles.length).toBe(1);

    component.toggleOption('bandedRows');
    expect(component.currentRule().bandedRows).toBe(true);
    expect(emittedStyles.length).toBe(2);
  });

  it('emits setCellBackground with chosen color or null for transparent', () => {
    const backgrounds: (string | null)[] = [];
    component.setCellBackground.subscribe((c) => backgrounds.push(c));

    component.onSelectShading('#dbeafe');
    component.onSelectShading(null);

    expect(backgrounds).toEqual(['#dbeafe', null]);
  });

  it('emits setVerticalAlign, toggleRowTopBorder and distributeColumns', () => {
    const vAligns: string[] = [];
    let topBorderToggled = false;
    let distributed = false;

    component.setVerticalAlign.subscribe((v) => vAligns.push(v));
    component.toggleRowTopBorder.subscribe(() => (topBorderToggled = true));
    component.distributeColumns.subscribe(() => (distributed = true));

    component.setVerticalAlign.emit('middle');
    component.toggleRowTopBorder.emit();
    component.distributeColumns.emit();

    expect(vAligns).toEqual(['middle']);
    expect(topBorderToggled).toBe(true);
    expect(distributed).toBe(true);
  });

  it('emits insertTable on quick insert', () => {
    const inserted: { rows: number; cols: number }[] = [];
    component.insertTable.subscribe((tbl) => inserted.push(tbl));

    component.insertRows = 4;
    component.insertCols = 5;
    component.onInsertTableQuick();

    expect(inserted).toEqual([{ rows: 4, cols: 5 }]);
  });

  it('renders English and Spanish labels via I18nService', () => {
    const i18n = TestBed.inject(I18nService);
    fixture.componentRef.setInput('hasActiveTable', true);

    i18n.setLanguage('en');
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Header row');
    expect(el.textContent).toContain('Shading');
    expect(el.textContent).toContain('Delete table');
    expect(el.textContent).toContain('Split cell');

    i18n.setLanguage('es');
    fixture.detectChanges();
    expect(el.textContent).toContain('Fila encabezado');
    expect(el.textContent).toContain('Sombreado');
    expect(el.textContent).toContain('Borrar tabla');
    expect(el.textContent).toContain('Dividir celda');
  });

  it('emits setCellPadding without re-applying full table style so custom per-cell colors are preserved', () => {
    const emittedStyles: any[] = [];
    const emittedPaddings: number[] = [];
    component.applyTableStyle.subscribe((val) => emittedStyles.push(val));
    component.setCellPadding.subscribe((pt) => emittedPaddings.push(pt));

    const striped = component.presets.find((p) => p.id === 'striped')!;
    component.selectPreset(striped);
    expect(emittedStyles.length).toBe(1);
    expect(emittedStyles[0].rule.headerBackgroundColor).toBe('#2563eb');
    expect(emittedStyles[0].rule.bandedRows).toBe(true);

    component.applyCellPadding(12);
    expect(emittedPaddings).toEqual([12]);
    expect(emittedStyles.length).toBe(1);
    expect(component.currentRule().cellPaddingPt).toBe(12);
    expect(component.currentRule().headerBackgroundColor).toBe('#2563eb');
    expect(component.currentRule().headerColor).toBe('#ffffff');
    expect(component.currentRule().bandedRows).toBe(true);
    expect(component.currentRule().bandColor).toBe('#f8fafc');
  });
});
