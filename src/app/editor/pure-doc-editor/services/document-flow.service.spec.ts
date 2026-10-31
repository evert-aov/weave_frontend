import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DocumentFlowService } from './document-flow.service';
import { DocumentPage } from '../models/word-document.model';
import { deleteAtContinuation, joinBoundaryBlocks, markDocumentSelection, restoreDocumentSelection, withoutSelectionMarkers } from '../utils/document-selection';

describe('DocumentFlowService', () => {
  const service = new DocumentFlowService();
  let canvas: HTMLDivElement;

  beforeEach(() => {
    canvas = document.createElement('div');
    document.body.appendChild(canvas);
  });
  afterEach(() => { document.body.replaceChildren(); window.getSelection()?.removeAllRanges(); });

  // Deterministic layout for jsdom: ten characters per line, ten pixels per line.
  // Production uses the browser's actual layout, rather than this test approximation.
  const measureNode = (node: Node): number => {
    if (node.nodeType === Node.COMMENT_NODE) return 0;
    if (node instanceof HTMLElement && node.matches('div,ol,ul,table,tbody,thead')) {
      return Array.from(node.childNodes).reduce((sum, child) => sum + measureNode(child), 0);
    }
    return Math.max(1, Math.ceil((node.textContent?.length ?? 0) / 10)) * 10;
  };
  const paginate = (pages: DocumentPage[], height = 30) =>
    service.paginate(pages, canvas, height, () => measureNode(canvas));
  const page = (html: string, id = 'first'): DocumentPage => ({ id, html });
  const text = (pages: DocumentPage[]) => {
    const holder = document.createElement('div');
    holder.innerHTML = pages.map((p) => p.html).join('');
    return holder.textContent;
  };

  it('fills the remaining area with part of a long paragraph while retaining inline markup', () => {
    const html = '<p>1234567890</p><p style="color:red"><strong>one two three four five six seven eight nine ten eleven twelve</strong></p>';
    const result = paginate([page(html)]);
    expect(result.length).toBeGreaterThan(2);
    expect(result[0].html).toContain('<strong');
    expect(result[0].html).toContain('one two');
    expect(text(result)).toBe(text([page(html)]));
    expect(result.every((p) => !p.html.includes('one') || p.html.includes('color:red'))).toBe(true);
  });

  it('paginates a large paste across every required page in one transaction', () => {
    const html = Array.from({ length: 40 }, (_, i) => `<p>line ${i}</p>`).join('');
    const result = paginate([page(html)]);
    expect(result).toHaveLength(14);
    expect(text(result)).toBe(text([page(html)]));
    expect(result[0].id).toBe('first');
    expect(new Set(result.map((p) => p.id)).size).toBe(result.length);
  });

  it('pulls content back after deletion, removes automatic blank pages and is stable on repeated layout', () => {
    const initial = paginate([page('<p>one two three four five six seven eight nine ten</p>')]);
    const edited = initial.map((p, index) => ({ ...p, html: index ? p.html : '<p></p>' }));
    const result = paginate(edited);
    expect(result.length).toBeLessThan(initial.length);
    expect(paginate(result)).toEqual(result);
    expect(text(result)).toBe(text(edited));
  });

  it('rejoins paragraph fragments when the page height or margins change', () => {
    const html = '<p><em>one two three four five six seven eight nine ten</em></p>';
    const small = paginate([page(html)], 20);
    const large = paginate(small, 200);
    expect(large).toHaveLength(1);
    const holder = document.createElement('div');
    holder.innerHTML = large[0].html;
    expect(holder.children).toHaveLength(1);
    expect(holder.querySelector('em')).toBeTruthy();
    expect(text(large)).toBe(text([page(html)]));
  });

  it('preserves explicit page breaks and empty manually inserted pages', () => {
    const result = paginate([
      page('<p>A</p>'),
      { ...page('<p><br></p>', 'manual'), breakBefore: 'manual' },
      { ...page('<p>B</p>', 'last'), breakBefore: 'manual' },
    ], 300);
    expect(result).toHaveLength(3);
    expect(result[1].breakBefore).toBe('manual');
    expect(result[2].breakBefore).toBe('manual');
  });

  it('preserves ordered list numbering and does not repeat a continued list item bullet', () => {
    const html = '<ol start="4"><li>one two three four five six seven eight nine ten</li><li>last item</li></ol>';
    const result = paginate([page(html)], 20);
    expect(result.length).toBeGreaterThan(2);
    expect(result[1].html).toMatch(/<ol[^>]*start="4"/);
    expect(result[1].html).toMatch(/<li[^>]*data-word-continuation/);
    expect(text(result)).toBe(text([page(html)]));
    expect(paginate(result, 400)[0].html.match(/<li/g)).toHaveLength(2);
  });

  it('does not merge unrelated adjacent tables, even with identical columns', () => {
    const table = '<table><tbody><tr><td>A</td></tr></tbody></table>';
    const result = paginate([page(table), page(table, 'second')], 200);
    expect(result[0].html.match(/<table/g)).toHaveLength(2);
  });

  it('rejoins continuations with a caret directly at the page boundary', () => {
    const result = paginate([
      page('<p data-word-flow="p">Before</p>'),
      page('<!--weave-selection-start--><p data-word-flow="p" data-word-continuation="p">After</p>', 'second'),
    ], 300);
    expect(result).toHaveLength(1);
    const holder = document.createElement('div');
    holder.innerHTML = result[0].html;
    expect(holder.children).toHaveLength(1);
    expect(holder.firstElementChild!.innerHTML).toContain('Before<!--weave-selection-start-->After');
  });

  it('splits tables by rows and recombines only their own fragments', () => {
    const html = '<table><colgroup><col></colgroup><tbody>'
      + Array.from({ length: 8 }, (_, i) => `<tr><td>${i}</td></tr>`).join('') + '</tbody></table>';
    const result = paginate([page(html)]);
    expect(result.length).toBeGreaterThan(1);
    const joined = paginate(result, 400);
    expect(joined).toHaveLength(1);
    expect(joined[0].html.match(/<table/g)).toHaveLength(1);
    expect(joined[0].html.match(/<tr/g)).toHaveLength(8);
    expect(joined[0].html.match(/<colgroup/g)).toHaveLength(1);
  });

  it('never loses or loops on an oversized indivisible object', () => {
    const result = service.paginate([page('<img src="test.png"><p>end</p>')], canvas, 30,
      () => canvas.querySelector('img') ? 300 : 10);
    expect(result).toHaveLength(2);
    expect(result[0].html).toContain('<img');
    expect(result[1].html).toContain('end');
  });

  it('does not split emoji or combining characters', () => {
    const value = '👩🏽‍💻'.repeat(20) + 'á'.repeat(20);
    const result = paginate([page(`<p>${value}</p>`)]);
    expect(text(result)).toBe(value);
    for (const p of result) {
      const content = text([p]) ?? '';
      expect(content).not.toMatch(/^[\uDC00-\uDFFF\u0301]/u);
    }
  });

  it('moves the exact caret through a paragraph split and never saves selection markers', () => {
    const body = document.createElement('div');
    body.contentEditable = 'true';
    body.innerHTML = '<p>one two three four five six seven eight nine ten</p>';
    document.body.appendChild(body);
    const range = document.createRange();
    range.setStart(body.firstChild!.firstChild!, 37);
    range.collapse(true);
    window.getSelection()!.addRange(range);
    expect(markDocumentSelection([body])).toBe(true);
    const result = paginate([page(body.innerHTML)], 20);
    const bodies: HTMLElement[] = result.map((p) => {
      const el = document.createElement('div');
      el.contentEditable = 'true';
      el.innerHTML = p.html;
      document.body.appendChild(el);
      return el;
    });
    const active = restoreDocumentSelection(bodies);
    expect(active).toBeTruthy();
    expect(bodies.indexOf(active!)).toBeGreaterThan(0);
    const selected = window.getSelection()!.getRangeAt(0);
    const prefix = selected.cloneRange();
    prefix.selectNodeContents(active!);
    prefix.setEnd(selected.startContainer, selected.startOffset);
    const previous = bodies.slice(0, bodies.indexOf(active!)).map((el) => el.textContent).join('');
    expect(previous + prefix.toString()).toHaveLength(37);
    expect(result.map((p) => withoutSelectionMarkers(p.html)).join('')).not.toContain('weave-selection');
  });

  it('Backspace across a paragraph boundary joins blocks without deleting text', () => {
    const left = document.createElement('div');
    const right = document.createElement('div');
    left.innerHTML = '<p><b>hello</b></p>';
    right.innerHTML = '<p><i>world</i></p>';
    joinBoundaryBlocks(left, right);
    expect(left.children).toHaveLength(1);
    expect(left.textContent).toBe('helloworld');
    expect(left.querySelector('b')).toBeTruthy();
    expect(left.querySelector('i')).toBeTruthy();
  });

  it.each([true, false])('deletes one whole grapheme at a continued paragraph seam (backwards=%s)', (backwards) => {
    const left = document.createElement('div');
    const right = document.createElement('div');
    left.innerHTML = '<p>A👩🏽‍💻</p>';
    right.innerHTML = '<p>👩🏽‍💻B</p>';
    joinBoundaryBlocks(left, right);
    deleteAtContinuation(left, backwards);
    expect(left.textContent).toBe('A👩🏽‍💻B');
  });
});
