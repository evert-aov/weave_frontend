import { docxColumnWidths } from './docx-table-widths';
import type { DocumentLayoutConfig, DocumentPage } from '../models/word-document.model';
import { PAPER_FORMAT_PRESETS } from '../constants/word-document.constants';
import { tableCellGrid } from '../utils/table-cell-grid';
import { DocxListNumbering } from './docx-list-numbering';
import { DocxMedia } from './docx-media';
import { DocxNotes } from './docx-notes';
import { WORD_NS, xml } from './docx-package';
import { points, runStyle, textRun, runProperties, type DocxRunStyle } from './docx-formatting';
interface ParagraphOptions { left?: number; hanging?: number; numberingId?: number; before?: number; line?: number; }
export class DocxDocumentWriter {
  readonly numbering = new DocxListNumbering();
  readonly links = new Map<string, string>();
  private readonly bookmarks = new Map<string, { id: number; name: string }>();
  readonly style: DocxRunStyle;
  readonly notes: DocxNotes;
  private endedNotes = false;
  private tocRemaining = 0;
  private tocStarted = false;
  constructor(private readonly pages: DocumentPage[], private readonly layout: DocumentLayoutConfig, readonly media: DocxMedia) {
    this.style = { font: layout.apa?.fontFamily || 'Times New Roman', size: layout.apa?.fontSizePt || 11, bold: false, italic: false, underline: false, strike: false, color: '000000' };
    this.notes = new DocxNotes(pages, this.style);
    pages.forEach(page => { const body = document.createElement('div'); body.innerHTML = page.html; this.tocRemaining += body.querySelectorAll('.word-toc-entry').length; body.querySelectorAll<HTMLElement>('[id]').forEach(element => {
      if (!this.bookmarks.has(element.id)) { const id = this.bookmarks.size + 1; this.bookmarks.set(element.id, { id, name: element.tagName === 'SPAN' && element.dataset['apaHeadingLevel'] ? `APA_RUNIN_${element.dataset['apaHeadingLevel']}_${id}` : `target_${id}` }); }
    }); });
  }
  get relationships(): string { return [...this.links].map(([url, id]) => `<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${xml(url)}" TargetMode="External"/>`).join(''); }
  private bookmark(element: HTMLElement, content: string): string {
    const bookmark = this.bookmarks.get(element.id); return bookmark ? `<w:bookmarkStart w:id="${bookmark.id}" w:name="${bookmark.name}"/>${content}<w:bookmarkEnd w:id="${bookmark.id}"/>` : content;
  }
  private link(target: string, content: string): string {
    if (target.startsWith('#')) { const bookmark = this.bookmarks.get(target.slice(1)); return bookmark ? `<w:hyperlink w:anchor="${bookmark.name}">${content}</w:hyperlink>` : content; }
    let url: URL; try { url = new URL(target, document.baseURI); } catch { return content; }
    if (!['https:', 'http:', 'mailto:', 'tel:'].includes(url.protocol)) return content;
    let id = this.links.get(url.href); if (!id) { id = `link${this.links.size + 1}`; this.links.set(url.href, id); }
    return `<w:hyperlink r:id="${id}">${content}</w:hyperlink>`;
  }
  private inline(node: Node, inherited: DocxRunStyle): string {
    if (node.nodeType === Node.TEXT_NODE) {
      const value = node.textContent || '';
      return textRun(node.parentElement?.closest('pre,.docx-tab') ? value : value.replace(/[ \t\r\n\f]+/g, ' '), inherited);
    }
    if (node instanceof SVGElement) throw new Error('La ilustración SVG debe convertirse antes de exportar DOCX.');
    if (!(node instanceof HTMLElement)) return '';
    if (node.matches('[data-word-note-id]')) return this.notes.reference(node);
    if (node.tagName === 'IMG') {
      const cell = node.closest('td,th') as HTMLTableCellElement | null, table = cell?.closest('table');
      const limit = cell && table ? Math.max(16, this.contentWidth() * cell.colSpan / Math.max(1, tableCellGrid(table).width) - 16) : this.contentWidth();
      return this.bookmark(node, this.media.drawing(node as HTMLImageElement, limit));
    }
    if (node.tagName === 'BR') return '<w:r><w:br/></w:r>';
    if (node.classList.contains('word-toc-dots')) return '<w:r><w:tab/></w:r>';
    const style = runStyle(node, inherited);
    let content = Array.from(node.childNodes).map(child => this.inline(child, style)).join('');
    if (node.classList.contains('word-toc-page')) {
      const target = node.closest<HTMLElement>('[data-toc-target-id]')?.dataset['tocTargetId'];
      const bookmark = target ? this.bookmarks.get(target) : undefined;
      if (bookmark) content = `<w:fldSimple w:instr=" PAGEREF ${bookmark.name} \\h ">${content}</w:fldSimple>`;
    }
    if (node.tagName === 'A' && node.getAttribute('href')) content = this.link(node.getAttribute('href')!, content);
    return this.bookmark(node, content);
  }
  private paragraph(element: HTMLElement, inherited = this.style, options: ParagraphOptions = {}): string {
    const heading = /^H([1-6])$/.exec(element.tagName), runIn = element.dataset['apaRunIn'];
    let props = heading ? `<w:pStyle w:val="Heading${heading[1]}"/><w:outlineLvl w:val="${Number(heading[1]) - 1}"/>` : runIn ? `<w:outlineLvl w:val="${Number(runIn) - 1}"/>` : '';
    if (element.classList.contains('word-toc-entry')) props += `<w:keepLines/><w:pStyle w:val="TOC${Math.min(6, Math.floor(points(element.style.paddingLeft) / 14) + 1)}"/>`;
    if (options.numberingId) props += `<w:numPr><w:ilvl w:val="0"/><w:numId w:val="${options.numberingId}"/></w:numPr>`;
    if (element.style.breakAfter === 'avoid' || heading) props += '<w:keepNext/>';
    const align = element.style.textAlign; if (['left','right','center','justify'].includes(align)) props += `<w:jc w:val="${align === 'justify' ? 'both' : align}"/>`;
    const before = points(element.style.marginTop) + (options.before || 0), after = points(element.style.marginBottom);
    const semanticLine=Number(element.dataset['wordLineSpacing']);
    const rawLine = semanticLine>0 ? String(semanticLine) : element.style.lineHeight;
    const line = Number(rawLine) || options.line || (this.layout.apa ? 2 : 0);
    const fixedLine = rawLine && /(?:px|pt|cm|in)$/.test(rawLine) ? points(rawLine) : 0;
    props += `<w:spacing w:before="${Math.round(before * 20)}" w:after="${Math.round(after * 20)}"${fixedLine ? ` w:line="${Math.round(fixedLine * 20)}" w:lineRule="${element.querySelector('img') ? 'atLeast' : 'exact'}"` : line ? ` w:line="${Math.round(line * 240)}" w:lineRule="auto"` : ''}/>`;
    const left = (options.left || 0) + Math.round(points(element.style.marginLeft || element.style.paddingLeft) * 20), indent = points(element.style.textIndent || (this.layout.apa && element.tagName === 'P' && !element.dataset['apaRole'] && !element.closest('blockquote,td,th,li') ? '36pt' : '0pt'));
    if (left || indent || options.hanging) props += `<w:ind w:left="${left}"${options.hanging ? ` w:hanging="${options.hanging}"` : indent < 0 ? ` w:hanging="${Math.round(-indent * 20)}"` : ` w:firstLine="${Math.round(indent * 20)}"`}/>`;
    if (element.classList.contains('word-toc-entry')) {
      const width = Math.round(this.contentWidth() * 15); props += `<w:tabs><w:tab w:val="right" w:leader="dot" w:pos="${width}"/></w:tabs>`;
    }
    const style = runStyle(element, inherited);
    if (heading && !element.style.fontWeight) style.bold = true;
    if (heading && this.layout.apa && ['3','5'].includes(heading[1]) && !element.style.fontStyle) style.italic = true;
    if (element.classList.contains('word-toc-header')) { style.bold = true; props += '<w:jc w:val="center"/><w:keepNext/>'; }
    let content = Array.from(element.childNodes).filter(node => !(node instanceof HTMLElement && /^(OL|UL)$/.test(node.tagName)) && !(element.classList.contains('word-toc-entry') && node.nodeType === Node.TEXT_NODE && !node.textContent?.trim())).map(node => this.inline(node, style)).join('');
    const target = element.dataset['tocTargetId']; if (target) content = this.link(`#${target}`, content);
    if (!element.textContent?.trim() && !element.querySelector('img') && element.querySelectorAll('br').length === 1) content = '';
    if (element.classList.contains('word-toc-entry')) {
      if (!this.tocStarted) {
        content = `<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> TOC \\o "1-${this.layout.apa ? 5 : 6}" \\h \\z \\u </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r>${content}`;
        this.tocStarted = true;
      }
      if (--this.tocRemaining === 0) content += '<w:r><w:fldChar w:fldCharType="end"/></w:r>';
    }
    content = this.bookmark(element, content);
    props += `<w:rPr>${runProperties(style)}</w:rPr>`;
    return `<w:p><w:pPr>${props}</w:pPr>${content || '<w:r><w:t/></w:r>'}</w:p>`;
  }
  private list(list: HTMLElement, inherited: DocxRunStyle, ancestor = 0): string {
    const left = ancestor + Math.round((Number(list.dataset['wordListIndent']) || points(list.style.marginLeft) + points(list.style.paddingLeft) || 36) * 20);
    const hanging = Math.round((Number(list.dataset['wordListHanging']) || 18) * 20);
    let counter = Number(list.getAttribute('start') || 1), id = this.numbering.register(list, counter + (list.firstElementChild?.hasAttribute('data-word-continuation') ? 1 : 0), left, hanging);
    return Array.from(list.querySelectorAll<HTMLElement>(':scope > li')).map(item => {
      if (item.hasAttribute('value')) { counter = Number(item.getAttribute('value')); id = this.numbering.register(list, counter, left, hanging); }
      let output = '', numbered = item.hasAttribute('data-word-continuation'), pending: Node[] = [];
      const emit = (element: HTMLElement) => { output += this.paragraph(element, runStyle(item, inherited), { numberingId: numbered ? undefined : id, left, hanging: numbered ? undefined : hanging }); numbered = true; };
      const flush = () => { if (!pending.length) return; const shell = item.cloneNode(false) as HTMLElement; pending.forEach(n => shell.append(n.cloneNode(true))); emit(shell); pending = []; };
      for (const node of Array.from(item.childNodes)) {
        if (node instanceof HTMLElement && /^(OL|UL)$/.test(node.tagName)) { flush(); if (!numbered) emit(item.cloneNode(false) as HTMLElement); output += this.list(node, inherited, left); }
        else if (node instanceof HTMLElement && /^(P|DIV|H[1-6])$/.test(node.tagName)) { flush(); emit(node); }
        else pending.push(node);
      }
      flush(); if (!numbered) emit(item.cloneNode(false) as HTMLElement); counter++; return output;
    }).join('');
  }
  private table(table: HTMLTableElement, inherited: DocxRunStyle): string {
    const grid = tableCellGrid(table), cols = Math.max(1, grid.width), apa = table.dataset['apaTable'] === 'true';
    const widths = docxColumnWidths(table, cols, Math.round(this.contentWidth() * 15));
    const borders = ['top','left','bottom','right','insideH','insideV'].map(side => `<w:${side} w:val="${apa && !['top','bottom'].includes(side) ? 'nil' : 'single'}" w:sz="4" w:color="${apa ? '000000' : '808080'}"/>`).join('');
    const rows = Array.from(table.rows).map((row, r) => {
      const header = row.parentElement?.tagName === 'THEAD' || apa && r === 0; let cells = '';
      for (let c = 0; c < cols;) {
        const slot = grid.rows[r]?.[c], span = slot?.cols || 1, continuation = !!slot && slot.row !== r;
        const properties = `<w:tcW w:w="${widths.slice(c, c + span).reduce((sum, width) => sum + width, 0)}" w:type="dxa"/>${span > 1 ? `<w:gridSpan w:val="${span}"/>` : ''}${slot && slot.rows > 1 ? `<w:vMerge${continuation ? '' : ' w:val="restart"'}/>` : ''}${apa ? `<w:shd w:val="clear" w:fill="FFFFFF"/>${header ? '<w:tcBorders><w:bottom w:val="single" w:sz="4" w:color="000000"/></w:tcBorders>' : row.parentElement?.tagName === 'TFOOT' ? '<w:tcBorders><w:top w:val="single" w:sz="4" w:color="000000"/></w:tcBorders>' : ''}` : ''}`;
        const cell = slot?.cell;
        const margins = ['Top','Left','Bottom','Right'].map(side => {
          const css = cell?.style.getPropertyValue(`padding-${side.toLowerCase()}`);
          const padding = css ? points(css) : ['Top','Bottom'].includes(side) ? 1.5 : 4;
          return `<w:${side.toLowerCase()} w:w="${Math.round(padding * 20)}" w:type="dxa"/>`;
        }).join('');
        const vertical = cell?.style.verticalAlign;
        const cellLayout = `<w:tcMar>${margins}</w:tcMar><w:vAlign w:val="${vertical === 'middle' ? 'center' : vertical === 'bottom' ? 'bottom' : 'top'}"/>`;
        let content = '<w:p/>';
        if (slot && !continuation) {
          const children = Array.from(slot.cell.children).filter(child => /^(P|DIV|H[1-6]|UL|OL|TABLE)$/.test(child.tagName));
          const font = runStyle(slot.cell, inherited);
          content = children.length ? children.map(child => this.blocks(child as HTMLElement, font, { line: apa ? 1.5 : undefined })).join('') : this.paragraph(slot.cell, font, { line: apa ? 1.5 : undefined });
        }
        cells += `<w:tc><w:tcPr>${properties}${cellLayout}</w:tcPr>${content}</w:tc>`; c += span;
      }
      return `<w:tr>${header ? '<w:trPr><w:tblHeader/></w:trPr>' : ''}${cells}</w:tr>`;
    }).join('');
    return `<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/><w:tblBorders>${borders}</w:tblBorders><w:tblLayout w:type="fixed"/></w:tblPr><w:tblGrid>${widths.map(width => `<w:gridCol w:w="${width}"/>`).join('')}</w:tblGrid>${rows}</w:tbl>`;
  }
  private blocks(element: HTMLElement, inherited = this.style, options: ParagraphOptions = {}): string {
    if (element.hasAttribute('data-word-note-list') || element.hasAttribute('data-note-entry-id')) return '';
    if (element.tagName === 'TABLE') return this.table(element as HTMLTableElement, runStyle(element, inherited));
    if (/^(UL|OL)$/.test(element.tagName)) return this.list(element, inherited);
    if (element.classList.contains('word-toc-entry')) return this.paragraph(element, inherited, options);
    if (element.tagName === 'DIV' || element.tagName === 'BLOCKQUOTE') {
      const children = Array.from(element.children).filter(child => /^(P|DIV|H[1-6]|UL|OL|TABLE|BLOCKQUOTE)$/.test(child.tagName));
      if (children.length) return children.map((child, index) => this.blocks(child as HTMLElement, runStyle(element, inherited), { ...options, left: (options.left || 0) + Math.round(points(element.style.marginLeft) * 20), before: index ? 0 : points(element.style.paddingTop) + (options.before || 0), line: Number(element.style.lineHeight) || options.line })).join('');
    }
    if (element.tagName === 'IMG') { const p = document.createElement('p'); p.append(element.cloneNode(true)); return this.paragraph(p, inherited, options); }
    return this.paragraph(element, inherited, options);
  }
  private contentWidth(): number {
    const preset = PAPER_FORMAT_PRESETS[this.layout.paperFormatId] || PAPER_FORMAT_PRESETS.letter;
    const width = this.layout.orientation === 'landscape' ? preset.heightPx : preset.widthPx;
    return width - this.layout.margins.leftPx - this.layout.margins.rightPx;
  }
  section(continueNumbering = false, continuous = false): string {
    const layout = this.layout, preset = PAPER_FORMAT_PRESETS[layout.paperFormatId] || PAPER_FORMAT_PRESETS.letter;
    const width = (layout.orientation === 'landscape' ? preset.heightCm : preset.widthCm) / 2.54 * 1440;
    const height = (layout.orientation === 'landscape' ? preset.widthCm : preset.heightCm) / 2.54 * 1440;
    return `<w:sectPr>${layout.apa ? '<w:headerReference w:type="default" r:id="rId3"/>' : layout.showHeaderFooter && layout.headerHtml ? '<w:headerReference w:type="default" r:id="generalHeader"/>' : ''}${!layout.apa && layout.showHeaderFooter && layout.footerHtml ? '<w:footerReference w:type="default" r:id="generalFooter"/>' : ''}${this.notes.has('footnote') ? '<w:footnotePr><w:pos w:val="pageBottom"/><w:numFmt w:val="decimal"/></w:footnotePr>' : ''}${this.notes.has('endnote') ? '<w:endnotePr><w:pos w:val="sectEnd"/><w:numFmt w:val="decimal"/></w:endnotePr>' : ''}${continuous ? '<w:type w:val="continuous"/>' : ''}<w:pgSz w:w="${Math.round(width)}" w:h="${Math.round(height)}"${layout.orientation === 'landscape' ? ' w:orient="landscape"' : ''}/><w:pgMar w:top="${layout.margins.topPx * 15}" w:right="${layout.margins.rightPx * 15}" w:bottom="${layout.margins.bottomPx * 15}" w:left="${layout.margins.leftPx * 15}" w:header="${layout.apa ? 720 : 360}" w:footer="360" w:gutter="0"/>${layout.apa && !continueNumbering ? '<w:pgNumType w:start="1"/>' : ''}</w:sectPr>`;
  }
  fragment(html: string): string {
    const root = document.createElement('div'); root.innerHTML = html;
    return Array.from(root.childNodes).map(node => node instanceof HTMLElement ? this.blocks(node) : node.textContent?.trim() ? `<w:p>${textRun(node.textContent, this.style)}</w:p>` : '').join('');
  }
  document(): string {
    let content = '';
    this.pages.forEach((page, index) => {
      const root = document.createElement('div'); root.innerHTML = page.html;
      if (root.querySelector('[data-apa-section="appendix"]') && this.notes.has('endnote') && !this.endedNotes) {
        content += `<w:p><w:pPr>${this.section(false, true)}</w:pPr></w:p>`; this.endedNotes = true;
      }
      // Word lays out automatic page breaks itself, including space for native notes.
      const manual = index && page.breakBefore === 'manual' && !root.querySelector('[data-word-note-list="endnote"]');
      let pageContent = '';
      for (const node of Array.from(root.childNodes)) {
        if (node instanceof HTMLElement) pageContent += this.blocks(node);
        else if (node.nodeType === Node.TEXT_NODE && node.textContent?.trim()) pageContent += `<w:p>${textRun(node.textContent, this.style)}</w:p>`;
      }
      if (manual && pageContent.startsWith('<w:p><w:pPr>')) pageContent = pageContent.replace('<w:p><w:pPr>', '<w:p><w:pPr><w:pageBreakBefore/>');
      else if (manual) pageContent = '<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="1" w:lineRule="exact"/></w:pPr><w:r><w:br w:type="page"/></w:r></w:p>' + pageContent;
      content += pageContent;
    });
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="${WORD_NS}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><w:body>${content}${this.section(this.endedNotes)}</w:body></w:document>`;
  }
}
