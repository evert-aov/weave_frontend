import { TestBed } from '@angular/core/testing';
import { ExcelChartModalComponent, CHART_CATEGORIES_DEF } from './excel-chart-modal.component';
import { ExcelChartRendererComponent } from '../excel-chart-renderer/excel-chart-renderer.component';
import { By } from '@angular/platform-browser';

describe('Excel chart selection', () => {
  async function create() {
    await TestBed.configureTestingModule({ imports: [ExcelChartModalComponent] }).compileComponents();
    const fixture = TestBed.createComponent(ExcelChartModalComponent);
    fixture.componentRef.setInput('grid', {
      A1: { raw: 'Product' }, B1: { raw: 'Sales' }, C1: { raw: 'Units' },
      A2: { raw: 'Laptop' }, B2: { raw: '150' }, C2: { raw: '10' },
      A3: { raw: 'Monitor' }, B3: { raw: '80' }, C3: { raw: '8' },
    });
    fixture.componentRef.setInput('range', { startCol: 0, startRow: 0, endCol: 2, endRow: 2 });
    fixture.detectChanges();
    return fixture;
  }

  it('renders a populated live preview for every category and subtype', async () => {
    const fixture = await create();
    for (const [categoryIndex, category] of CHART_CATEGORIES_DEF.entries()) {
      (fixture.nativeElement.querySelectorAll('.category')[categoryIndex] as HTMLButtonElement).click();
      fixture.detectChanges();
      for (const [subtypeIndex, subtype] of category.subTypes.entries()) {
        (fixture.nativeElement.querySelectorAll('.subtype')[subtypeIndex] as HTMLButtonElement).click();
        fixture.detectChanges();
        const renderer = fixture.debugElement.query(By.directive(ExcelChartRendererComponent)).componentInstance as ExcelChartRendererComponent;
        expect(renderer.category).toBe(category.id);
        expect(renderer.subType).toBe(subtype.id);
        expect(renderer.chartData().rows.length).toBe(2);
        const canvas = fixture.nativeElement.querySelector('.chart-preview canvas.plot-canvas') as HTMLCanvasElement | null;
        expect(canvas).toBeTruthy();
        expect(Number(canvas?.getAttribute('data-renders') || 0)).toBeGreaterThan(0);
        expect(fixture.nativeElement.querySelector('.chart-preview').innerHTML).not.toMatch(/NaN|Infinity/);
      }
    }
  }, 15000);

  it('selects thumbnails, switches tabs, and confirms the displayed subtype', async () => {
    const fixture = await create();
    const thumbnails = fixture.nativeElement.querySelectorAll('.subtype') as NodeListOf<HTMLButtonElement>;
    thumbnails[1].click();
    fixture.detectChanges();
    expect(fixture.componentInstance.activeSubType).toBe('stackedColumn');
    expect(thumbnails[1].getAttribute('aria-pressed')).toBe('true');
    const tabs = fixture.nativeElement.querySelectorAll('[role="tab"]') as NodeListOf<HTMLButtonElement>;
    tabs[0].click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('.category').length).toBe(6);
    let selected: unknown;
    fixture.componentInstance.selectChart.subscribe(value => selected = value);
    (fixture.nativeElement.querySelector('.confirm') as HTMLButtonElement).click();
    expect(selected).toEqual({ category: 'column', subType: 'stackedColumn' });
  });
});
