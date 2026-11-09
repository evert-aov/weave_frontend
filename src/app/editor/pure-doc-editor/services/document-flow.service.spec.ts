import { noteList, renumberAcademicNotes } from '../utils/academic-notes';
import { APA_STYLE_TEMPLATES } from '../constants/apa-style-templates';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

  it('moves complete words across formatted runs to the next page', () => {
    for (const html of ['<p>123456789012345678 dato<span>s permite</span></p>', '<p>123456789012345678 <b>dato</b><i>s permite</i></p>']) {
      const result = paginate([page(html)], 20);
      expect(text([result[0]])).toBe('123456789012345678 ');
      expect(text([result[1]])).toBe('datos permite');
      expect(text(result)).toBe(text([page(html)]));
      expect(paginate(result, 20).map(p => p.html)).toEqual(result.map(p => p.html));
    }
  });

  it('keeps APA number and title with the figure instead of leaving them on the preceding page', () => {
    const html = '<p>Texto</p><p data-apa-caption-for="fig" data-apa-role="number">Figura 1</p><p data-apa-caption-for="fig" data-apa-role="title">Título</p><p><img data-word-object-id="fig" src="/a.jpg"></p>';
    const result = paginate([page(html)], 30);
    expect(result).toHaveLength(2);
    expect(result[0].html).toBe('<p>Texto</p>');
    expect(result[1].html).toContain('Figura 1'); expect(result[1].html).toContain('<img');
    expect(text(result)).toBe(text([page(html)]));
  });

  it('splits a long generated endnote without duplicating its content on the next pagination', () => {
    const note = { id: 'long', kind: 'endnote' as const, number: 1, text: 'Explicación extensa. '.repeat(100) };
    const body = document.createElement('div'); body.innerHTML = `<p>Texto<a data-word-note-id="long" data-note-kind="endnote" data-note-content="${note.text}">1</a></p>`; renumberAcademicNotes([body]);
    const pages: DocumentPage[] = [page(body.innerHTML), { id: 'notes', html: noteList([note], APA_STYLE_TEMPLATES[0], 'endnote').outerHTML, breakBefore: 'manual' }];
    const result = paginate(pages, 60); expect(result.length).toBeGreaterThan(4);
    const noteText = (list: DocumentPage[]) => { const holder = document.createElement('div'); holder.innerHTML = list.map(p => p.html).join(''); return Array.from(holder.querySelectorAll('[data-note-entry-id]')).map(p => p.textContent).join(''); };
    expect(noteText(result)).toBe('1 ' + note.text);
    const again = paginate(result, 60); expect(noteText(again)).toBe(noteText(result));
    expect(again.map(p => p.html)).toEqual(result.map(p => p.html));
  });

  it('keeps a settled automatic suffix outside the measurement window while typing', () => {
    const engine = new DocumentFlowService();
    const previous = Array.from({length:140}, (_,i)=>page(`<p>Page ${i}</p>`,String(i)));
    const edited = previous.map((p,i)=>i===60?{...p,html:'<p>Edited</p>'}:p);
    const spy = vi.spyOn(engine,'paginate').mockImplementation(pages=>pages);
    const result = engine.paginateChangedSections(edited,previous,canvas,100);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0].map(p=>p.id)).toEqual(['59','60','61','62']);
    expect(result[0]).toBe(previous[0]);expect(result[139]).toBe(previous[139]);
    expect(result[60].html).toBe('<p>Edited</p>');
    spy.mockRestore();
  });

  it('expands the changed window until cascading page changes settle', () => {
    const engine = new DocumentFlowService();
    const previous = Array.from({length:20}, (_,i)=>page(`<p>Page ${i}</p>`,String(i)));
    const edited = previous.map((p,i)=>i===2?{...p,html:'<p>Edited</p>'}:p);
    const spy = vi.spyOn(engine,'paginate').mockImplementation(pages=>pages.length<8 ? pages.map((p,i)=>i===pages.length-1?{...p,html:'<p>Unsettled</p>'}:p) : pages);
    const result = engine.paginateChangedSections(edited,previous,canvas,100);
    expect(spy.mock.calls.map(call=>call[0].length)).toEqual([4,8]);
    expect(result).toEqual(edited);
    spy.mockRestore();
  });

  it('paginates only the edited manual section among 200 independent pages', () => {
    const previous: DocumentPage[] = Array.from({ length: 200 }, (_, index) => ({ id: String(index), html: `<p>Page ${index}</p>`, ...(index ? { breakBefore: 'manual' as const } : {}) }));
    const edited = previous.map((page, index) => index === 100 ? { ...page, html: '<p>Changed page</p>' } : page);
    const paginate = vi.spyOn(service, 'paginate');
    const result = service.paginateChangedSections(edited, previous, canvas, 100);
    expect(paginate).toHaveBeenCalledTimes(1);
    expect(paginate.mock.calls[0][0]).toHaveLength(1);
    expect(result[99]).toBe(previous[99]);
    expect(result[101]).toBe(previous[101]);
    expect(text(result)).toContain('Changed page');
    paginate.mockRestore();
  });

  it('measures overflowing content as well as the measuring box height', () => {
    Object.defineProperty(canvas, 'scrollHeight', { configurable: true, get: () => measureNode(canvas) });
    canvas.getBoundingClientRect = () => ({ height: 10 } as DOMRect);
    const input = [page('<p>one two three four five six seven eight nine ten eleven twelve</p>')];
    const result = service.paginate(input, canvas, 30);
    expect(result.length).toBeGreaterThan(1);
    expect(text(result)).toBe(text(input));
    result.forEach(page => { canvas.innerHTML = page.html; expect(measureNode(canvas)).toBeLessThanOrEqual(30); });
  });

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

describe('fractional list line boxes at a page boundary',()=>{
  it('keeps the extra line when only one pixel is rounding, but moves the next complete line',()=>{
    const canvas=document.createElement('div');document.body.append(canvas);
    const measure=()=>Array.from(canvas.querySelectorAll('p,li')).reduce((height,node)=>height+(node.tagName==='P'?704:node.textContent==='Primer punto'?128.5:32.5),0);
    const service=new DocumentFlowService();
    const source='<p>Contenido anterior</p><ul><li>Primer punto</li><li><br></li></ul>';
    const fitted=service.paginate([{id:'a',html:source}],canvas,864,measure);
    expect(fitted).toHaveLength(1);expect(fitted[0].html.match(/<li/g)).toHaveLength(2);
    const overflowing=service.paginate([{id:'a',html:source.replace('</ul>','<li>Siguiente línea</li></ul>')}],canvas,864,measure);
    expect(overflowing).toHaveLength(2);expect(overflowing[0].html.match(/<li/g)).toHaveLength(2);
    expect(overflowing[1].html).toContain('Siguiente línea');canvas.remove();
  });
});

describe('recomposition after importing many automatic pages',()=>{
  it('does not accumulate a lost list line across 100 imported pages',()=>{
    const canvas=document.createElement('div');document.body.append(canvas);
    const measure=()=>Array.from(canvas.querySelectorAll('p,li')).reduce((height,node)=>height+(node.tagName==='P'?704:node.textContent==='Primer punto'?128.5:32.5),0);
    const fragmented:DocumentPage[]=[];
    for(let i=0;i<100;i++) {
      fragmented.push({id:`page-${i}-a`,html:`<p>Sección ${i}</p><ul data-word-flow="list-${i}"><li>Primer punto</li></ul>`});
      fragmented.push({id:`page-${i}-b`,html:`<ul data-word-flow="list-${i}" data-word-continuation="list-${i}"><li><br></li></ul>`});
    }
    const service=new DocumentFlowService();
    const result=service.paginate(fragmented,canvas,864,measure);
    expect(result).toHaveLength(100);
    expect(result.every(page=>(page.html.match(/<li/g)||[]).length===2)).toBe(true);
    const repeated=service.paginate(result,canvas,864,measure);
    expect(repeated.map(page=>page.html)).toEqual(result.map(page=>page.html));
    canvas.remove();
  });
});
