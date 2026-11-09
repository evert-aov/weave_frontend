import { ElementRef, signal } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WordNavigationController } from './word-navigation.controller';

describe('Word document zoom', () => {
  let viewport: HTMLElement, page: HTMLElement, controller: WordNavigationController;
  let zoom: ReturnType<typeof signal<number>>;
  let frame: FrameRequestCallback | undefined;
  const rect = (left: number, top: number, width: number, height: number) => ({ left, top, width, height, right: left + width, bottom: top + height } as DOMRect);
  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => { frame = callback; return 1; }));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    zoom = signal(100);
    viewport = document.createElement('main'); page = document.createElement('section');
    page.className = 'word-page-sheet'; viewport.appendChild(page); document.body.appendChild(viewport);
    viewport.scrollTop = 1000; viewport.style.overflowAnchor = 'auto';
    viewport.getBoundingClientRect = () => rect(0, 100, 600, 500);
    page.getBoundingClientRect = () => rect(100 - viewport.scrollLeft, 100 + 1200 * zoom() / 100 - viewport.scrollTop, 500 * zoom() / 100, 1000 * zoom() / 100);
    const host = { zoom, refreshObjectOverlays: vi.fn(), mainScrollRef: new ElementRef(viewport) } as unknown as ConstructorParameters<typeof WordNavigationController>[0];
    controller = new WordNavigationController(host, { cdr: null } as ConstructorParameters<typeof WordNavigationController>[1]);
    viewport.addEventListener('wheel', event => controller.onPageWheel(event), { passive: false });
  });
  afterEach(() => { controller.cancelZoom(); document.body.replaceChildren(); vi.unstubAllGlobals(); });

  it('keeps the same visible page point when zooming with the slider or ribbon', () => {
    controller.setDocumentZoom(150);
    expect(zoom()).toBe(150);
    expect(viewport.scrollTop).toBeCloseTo(1625);
    const visiblePoint = () => { const box = page.getBoundingClientRect(); return box.top + box.height * .05; };
    expect(visiblePoint()).toBeCloseTo(350);
    frame?.(0);
    expect(visiblePoint()).toBeCloseTo(350);
    expect(viewport.style.overflowAnchor).toBe('auto');
  });

  it('captures Ctrl + wheel on paper without affecting normal scrolling or browser zoom outside paper', () => {
    const wheel = new WheelEvent('wheel', { ctrlKey: true, deltaY: -100, clientX: 300, clientY: 350, bubbles: true, cancelable: true });
    page.dispatchEvent(wheel);
    expect(wheel.defaultPrevented).toBe(true); expect(zoom()).toBe(110);
    const plain = new WheelEvent('wheel', { deltaY: 100, bubbles: true, cancelable: true });
    page.dispatchEvent(plain);
    expect(plain.defaultPrevented).toBe(false); expect(zoom()).toBe(110);
    const outside = new WheelEvent('wheel', { ctrlKey: true, deltaY: -100, bubbles: true, cancelable: true });
    viewport.dispatchEvent(outside);
    expect(outside.defaultPrevented).toBe(false);
  });

  it('still blocks browser zoom at the document zoom limit and restores anchoring on cleanup', () => {
    zoom.set(160);
    const wheel = new WheelEvent('wheel', { ctrlKey: true, deltaY: -100, bubbles: true, cancelable: true });
    page.dispatchEvent(wheel);
    expect(wheel.defaultPrevented).toBe(true); expect(zoom()).toBe(160);
    controller.setDocumentZoom(100);
    controller.cancelZoom();
    expect(viewport.style.overflowAnchor).toBe('auto');
  });
});
