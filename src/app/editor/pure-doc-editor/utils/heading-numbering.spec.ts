import { CanvasEditSession } from '../engine/canvas-edit-session';
import { textNodes } from '../engine/document-model';
import { renumberHeadings } from './heading-numbering';
import { HeadingOutlineCounter } from './heading-outline-counter';
import { numberModelHeadings } from '../engine/model-heading-numbering';
import { htmlToDocumentState, documentStateToHtml } from '../engine/document-model-dom';

const bodies = (...html: string[]) => html.map(value => { const body = document.createElement('div'); body.innerHTML = value; return body; });
const numbers = (hosts: HTMLElement[]) => hosts.flatMap(host => Array.from(host.querySelectorAll('[data-word-heading-number]'), node => node.textContent));

describe('Chapter heading numbering', () => {
  const pages = ['<h1 data-word-chapter="true">Capítulo A</h1><h1>A</h1><h2>A.1</h2>', '<h1 data-word-chapter="true">Capítulo B</h1><h1>B</h1><h2>B.1</h2><h3>B.1.1</h3><h1>Other</h1><h2>Other.1</h2>', '<h1 data-word-chapter="true">Capítulo C</h1><h1>C</h1><h2>C.1</h2><h3>C.1.1</h3>'];
  const expected = ['1. ', '1.1 ', '2. ', '2.1 ', '2.1.1 ', '3. ', '3.1 ', '3. ', '3.1 ', '3.1.1 '];
  it('restarts H1 at each chapter position across pages without numbering chapter titles', () => {
    const hosts = bodies(...pages);
    expect(renumberHeadings(hosts, true)).toBe(true);
    expect(numbers(hosts)).toEqual(expected);
    expect(renumberHeadings(hosts, true)).toBe(false);
    expect(hosts.every(host => !host.querySelector('[data-word-chapter] [data-word-heading-number]'))).toBe(true);
    renumberHeadings(hosts, false); expect(numbers(hosts)).toEqual([]);
  });
  it('does not count chapter continuations or lose the chapter number when H1 is omitted', () => {
    const hosts = bodies('<h1 data-word-chapter="true">A</h1><h2>A1</h2>', '<h1 data-word-chapter="true" data-word-continuation="a">continued</h1><h2>A2</h2><h1 data-word-chapter="true">B</h1><h2>B1</h2>');
    renumberHeadings(hosts, true); expect(numbers(hosts)).toEqual(['1.1 ', '1.2 ', '2.1 ']);
  });
  it('recalculates after removing a chapter and replaces old manual numbers inside chapters', () => {
    const hosts = bodies(...pages);
    renumberHeadings(hosts, true);
    hosts[1].querySelector('[data-word-chapter]')!.remove();
    renumberHeadings(hosts, true);
    expect(numbers(hosts).slice(-3)).toEqual(['2. ', '2.1 ', '2.1.1 ']);
    const manual = bodies('<h1 data-word-chapter="true">A</h1><h1>5. Typed</h1><h2>Sub</h2>');
    renumberHeadings(manual, true); expect(numbers(manual)).toEqual(['1. ', '1.1 ']);
    expect(manual[0].textContent).toContain('1. Typed');
  });
  it('produces the same outline directly in the Canvas model and is stable on repeated normalization', () => {
    const outline = new HeadingOutlineCounter();
    const states = pages.map((html, index) => htmlToDocumentState(html, 0, `p${index}`));
    const roots = states.map(state => numberModelHeadings(state.roots, outline, true));
    const hosts = bodies(...roots.map((root, index) => documentStateToHtml({...states[index], roots: root})));
    expect(numbers(hosts)).toEqual(expected);
    const again = new HeadingOutlineCounter();
    roots.forEach(root => expect(numberModelHeadings(root, again, true)).toBe(root));
  });
  it('uses only Chapter order despite arbitrary chapter names and stale imported heading labels', () => {
    const html = '<h1 data-word-chapter="true">CAPÍTULO 99. 1.1, 2</h1><h1>1. INTRODUCCIÓN</h1><h2>1.1 PLANTEAMIENTO</h2><h1 data-word-chapter="true">CAPÍTULO I: ESTUDIO DE MERCADO</h1><h1><b>3</b><i>. </i>OBJETIVOS</h1><h2><span>3.1 </span>METODOLOGÍA</h2><h3>3.1.1 MÉTODO</h3>';
    const hosts = bodies(html);
    renumberHeadings(hosts, true);
    expect(numbers(hosts)).toEqual(['1. ', '1.1 ', '2. ', '2.1 ', '2.1.1 ']);
    expect(hosts[0].querySelectorAll('h1')[3].textContent).toBe('2. OBJETIVOS');
    expect(hosts[0].querySelector('[data-word-chapter]')!.textContent).toBe('CAPÍTULO 99. 1.1, 2');
    expect(renumberHeadings(hosts, true)).toBe(false);
    const state = htmlToDocumentState(html);
    const roots = numberModelHeadings(state.roots, new HeadingOutlineCounter(), true);
    const projected = bodies(documentStateToHtml({...state, roots}));
    expect(numbers(projected)).toEqual(numbers(hosts));
    expect(projected[0].textContent).toBe(hosts[0].textContent);
    expect(numberModelHeadings(roots, new HeadingOutlineCounter(), true)).toBe(roots);
    const withoutChapters = bodies('<h1>5. Existing</h1><h2>Sub</h2>');
    renumberHeadings(withoutChapters, true);
    expect(numbers(withoutChapters)).toEqual(['5.1 ']);
  });
  it('ignores invisible empty chapters and headings left between the visible chapters', () => {
    // Stored document: visible Chapters on p7, empty Chapter on p17, visible Chapter on p18.
    const source = [
      '<h1 data-word-chapter="true">PERFIL DEL PROYECTO</h1><h1 data-word-chapter="true">INTRODUCCIÓN</h1><h2>PLANTEAMIENTO</h2>',
      '<h1 data-word-chapter="true" data-word-flow="block-mwa74iwr-1"><b><br></b></h1><h1> \u200b </h1><h1 data-word-chapter="true">&nbsp;</h1>',
      '<h1 data-word-chapter="true">CAPÍTULO II: ESTUDIO DE MERCADO</h1><h1>4. OBJETIVOS</h1><h2>4.1 METODOLOGÍA</h2>'
    ];
    const hosts = bodies(...source);
    renumberHeadings(hosts, true);
    expect(numbers(hosts)).toEqual(['2.1 ', '3. ', '3.1 ']);
    expect(renumberHeadings(hosts, true)).toBe(false);
    const outline = new HeadingOutlineCounter();
    const projected = source.map((html, index) => {
      const state = htmlToDocumentState(html, 0, `empty-${index}`);
      return documentStateToHtml({...state, roots: numberModelHeadings(state.roots, outline, true)});
    });
    expect(numbers(bodies(...projected))).toEqual(numbers(hosts));
    hosts[0].querySelectorAll('h1')[1].removeAttribute('data-word-chapter');
    renumberHeadings(hosts, true);
    expect(numbers(hosts)).toEqual(['1. ', '1.1 ', '2. ', '2.1 ']);
  });
  it('renumbers native Canvas chapter edits and restores numbering after undo and redo', () => {
    const session = new CanvasEditSession({width: 600, height: 800, top: 50, right: 50, bottom: 50, left: 50}, {font: '12px serif', lineHeight: 20}, text => ({width: text.length * 6, ascent: 10, descent: 2}));
    session.load([{id: 'a', html: '<h1 data-word-chapter="true">A</h1><h1>First</h1><h1>New chapter</h1><h1>Last</h1>'}]);
    session.renumberHeadings(true);
    const prefixes = () => numbers(bodies(...session.pages.map(page => page.html)));
    expect(prefixes()).toEqual(['1. ', '2. ', '3. ']);
    const leaf = textNodes(session.engine.getSections()[0].model.state.roots).find(node => node.text === 'New chapter')!;
    session.setSelection(0, {anchor: {nodeId: leaf.id, offset: 0}, focus: {nodeId: leaf.id, offset: 0}});
    session.applyChapter(); session.renumberHeadings(true);
    expect(prefixes()).toEqual(['1. ', '2. ']);
    session.undo(); session.renumberHeadings(true);
    expect(prefixes()).toEqual(['1. ', '2. ', '3. ']);
    session.undo(true); session.renumberHeadings(true);
    expect(prefixes()).toEqual(['1. ', '2. ']);
    const snapshot = session.engine.getSections()[0].model.state;
    session.renumberHeadings(true);
    expect(session.engine.getSections()[0].model.state).toBe(snapshot);
  });

});
