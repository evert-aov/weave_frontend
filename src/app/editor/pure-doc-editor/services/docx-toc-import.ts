const WORD = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const attr = (element: Element, name: string) => element.getAttributeNS(WORD, name) || element.getAttribute(`w:${name}`) || '';
const text = (element: Element): string => Array.from(element.childNodes).map(node => {
  if (!(node instanceof Element)) return '';
  if (['instrText','del','delText'].includes(node.localName)) return '';
  if (node.localName === 't') return node.textContent || '';
  if (node.localName === 'tab') return '\t';
  if (node.localName === 'br') return '\n';
  return text(node);
}).join('');
export interface ImportedTocEntry { title: string; page: string; target?: string; }

/** Los campos complejos de Word pueden comenzar y terminar en párrafos diferentes. */
export class DocxTocImport {
  private readonly fieldParagraphs = new Set<Element>();
  private readonly controls = new Set<Element>();
  private readonly targets = new Map<Element, string>();
  private readonly bookmarks = new Map<string, string>();
  constructor(body: Element | null) {
    if (!body) return;
    let sequence = 0;
    for (const p of Array.from(body.getElementsByTagNameNS(WORD, 'p'))) {
      const names = Array.from(p.getElementsByTagNameNS(WORD, 'bookmarkStart')).map(node => attr(node,'name')).filter(name => name && name !== '_GoBack');
      if (names.length) { const id = `docx-target-${++sequence}`; this.targets.set(p,id); names.forEach(name => this.bookmarks.set(name,id)); }
    }
    type Field = { instruction: string; result: boolean; controls: Set<Element> };
    const stack: Field[] = [], fields: Field[] = [];
    const visit = (node: Element, paragraph: Element | null): void => {
      if (node.localName === 'del') return;
      if (node.localName === 'p') paragraph = node;
      if (node.localName === 'fldChar') {
        const kind = attr(node,'fldCharType');
        if (kind === 'begin') { const field: Field = {instruction:'',result:false,controls:new Set()}; stack.push(field); fields.push(field); }
        if (paragraph && stack.length) stack[stack.length-1].controls.add(paragraph);
        if (kind === 'separate' && stack.length) stack[stack.length-1].result=true;
        if (kind === 'end') stack.pop();
      } else if (node.localName === 'instrText' && stack.length && !stack[stack.length-1].result) {
        stack[stack.length-1].instruction += node.textContent || '';
        if (paragraph) stack[stack.length-1].controls.add(paragraph);
      } else if (node.localName === 't' && paragraph && stack.some(field => field.result && /^\s*TOC(?:\s|$)/i.test(field.instruction))) {
        this.fieldParagraphs.add(paragraph);
      }
      for (const child of Array.from(node.children)) visit(child,paragraph);
    };
    visit(body,null);
    fields.filter(field => /^\s*TOC(?:\s|$)/i.test(field.instruction)).forEach(field => field.controls.forEach(p => { if (!text(p).trim()) this.controls.add(p); }));
  }
  visibleText(paragraph: Element): string { return text(paragraph); }
  inField(paragraph: Element): boolean { return this.fieldParagraphs.has(paragraph); }
  isControl(paragraph: Element): boolean { return this.controls.has(paragraph); }
  target(paragraph: Element): string | undefined { return this.targets.get(paragraph); }
  entry(paragraph: Element): ImportedTocEntry {
    const visible = text(paragraph).trim();
    const match = /^(.*?)(?:\t+|[ .\u00a0]+)(\d+|[ivxlcdm]+)\s*$/i.exec(visible);
    const anchor = Array.from(paragraph.getElementsByTagNameNS(WORD,'hyperlink')).map(node => attr(node,'anchor')).find(Boolean)
      || Array.from(paragraph.getElementsByTagNameNS(WORD,'instrText')).map(node => /PAGEREF\s+([^\s\\]+)/i.exec(node.textContent || '')?.[1]).find(Boolean)
      || Array.from(paragraph.getElementsByTagNameNS(WORD,'fldSimple')).map(node => /PAGEREF\s+([^\s\\]+)/i.exec(attr(node,'instr'))?.[1]).find(Boolean);
    return {title:(match?.[1] || visible).trim(),page:match?.[2] || '',target:anchor ? this.bookmarks.get(anchor) : undefined};
  }
}

/** Unifica los índices importados con el formato editable/exportable del editor. */
export function groupImportedToc(html: string): string {
  const root=document.createElement('div');root.innerHTML=html;
  let section: HTMLElement | null=null;
  for (const node of Array.from(root.childNodes)) {
    if (node instanceof HTMLElement && node.matches('.word-toc-entry,.word-toc-header')) {
      if (!section) { section=document.createElement('div');section.className='word-toc-page-section';section.dataset['nativeWordToc']='true';node.before(section); }
      section.append(node);
    } else if (node.textContent?.trim() || node instanceof HTMLElement) section=null;
  }
  return root.innerHTML;
}

/** Conserva el formato de los runs a ambos lados del tabulador, sin incluir instrucciones de campos. */
export function importedTocRuns(inner: string, entry: ImportedTocEntry): { title: string; page: string } {
  const root=document.createElement('div');root.innerHTML=inner;
  const separator=root.querySelector('.docx-toc-leader,.docx-tab');
  const escape=(value:string)=>{const span=document.createElement('span');span.textContent=value;return span.innerHTML;};
  if (separator) {
    const before=document.createRange();before.selectNodeContents(root);before.setEndBefore(separator);
    const after=document.createRange();after.selectNodeContents(root);after.setStartAfter(separator);
    const title=document.createElement('span'),page=document.createElement('span');title.append(before.cloneContents());page.append(after.cloneContents());
    const normalize=(value:string)=>value.replace(/\s+/g,' ').trim();
    if (normalize(title.textContent || '')===normalize(entry.title) && normalize(page.textContent || '')===entry.page) return {title:title.innerHTML,page:page.innerHTML};
  }
  return {title:escape(entry.title),page:escape(entry.page)};
}
