import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { ExcelChartDataModalComponent } from './excel-chart-data-modal.component';
import { ExcelChartRendererComponent } from '../excel-chart-renderer/excel-chart-renderer.component';
import { ChartDataConfig, SelectionRange } from '../../models/excel.model';

describe('Chart data selection', () => {
  it('previews a middle X column and isolated first/last series, applying without mutating the original chart', () => {
    const fixture = TestBed.createComponent(ExcelChartDataModalComponent);
    const chart = { id: 'chart1', title: 'Line', category: 'line', subType: 'line', range: { startCol: 0, startRow: 0, endCol: 4, endRow: 1 }, x: 0, y: 0, width: 480, height: 300 };
    fixture.componentRef.setInput('chart', chart);
    fixture.componentRef.setInput('grid', { A1: { raw: 'Sales' }, B1: { raw: 'Ignored' }, C1: { raw: 'Product' }, D1: { raw: 'Ignored' }, E1: { raw: 'Profit' }, A2: { raw: '100' }, C2: { raw: 'Laptop' }, E2: { raw: '20' } });
    fixture.detectChanges();
    const select = fixture.nativeElement.querySelector('#chart-x-column') as HTMLSelectElement;
    select.value = '2'; select.dispatchEvent(new Event('change')); fixture.detectChanges();
    const checkboxes = fixture.nativeElement.querySelectorAll('.series input') as NodeListOf<HTMLInputElement>;
    [0, 4].forEach(index => { if (!checkboxes[index].checked) checkboxes[index].click(); });
    [1, 3].forEach(index => { if (checkboxes[index].checked) checkboxes[index].click(); });
    fixture.detectChanges();
    expect(fixture.componentInstance.config).toEqual({ xColumn: 2, seriesColumns: [0, 4], hasHeaders: true });
    expect(fixture.nativeElement.querySelector('.preview-chart').textContent).toContain('Laptop');
    expect('dataConfig' in chart).toBe(false);
    let applied: { range: SelectionRange; config: ChartDataConfig } | undefined;
    fixture.componentInstance.apply.subscribe(value => applied = value);
    (fixture.nativeElement.querySelector('.confirm') as HTMLButtonElement).click();
    expect(applied?.config.seriesColumns).toEqual([0, 4]);
    expect('dataConfig' in chart).toBe(false);
  });
  it('previews legend/title positions and switches from stacked to independent series without editing the source', () => {
    const fixture = TestBed.createComponent(ExcelChartDataModalComponent);
    const chart = { id: 'chart2', title: 'Line', category: 'line', subType: 'stackedLine', range: { startCol: 0, startRow: 0, endCol: 1, endRow: 1 }, x: 0, y: 0, width: 480, height: 300 };
    fixture.componentRef.setInput('chart', chart);
    fixture.componentRef.setInput('grid', { A1: { raw: 'Product' }, B1: { raw: 'Sales' }, A2: { raw: 'Laptop' }, B2: { raw: '100' } });
    fixture.componentRef.setInput('initialTab', 'appearance'); fixture.detectChanges();
    const choose = (selector: string, value: string) => {
      const select = fixture.nativeElement.querySelector(selector) as HTMLSelectElement;
      select.value = value; select.dispatchEvent(new Event('change')); fixture.detectChanges();
    };
    choose('#chart-legend-position', 'right'); choose('#chart-title-position', 'bottom'); choose('#chart-series-mode', 'normal');
    expect(chart.subType).toBe('stackedLine');
    expect(fixture.componentInstance.subType).toBe('line');
    let result: any;
    fixture.componentInstance.apply.subscribe(value => result = value);
    (fixture.nativeElement.querySelector('.confirm') as HTMLButtonElement).click();
    expect(result.appearance.legendPosition).toBe('right');
    expect(result.appearance.titlePosition).toBe('bottom');
    expect(result.subType).toBe('line');
    expect(result.dataEdited).toBe(false);
  });

  it('previews colors separately, can restore the palette, and applies them without mutating the original chart', () => {
    const fixture = TestBed.createComponent(ExcelChartDataModalComponent);
    const chart = { id: 'colors', title: 'Line', category: 'line', subType: 'line', range: { startCol: 0, startRow: 0, endCol: 1, endRow: 1 }, x: 0, y: 0, width: 480, height: 300 };
    fixture.componentRef.setInput('chart', chart);
    fixture.componentRef.setInput('grid', { A1: { raw: 'Product' }, B1: { raw: 'Sales' }, A2: { raw: 'Laptop' }, B2: { raw: '100' } });
    fixture.componentRef.setInput('initialTab', 'appearance'); fixture.detectChanges();
    const color = fixture.nativeElement.querySelector('input[type="color"]') as HTMLInputElement;
    color.value = '#ff5500'; color.dispatchEvent(new Event('input')); fixture.detectChanges();
    expect(fixture.componentInstance.seriesColors['column:1']).toBe('#ff5500');
    expect('seriesColors' in chart).toBe(false);
    const renderer = fixture.debugElement.query(By.directive(ExcelChartRendererComponent)).componentInstance as ExcelChartRendererComponent;
    expect(renderer.toPlotState().getColor(0)).toBe('#ff5500');
    expect((fixture.nativeElement.querySelector('.chart-legend .font-medium') as HTMLElement).style.color).toBe('rgb(255, 85, 0)');
    expect(fixture.nativeElement.querySelector('.preview-chart canvas.plot-canvas')).toBeTruthy();
    fixture.componentInstance.resetSeriesColor('column:1');
    expect(fixture.componentInstance.seriesColors).toEqual({});
    fixture.componentInstance.setSeriesColor('column:1', '#00aa55');
    let result: any;
    fixture.componentInstance.apply.subscribe(value => result = value);
    fixture.componentInstance.confirm();
    expect(result.seriesColors).toEqual({ 'column:1': '#00aa55' });
    expect(result.dataEdited).toBe(false);
    expect('seriesColors' in chart).toBe(false);
  });

});
