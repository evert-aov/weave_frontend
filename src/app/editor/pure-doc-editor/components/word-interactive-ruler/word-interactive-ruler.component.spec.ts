import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WordInteractiveRulerComponent } from './word-interactive-ruler.component';

describe('WordInteractiveRulerComponent (Fase 7)', () => {
  let fixture: ComponentFixture<WordInteractiveRulerComponent>;
  let component: WordInteractiveRulerComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [WordInteractiveRulerComponent],
    }).compileComponents();
    fixture = TestBed.createComponent(WordInteractiveRulerComponent);
    component = fixture.componentInstance;
    component.sheetWidthPx = 816;
    component.marginLeftPx = 96;
    component.marginRightPx = 96;
    component.zoom = 100;
    fixture.detectChanges();
  });

  it('toggles APA 36pt first-line indent, hanging indent (-36pt + 1.27cm), and reset on APA button click', () => {
    const emitted: unknown[] = [];
    component.indentChange.subscribe(patch => emitted.push(patch));

    component.firstLineIndentPt = 0;
    component.toggleApaHangingIndent();
    expect(emitted.at(-1)).toEqual({ indentLeftCm: 0, firstLineIndentPt: 36 });

    component.firstLineIndentPt = 36;
    component.toggleApaHangingIndent();
    expect(emitted.at(-1)).toEqual({ indentLeftCm: 1.27, firstLineIndentPt: -36 });

    component.firstLineIndentPt = -36;
    component.toggleApaHangingIndent();
    expect(emitted.at(-1)).toEqual({ indentLeftCm: 0, firstLineIndentPt: 0 });
  });

  it('drags first-line, left-indent, and right-indent handles and emits updated ruler measurements', () => {
    const spy = vi.fn();
    component.indentChange.subscribe(spy);

    // Drag first-line indent rightward by ~48px (~36pt)
    const firstBtn = fixture.nativeElement.querySelector('[data-ruler-handle="first-line"]') as HTMLElement;
    expect(firstBtn).toBeTruthy();
    firstBtn.dispatchEvent(new PointerEvent('pointerdown', { clientX: 100, bubbles: true }));
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: 148 }));
    window.dispatchEvent(new PointerEvent('pointerup', { clientX: 148 }));
    expect(spy).toHaveBeenLastCalledWith({ firstLineIndentPt: 36 });

    // Drag left-indent rightward by ~38px (~1.0cm)
    const leftBtn = fixture.nativeElement.querySelector('[data-ruler-handle="left-indent"]') as HTMLElement;
    leftBtn.dispatchEvent(new PointerEvent('pointerdown', { clientX: 100, bubbles: true }));
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: 138 }));
    window.dispatchEvent(new PointerEvent('pointerup', { clientX: 138 }));
    const leftArg = spy.mock.calls.at(-1)?.[0] as { indentLeftCm: number };
    expect(leftArg.indentLeftCm).toBeGreaterThan(0.8);

    // Drag right-indent leftward by ~38px (~1.0cm)
    const rightBtn = fixture.nativeElement.querySelector('[data-ruler-handle="right-indent"]') as HTMLElement;
    rightBtn.dispatchEvent(new PointerEvent('pointerdown', { clientX: 700, bubbles: true }));
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: 662 }));
    window.dispatchEvent(new PointerEvent('pointerup', { clientX: 662 }));
    const rightArg = spy.mock.calls.at(-1)?.[0] as { indentRightCm: number };
    expect(rightArg.indentRightCm).toBeGreaterThan(0.8);
  });
});
