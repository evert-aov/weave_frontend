import { TestBed } from '@angular/core/testing';
import { ExcelFloatingArtworkComponent } from './excel-floating-artwork.component';

describe('Floating sheet artwork', () => {
  it('moves and resizes in sheet coordinates at the current zoom', () => {
    const fixture = TestBed.createComponent(ExcelFloatingArtworkComponent);
    const component = fixture.componentInstance;
    fixture.componentRef.setInput('artwork', { id: 'shape1', kind: 'shape', itemId: 'line', x: 100, y: 80, width: 160, height: 100 });
    fixture.componentRef.setInput('zoom', 2);
    fixture.detectChanges();
    let geometry: any;
    let completed = 0;
    component.geometryChange.subscribe(value => geometry = value);
    component.endChange.subscribe(() => completed++);
    component.begin(new MouseEvent('mousedown', { clientX: 10, clientY: 10 }), false);
    component.move(new MouseEvent('mousemove', { clientX: 50, clientY: 70 }));
    expect(geometry).toEqual({ x: 120, y: 110, width: 160, height: 100 });
    component.finish();
    expect(completed).toBe(1);
    component.begin(new MouseEvent('mousedown', { clientX: 10, clientY: 10 }), true);
    component.move(new MouseEvent('mousemove', { clientX: 90, clientY: 50 }));
    expect(geometry).toEqual({ x: 100, y: 80, width: 200, height: 120 });
  });
});
