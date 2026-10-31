import { describe, expect, it, vi } from 'vitest';
import { DocxParserService } from './docx-parser.service';

describe('DOCX page break semantics', () => {
  async function parse(body: string) {
    const service = new DocxParserService();
    const archive = service as unknown as {
      extractDocxArchiveContents(buffer: ArrayBuffer): Promise<unknown>;
    };
    vi.spyOn(archive, 'extractDocxArchiveContents').mockResolvedValue({
      xmlFiles: { 'word/document.xml': `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/></w:sectPr></w:body></w:document>` },
      mediaBlobUrls: {},
    });
    return service.parseDocxFile({ name: 'flow.docx', arrayBuffer: async () => new ArrayBuffer(0) } as File);
  }

  it('does not turn cached rendered page breaks into manual breaks or extra paragraphs', async () => {
    const result = await parse('<w:p><w:r><w:t>Before</w:t><w:lastRenderedPageBreak/><w:t>After</w:t></w:r></w:p>');
    expect(result.pages).toHaveLength(1);
    expect(result.pages[0].breakBefore).toBeUndefined();
    const holder = document.createElement('div');
    holder.innerHTML = result.pages[0].html;
    expect(holder.textContent).toBe('BeforeAfter');
    expect(holder.querySelectorAll('p')).toHaveLength(1);
  });

  it('preserves actual page breaks embedded in paragraph runs', async () => {
    const result = await parse('<w:p><w:r><w:t>Before</w:t><w:br w:type="page"/><w:t>After</w:t></w:r></w:p>');
    expect(result.pages).toHaveLength(2);
    expect(result.pages[1].breakBefore).toBe('manual');
  });

  it('keeps pageBreakBefore when importing paragraph properties', async () => {
    const result = await parse('<w:p><w:r><w:t>First</w:t></w:r></w:p><w:p><w:pPr><w:pageBreakBefore/></w:pPr><w:r><w:t>Second</w:t></w:r></w:p>');
    expect(result.pages).toHaveLength(2);
    expect(result.pages[1].breakBefore).toBe('manual');
  });
});
