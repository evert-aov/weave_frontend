import {CanvasEditSession} from '../engine/canvas-edit-session';
import {BUILTIN_STYLE_TEMPLATES} from '../constants/word-document.constants';
import {describe,it,expect} from 'vitest';
import {analyzePageHtmlFast} from './word-editor.utils';
import {renumberHeadings} from './heading-numbering';
import {normalizeApaHeadings,headingLevel} from './apa-headings';
import {createDocxBlob} from '../services/docx-export';
import {DEFAULT_LAYOUT_CONFIG} from '../constants/word-document.constants';
import {unzipSync,strFromU8} from 'fflate';
describe('chapter hierarchy',()=>{
 const html='<h1 data-word-chapter="true">CAPÍTULO IV</h1><h1>Objetivos</h1><h2>Factores</h2>';
 it('uses outline level zero without numbering the chapter',()=>{
  const root=document.createElement('div');root.innerHTML=html;
  renumberHeadings([root],true);
  expect(root.firstElementChild!.textContent).toBe('CAPÍTULO IV');
  expect(root.children[1].textContent).toBe('1. Objetivos');
  expect(headingLevel(root.firstElementChild as HTMLElement)).toBe(0);
  expect(analyzePageHtmlFast(root.innerHTML,0).headings.map(h=>h.level)).toEqual([0,1,2]);
 });
 it('exports a separate unnumbered chapter style above normal headings',async()=>{
  const zip=unzipSync(new Uint8Array(await createDocxBlob([{id:'p',html}],DEFAULT_LAYOUT_CONFIG).arrayBuffer()));
  const doc=new DOMParser().parseFromString(strFromU8(zip['word/document.xml']),'application/xml');
  const outlines=Array.from(doc.getElementsByTagName('w:outlineLvl')).map(n=>n.getAttribute('w:val'));
  expect(outlines).toEqual(['0','1','2']);
  expect(strFromU8(zip['word/styles.xml'])).toContain('w:styleId="WeaveChapter"');
 });
 it('gives HTML APA H1 the H2 style only when a Chapter is present and restores the original style',()=>{
  const template=BUILTIN_STYLE_TEMPLATES.find(t=>t.academicStyle==='apa7')!;
  const root=document.createElement('div');root.innerHTML=html;
  normalizeApaHeadings([root],template);
  expect((root.children[0] as HTMLElement).style.textAlign).toBe('center');
  expect((root.children[1] as HTMLElement).style.textAlign).toBe('left');
  expect((root.children[1] as HTMLElement).style.fontSize).toBe(`${template.rules.H2.fontSizePt}pt`);
  root.children[0].remove();normalizeApaHeadings([root],template);
  expect((root.children[0] as HTMLElement).style.textAlign).toBe('center');
 });
 it('updates existing Canvas headings when Chapter is added or removed without changing the outline levels',()=>{
  const template=BUILTIN_STYLE_TEMPLATES.find(t=>t.academicStyle==='apa7')!;
  const session=new CanvasEditSession({width:600,height:800,top:50,right:50,bottom:50,left:50},{font:'12px serif',lineHeight:20},text=>({width:text.length*6,ascent:10,descent:2}));
  session.load([{id:'p',html}]);session.normalizeApaChapterHeadings(template);
  const read=()=>{const body=document.createElement('div');body.innerHTML=session.pages.map(p=>p.html).join('');return body;};
  let body=read();
  expect((body.children[0] as HTMLElement).style.textAlign).toBe('center');
  expect((body.children[1] as HTMLElement).style.textAlign).toBe('left');
  expect(body.children[1].tagName).toBe('H1');
  const state=session.engine.getSections()[0].model.state;
  session.normalizeApaChapterHeadings(template);expect(session.engine.getSections()[0].model.state).toBe(state);
  session.replacePagesWithHistory([{id:'p',html:'<p>Former chapter</p>'+body.children[1].outerHTML+body.children[2].outerHTML}]);
  session.normalizeApaChapterHeadings(template);body=read();
  expect((body.querySelector('h1') as HTMLElement).style.textAlign).toBe('center');
  session.undo();session.normalizeApaChapterHeadings(template);body=read();
  expect((body.children[1] as HTMLElement).style.textAlign).toBe('left');
 });
 it('exports APA H1 aligned left with chapters and centered without them',async()=>{
  const layout={...DEFAULT_LAYOUT_CONFIG,apa:{mode:'student' as const,runningHead:'',fontFamily:'Times New Roman',fontSizePt:12}};
  for(const chapters of [true,false]){
   const source=chapters?'<h1 data-word-chapter="true">Chapter</h1><h1 style="text-align:center">Heading</h1><h2>Sub</h2>':'<h1>Heading</h1><h2>Sub</h2>';
   const zip=unzipSync(new Uint8Array(await createDocxBlob([{id:'p',html:source}],layout).arrayBuffer()));
   const styles=new DOMParser().parseFromString(strFromU8(zip['word/styles.xml']),'application/xml');
   const h1=Array.from(styles.getElementsByTagName('w:style')).find(el=>el.getAttribute('w:styleId')==='Heading1')!;
   expect(h1.getElementsByTagName('w:jc')[0].getAttribute('w:val')).toBe(chapters?'left':'center');
   if(chapters){
    const doc=new DOMParser().parseFromString(strFromU8(zip['word/document.xml']),'application/xml');
    const paragraphs=Array.from(doc.getElementsByTagName('w:p')).filter(el=>el.textContent?.includes('Heading'));
    expect(paragraphs[0].getElementsByTagName('w:jc')[0].getAttribute('w:val')).toBe('left');
   }
  }
 });

});
