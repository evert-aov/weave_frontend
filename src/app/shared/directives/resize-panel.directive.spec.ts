import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { ResizePanelDirective } from './resize-panel.directive';

@Component({
  standalone: true,
  imports: [ResizePanelDirective],
  template: `<div [appResizePanel]="width()" [resizeDirection]="direction()"
    [resizeMin]="240" [resizeMax]="440" [resizeDefault]="288"
    (panelWidthChange)="width.set($event)"></div>`,
})
class TestPanel {
  readonly width = signal(288);
  readonly direction = signal<1 | -1>(1);
}

describe('panel resizing', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [TestPanel] }).compileComponents();
  });

  it('supports keyboard resizing on both sides and respects the allowed width', () => {
    const fixture = TestBed.createComponent(TestPanel);
    fixture.detectChanges();
    const handle = fixture.nativeElement.querySelector('[role="separator"]') as HTMLElement;
    handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    expect(fixture.componentInstance.width()).toBe(304);
    fixture.componentInstance.direction.set(-1);
    fixture.detectChanges();
    handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    expect(fixture.componentInstance.width()).toBe(288);
    handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'End' }));
    expect(fixture.componentInstance.width()).toBe(440);
    fixture.detectChanges();
    handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
    expect(fixture.componentInstance.width()).toBe(440);
    handle.dispatchEvent(new MouseEvent('dblclick'));
    expect(fixture.componentInstance.width()).toBe(288);
  });
});
