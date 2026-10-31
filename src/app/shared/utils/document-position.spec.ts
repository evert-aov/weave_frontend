import { afterEach, describe, expect, it } from 'vitest';
import { captureDocumentPosition, restoreDocumentPosition } from './document-position';

describe('document return position', () => {
  afterEach(() => { document.body.replaceChildren(); window.getSelection()?.removeAllRanges(); });
  function content(): HTMLElement {
    const host = document.createElement('div');
    host.innerHTML = '<div data-document-scroll><div data-page-body-id="page" contenteditable="true"><p>Hello <b>world</b></p></div></div>';
    document.body.append(host); return host;
  }
  it('restores the caret through formatting and the document scroll offset', () => {
    const host = content();
    const body = host.querySelector<HTMLElement>('[contenteditable]')!;
    const text = body.querySelector('b')!.firstChild!;
    window.getSelection()!.setBaseAndExtent(text, 3, text, 3);
    host.firstElementChild!.scrollTop = 260;
    const position = captureDocumentPosition(host);
    expect(position.anchor?.offset).toBe(9);
    host.remove(); const reopened = content();
    expect(restoreDocumentPosition(reopened, position)).toBe(true);
    expect(window.getSelection()!.anchorNode?.textContent).toBe('world');
    expect(window.getSelection()!.anchorOffset).toBe(3);
    expect(reopened.firstElementChild!.scrollTop).toBe(260);
  });
  it('waits until Word has hydrated its pages', () => {
    const host = content(); host.firstElementChild!.setAttribute('data-word-ready', 'false');
    expect(restoreDocumentPosition(host, { scrollTop: 30, scrollLeft: 0 })).toBe(false);
    host.firstElementChild!.setAttribute('data-word-ready', 'true');
    expect(restoreDocumentPosition(host, { scrollTop: 30, scrollLeft: 0 })).toBe(true);
  });
  it('restores a selection inside a rich text block, including reading mode', () => {
    const host = document.createElement('div');
    host.innerHTML = '<div data-document-scroll><div data-block-id="block"><div contenteditable="false"><p>Block text</p></div></div></div>';
    document.body.append(host);
    const text = host.querySelector('p')!.firstChild!;
    window.getSelection()!.setBaseAndExtent(text, 2, text, 6);
    const position = captureDocumentPosition(host);
    expect(position.anchor?.kind).toBe('block');
    expect(restoreDocumentPosition(host, position)).toBe(true);
    expect(window.getSelection()!.toString()).toBe('ock ');
  });
});
