import { bindWorkbookFormulaContext } from '../../services/formula-engine.service';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { extractChartDataFromGrid, ExcelChartRendererComponent } from './excel-chart-renderer.component';
import { Sheet, SheetGrid } from '../../models/excel.model';

describe('ExcelChartRendererComponent', () => {
  let component: ExcelChartRendererComponent;
  let fixture: ComponentFixture<ExcelChartRendererComponent>;

  const mockGrid: SheetGrid = {
    A1: { raw: 'Producto' },
    B1: { raw: 'Q1' },
    C1: { raw: 'Q2' },
    A2: { raw: 'Laptops', computed: 'Laptops' },
    B2: { raw: '150', computed: 150 },
    C2: { raw: '200', computed: 200 },
    A3: { raw: 'Monitores', computed: 'Monitores' },
    B3: { raw: '80', computed: 80 },
    C3: { raw: '110', computed: 110 },
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ExcelChartRendererComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(ExcelChartRendererComponent);
    component = fixture.componentInstance;
    component.grid = mockGrid;
    component.range = { startCol: 0, startRow: 0, endCol: 2, endRow: 2 };
    component.category = 'column';
    component.subType = 'clusteredColumn';
    fixture.detectChanges();
  });

  it('should create and extract chart data', () => {
    expect(component).toBeTruthy();
    expect(component.chartData().rows.length).toBeGreaterThan(0);
    expect(component.chartData().seriesKeys).toContain('Q1');
  });

  it('should render bar groups for column charts', () => {
    const barGroups = component.barGroups();
    expect(barGroups.length).toBe(2);
    expect(barGroups[0].bars.length).toBe(2);
  });

  it('should support pie chart slices calculation', () => {
    component.category = 'pie';
    component.subType = 'doughnut';
    fixture.detectChanges();
    const slices = component.pieSlices();
    expect(slices.length).toBe(2);
    expect(slices[0].pct).toBeGreaterThan(0);
  });

  it('should support line and area series calculation', () => {
    component.category = 'line';
    fixture.detectChanges();
    const lines = component.lineSeries();
    expect(lines.length).toBe(2);
    expect(lines[0].points.length).toBe(2);

    const areas = component.areaSeries();
    expect(areas.length).toBe(2);
    expect(areas[0].dArea).toContain('Z');
  });

  it('should support radar, treemap, and stock calculations', () => {
    component.category = 'radar';
    fixture.detectChanges();
    const radar = component.radarData();
    expect(radar.spokes.length).toBe(2);

    component.category = 'treemap';
    fixture.detectChanges();
    const tiles = component.treemapTiles();
    expect(tiles.length).toBe(2);

    component.category = 'stock';
    fixture.detectChanges();
    const stocks = component.stockItems();
    expect(stocks.length).toBe(2);
  });
  it('recomputes percentage stacks when the subtype changes without changing the grid', () => {
    fixture.componentRef.setInput('subType', 'percentStackedColumn');
    fixture.detectChanges();
    expect(component.maxVal()).toBe(100);
    const bars = component.barGroups()[0].bars;
    expect(bars[0].x).toBe(bars[1].x);
    expect(bars[0].val + bars[1].val).toBeCloseTo(100);
    expect(bars[1].y).toBeCloseTo(25);
    fixture.componentRef.setInput('subType', 'clusteredColumn');
    fixture.detectChanges();
    const grouped = component.barGroups()[0].bars;
    expect(grouped[0].x).not.toBe(grouped[1].x);
    expect(grouped[0].val).toBe(150);
  });

  it('updates the pie hole when switching from pie to doughnut', () => {
    fixture.componentRef.setInput('category', 'pie');
    fixture.componentRef.setInput('subType', 'pie2d');
    fixture.detectChanges();
    const piePath = component.pieSlices()[0].path;
    expect(piePath).toContain('M 0 0');
    fixture.componentRef.setInput('subType', 'doughnut');
    fixture.detectChanges();
    expect(component.pieSlices()[0].path).not.toContain('M 0 0');
    // React uses the final numeric series for pie proportions.
    expect(component.pieSlices()[0].val).toBe(200);
    expect(component.legendKeys).toEqual(['Laptops', 'Monitores']);
  });

  it('shows values on hover and clears stale tooltips when changing chart type', () => {
    const bar = fixture.nativeElement.querySelector('svg rect') as SVGRectElement;
    bar.dispatchEvent(new MouseEvent('mouseenter', { clientX: 100, clientY: 100 }));
    fixture.detectChanges();
    expect(component.hoverTooltip()?.val).toBe(150);
    expect(component.hoverTooltip()?.series).toBe('Q1');
    fixture.componentRef.setInput('category', 'area');
    fixture.detectChanges();
    expect(component.hoverTooltip()).toBeNull();
  });

  it('renders only the first bar series and second line series in a combination chart', () => {
    fixture.componentRef.setInput('category', 'combo');
    fixture.componentRef.setInput('subType', 'comboClusteredColumnLine');
    fixture.detectChanges();
    expect(component.barGroups()[0].bars.map(bar => bar.key)).toEqual(['Q1']);
    expect(component.lineSeries().map(line => line.key)).toEqual(['Q2']);
  });

  it('plots numeric X/Y pairs rather than treating scatter data as independent line series', () => {
    fixture.componentRef.setInput('category', 'scatter');
    fixture.componentRef.setInput('subType', 'scatter');
    fixture.detectChanges();
    const points = component.scatterPoints();
    expect(points.length).toBe(2);
    expect(points[0].xVal).toBe(150);
    expect(points[0].val).toBe(200);
    expect(points[1].val).toBe(110);
    expect(component.legendKeys).toEqual(['Q2']);
  });


  it('replays animation only for changes to source data and keeps a title change separate', () => {
    const initial = component.animationKey;
    fixture.componentRef.setInput('grid', { ...mockGrid, Z99: { raw: 'unrelated edit' } });
    fixture.detectChanges();
    expect(component.animationKey).toBe(initial);
    fixture.componentRef.setInput('chartTitle', 'Sales');
    fixture.detectChanges();
    expect(component.animationKey).toBe(initial);
    expect(fixture.nativeElement.querySelector('.chart-title').textContent).toBe('Sales');
    fixture.componentRef.setInput('grid', { ...mockGrid, B2: { raw: '300' } });
    fixture.detectChanges();
    expect(component.animationKey).toBe(initial + 1);
    expect(component.chartData().rows[0]['Q1']).toBe(300);
  });


  it('uses a middle column for X and nonadjacent series without animating edits to excluded columns', () => {
    const grid: SheetGrid = {
      A1: { raw: 'Sales' }, B1: { raw: 'Ignored' }, C1: { raw: 'Product' }, D1: { raw: 'Ignored too' }, E1: { raw: 'Profit' },
      A2: { raw: '100' }, B2: { raw: '99999' }, C2: { raw: 'Laptop' }, E2: { raw: '20' },
      A3: { raw: '200' }, C3: { raw: 'Monitor' }, E3: { raw: '40' },
    };
    fixture.componentRef.setInput('grid', grid);
    fixture.componentRef.setInput('range', { startCol: 0, startRow: 0, endCol: 4, endRow: 2 });
    fixture.componentRef.setInput('dataConfig', { xColumn: 2, seriesColumns: [0, 4], hasHeaders: true });
    fixture.detectChanges();
    expect(component.chartData().seriesKeys).toEqual(['Sales', 'Profit']);
    expect(component.chartData().rows.map(row => row['name'])).toEqual(['Laptop', 'Monitor']);
    expect(component.chartData().rows[0]['Sales']).toBe(100);
    const key = component.animationKey;
    fixture.componentRef.setInput('grid', { ...grid, B2: { raw: '88888' } }); fixture.detectChanges();
    expect(component.animationKey).toBe(key);
    fixture.componentRef.setInput('grid', { ...grid, E2: { raw: '30' } }); fixture.detectChanges();
    expect(component.animationKey).toBe(key + 1);
  });


  it('matches the independent cost/income values and uses readable axis ticks for the supplied financial example', () => {
    const grid: SheetGrid = {
      A1: { raw: 'Quantity' }, B1: { raw: 'Fixed' }, C1: { raw: 'Variable' }, D1: { raw: 'Total' }, E1: { raw: 'Income' },
      A2: { raw: '0' }, B2: { raw: '582960' }, C2: { raw: '0' }, D2: { raw: '582960' }, E2: { raw: '0' },
      A3: { raw: '200' }, B3: { raw: '582960' }, C3: { raw: '164936' }, D3: { raw: '747896' }, E3: { raw: '1155984' },
    };
    fixture.componentRef.setInput('grid', grid);
    fixture.componentRef.setInput('range', { startCol: 0, startRow: 0, endCol: 4, endRow: 2 });
    fixture.componentRef.setInput('dataConfig', { xColumn: 0, seriesColumns: [1, 2, 3, 4], hasHeaders: true });
    fixture.componentRef.setInput('category', 'line'); fixture.componentRef.setInput('subType', 'line');
    fixture.detectChanges();
    const series = component.lineSeries();
    expect(series[0].points[0].y).toBe(series[0].points[1].y);
    expect(series[3].points[1].y).toBeCloseTo(component.valueY(1155984));
    expect(component.maxVal()).toBe(1250000);
    expect(component.gridLines().map(tick => tick.val)).toEqual([0, 250000, 500000, 750000, 1000000, 1250000]);
    fixture.componentRef.setInput('subType', 'stackedLine'); fixture.detectChanges();
    expect(component.lineSeries()[3].points[1].y).toBeCloseTo(component.valueY(2651776));
    expect(component.lineSeries()[3].points[1].val).toBe(1155984);
  });

  it('places negative results below zero on a linear value axis', () => {
    fixture.componentRef.setInput('grid', { A1: { raw: 'Quantity' }, B1: { raw: 'Result' }, A2: { raw: '0' }, B2: { raw: '-582960' }, A3: { raw: '200' }, B3: { raw: '408088' } });
    fixture.componentRef.setInput('dataConfig', { xColumn: 0, seriesColumns: [1], hasHeaders: true });
    fixture.componentRef.setInput('range', { startCol: 0, startRow: 0, endCol: 1, endRow: 2 });
    fixture.componentRef.setInput('category', 'line'); fixture.componentRef.setInput('subType', 'line');
    fixture.detectChanges();
    expect(component.axisDomain().min).toBeLessThanOrEqual(-582960);
    expect(component.lineSeries()[0].points[0].y).toBeGreaterThan(component.valueY(0));
    expect(component.lineSeries()[0].points[1].y).toBeLessThan(component.valueY(0));
  });

  it('moves legend and title without restarting the data animation', () => {
    fixture.componentRef.setInput('chartTitle', 'Costs');
    fixture.detectChanges();
    const key = component.animationKey;
    fixture.componentRef.setInput('appearance', { legendPosition: 'right', titlePosition: 'bottom', titleAlign: 'left' });
    fixture.detectChanges();
    expect(component.chartLayout['gridTemplateAreas']).toContain('"plot legend"');
    expect(component.chartLayout['gridTemplateAreas']).toContain('"title title"');
    expect((fixture.nativeElement.querySelector('.chart-title') as HTMLElement).style.textAlign).toBe('left');
    expect(component.animationKey).toBe(key);
    fixture.componentRef.setInput('appearance', { legendPosition: 'none', titlePosition: 'none', titleAlign: 'center' }); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.chart-title')).toBeNull();
    expect((fixture.nativeElement.querySelector('.chart-legend') as HTMLElement).style.display).toBe('none');
    expect(component.animationKey).toBe(key);
  });


  it('applies the same custom series color to the plot, legend and tooltip without replaying animation', () => {
    fixture.componentRef.setInput('category', 'line'); fixture.componentRef.setInput('subType', 'line');
    fixture.detectChanges();
    const key = component.animationKey;
    const svg = fixture.nativeElement.querySelector('.plot-svg');
    fixture.componentRef.setInput('seriesColors', { 'column:1': '#ff5500' }); fixture.detectChanges();
    expect(component.getColor(0)).toBe('#ff5500');
    expect(fixture.nativeElement.querySelector('.animated-line').getAttribute('stroke')).toBe('#ff5500');
    expect((fixture.nativeElement.querySelector('.chart-legend .font-medium') as HTMLElement).style.color).toBe('rgb(255, 85, 0)');
    expect(component.animationKey).toBe(key);
    expect(fixture.nativeElement.querySelector('.plot-svg')).toBe(svg);
    Object.defineProperty(svg, 'getBoundingClientRect', { value: () => ({ left: 0, top: 0, width: 500, height: 240 }) });
    svg.querySelector('.axis-hover-target').dispatchEvent(new MouseEvent('mousemove', { clientX: 75, clientY: 40 }));
    fixture.detectChanges();
    expect(component.axisHover()?.values[0].color).toBe('#ff5500');
    fixture.componentRef.setInput('dataConfig', { xColumn: 0, seriesColumns: [2], hasHeaders: true });
    fixture.componentRef.setInput('seriesColors', { 'column:1': '#ff5500', 'column:2': '#009944' }); fixture.detectChanges();
    expect(component.getColor(0)).toBe('#009944');
  });


  it('identifies pie colors by source row so each legend item matches its slice', () => {
    fixture.componentRef.setInput('category', 'pie'); fixture.componentRef.setInput('subType', 'pie2d');
    fixture.componentRef.setInput('seriesColors', { 'row:1': '#bb2255', 'row:2': '#22aa88' }); fixture.detectChanges();
    expect(component.colorItems().map(item => item.key)).toEqual(['row:1', 'row:2']);
    expect(component.getColor(0)).toBe('#bb2255');
    expect(component.getColor(1)).toBe('#22aa88');
    expect(fixture.nativeElement.querySelector('svg g > path').getAttribute('fill')).toBe('#bb2255');
  });


  it('recalculates referenced worksheet data and ignores unrelated foreign edits when deciding to replay animation', () => {
    const grid: SheetGrid = { A1: { raw: 'Product' }, B1: { raw: 'Sales' }, A2: { raw: 'Laptop' }, B2: { raw: '=Ventas!B1' } };
    const sheets: Sheet[] = [{ id: 'summary', name: 'Resumen', type: 'grid', data: grid }, { id: 'sales', name: 'Ventas', type: 'grid', data: { B1: { raw: '10' } } }];
    bindWorkbookFormulaContext(sheets);
    fixture.componentRef.setInput('grid', grid); fixture.componentRef.setInput('range', { startCol: 0, startRow: 0, endCol: 1, endRow: 1 }); fixture.detectChanges();
    expect(component.chartData().rows[0]['Sales']).toBe(10);
    const initial = component.animationKey;
    sheets[1].data = { B1: { raw: '20' } }; bindWorkbookFormulaContext(sheets);
    fixture.componentRef.setInput('dataRevision', 1); fixture.detectChanges();
    expect(component.chartData().rows[0]['Sales']).toBe(20);
    expect(component.animationKey).toBe(initial + 1);
    sheets[1].data = { ...sheets[1].data, Z99: { raw: 'unrelated' } }; bindWorkbookFormulaContext(sheets);
    fixture.componentRef.setInput('dataRevision', 2); fixture.detectChanges();
    expect(component.animationKey).toBe(initial + 1);
  });

  it('uses the available plot height while keeping text and markers in pixels at preview size', () => {
    fixture.componentRef.setInput('category', 'line');
    fixture.componentRef.setInput('subType', 'line');
    component.viewport.set({ width: 248, height: 115 });
    fixture.detectChanges();
    const svg = fixture.nativeElement.querySelector('.plot-svg') as SVGSVGElement;
    expect(svg.getAttribute('viewBox')).toBe('0 0 248 115');
    expect(component.y(25)).toBe(10);
    expect(component.y(200)).toBe(89);
    expect(component.x(55)).toBe(70);
    expect(component.x(480)).toBe(232);
    expect(svg.querySelector('circle')?.getAttribute('r')).toBe('5');
    expect(svg.querySelector('text')?.getAttribute('transform')).toBeNull();
    expect(component.visibleXLabels.length).toBe(2);
    component.viewport.set({ width: 448, height: 210 });
    fixture.detectChanges();
    expect(svg.getAttribute('viewBox')).toBe('0 0 448 210');
    expect(component.y(200)).toBe(184);
    expect(svg.querySelector('circle')?.getAttribute('r')).toBe('5');
  });

  it('tracks categories across the plot, showing a vertical cursor and all series values', () => {
    fixture.componentRef.setInput('category', 'line');
    fixture.componentRef.setInput('subType', 'line');
    fixture.detectChanges();
    const svg = fixture.nativeElement.querySelector('.plot-svg') as SVGSVGElement;
    Object.defineProperty(svg, 'getBoundingClientRect', { value: () => ({ left: 0, top: 0, width: 500, height: 240 }) });
    const target = svg.querySelector('.axis-hover-target') as SVGRectElement;
    // Hover well above the data points: selection depends on horizontal position.
    target.dispatchEvent(new MouseEvent('mousemove', { clientX: 400, clientY: 30 }));
    fixture.detectChanges();
    expect(component.axisHover()?.label).toBe('Monitores');
    expect(component.axisHover()?.values.map(item => item.value)).toEqual([80, 110]);
    expect(svg.querySelector('.axis-cursor')?.getAttribute('x1')).toBe(String(component.x(480)));
    expect(fixture.nativeElement.querySelector('.axis-tooltip').textContent).toContain('Q2 : 110');
    target.dispatchEvent(new MouseEvent('mousemove', { clientX: 75, clientY: 30 }));
    fixture.detectChanges();
    expect(component.axisHover()?.label).toBe('Laptops');
    target.dispatchEvent(new MouseEvent('mouseleave'));
    fixture.detectChanges();
    expect(svg.querySelector('.axis-cursor')).toBeNull();
    expect(fixture.nativeElement.querySelector('.axis-tooltip')).toBeNull();
  });

});

describe('Chart selection extraction', () => {
  const grid: SheetGrid = {
    A1: { raw: 'Default' }, B1: { raw: 'Sales' }, A2: { raw: 'Ignore' }, B2: { raw: '9999' },
    D4: { raw: 'Q1' }, E4: { raw: 'Q2' }, D5: { raw: '10' }, E5: { raw: '20' }, D6: { raw: '30' }, E6: { raw: '40' },
  };
  it('uses only selected numeric columns including the first column', () => {
    const result = extractChartDataFromGrid(grid, { startCol: 3, startRow: 3, endCol: 4, endRow: 5 });
    expect(result.seriesKeys).toEqual(['Q1', 'Q2']);
    expect(result.rows.map(row => [row['Q1'], row['Q2']])).toEqual([[10, 20], [30, 40]]);
  });
  it('does not replace empty or single-cell selections with demo data', () => {
    expect(extractChartDataFromGrid(grid, { startCol: 7, startRow: 7, endCol: 8, endRow: 8 }).rows).toEqual([]);
    const result = extractChartDataFromGrid(grid, { startCol: 3, startRow: 4, endCol: 3, endRow: 4 });
    expect(result.rows.length).toBe(1);
    expect(result.rows[0]['Serie D']).toBe(10);
  });
  it('supports reversed selections and retains explicitly selected total rows', () => {
    const result = extractChartDataFromGrid({ A1: { raw: 'Product' }, B1: { raw: 'Sales' }, A2: { raw: 'SUMA TOTAL' }, B2: { raw: '42' } }, { startCol: 1, startRow: 1, endCol: 0, endRow: 0 });
    expect(result.rows[0]['Sales']).toBe(42);
    expect(result.rows[0]['name']).toBe('SUMA TOTAL');
  });
});
