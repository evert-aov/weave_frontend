import { TestBed } from '@angular/core/testing';
import { ExcelInkLayerComponent } from './excel-ink-layer.component';
import { InkStroke } from '../../models/excel.model';

describe('Floating ink layer', () => {
  function create() {
    const fixture = TestBed.createComponent(ExcelInkLayerComponent);
    fixture.componentRef.setInput('width', 500);
    fixture.componentRef.setInput('height', 300);
    fixture.componentRef.setInput('enabled', true);
    fixture.componentRef.setInput('tool', 'penRed');
    fixture.componentRef.setInput('pen', { id: 'penRed', kind: 'pen', color: '#ef4444', strokeWidth: 3, opacity: 1 });
    fixture.detectChanges();
    const svg = fixture.nativeElement.querySelector('svg') as SVGSVGElement;
    Object.defineProperty(svg, 'getBoundingClientRect', { value: () => ({ left: 0, top: 0, width: 1000, height: 600 }) });
    let strokes: InkStroke[] = [];
    fixture.componentInstance.strokesChange.subscribe(value => { strokes = value; fixture.componentRef.setInput('strokes', value); });
    function pointer(target: Element, type: string, x: number, y: number) {
      target.dispatchEvent(new MouseEvent(type, { bubbles: true, clientX: x, clientY: y }));
      fixture.detectChanges();
    }
    return { fixture, svg, pointer, strokes: () => strokes };
  }

  it('draws in sheet coordinates at zoom, then moves and resizes the floating stroke', () => {
    const { fixture, svg, pointer, strokes } = create();
    pointer(svg, 'pointerdown', 20, 40);
    pointer(svg, 'pointermove', 200, 160);
    pointer(svg, 'pointerup', 200, 160);
    expect(strokes()[0].points).toEqual([{ x: 10, y: 20 }, { x: 100, y: 80 }]);
    expect(strokes()[0].color).toBe('#ef4444');
    fixture.componentRef.setInput('tool', 'select'); fixture.detectChanges();
    pointer(svg.querySelector('.stroke-hit')!, 'pointerdown', 20, 40);
    pointer(svg, 'pointermove', 100, 120);
    pointer(svg, 'pointerup', 100, 120);
    expect(strokes()[0].points).toEqual([{ x: 50, y: 60 }, { x: 140, y: 120 }]);
    pointer(svg.querySelector('.resize')!, 'pointerdown', 290, 250);
    pointer(svg, 'pointermove', 470, 370);
    pointer(svg, 'pointerup', 470, 370);
    expect(strokes()[0].points[1]).toEqual({ x: 230, y: 180 });
  });

  it('erases by segment distance and discards cancelled drafts', () => {
    const { fixture, svg, pointer, strokes } = create();
    pointer(svg, 'pointerdown', 20, 40);
    pointer(svg, 'pointermove', 200, 160);
    pointer(svg, 'pointerup', 200, 160);
    fixture.componentRef.setInput('tool', 'eraser'); fixture.detectChanges();
    pointer(svg, 'pointerdown', 110, 100);
    pointer(svg, 'pointerup', 110, 100);
    expect(strokes()).toEqual([]);
    fixture.componentRef.setInput('tool', 'penRed'); fixture.detectChanges();
    pointer(svg, 'pointerdown', 10, 10);
    pointer(svg, 'pointercancel', 10, 10);
    expect(fixture.componentInstance.draft).toBeNull();
    expect(strokes()).toEqual([]);
  });
});
