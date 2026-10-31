import { describe, expect, it } from 'vitest';
import { markdownHtml, markdownParts, richHtmlToMarkdown, normalizeLiveMarkdown } from './markdown-document';

describe('Markdown document compatibility', () => {
  it('renders headings, emphasis, nested lists and GFM tables', () => {
    const html = markdownHtml('# Título\n\n**Texto** y *énfasis*\n\n- Primero\n  - Hijo\n\n| A | B |\n| --- | --- |\n| 1 | 2 |');
    expect(html).toContain('<h1>Título</h1>'); expect(html).toContain('<strong>Texto</strong>');
    expect(html).toContain('<em>énfasis</em>'); expect(html).toContain('<table>');
    expect(html.match(/<ul>/g)).toHaveLength(2);
  });
  it('strips executable HTML and unsafe URL protocols without losing text', () => {
    const html = markdownHtml('<script>alert(1)</script><img src="x" onerror="alert(1)"><a href="javascript:alert(1)">Enlace</a>\n\nTexto');
    expect(html).not.toMatch(/<script|onerror|javascript:/); expect(html).toContain('Texto');
  });
  it('preserves exact offsets across blanks, CRLF and omitted reference definitions', () => {
    const source = '# Uno\r\n\r\n[ref]: /?document=abc\r\n\r\n[Ir][ref]\r\n\r\nÚltimo';
    const parts = markdownParts(source);
    for (const part of parts) expect(source.slice(part.from, part.to)).toBe(part.raw);
    const link = parts.find(part => part.raw === '[Ir][ref]')!;
    expect(link.from).toBe(source.indexOf('[Ir][ref]')); expect(link.html).toContain('href="/?document=abc"');
    expect(parts.at(-1)!.from).toBe(source.indexOf('Último'));
  });
  it('converts simple rich documents while keeping document references usable', () => {
    const source = richHtmlToMarkdown('<h2>Título</h2><p>Un <strong>texto</strong> con <a href="/?document=abc">enlace</a>.</p>');
    expect(source).toContain('## Título'); expect(source).toContain('**texto**');
    expect(markdownHtml(source)).toContain('href="/?document=abc"');
  });
  it('preserves merged tables, styled paragraphs and task lists as supported raw HTML', () => {
    const html = '<p style="text-align: right">Texto</p><table><tr><td colspan="2">Celda</td></tr></table>';
    const roundTrip = markdownHtml(richHtmlToMarkdown(html));
    expect(roundTrip).toContain('colspan="2"'); expect(roundTrip).toContain('text-align: right');
    expect(richHtmlToMarkdown('<p></p>')).toBe('');
  });
  it('converts the reported mixed heading/link/table document without exposing HTML tags', () => {
    const html = '<h2>Corriente electrica</h2><p><a rel="noopener noreferrer nofollow" href="/?document=6adea4aecbae6a6a0842becf">ds</a> sadsa\nda sadsadsadsa</p><table><tbody><tr><th><p>Hola</p></th><th><p>Mundo</p></th></tr><tr><td><p>a</p></td><td><p>a</p></td></tr></tbody></table><h3>dsadsadsads</h3><p></p> da';
    const source = normalizeLiveMarkdown(html);
    expect(source).not.toMatch(/<\/?(?:h2|h3|p|a|table|tbody|tr|th|td)\b/);
    expect(source).toContain('## Corriente electrica'); expect(source).toContain('### dsadsadsads');
    expect(source).toContain('| Hola | Mundo |'); expect(source).toContain('| a | a |');
    const root = document.createElement('div'); root.innerHTML = markdownHtml(source);
    expect(root.querySelector('a')!.getAttribute('href')).toBe('/?document=6adea4aecbae6a6a0842becf');
    expect(root.querySelectorAll('th')).toHaveLength(2); expect(root.querySelectorAll('td')).toHaveLength(2);
    expect(root.textContent).toContain('da sadsadsadsa');
    expect(normalizeLiveMarkdown(source)).toBe(source);
  });
  it('isolates unsupported rich content instead of keeping the entire document as HTML', () => {
    const source = richHtmlToMarkdown('<h2>Title</h2><table><tr><th colspan="2">Merged</th></tr></table><p>After</p>');
    expect(source).toMatch(/^## Title/); expect(source).toContain('colspan="2"'); expect(source).toMatch(/After$/);
    const parts = markdownParts(source); expect(parts.map(p=>p.type)).toEqual(['heading','html','paragraph']);
  });
  it('preserves literal HTML in fenced and inline code during automatic repair', () => {
    const source = '```html\n<h2>Example</h2>\n```\n\nUse `<p>` here.';
    expect(normalizeLiveMarkdown(source)).toBe(source);
    expect(markdownHtml(richHtmlToMarkdown('<pre><code>&lt;p&gt;example&lt;/p&gt;</code></pre>'))).toContain('&lt;p&gt;example&lt;/p&gt;');
  });
  it('keeps unsupported inline styling rendered as an isolated rich block', () => {
    const source = normalizeLiveMarkdown('Before\n\nText <u>underlined</u>.\n\nAfter');
    expect(markdownParts(source).map(part => part.type)).toEqual(['paragraph','html','paragraph']);
    expect(markdownHtml(source)).toContain('<u>underlined</u>');
  });
  it('preserves multiple paragraphs within a table cell', () => {
    const source = richHtmlToMarkdown('<table><tr><th>Title</th></tr><tr><td><p>First</p><p>Second</p></td></tr></table>');
    expect(source).toContain('<p>First</p><p>Second</p>');
  });

  it('escapes literal pipe characters in table cells', () => {
    const source = richHtmlToMarkdown('<table><tr><th>A | B</th></tr><tr><td>**text**</td></tr></table>');
    const root = document.createElement('div'); root.innerHTML = markdownHtml(source);
    expect(root.querySelectorAll('th')).toHaveLength(1); expect(root.querySelector('th')!.textContent).toBe('A | B');
    expect(root.querySelector('td')!.textContent).toBe('**text**');
  });

  it('keeps ordered list numbering and nested list indentation', () => {
    const source = richHtmlToMarkdown('<ol start="3"><li><p>Tres</p><ul><li><p>Hijo</p></li></ul></li><li><p>Cuatro</p></li></ol>');
    const html = markdownHtml(source);
    expect(html).toContain('<ol start="3">'); expect(html).toContain('<ul>'); expect(html).toContain('Cuatro');
  });
});
