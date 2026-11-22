import { parseHtmlTableFromClipboard, parseTsvFromClipboard, serializeRangeToClipboard } from './clipboard.service';

describe('External spreadsheet clipboard formats', () => {
  it('imports HTML tables with header formatting, Excel CSS classes, locale numbers and spanning cells', () => {
    const matrix = parseHtmlTableFromClipboard(`<html><head><style>.number { color: #2563eb; background-color: #ffeb9c; font-weight: 700; }</style></head><body><table>
      <tr><th rowspan="2">Product</th><th colspan="2">Sales</th></tr>
      <tr><td class="number">$1,250.00</td><td>25%</td></tr>
      <tr><td>Laptop</td><td>1.234,50</td><td>5</td></tr>
    </table></body></html>`)!;
    expect(matrix[0].map(cell => cell.raw)).toEqual(['Product', 'Sales', '']);
    expect(matrix[1].map(cell => cell.raw)).toEqual(['', '1250', '0.25']);
    expect(matrix[1][1].style?.bold).toBe(true);
    expect(matrix[1][1].style?.numberFormat).toBe('currency');
    expect(matrix[1][2].style?.numberFormat).toBe('percent');
    expect(matrix[2][1].raw).toBe('1234.5');
  });

  it('round-trips quoted spreadsheet cells containing tabs, quotes and line breaks', () => {
    const source = { A1: { raw: 'one\ttwo\n"quoted"' }, B1: { raw: '42' } };
    const { tsv, html } = serializeRangeToClipboard(source, 0, 1, 0, 0);
    expect(parseTsvFromClipboard(tsv)[0].map(cell => cell.raw)).toEqual(['one\ttwo\n"quoted"', '42']);
    expect(parseHtmlTableFromClipboard(html)![0].map(cell => cell.raw)).toEqual(['one\ttwo\n"quoted"', '42']);
  });

  it('preserves full CellStyle including borders, number formats, alignment, wrapText and presets across HTML round-trips', () => {
    const source = {
      A1: {
        raw: '0.25',
        style: {
          bold: true,
          italic: true,
          underline: true,
          bgColor: '#ffeb9c',
          textColor: '#9c6500',
          align: 'right' as const,
          verticalAlign: 'middle' as const,
          wrapText: true,
          fontFamily: 'Georgia',
          fontSize: 13,
          numberFormat: 'percent' as const,
          decimals: 1,
          preset: 'neutral' as const,
          borders: {
            top: { style: 'medium' as const, color: '#107c41' },
            bottom: { style: 'double' as const, color: '#000000' },
          },
        },
      },
    };
    const { html } = serializeRangeToClipboard(source, 0, 0, 0, 0);
    const parsed = parseHtmlTableFromClipboard(html)!;
    expect(parsed[0][0].raw).toBe('0.25');
    expect(parsed[0][0].style).toEqual(source.A1.style);
  });

  it('imports CSS borders and alignment from external HTML tables', () => {
    const parsed = parseHtmlTableFromClipboard(
      '<table><tr><td style="border-top: 2px solid #ff0000; border-bottom: 3px double #000000; vertical-align: bottom; white-space: normal;">Data</td></tr></table>'
    )!;
    expect(parsed[0][0].style?.borders?.top).toEqual({ style: 'medium', color: '#ff0000' });
    expect(parsed[0][0].style?.borders?.bottom).toEqual({ style: 'double', color: '#000000' });
    expect(parsed[0][0].style?.verticalAlign).toBe('bottom');
    expect(parsed[0][0].style?.wrapText).toBe(true);
  });
});
