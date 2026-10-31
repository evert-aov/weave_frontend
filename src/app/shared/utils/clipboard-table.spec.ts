import { describe, expect, it } from 'vitest';
import { clipboardTableHtml } from './clipboard-table';

function fragment(html: string | null): HTMLDivElement {
  const div = document.createElement('div');
  div.innerHTML = html ?? '';
  return div;
}

describe('clipboard tables', () => {
  it('prefers an HTML table, preserving surrounding text, formatting and merged cells', () => {
    const result = fragment(clipboardTableHtml('<p>Before</p><table><tr><th colspan="2">Header</th></tr>'
      + '<tr><td rowspan="2"><b>A</b></td><td>B</td></tr><tr><td>C</td></tr></table><p>After</p>', 'fallback\ttext'));
    expect(result.querySelector('th')?.colSpan).toBe(2);
    expect(result.querySelector('td')?.rowSpan).toBe(2);
    expect(result.querySelector('b')?.textContent).toBe('A');
    expect(result.firstElementChild?.textContent).toBe('Before');
    expect(result.lastElementChild?.textContent).toBe('After');
    expect(result.textContent).not.toContain('fallback');
  });

  it('removes executable markup, external styles and pagination metadata from copied HTML', () => {
    const result = fragment(clipboardTableHtml('<table id="source" onclick="alert(1)" data-word-flow="old" style="height:10000px;width:5000px">'
      + '<tr><td style="background-color:red;text-align:right;background-image:url(https://example.com)" rowspan="-1">'
      + '<script>alert(1)</script><iframe src="https://example.com"></iframe><img src="x" onerror="alert(1)">'
      + '<a href="javascript:alert(1)">Text</a></td></tr></table>', ''));
    expect(result.querySelector('script,iframe,[onclick],[onerror],[data-word-flow],[id],[rowspan],[href]')).toBeNull();
    const table = result.querySelector('table')!;
    expect(table.style.width).toBe('100%');
    expect(table.style.height).toBe('');
    const cell = result.querySelector('td')!;
    expect(cell.style.backgroundColor).toBe('red');
    expect(cell.style.textAlign).toBe('right');
    expect(cell.style.backgroundImage).toBe('');
  });

  it('reads spreadsheet cells, including quoted newlines, tabs, quotes and trailing empty cells', () => {
    const result = fragment(clipboardTableHtml('', 'Name\tNote\t\r\nAna\t"First\nSecond\t""quoted"""\t\r\n'));
    expect(result.querySelectorAll('tr')).toHaveLength(2);
    expect(result.querySelectorAll('td')).toHaveLength(6);
    expect(result.querySelectorAll('td')[4].innerHTML).toContain('First<br>Second\t"quoted"');
    expect(result.querySelectorAll('td')[5].textContent).toBe('');
  });

  it('recognizes a single spreadsheet row with multiple columns', () => {
    expect(fragment(clipboardTableHtml('', '1\t2')).querySelectorAll('td')).toHaveLength(2);
  });

  it('recognizes Markdown tables inside prose, with alignment and escaped pipes', () => {
    const result = fragment(clipboardTableHtml('', 'Before\n\n| Name | Value |\n| :--- | ---: |\n| A\\|B | <b>literal</b> |\n\nAfter'));
    expect(result.querySelectorAll('table')).toHaveLength(1);
    expect(result.querySelectorAll('th')).toHaveLength(2);
    expect(result.querySelectorAll('td')[0].textContent).toBe('A|B');
    expect(result.querySelectorAll('td')[1].style.textAlign).toBe('right');
    expect(result.querySelector('b')).toBeNull();
    expect(result.textContent).toContain('<b>literal</b>');
    expect(result.textContent).toContain('Before');
    expect(result.textContent).toContain('After');
  });

  it.each([
    'ordinary text\nwith lines', 'Name | Value\nA | B', 'Text\tindented\nnot a grid',
    '```\n| A | B |\n| --- | --- |\n| 1 | 2 |\n```', 'a\t"unclosed',
  ])('leaves non-tabular content untouched: %s', (text) => {
    expect(clipboardTableHtml('', text)).toBeNull();
  });

  it('does not interpret HTML code examples as spreadsheet or Markdown tables', () => {
    expect(clipboardTableHtml('<pre>a\tb</pre>', 'a\tb')).toBeNull();
  });
});
