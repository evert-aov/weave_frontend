import { afterEach, describe, expect, it } from 'vitest';
import { captureDocumentPosition, restoreDocumentPosition } from './document-position';
afterEach(() => { document.body.replaceChildren(); window.getSelection()?.removeAllRanges(); });
describe('document positions with retained Word sessions', () => {
  it('ignores inactive scrollers and duplicate page IDs belonging to hidden sessions', () => {
    const host = document.createElement('div');
    host.innerHTML = '<section inert><div data-document-scroll><div data-page-body-id="p1" contenteditable="true">Anterior</div></div></section>'
      + '<section><div data-document-scroll><div data-page-body-id="p1" contenteditable="true">Actual</div></div></section>';
    document.body.append(host);
    const scrollers = host.querySelectorAll<HTMLElement>('[data-document-scroll]'); scrollers[0].scrollTop = 12; scrollers[1].scrollTop = 90;
    expect(captureDocumentPosition(host).scrollTop).toBe(90);
    expect(restoreDocumentPosition(host, { scrollTop:130, scrollLeft:4, anchor:{kind:'page',id:'p1',offset:3}, focus:{kind:'page',id:'p1',offset:3} })).toBe(true);
    expect(scrollers[0].scrollTop).toBe(12); expect(scrollers[1].scrollTop).toBe(130);
    expect(window.getSelection()?.anchorNode?.textContent).toBe('Actual');
  });

  it('restores scroll position even when anchor points are not present in DOM as in Canvas mode', () => {
    const host = document.createElement('div');
    host.innerHTML = '<section><div data-document-scroll><canvas></canvas></div></section>';
    document.body.append(host);
    const scroller = host.querySelector<HTMLElement>('[data-document-scroll]')!;
    expect(restoreDocumentPosition(host, { scrollTop: 450, scrollLeft: 0, anchor: { kind: 'page', id: 'p2', offset: 0 }, focus: { kind: 'page', id: 'p2', offset: 0 } })).toBe(true);
    expect(scroller.scrollTop).toBe(450);
  });
});
