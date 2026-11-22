import { describe, expect, it, vi } from 'vitest';
import { DocxParserService } from './docx-parser.service';
const ns='http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const styles=`<w:styles xmlns:w="${ns}"><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/></w:style><w:style w:type="paragraph" w:styleId="TOC2"><w:name w:val="toc 2"/><w:pPr><w:jc w:val="center"/></w:pPr></w:style></w:styles>`;
async function parse(body: string) {
  const service=new DocxParserService();
  vi.spyOn(service as unknown as {extractDocxArchiveContents(buffer: ArrayBuffer):Promise<unknown>},'extractDocxArchiveContents').mockResolvedValue({xmlFiles:{'word/document.xml':`<w:document xmlns:w="${ns}"><w:body>${body}<w:sectPr/></w:body></w:document>`,'word/styles.xml':styles},mediaBlobUrls:{}});
  return service.parseDocxFile({name:'native.docx',arrayBuffer:async()=>new ArrayBuffer(0)} as File);
}
const begin='<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText> TOC \\o "1-3" </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r>';
const end='<w:r><w:fldChar w:fldCharType="end"/></w:r>';
const row='<w:hyperlink w:anchor="_Toc123"><w:r><w:t>Introducción</w:t></w:r><w:r><w:tab/></w:r><w:fldSimple w:instr=" PAGEREF _Toc123 \\h "><w:r><w:t>12</w:t></w:r></w:fldSimple></w:hyperlink>';
const heading='<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:bookmarkStart w:id="1" w:name="_Toc123"/><w:r><w:t>Introducción</w:t></w:r><w:bookmarkEnd w:id="1"/></w:p>';
describe('native Word TOC import',()=>{
  it('tracks a complex field across paragraphs, excludes instructions and restores bookmark navigation',async()=>{
    const result=await parse(`<w:p>${begin}</w:p><w:p>${row}</w:p><w:p>${end}</w:p>${heading}<w:p><w:r><w:t>Texto posterior</w:t></w:r></w:p>`);
    const root=document.createElement('div');root.innerHTML=result.pages.map(p=>p.html).join('');
    expect(root.querySelectorAll('.word-toc-entry')).toHaveLength(1);
    const entry=root.querySelector<HTMLElement>('.word-toc-entry')!;
    expect(entry.querySelector('.word-toc-title')?.textContent).toBe('Introducción');
    expect(entry.querySelector('.word-toc-page')?.textContent).toBe('12');
    expect(entry.style.textAlign).toBe('left');
    expect(root.querySelector(`[id="${entry.dataset['tocTargetId']}"]`)?.tagName).toBe('H1');
    expect(root.querySelector('[data-native-word-toc]')).not.toBeNull();
    expect(root.textContent).not.toContain('PAGEREF'); expect(root.textContent).not.toContain('TOC \\o');
    expect(root.querySelectorAll('p')).toHaveLength(1);
    expect(root.querySelector('p')?.textContent).toBe('Texto posterior');
  });
  it('recovers an unclosed TOC field at the first real heading and preserves its named heading level',async()=>{
    const tocRow=`<w:p><w:pPr><w:pStyle w:val="TOC2"/></w:pPr>${row}</w:p>`;
    const realHeading='<w:p><w:pPr><w:pStyle w:val="Heading1"/><w:outlineLvl w:val="1"/></w:pPr><w:r><w:t>1. Introducción</w:t></w:r></w:p>';
    const result=await parse(`<w:p>${begin}</w:p>${tocRow}${realHeading}<w:p><w:r><w:t>Texto normal del cuerpo.</w:t></w:r></w:p>`);
    const root=document.createElement('div');root.innerHTML=result.pages.map(page=>page.html).join('');
    expect(result.properties.tocEntriesCount).toBe(1);
    expect(result.properties.headingCounts.h1).toBe(1);
    expect(root.querySelectorAll('.word-toc-entry')).toHaveLength(1);
    expect(root.querySelectorAll('h1')).toHaveLength(1);
    expect(root.querySelector('h1')?.textContent).toBe('1. Introducción');
    expect(root.querySelector('p')?.textContent).toBe('Texto normal del cuerpo.');
  });
  it('uses the editor TOC model for centered TOC styles inside an SDT and keeps body headings separate',async()=>{
    const result=await parse(`<w:sdt><w:sdtPr><w:docPartObj><w:docPartGallery w:val="Table of Contents"/></w:docPartObj></w:sdtPr><w:sdtContent><w:p><w:r><w:t>Table of Contents</w:t></w:r></w:p><w:p><w:pPr><w:pStyle w:val="TOC2"/></w:pPr>${row}</w:p></w:sdtContent></w:sdt>${heading}`);
    const root=document.createElement('div');root.innerHTML=result.pages.map(p=>p.html).join('');
    expect(root.querySelector<HTMLElement>('.word-toc-entry')?.style.textAlign).toBe('left');
    expect(root.querySelector<HTMLElement>('.word-toc-entry')?.style.paddingLeft).toBe('14pt');
    expect(root.querySelectorAll('h1')).toHaveLength(1);
    expect(root.querySelector('.word-toc-header')?.textContent).toBe('Table of Contents');
    expect(root.querySelector('.word-toc-title')?.textContent).toBe('Introducción');
  });
  it('does not mistake an ordinary PAGEREF cross-reference for a table of contents',async()=>{
    const result=await parse('<w:p><w:r><w:t>Véase página </w:t></w:r><w:fldSimple w:instr=" PAGEREF ref "><w:r><w:t>12</w:t></w:r></w:fldSimple></w:p>');
    expect(result.pages.map(p=>p.html).join('')).not.toContain('word-toc-entry');
  });
});

describe('additional native TOC forms',()=>{
  it('preserves roman page labels and inline emphasis in simple-field TOCs',async()=>{
    const result=await parse('<w:fldSimple w:instr=" TOC \\o &quot;1-3&quot; "><w:p><w:r><w:rPr><w:i/></w:rPr><w:t>Resumen</w:t></w:r><w:r><w:tab/></w:r><w:r><w:t>iv</w:t></w:r></w:p></w:fldSimple>');
    const root=document.createElement('div');root.innerHTML=result.pages.map(page=>page.html).join('');
    expect(root.querySelector('.word-toc-page')?.textContent).toBe('iv');
    expect(root.querySelector('.word-toc-title em')?.textContent).toBe('Resumen');
  });
});

import { WordCompatibilityService } from './word-compatibility.service';
import { rebuildTableOfContents } from '../utils/table-of-contents';
import { createDocxBlob } from './docx-export';
import { DEFAULT_LAYOUT_CONFIG } from '../constants/word-document.constants';
import { unzipSync, strFromU8 } from 'fflate';

describe('Word–Weave index round trip',()=>{
  it('adds a heading to an imported Word index and retains a native updatable TOC on export and reimport',async()=>{
    const imported=await parse(`<w:p>${begin}${row}${end}</w:p>${heading}`);
    imported.pages[imported.pages.length-1].html+='<h2>Nuevo título</h2>';
    const compatibility=Object.create(WordCompatibilityService.prototype) as WordCompatibilityService;
    const rebuilt=rebuildTableOfContents(imported.pages,0,false,headings=>compatibility.buildPaginatedTocPagesHtml(headings,3));
    expect(rebuilt.headings.map(h=>h.text)).toContain('Nuevo título');
    const holder=document.createElement('div');holder.innerHTML=rebuilt.pages.map(p=>p.html).join('');
    expect(holder.querySelectorAll('.word-toc-header')).toHaveLength(1);
    expect(holder.textContent).not.toMatch(/continuación/i);
    const bytes=unzipSync(new Uint8Array(await createDocxBlob(rebuilt.pages,DEFAULT_LAYOUT_CONFIG).arrayBuffer()));
    const xmlFiles=Object.fromEntries(Object.entries(bytes).filter(([name])=>name.endsWith('.xml')||name.endsWith('.rels')).map(([name,data])=>[name,strFromU8(data)]));
    expect(xmlFiles['word/document.xml']).toContain(' TOC \\o');
    const parser=new DocxParserService();
    vi.spyOn(parser as unknown as {extractDocxArchiveContents(buffer:ArrayBuffer):Promise<unknown>},'extractDocxArchiveContents').mockResolvedValue({xmlFiles,mediaBlobUrls:{}});
    const result=await parser.parseDocxFile({name:'roundtrip.docx',arrayBuffer:async()=>new ArrayBuffer(0)} as File);
    holder.innerHTML=result.pages.map(p=>p.html).join('');
    const added=Array.from(holder.querySelectorAll<HTMLElement>('.word-toc-entry')).find(entry=>entry.querySelector('.word-toc-title')?.textContent==='Nuevo título')!;
    expect(added).toBeTruthy();expect(holder.querySelector(`[id="${added.dataset['tocTargetId']}"]`)?.tagName).toBe('H2');
  });
});
