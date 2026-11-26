import {describe,it,expect,vi} from 'vitest';
import {CanvasEditSession} from './canvas-edit-session';
import {CanvasPerfMonitor} from './canvas-perf';
import {textNodes, type DocumentNode} from './document-model';
import {BUILTIN_STYLE_TEMPLATES} from '../constants/word-document.constants';
import {APA_STYLE_TEMPLATES} from '../constants/apa-style-templates';
import {emptySource} from '../models/academic.model';
const geometry={width:200,height:90,top:10,right:10,bottom:10,left:10};
const measure=(s:string)=>({width:[...s].length*8,ascent:8,descent:2});
const session=()=>{const s=new CanvasEditSession(geometry,{font:'10px serif',lineHeight:12},measure);s.load([{id:'p',html:'<p>Hola mundo</p>'}]);const leaf=textNodes(s.engine.getSections()[0].model.state.roots)[0];s.setSelection(0,{anchor:{nodeId:leaf.id,offset:4},focus:{nodeId:leaf.id,offset:4}});return s;};
describe('persistent Canvas editing',()=>{
 it('inserts and deletes graphemes, splits and merges blocks and preserves undo',()=>{
  const s=session(),checkpoint=vi.fn();s.onCheckpoint=checkpoint;
  s.insert(' á');expect(s.engine.getSourcePages()[0].html).toContain('Hola á mundo');
  s.delete(true);expect(s.engine.getSourcePages()[0].html).toContain('Hola  mundo');
  s.enter();expect(s.engine.getSections()[0].model.state.roots).toHaveLength(2);
  s.delete(true);expect(s.engine.getSections()[0].model.state.roots).toHaveLength(1);
  s.undo();expect(s.engine.getSections()[0].model.state.roots).toHaveLength(2);
  s.undo(true);expect(s.engine.getSections()[0].model.state.roots).toHaveLength(1);
  expect(checkpoint).toHaveBeenCalled();
 });
 it('generates selection bookmarks only for the transient compatibility projection',()=>{
  const s=session();const marked=s.engine.getMarkedPages();
  expect(marked.map(p=>p.html).join('')).toContain('Hola<!--weave-selection-start--> mundo');
  expect(s.pages.map(p=>p.html).join('')).not.toContain('weave-selection');
 });
 it('selects, copies and replaces across visual pages within the same section',()=>{
  const s=session();s.insert(' palabra'.repeat(40));s.selectAll();const selected=s.selectedText();expect(selected).toContain('palabra');
  expect(s.displayLists.length).toBeGreaterThan(1);
  expect(s.displayLists.filter(p=>s.overlay(p).selections?.length).length).toBeGreaterThan(1);
  s.insert('Nuevo');expect(s.engine.getSourcePages()[0].html).toContain('Nuevo');expect(s.selectedText()).toBe('');
 });
 it('reuses unchanged display lists and page objects on incremental keystrokes in large documents',()=>{
  const s=new CanvasEditSession(geometry,{font:'10px serif',lineHeight:12},measure);
  const largeHtml=Array.from({length:120},(_,i)=>`<p>Párrafo número ${i} con texto suficiente para ocupar varias líneas en la página.</p>`).join('');
  s.load([{id:'p1',html:largeHtml}]);
  const leaves=textNodes(s.engine.getSections()[0].model.state.roots);
  s.setSelection(0,{anchor:{nodeId:leaves[0].id,offset:4},focus:{nodeId:leaves[0].id,offset:4}});
  const beforeLists=s.displayLists;
  const beforePages=s.pages;
  expect(beforeLists.length).toBeGreaterThan(5);
  const t0=performance.now();
  s.insert('X');
  const elapsed=performance.now()-t0;
  const afterLists=s.displayLists;
  expect(elapsed).toBeLessThan(50);
  // Later pages whose layout did not shift reuse their exact PageDisplayList and DocumentPage references
  expect(afterLists.at(-1)).toBe(beforeLists.at(-1));
  expect(s.pages.at(-1)).toBe(beforePages.at(-1));
 });
 it('detects active heading (H1-H6), inline styles (bold, italic, underline), tables, and TOC entries from selection',()=>{
  const s=new CanvasEditSession({width:400,height:500,top:20,right:20,bottom:20,left:20},{font:'14px "Times New Roman"',lineHeight:18},measure);
  s.load([{
   id:'p1',
   html:[
    '<div class="word-toc-entry" data-toc-target-id="h-intro" data-toc-page="0"><span class="word-toc-title">1. Introducción</span><span class="word-toc-dots"></span><span class="word-toc-page">1</span></div>',
    '<h2 id="h-intro" style="font-family: Arial; font-size: 16pt; font-weight: bold; font-style: italic; text-decoration: underline;">1. Introducción</h2>',
    '<table><tbody><tr><td>Celda A</td><td>Celda B</td></tr></tbody></table>',
   ].join(''),
  }]);
  const leaves=textNodes(s.engine.getSections()[0].model.state.roots);
  // Select inside H2 heading
  const h2Leaf=leaves.find(l=>l.text.includes('1. Introducción')&&l!==leaves[0])!;
  s.setSelection(0,{anchor:{nodeId:h2Leaf.id,offset:2},focus:{nodeId:h2Leaf.id,offset:2}});
  const h2Ctx=s.getSelectionContext()!;
  expect(h2Ctx.formats.heading).toBe('H2');
  expect(h2Ctx.formats.bold).toBe(true);
  expect(h2Ctx.formats.italic).toBe(true);
  expect(h2Ctx.formats.underline).toBe(true);
  expect(h2Ctx.formats.fontName).toBe('Arial');
  expect(h2Ctx.formats.fontSize).toBe('16');
  expect(h2Ctx.table).toBeNull();

  // Select inside table cell
  const cellLeaf=leaves.find(l=>l.text==='Celda A')!;
  s.setSelection(0,{anchor:{nodeId:cellLeaf.id,offset:1},focus:{nodeId:cellLeaf.id,offset:1}});
  const tableCtx=s.getSelectionContext()!;
  expect(tableCtx.table).toBeTruthy();

  // Modify table directly in Canvas mode (addRow)
  expect(s.modifyTable('addRow')).toBe(true);
  expect(s.engine.getSourcePages()[0].html.match(/<tr\b/g)?.length).toBe(2);

  // Hit-test TOC entry and locate target heading
  const firstCmd=s.displayLists[0].commands.find(c=>c.kind==='text'&&c.source)!;
  expect(firstCmd.kind).toBe('text');
  if(firstCmd.kind==='text'&&firstCmd.source){
   const hit=s.hitTocEntry(s.displayLists[0].id,firstCmd.x+1,firstCmd.source.top+2);
   expect(hit).toEqual({targetId:'h-intro',pageIndex:0,title:'1. Introducción'});
   const loc=s.findHeadingLocation(hit?.targetId,hit?.title,hit?.pageIndex);
   expect(loc.pageIndex).toBe(0);
   expect(loc.y).toBeGreaterThan(firstCmd.source.top);
  }
 });
 it('applies H1-H6 rules directly on the model without rebuilding unchanged roots',()=>{
  const s=session();
  const tpl=BUILTIN_STYLE_TEMPLATES[0];
  expect(s.applyBlockRule(tpl.rules.H1,tpl)).toBe(true);
  expect(s.getSelectionContext()?.formats.heading).toBe('H1');
  expect(s.engine.getSourcePages()[0].html).toContain('<h1');
  expect(s.applyBlockRule(tpl.rules.P,tpl)).toBe(true);
  expect(s.getSelectionContext()?.formats.heading).toBe('P');
 });
 it('inserts a table without DOM bridge and allows typing and clicking inside empty cells',()=>{
  const s=new CanvasEditSession({width:400,height:500,top:20,right:20,bottom:20,left:20},{font:'14px "Times New Roman"',lineHeight:18},measure);
  s.load([{id:'p1',html:'<p>Introducción</p>'}]);
  // Even without clicking first, insertTable ensures a selection and inserts the table
  expect(s.insertTable(2,2,true,0)).toBe(true);
  expect(s.getSelectionContext()?.table).toBeTruthy();
  // Typing immediately inserts into the first cell (<th>)
  expect(s.insert('Columna 1')).toBe(true);
  expect(s.engine.getSourcePages()[0].html).toContain('Columna 1');

  // Clicking inside another empty cell (<td><br/></td>) selects that empty cell and allows typing
  const page=s.displayLists[0];
  const emptyCellCmds=page.commands.filter(c=>c.kind==='text'&&c.text===''&&c.source);
  expect(emptyCellCmds.length).toBeGreaterThanOrEqual(3);
  const lastEmpty=emptyCellCmds.at(-1)!;
  if(lastEmpty.kind==='text'&&lastEmpty.source){
   expect(s.selectAt(page.id,lastEmpty.x+10,lastEmpty.source.top+4,false)).toBe(true);
   expect(s.insert('Valor celda')).toBe(true);
   expect(s.engine.getSourcePages()[0].html).toContain('Valor celda');
  }
 });
 it('pastes an HTML table into the Canvas document model with undo support', () => {
  const s = new CanvasEditSession({ width: 400, height: 500, top: 20, right: 20, bottom: 20, left: 20 }, { font: '14px "Times New Roman"', lineHeight: 18 }, measure);
  s.load([{ id: 'p1', html: '<p>Documento</p>' }]);
  const tableHtml = '<table><thead><tr><th>Encabezado 1</th><th>Encabezado 2</th></tr></thead><tbody><tr><td>Dato A</td><td>Dato B</td></tr></tbody></table>';
  expect(s.pasteTable(tableHtml, false, 0)).toBe(true);
  expect(s.engine.getSourcePages()[0].html).toContain('Encabezado 1');
  expect(s.engine.getSourcePages()[0].html).toContain('Dato B');
  expect(s.undo()).toBe(true);
  expect(s.engine.getSourcePages()[0].html).not.toContain('Encabezado 1');
 });
 it('inserts, renders, hit-tests, updates and deletes LaTeX formulas on Canvas',()=>{
  const s=new CanvasEditSession({width:400,height:500,top:20,right:20,bottom:20,left:20},{font:'14px "Times New Roman"',lineHeight:18},measure);
  s.load([{id:'p1',html:'<p>Texto previo</p>'}]);
  const formulaHtml='<div class="word-latex-formula" contenteditable="false" data-latex="\\frac{a+b}{c}" style="display:block;text-align:center;margin:12px 0;padding:10px 16px;"><span style="display:inline-flex;flex-direction:column;align-items:center;"><span style="border-bottom:1.2px solid currentColor;">a+b</span><span>c</span></span></div>';
  expect(s.insertOrUpdateLatexFormula(formulaHtml,null,0)).toBe(true);
  const page=s.displayLists[0];
  const glyphTexts=page.commands.filter(c=>c.kind==='text').map(c=>c.text).join('');
  expect(glyphTexts).toContain('a+b');
  expect(glyphTexts).toContain('c');

  // Hit-test the formula on Canvas
  const formulaCmd=page.commands.find(c=>c.kind==='text'&&c.text.includes('a')&&c.source)!;
  expect(formulaCmd).toBeTruthy();
  if(formulaCmd.kind==='text'&&formulaCmd.source){
   const hit=s.hitLatexFormula(page.id,formulaCmd.x+1,formulaCmd.source.top+2);
   expect(hit).toBeTruthy();
   expect(hit?.latex).toBe('\\frac{a+b}{c}');

   // Update existing formula
   const updatedHtml='<div class="word-latex-formula" contenteditable="false" data-latex="E=mc^2" style="display:block;text-align:center;"><span>E=mc<sup>2</sup></span></div>';
   expect(s.insertOrUpdateLatexFormula(updatedHtml,hit!.nodeId,0)).toBe(true);
   const updatedGlyphs=s.displayLists[0].commands.filter(c=>c.kind==='text').map(c=>c.text).join('');
   expect(updatedGlyphs).toContain('E=mc2');

   // Delete formula
   expect(s.deleteLatexFormula(hit!.nodeId)).toBe(true);
   expect(s.engine.getSourcePages()[0].html).not.toContain('word-latex-formula');
  }
 });
 it('renders 2D LaTeX fractions with numerator above horizontal fraction bar and denominator below, and clamps caret height on double-spaced lines',()=>{
  const g={width:500,height:600,top:40,right:40,bottom:40,left:40};
  const s=new CanvasEditSession(g,{font:'16px "Times New Roman"',lineHeight:36},measure);
  const fracHtml='<p style="line-height: 2; font-size: 12pt;">Párrafo doble espacio</p><div class="word-latex-formula" contenteditable="false" data-latex="\\frac{\\partial x}{\\partial y}"><div class="word-latex-math-rendered" style="font-family: \'Cambria Math\', \'Times New Roman\', serif; font-size: 13.5pt;"><div style="display:flex;"><span style="display:inline-flex; flex-direction:column; align-items:center;"><span style="border-bottom:1.3px solid currentColor;"><span>∂</span><span>x</span></span><span><span>∂</span><span>y</span></span></span></div></div></div>';
  s.load([{id:'p1',html:fracHtml}]);
  const leaves=textNodes(s.engine.getSections()[0].model.state.roots);
  s.setSelection(0,{anchor:{nodeId:leaves[0].id,offset:2},focus:{nodeId:leaves[0].id,offset:2}});
  const page=s.overlay(s.displayLists[0]);
  expect(page.caret).toBeTruthy();
  // Caret ("pipe") height is compact (~18px) instead of full 36px double-spaced lineHeight
  expect(page.caret!.height).toBeLessThanOrEqual(16);

  const textCmds=page.commands.filter((c):c is Extract<typeof c,{kind:'text'}>=>c.kind==='text');
  const numX=textCmds.find(c=>c.text==='x')!;
  const denY=textCmds.find(c=>c.text==='y')!;
  const partials=textCmds.filter(c=>c.text==='∂');
  expect(partials).toHaveLength(2);
  // Cambria Math is replaced by DejaVu Math TeX Gyre to avoid Linux .ttc glyph index corruption
  expect(partials[0].font).toContain('DejaVu Math TeX Gyre');
  expect(partials[0].font).not.toContain('Cambria Math');
  const barRect=page.commands.find((c):c is Extract<typeof c,{kind:'rect'}>=>c.kind==='rect'&&c.height<3&&c.width>10)!;
  expect(barRect).toBeTruthy();
  // 2D vertical stacking: numerator is above barRect, denominator is below barRect
  expect(numX.y).toBeLessThan(barRect.y);
  expect(denY.y).toBeGreaterThan(barRect.y);
 });
 it('unwraps formulas nested inside paragraph elements so fractions render with 2D vinculum bar rather than 1D text runs',()=>{
  const g={width:500,height:600,top:40,right:40,bottom:40,left:40};
  const s=new CanvasEditSession(g,{font:'16px "Times New Roman"',lineHeight:32},measure);
  const pWrappedHtml='<p><div class="word-latex-formula" contenteditable="false" data-latex="\\frac{\\partial x}{\\partial y}"><div class="word-latex-math-rendered" style="font-family: \'DejaVu Math TeX Gyre\', serif; font-size: 13.5pt;"><div style="display:flex;"><span style="display:inline-flex; flex-direction:column; align-items:center;"><span style="border-bottom:1.3px solid currentColor;"><span>∂</span><span>x</span></span><span><span>∂</span><span>y</span></span></span></div></div></div></p>';
  s.load([{id:'p1',html:pWrappedHtml}]);
  const page=s.displayLists[0];
  const barRect=page.commands.find((c):c is Extract<typeof c,{kind:'rect'}>=>c.kind==='rect'&&c.height<3&&c.width>10);
  expect(barRect).toBeTruthy();
  const textCmds=page.commands.filter((c):c is Extract<typeof c,{kind:'text'}>=>c.kind==='text');
  expect(textCmds.some(c=>c.text==='∂')).toBe(true);
  expect(textCmds.every(c=>c.text!==' / '&&c.text!==' \u2215 ')).toBe(true);
 });
 it('switches between APA Times New Roman 12pt and APA Arial 11pt templates and supports instant Undo/Redo',()=>{
  const g={width:600,height:800,top:96,right:96,bottom:96,left:96};
  const s=new CanvasEditSession(g,{font:'14.67px "Times New Roman"',lineHeight:18},measure);
  s.load([{
   id:'p1',
   html:'<h1>Título</h1><p><span style="font-family: Calibri; font-size: 10pt;">Texto cuerpo</span></p><table><tbody><tr><td><p>Celda</p></td></tr></tbody></table>',
  }]);
  const apaTimes=BUILTIN_STYLE_TEMPLATES.find(t=>t.id==='apa-times-12')!;
  const apaArial=BUILTIN_STYLE_TEMPLATES.find(t=>t.id==='apa-arial-11')!;
  expect(s.applyTemplateToDocument(apaTimes,g,{font:'16px "Times New Roman"',lineHeight:32,apaBorders:true},{activeTemplateId:'executive-corp'})).toBe(true);
  const timesHtml=s.engine.getSourcePages()[0].html;
  expect(timesHtml).toContain('Times New Roman');
  expect(timesHtml).toContain('12pt');
  expect(timesHtml).toContain('data-apa-table="true"');

  expect(s.applyTemplateToDocument(apaArial,g,{font:'14.67px "Arial"',lineHeight:29.34,apaBorders:true},{activeTemplateId:'apa-times-12'})).toBe(true);
  const arialHtml=s.engine.getSourcePages()[0].html;
  expect(arialHtml).toContain('Arial');
  expect(arialHtml).toContain('11pt');

  // Instant Undo back to APA Times New Roman 12pt
  const undoRes=s.undoWithMeta(false,{activeTemplateId:'apa-arial-11'});
  expect(undoRes.ok).toBe(true);
  expect(undoRes.meta?.activeTemplateId).toBe('apa-times-12');
  expect(s.engine.getSourcePages()[0].html).toContain('Times New Roman');

  // Instant Redo back to APA Arial 11pt
  const redoRes=s.undoWithMeta(true,{activeTemplateId:'apa-times-12'});
  expect(redoRes.ok).toBe(true);
  expect(redoRes.meta?.activeTemplateId).toBe('apa-arial-11');
  expect(s.engine.getSourcePages()[0].html).toContain('Arial');
 });
 it('merges consecutive manual-break TOC pages into a single continuous TOC section so entries never get stranded alone on a page when font size changes',()=>{
  const g={width:500,height:145,top:15,right:20,bottom:15,left:20};
  const s=new CanvasEditSession(g,{font:'14.67px "Arial"',lineHeight:29.34},measure);
  const makeEntry=(id:string,title:string,p:number)=>
   `<div class="word-toc-entry" data-toc-target-id="${id}" data-toc-page="${p}" style="line-height: 2; font-size: 11pt;"><span class="word-toc-title">${title}</span><span class="word-toc-dots"></span><span class="word-toc-page">${p+1}</span></div>`;
  s.load([
   {
    id:'toc-1',
    breakBefore:'manual',
    html:`<div class="word-toc-page-section"><div class="word-toc-header">Índice de contenido</div>${makeEntry('h1','1. Estudio de Mercado',2)}${makeEntry('h2','2. Identificación de los Demandantes',2)}${makeEntry('h3','3. Determinación del Tamaño de la Muestra',2)}</div>`,
   },
   {
    id:'toc-2',
    breakBefore:'manual',
    html:`<div class="word-toc-page-section">${makeEntry('h4','4. Estudio Técnico',2)}${makeEntry('h5','5. Tamaño y Localización',2)}</div>`,
   },
   {
    id:'body-1',
    breakBefore:'manual',
    html:'<h1 id="h1">1. Estudio de Mercado</h1><h2 id="h2">2. Identificación de los Demandantes</h2><h2 id="h3">3. Determinación del Tamaño de la Muestra</h2><h1 id="h4">4. Estudio Técnico</h1><h2 id="h5">5. Tamaño y Localización</h2>',
   },
  ]);
  // Consecutive TOC pages are unified into 1 TOC section + 1 body section = 2 sections total (not 3)
  expect(s.engine.getSections()).toHaveLength(2);
  // Switch to APA Times New Roman 12pt and verify continuous TOC flow and updated page numbers
  const apaTimes=BUILTIN_STYLE_TEMPLATES.find(t=>t.id==='apa-times-12')!;
  expect(s.applyTemplateToDocument(apaTimes,g,{font:'16px "Times New Roman"',lineHeight:32,apaBorders:true})).toBe(true);
  expect(s.engine.getSections()).toHaveLength(2);
  const tocSectionLists=s.engine.getSections()[0].displayLists;
  // First TOC page has multiple entries, and the second TOC page has all remaining entries merged (not 1 stranded entry + a third TOC page)
  expect(tocSectionLists).toHaveLength(2);
 });
 it('deletes a visual page and restores it with instant Undo/Redo',()=>{
  const g={width:500,height:200,top:15,right:20,bottom:15,left:20};
  const s=new CanvasEditSession(g,{font:'14.67px "Arial"',lineHeight:22},measure);
  s.load([
   {id:'p1',breakBefore:'manual',html:'<p>Primera página</p>'},
   {id:'p2',breakBefore:'manual',html:'<p>Segunda página a eliminar</p>'},
   {id:'p3',breakBefore:'manual',html:'<p>Tercera página</p>'},
  ]);
  expect(s.pages).toHaveLength(3);
  expect(s.deletePage(1)).toBe(true);
  expect(s.pages).toHaveLength(2);
  expect(s.pages[0].html).toContain('Primera');
  expect(s.pages[1].html).toContain('Tercera');
  expect(s.undo()).toBe(true);
  expect(s.pages).toHaveLength(3);
  expect(s.pages[1].html).toContain('Segunda');
  expect(s.undo(true)).toBe(true);
  expect(s.pages).toHaveLength(2);
  expect(s.pages[1].html).toContain('Tercera');
 });
 it('hits, resizes and deletes images on Canvas with Undo/Redo support',()=>{
  const g={width:500,height:400,top:15,right:20,bottom:15,left:20};
  const s=new CanvasEditSession(g,{font:'14px "Arial"',lineHeight:20},measure);
  s.load([
   {
    id:'p1',
    breakBefore:'manual',
    html:'<p>Foto:</p><img id="img-test" src="data:image/png;base64,fake" style="width: 200px; height: 100px;" width="200" height="100"><p>Pie</p>',
   },
  ]);
  const pageId=s.displayLists[0].id;
  const hit=s.hitImage(pageId,30,45);
  expect(hit).not.toBeNull();
  expect(hit?.nodeId).toBeTruthy();
  expect(hit?.width).toBe(200);
  expect(hit?.height).toBe(100);

  const imgId=hit!.nodeId;
  expect(s.resizeImage(imgId,300,150)).toBe(true);
  const updatedHit=s.hitImage(pageId,30,45);
  expect(updatedHit?.width).toBe(300);
  expect(updatedHit?.height).toBe(150);

  expect(s.undo()).toBe(true);
  const undoneHit=s.hitImage(pageId,30,45);
  expect(undoneHit?.width).toBe(200);
  expect(undoneHit?.height).toBe(100);

  expect(s.undo(true)).toBe(true);
  expect(s.hitImage(pageId,30,45)?.width).toBe(300);

  expect(s.deleteImage(imgId)).toBe(true);
  expect(s.hitImage(pageId,30,45)).toBeNull();

  expect(s.undo()).toBe(true);
  expect(s.hitImage(pageId,30,45)).not.toBeNull();
 });
 it('restores image HTML and drawing commands after deletion, publication, undo and redo',()=>{
  const s=new CanvasEditSession({width:500,height:400,top:15,right:20,bottom:15,left:20},{lineHeight:20},measure);
  s.load([{id:'image-page',breakBefore:'manual',html:'<p>Antes</p><img src="photo.png" width="80" height="50"><p>Después</p>'},
   {id:'other',breakBefore:'manual',html:'<p>Otra página</p>'}]);
  const image=()=>s.displayLists.flatMap(p=>p.commands).find(c=>c.kind==='image');
  const id=image()!.nodeId!;
  const html=()=>s.pages.map(p=>p.html).join('');
  expect(s.deleteImage(id)).toBe(true);expect(html()).not.toContain('<img');
  expect(s.undo()).toBe(true);expect(html()).toContain('photo.png');expect(image()).toBeDefined();
  expect(s.undo(true)).toBe(true);expect(html()).not.toContain('<img');
  expect(s.undo()).toBe(true);expect(html()).toContain('photo.png');
  expect(s.deletePage(0)).toBe(true);expect(html()).not.toContain('photo.png');
  expect(s.undo()).toBe(true);expect(html()).toContain('photo.png');expect(image()).toBeDefined();
  expect(s.undo(true)).toBe(true);expect(html()).not.toContain('photo.png');
 });

 it('copies image dimensions and pastes a distinct node with undo support',()=>{
  const s=new CanvasEditSession({width:500,height:400,top:15,right:20,bottom:15,left:20},{lineHeight:20},measure);
  s.load([{id:'p',html:'<img src="photo.png" width="80" height="50" alt="Foto">'}]);
  const original=s.displayLists.flatMap(p=>p.commands).find(c=>c.kind==='image')!;
  const copied=s.imageForClipboard(original.nodeId!)!;
  expect(copied).toMatchObject({src:'photo.png',width:80,height:50,alt:'Foto'});
  expect(s.pasteImage(copied,original.nodeId)).toBe(true);
  const images=s.displayLists.flatMap(p=>p.commands).filter(c=>c.kind==='image');
  expect(images).toHaveLength(2);expect(images[0].nodeId).not.toBe(images[1].nodeId);
  expect(s.undo()).toBe(true);expect(s.displayLists.flatMap(p=>p.commands).filter(c=>c.kind==='image')).toHaveLength(1);
  expect(s.undo(true)).toBe(true);expect(s.displayLists.flatMap(p=>p.commands).filter(c=>c.kind==='image')).toHaveLength(2);
 });

 it('aligns an image inside the useful page width and restores alignment with undo',()=>{
  const s=new CanvasEditSession({width:500,height:400,top:20,right:20,bottom:20,left:20},{lineHeight:20},measure);
  s.load([{id:'p',html:'<img src="photo.png" width="80" height="50">'}]);
  const image=()=>s.displayLists.flatMap(p=>p.commands).find(c=>c.kind==='image')!;
  const id=image().nodeId!;expect(image().x).toBe(20);
  s.alignImage(id,'center');expect(image().x).toBe(210);expect(s.pages[0].html).toContain('margin-left: auto');
  s.alignImage(id,'right');expect(image().x).toBe(400);
  s.undo();expect(image().x).toBe(210);
  s.undo(true);expect(image().x).toBe(400);
  s.alignImage(id,'left');expect(image().x).toBe(20);
 });

 it.each([true,false])('removes a placeholder paragraph beside a table with backward=%s and restores it',backward=>{
  const s=new CanvasEditSession({width:500,height:400,top:20,right:20,bottom:20,left:20},{lineHeight:20},measure);
  s.load([{id:'p',html:'<p>Encabezado</p><p><br></p><table><tr><td><p>Celda intacta</p></td></tr></table>'}]);
  const roots=s.engine.getSections()[0].model.state.roots;
  const empty=roots[1];if(empty.kind!=='element')throw Error('Missing placeholder');
  const pos={nodeId:empty.children[0].id,offset:0};s.setSelection(0,{anchor:pos,focus:pos});
  expect(s.delete(backward)).toBe(true);
  expect(s.engine.getSections()[0].model.state.roots).toHaveLength(2);
  expect(s.pages.map(p=>p.html).join('')).toContain('Celda intacta');
  s.undo();expect(s.engine.getSections()[0].model.state.roots).toHaveLength(3);
 });

 it('removes a manual break at the section boundary and restores it on undo',()=>{
  const s=new CanvasEditSession({width:500,height:400,top:20,right:20,bottom:20,left:20},{lineHeight:20},measure);
  s.load([{id:'a',html:'<p>Primera</p>'},{id:'b',breakBefore:'manual',html:'<p>Segunda</p>'}]);
  const leaf=textNodes(s.engine.getSections()[1].model.state.roots)[0];
  s.setSelection(1,{anchor:{nodeId:leaf.id,offset:0},focus:{nodeId:leaf.id,offset:0}});
  expect(s.delete(true)).toBe(true);expect(s.engine.getSections()).toHaveLength(1);
  expect(s.pages.map(p=>p.html).join('')).toContain('Segunda');
  s.undo();expect(s.engine.getSections()).toHaveLength(2);
 });

 it('applies an unnumbered chapter above H1 and restores the previous style on undo',()=>{
  const s=new CanvasEditSession({width:500,height:400,top:20,right:20,bottom:20,left:20},{lineHeight:20},measure);
  s.load([{id:'p',html:'<p>CAPÍTULO IV</p><h1>Tamaño</h1>'}]);
  const leaf=textNodes(s.engine.getSections()[0].model.state.roots)[0];
  s.setSelection(0,{anchor:{nodeId:leaf.id,offset:0},focus:{nodeId:leaf.id,offset:0}});
  expect(s.applyChapter()).toBe(true);
  expect(s.pages[0].html).toContain('data-word-chapter="true"');
  expect(s.pages[0].html).not.toContain('data-word-heading-number');
  s.undo();expect(s.pages[0].html).not.toContain('data-word-chapter');
 });

 it('hit-tests table borders and resizes columns and rows with Undo/Redo support',()=>{
  const s=new CanvasEditSession({width:500,height:400,top:20,right:20,bottom:20,left:20},{lineHeight:20},measure);
  s.load([{id:'p',html:'<p>Intro</p>'}]);
  expect(s.insertTable(2,2)).toBe(true);
  const page=s.displayLists[0];
  expect(page.tables).toBeDefined();
  expect(page.tables!.length).toBeGreaterThan(0);
  const tbl=page.tables![0];
  expect(tbl.colBorders.length).toBe(2);
  expect(tbl.rowBorders.length).toBe(2);

  // Hit test vertical border between col 0 and col 1
  const colBorder=tbl.colBorders[0];
  const colHit=s.hitTableBorder(page.id,colBorder.x,colBorder.top+10);
  expect(colHit).not.toBeNull();
  expect(colHit!.type).toBe('col');
  expect(colHit!.colIndex).toBe(0);

  // Hit test horizontal border between row 0 and row 1
  const rowBorder=tbl.rowBorders[0];
  const rowHit=s.hitTableBorder(page.id,rowBorder.left+10,rowBorder.y);
  expect(rowHit).not.toBeNull();
  expect(rowHit!.type).toBe('row');
  expect(rowHit!.rowIndex).toBe(0);

  // Resize columns: change 50/50 to 70/30
  expect(s.resizeTableColumn(tbl.tableId,0,[70,30])).toBe(true);
  expect(s.pages[0].html).toContain('width: 70%');
  expect(s.pages[0].html).toContain('width: 30%');
  s.undo();
  expect(s.pages[0].html).toContain('width: 50%');
  s.undo(true);
  expect(s.pages[0].html).toContain('width: 70%');

  // Resize row: set row 0 height to 60px
  expect(s.resizeTableRow(tbl.tableId,0,60,rowBorder.rowId)).toBe(true);
  expect(s.pages[0].html).toContain('height: 60px');
  s.undo();
  expect(s.pages[0].html).not.toContain('height: 60px');
  s.undo(true);
  expect(s.pages[0].html).toContain('height: 60px');
 });

 it('toggles subscript and superscript natively in Canvas with undo support', () => {
  const s = new CanvasEditSession(geometry);
  s.load([{ id: 'p1', html: '<p id="para">H2O formula</p>' }]);
  const node = textNodes(s.engine.getSections()[0].model.state.roots)[0];
  // Select "2" (offset 1 to 2)
  s.setSelection(0, { anchor: { nodeId: node.id, offset: 1 }, focus: { nodeId: node.id, offset: 2 } });
  expect(s.toggleInlineCommand('subscript')).toBe(true);
  expect(s.pages[0].html).toContain('vertical-align: sub');
  expect(s.getSelectionContext()?.formats.subscript).toBe(true);

  // Undo restores normal
  s.undo();
  expect(s.pages[0].html).not.toContain('vertical-align: sub');

  // Redo
  s.undo(true);
  expect(s.pages[0].html).toContain('vertical-align: sub');

  // Toggle subscript off
  expect(s.toggleInlineCommand('subscript')).toBe(true);
  expect(s.pages[0].html).not.toContain('vertical-align: sub');
 });

 it('toggles bullet and numbered lists natively in Canvas with undo support', () => {
  const s = new CanvasEditSession(geometry);
  s.load([{ id: 'p1', html: '<p>First item</p><p>Second item</p>' }]);
  const leaves = textNodes(s.engine.getSections()[0].model.state.roots);
  // Select across both paragraphs
  s.setSelection(0, { anchor: { nodeId: leaves[0].id, offset: 0 }, focus: { nodeId: leaves[1].id, offset: 3 } });

  // Convert to unordered list
  expect(s.toggleList('ul')).toBe(true);
  expect(s.pages[0].html).toContain('<ul>');
  expect(s.pages[0].html).toContain('<li>First item</li>');
  expect(s.pages[0].html).toContain('<li>Second item</li>');

  // Switch to ordered list
  expect(s.toggleList('ol')).toBe(true);
  expect(s.pages[0].html).toContain('<ol>');
  expect(s.pages[0].html).not.toContain('<ul>');

  // Unlist back to paragraphs
  expect(s.toggleList('ol')).toBe(true);
  expect(s.pages[0].html).not.toContain('<ol>');
  expect(s.pages[0].html).toContain('<p>');

  // Undo restores the list
  s.undo();
  expect(s.pages[0].html).toContain('<ol>');
 });

 it('merges selected table cells natively in Canvas with undo support', () => {
  const s = new CanvasEditSession(geometry);
  s.load([{
    id: 'p1',
    html: '<table style="width:100%"><colgroup><col style="width:50%"><col style="width:50%"></colgroup><tbody><tr><td id="c1"><p>Cell 1</p></td><td id="c2"><p>Cell 2</p></td></tr><tr><td id="c3"><p>Cell 3</p></td><td id="c4"><p>Cell 4</p></td></tr></tbody></table>',
  }]);
  const leaves = textNodes(s.engine.getSections()[0].model.state.roots);
  const c1Text = leaves.find(l => l.text.includes('Cell 1'))!;
  const c2Text = leaves.find(l => l.text.includes('Cell 2'))!;

  // Single cell selection cannot merge
  s.setSelection(0, { anchor: { nodeId: c1Text.id, offset: 0 }, focus: { nodeId: c1Text.id, offset: 2 } });
  expect(s.canMergeTableCells()).toBe(false);

  // Multi-cell selection (c1 to c2) can merge
  s.setSelection(0, { anchor: { nodeId: c1Text.id, offset: 0 }, focus: { nodeId: c2Text.id, offset: 2 } });
  expect(s.canMergeTableCells()).toBe(true);

  // Merge horizontal cells
  expect(s.mergeSelectedTableCells()).toBe(true);
  expect(s.pages[0].html).toContain('colspan="2"');
  expect(s.pages[0].html).toContain('Cell 1');
  expect(s.pages[0].html).toContain('Cell 2');

  // Undo restores both cells
  s.undo();
  expect(s.pages[0].html).not.toContain('colspan="2"');
  expect(s.pages[0].html).toContain('Cell 1');
  expect(s.pages[0].html).toContain('Cell 2');
 });

 it('inserts page breaks and new pages natively in Canvas with undo support', () => {
  const s = new CanvasEditSession(geometry);
  s.load([{ id: 'p1', html: '<p>First page content</p>' }]);
  expect(s.pages.length).toBe(1);

  // Insert page break
  expect(s.insertPageBreak(0)).toBe(true);
  expect(s.pages.length).toBe(2);
  expect(s.pages[1].breakBefore).toBe('manual');

  // Undo removes the page break
  s.undo();
  expect(s.pages.length).toBe(1);

  // Redo restores the page break
  s.undo(true);
  expect(s.pages.length).toBe(2);
 });

 it('finds, selects, and replaces matches visually in Canvas with undo support', () => {
  const s = new CanvasEditSession(geometry);
  s.load([{ id: 'p1', html: '<p>Alpha beta Alpha gamma</p>' }]);

  const matches = s.findMatches('alpha', false, true);
  expect(matches.length).toBe(2);
  s.selectMatch(matches[0]);
  expect(s.selectedText()).toBe('Alpha');

  expect(s.replaceMatch(matches[0], 'Omega')).toBe(true);
  expect(s.pages[0].html).toContain('Omega beta Alpha gamma');

  s.undo();
  expect(s.pages[0].html).toContain('Alpha beta Alpha gamma');

  const count = s.replaceAllMatches('Alpha', 'Delta', true, true);
  expect(count).toBe(2);
  expect(s.pages[0].html).toContain('Delta beta Delta gamma');
 });

 it('applies changeCase, sortSelectedParagraphs, multilevelList, and selectCurrentParagraph natively in Canvas', () => {
  const s = new CanvasEditSession(geometry);
  s.load([{ id: 'p1', html: '<p>zebra item</p><p>apple item</p>' }]);

  const leaves = textNodes(s.engine.getSections()[0].model.state.roots);
  s.setSelection(0, { anchor: { nodeId: leaves[0].id, offset: 0 }, focus: { nodeId: leaves[0].id, offset: 5 } });
  expect(s.changeCase('upper')).toBe(true);
  expect(s.pages[0].html).toContain('ZEBRA item');

  expect(s.selectCurrentParagraph()).toBe(true);
  expect(s.selectedText()).toBe('ZEBRA item');

  s.setSelection(0, { anchor: { nodeId: leaves[0].id, offset: 0 }, focus: { nodeId: leaves[1].id, offset: 5 } });
  expect(s.sortSelectedParagraphs('asc')).toBe(true);
  const htmlAfterSort = s.pages[0].html;
  expect(htmlAfterSort.indexOf('apple item')).toBeLessThan(htmlAfterSort.indexOf('ZEBRA item'));

  expect(s.applyMultilevelList()).toBe(true);
  expect(s.pages[0].html).toContain('word-multilevel-list');
 });

 it('inserts HTML fragments and multi-column sections natively in Canvas with undo support', () => {
  const s = new CanvasEditSession(geometry);
  s.load([{ id: 'p1', html: '<p>Intro</p>' }]);

  expect(s.insertHtml('<div class="word-checklist-item"><p>Task 1</p></div>')).toBe(true);
  expect(s.pages[0].html).toContain('Task 1');

  const colRes = s.applySectionColumns('2');
  expect(colRes.applied).toBe(true);
  expect(s.pages.map(p => p.html).join('')).toContain('word-columns-section');

  s.undo();
  expect(s.pages.map(p => p.html).join('')).not.toContain('word-columns-section');
 });

 it('copies selectedHtml with formatting and pastes rich HTML (headings, bold, lists) with single-step undo', () => {
  const s = new CanvasEditSession(geometry);
  s.load([{ id: 'p1', html: '<p>Hola <strong>mundo</strong></p>' }]);

  const leaves = textNodes(s.engine.getSections()[0].model.state.roots);
  s.setSelection(0, { anchor: { nodeId: leaves[1].id, offset: 0 }, focus: { nodeId: leaves[1].id, offset: 5 } });
  const copiedHtml = s.selectedHtml();
  expect(copiedHtml).toContain('<strong>mundo</strong>');

  // Pegar HTML enriquecido con título, negrita y lista sobre la selección
  const pasted = s.pasteHtml('<h1>Título</h1><p>Texto <strong>fuerte</strong></p><ul><li>Item A</li><li>Item B</li></ul>');
  expect(pasted).toBe(true);
  const fullHtml = s.pages.map(p => p.html).join('');
  expect(fullHtml).toContain('<h1>Título</h1>');
  expect(fullHtml).toContain('<strong>fuerte</strong>');
  expect(fullHtml).toContain('<ul><li>Item A</li><li>Item B</li></ul>');

  // Un solo Ctrl+Z restaura el estado previo completo
  s.undo();
  expect(s.pages[0].html).toContain('Hola <strong>mundo</strong>');
  expect(s.pages[0].html).not.toContain('Título');
 });

 it('assigns object IDs and preserves metadata across model academic undo/redo', () => {
  const s = new CanvasEditSession(geometry);
  s.load([
   { id: 'p1', html: '<p>Texto inicial</p><table><tbody><tr><td>A</td></tr></tbody></table>' },
  ]);

  expect(s.assignMissingObjectIds()).toBe(true);
  expect(s.pages[0].html).toContain('data-word-object-id=');
  expect(s.assignMissingObjectIds()).toBe(false);

  const leaves = textNodes(s.engine.getSections()[0].model.state.roots);
  s.setSelection(0, { anchor: { nodeId: leaves[0].id, offset: 5 }, focus: { nodeId: leaves[0].id, offset: 5 } });

  const initialSource = {
   ...emptySource(),
   id: 'src-1',
   kind: 'book' as const,
   authors: [{ family: 'Pérez', given: 'Ana' }],
   year: '2022',
   title: 'Diseño Canvas',
   publisher: 'Editorial',
  };

  expect(
   s.insertCitation(
    { sourceId: 'src-1', narrative: false, locator: '', quoteText: '' },
    [initialSource],
    APA_STYLE_TEMPLATES[0],
    0,
    { bibliographicSources: [] },
   ),
  ).toBe(true);
  expect(s.pages[0].html).toContain('(Pérez, 2022)');
  expect(s.selection).toBeTruthy();

  const undoRes = s.undoWithMeta(false, { bibliographicSources: [initialSource] });
  expect(undoRes.ok).toBe(true);
  expect(undoRes.meta?.bibliographicSources).toEqual([]);
  expect(s.pages[0].html).not.toContain('(Pérez, 2022)');

  const redoRes = s.undoWithMeta(true, { bibliographicSources: [] });
  expect(redoRes.ok).toBe(true);
  expect(redoRes.meta?.bibliographicSources).toHaveLength(1);
  expect(s.pages[0].html).toContain('(Pérez, 2022)');
 });

 it('autocorrects common typos, detects repeated words, skips code blocks, and supports undo cleanly', () => {
  const s = new CanvasEditSession(geometry);
  s.load([{ id: 'p1', html: '<p>Hola tambien</p><pre><code>tambien</code></pre>' }]);
  const leaves = textNodes(s.engine.getSections()[0].model.state.roots);
  s.setSelection(0, { anchor: { nodeId: leaves[0].id, offset: leaves[0].text.length }, focus: { nodeId: leaves[0].id, offset: leaves[0].text.length } });
  expect(s.insert(' ')).toBe(true);

  const corrected = s.applyProofreading('es', true);
  expect(corrected?.kind).toBe('correction');
  expect(corrected?.before).toBe('tambien');
  expect(corrected?.after).toBe('también');
  expect(s.pages[0].html).toContain('Hola también');

  expect(corrected?.undo?.()).toBe(true);
  expect(s.pages[0].html).toContain('Hola tambien');

  const codeLeaf = textNodes(s.engine.getSections()[0].model.state.roots)[1];
  s.setSelection(0, { anchor: { nodeId: codeLeaf.id, offset: codeLeaf.text.length }, focus: { nodeId: codeLeaf.id, offset: codeLeaf.text.length } });
  expect(s.insert(' ')).toBe(true);
  expect(s.applyProofreading('es', true)).toBeNull();
  expect(s.pages[0].html).toContain('<code>tambien </code>');

  s.load([{ id: 'p2', html: '<p>texto repetido repetido</p>' }]);
  const repLeaf = textNodes(s.engine.getSections()[0].model.state.roots)[0];
  s.setSelection(0, { anchor: { nodeId: repLeaf.id, offset: repLeaf.text.length }, focus: { nodeId: repLeaf.id, offset: repLeaf.text.length } });
  expect(s.insert(' ')).toBe(true);
  expect(s.applyProofreading('es', true)).toEqual({ kind: 'repetition', before: 'repetido' });
 });

 it('hit-tests and toggles checkboxes with undo/redo and resolves hyperlink targets', () => {
  const s = new CanvasEditSession(geometry);
  s.load([{ id: 'p1', html: '<p><input type="checkbox" /> Tarea <a href="https://example.com/docs">Manual</a></p>' }]);
  const commands = s.displayLists[0].commands;
  const checkboxCmd = commands.find((c): c is Extract<typeof c, { kind: 'text' }> => c.kind === 'text' && c.text === '[');
  expect(checkboxCmd?.source).toBeTruthy();
  const checkboxId = s.hitCheckbox('p1', checkboxCmd!.x + 1, checkboxCmd!.source!.top + 2);
  expect(checkboxId).toBeTruthy();
  expect(s.toggleCheckbox(checkboxId!)).toBe(true);
  expect(s.pages[0].html).toContain('checked');
  expect(s.undo(false)).toBe(true);
  expect(s.pages[0].html).not.toContain('checked');
  expect(s.undo(true)).toBe(true);
  expect(s.pages[0].html).toContain('checked');

  const linkCmd = s.displayLists[0].commands.find((c): c is Extract<typeof c, { kind: 'text' }> => c.kind === 'text' && c.text === 'M');
  expect(linkCmd?.source).toBeTruthy();
  expect(s.hitLink('p1', linkCmd!.x + 1, linkCmd!.source!.top + 2)).toBe('https://example.com/docs');
  expect(s.hitLink('p1', checkboxCmd!.x + 1, checkboxCmd!.source!.top + 2)).toBeNull();
 });

 it('applies AI edits directly to model nodes with single-step undo, readable text, and accessible blocks', () => {
  const s = new CanvasEditSession(geometry);
  s.load([
    {
      id: 'p1',
      html: '<h1>Titulo Uno</h1><p>Parrafo inicial</p><table><tbody><tr><td>A1</td><td>B1</td></tr></tbody></table>',
    },
  ]);

  const fields = [...s.getAiTextFields()];
  const headingField = fields.find(f => f.text === 'Titulo Uno');
  const bodyField = fields.find(f => f.text === 'Parrafo inicial');
  const tableField = fields.find(f => f.id.startsWith('model-table:'));
  const appendField = fields.find(f => f.id.endsWith(':append'));
  expect(headingField).toBeTruthy();
  expect(bodyField).toBeTruthy();
  expect(tableField).toBeTruthy();
  expect(appendField).toBeTruthy();

  const edits = new Map<string, string>([
    [headingField!.id, 'Titulo Editado'],
    [bodyField!.id, 'Parrafo **mejorado**'],
    [tableField!.id, JSON.stringify({ action: 'setCell', row: 0, column: 1, text: 'B2' })],
    [appendField!.id, 'Bloque final'],
  ]);

  expect(s.applyAiEdits(edits)).toBe(true);
  const afterHtml = s.pages.map(p => p.html).join('');
  expect(afterHtml).toContain('Titulo Editado');
  expect(afterHtml).toContain('<strong>mejorado</strong>');
  expect(afterHtml).toContain('B2');
  expect(afterHtml).toContain('Bloque final');

  expect(s.pages.map((_, idx) => s.getReadableText(idx)).join('\n')).toContain('Titulo Editado');
  const blocks = s.getAccessibleBlocks();
  expect(blocks[0].tag).toBe('h1');
  expect(blocks[0].level).toBe(1);
  expect(blocks[0].text).toBe('Titulo Editado');
  expect(s.getAccessibleBlocks().some(b => b.tag === 'table')).toBe(true);

  expect(s.moveDocumentBoundary(true)).toBe(true);
  expect(s.getActiveAccessibleBlockId()).toBeTruthy();
  expect(s.undo(false)).toBe(true);
  const undoHtml = s.pages.map(p => p.html).join('');
  expect(undoHtml).toContain('Parrafo inicial');
  expect(undoHtml).not.toContain('Bloque final');
 });

 it('caches getAccessibleBlocks across unchanged reads and exposes table rows, cells, and cell focus', () => {
  const s = new CanvasEditSession(geometry);
  s.load([{
   id: 'p1',
   html: '<table><thead><tr><th>Columna A</th><th>Columna B</th></tr></thead><tbody><tr><td>Dato 1</td><td>Dato 2</td></tr></tbody></table>',
  }]);

  const first = s.getAccessibleBlocks();
  const second = s.getAccessibleBlocks();
  expect(second).toBe(first);

  const tableBlock = first.find(b => b.tag === 'table');
  expect(tableBlock?.rows).toHaveLength(2);
  expect(tableBlock?.rows?.[0].cells.map(c => ({ text: c.text, isHeader: c.isHeader }))).toEqual([
   { text: 'Columna A', isHeader: true },
   { text: 'Columna B', isHeader: true },
  ]);
  expect(tableBlock?.rows?.[1].cells.map(c => ({ text: c.text, isHeader: c.isHeader }))).toEqual([
   { text: 'Dato 1', isHeader: false },
   { text: 'Dato 2', isHeader: false },
  ]);

  const targetLeaf = textNodes(s.engine.getSections()[0].model.state.roots).find(t => t.text === 'Dato 2')!;
  s.setSelection(0, { anchor: { nodeId: targetLeaf.id, offset: 0 }, focus: { nodeId: targetLeaf.id, offset: 0 } });
  const cellId = tableBlock!.rows![1].cells[1].id;
  expect(s.getActiveAccessibleBlockId()).toBe(`canvas-a11y-${cellId}`);

  expect(s.insert(' mod')).toBe(true);
  const third = s.getAccessibleBlocks();
  expect(third).not.toBe(first);
 });

 it('creates links and clears inline/block formatting purely on the model without DOM transactions', () => {
  const s = new CanvasEditSession(geometry, { font: '10px serif', lineHeight: 12 }, measure);
  s.load([{ id: 'p1', html: '<h1><strong>Hola</strong> mundo</h1>' }]);
  const syncSpy = vi.spyOn(s.engine, 'syncPages');

  const leaves = textNodes(s.engine.getSections()[0].model.state.roots);
  s.setSelection(0, {
   anchor: { nodeId: leaves[1].id, offset: 1 },
   focus: { nodeId: leaves[1].id, offset: 6 },
  });
  expect(s.createLink('https://example.com')).toBe(true);
  expect(s.pages[0].html).toContain('<a href="https://example.com" target="_blank" rel="noopener noreferrer">mundo</a>');

  const updatedLeaves = textNodes(s.engine.getSections()[0].model.state.roots);
  s.setSelection(0, {
   anchor: { nodeId: updatedLeaves[0].id, offset: 0 },
   focus: { nodeId: updatedLeaves[0].id, offset: 2 },
  });
  const baseRule = BUILTIN_STYLE_TEMPLATES[0].rules.P;
  expect(s.removeFormat(baseRule)).toBe(true);
  expect(s.pages[0].html).toContain('<h1>Ho<strong>la</strong>');

  const nextLeaves = textNodes(s.engine.getSections()[0].model.state.roots);
  s.setSelection(0, {
   anchor: { nodeId: nextLeaves[0].id, offset: 1 },
   focus: { nodeId: nextLeaves[0].id, offset: 1 },
  });
  expect(s.removeFormat(baseRule)).toBe(true);
  const resetRoot = s.engine.getSections()[0].model.state.roots[0];
  expect(resetRoot.kind === 'element' ? resetRoot.tag : undefined).toBe('p');
  expect(s.pages[0].html).not.toContain('<strong>');
  expect(syncSpy).not.toHaveBeenCalled();

  expect(s.undo()).toBe(true);
  expect(s.pages[0].html).toContain('<h1>');
 });

 it('adds and deletes pages directly on section snapshots while preserving unaffected section state references', () => {
  const s = new CanvasEditSession(geometry, { font: '10px serif', lineHeight: 12 }, measure);
  s.load([
   { id: 'sec-1', html: '<p>Uno</p>' },
   { id: 'sec-2', html: '<p>Dos</p>', breakBefore: 'manual' },
  ]);
  const syncSpy = vi.spyOn(s.engine, 'syncPages');
  const markedSpy = vi.spyOn(s.engine, 'getMarkedPages');
  const untouchedSec1State = s.engine.getSections()[0].model.state;

  expect(s.addNewPageAt(0)).toBe(true);
  expect(s.engine.getSections()).toHaveLength(3);
  expect(s.engine.getSections()[0].model.state).toBe(untouchedSec1State);
  expect(syncSpy).not.toHaveBeenCalled();
  expect(markedSpy).not.toHaveBeenCalled();

  expect(s.deletePage(1)).toBe(true);
  expect(s.engine.getSections()).toHaveLength(2);
  expect(s.engine.getSections()[0].model.state).toBe(untouchedSec1State);
  expect(syncSpy).not.toHaveBeenCalled();
  expect(markedSpy).not.toHaveBeenCalled();
 });

 it('performs citations, bibliography, notes, captions, academic sections, and TOC rebuild purely on the model', () => {
  const apaTemplate = APA_STYLE_TEMPLATES[0];
  const s = new CanvasEditSession({ ...geometry, height: 110 }, { font: '10px serif', lineHeight: 12 }, measure);
  s.load([
   { id: 'body-sec', html: '<h1>Introduccion</h1><p>Texto principal.</p>' },
   { id: 'fig-sec', html: '<table><tbody><tr><td>A</td><td>B</td></tr></tbody></table>', breakBefore: 'manual' },
  ]);
  const syncSpy = vi.spyOn(s.engine, 'syncPages');

  const source = {
   ...emptySource(),
   id: 'src-1',
   authors: [{ family: 'Perez', given: 'Ana' }],
   year: '2024',
   title: 'Estudio Canvas',
   publisher: 'Editorial X',
  };

  const bodyLeaf = textNodes(s.engine.getSections()[0].model.state.roots)[1];
  s.setSelection(0, { anchor: { nodeId: bodyLeaf.id, offset: bodyLeaf.text.length }, focus: { nodeId: bodyLeaf.id, offset: bodyLeaf.text.length } });

  expect(s.insertCitation({ sourceId: 'src-1', narrative: false, locator: '12' }, [source], apaTemplate)).toBe(true);
  expect(s.isBibliographicSourceCited('src-1')).toBe(true);
  expect(s.pages[0].html).toContain('Perez');

  const figSecBeforeBib = s.engine.getSections()[1].model.state;
  const bibRes = s.insertOrRefreshBibliography([source], apaTemplate);
  expect(bibRes.ok).toBe(true);
  expect(s.engine.getSections()[1].model.state).toBe(figSecBeforeBib);
  expect(s.pages.map(p => p.html).join('')).toContain('Estudio Canvas');

  const postBibLeaf = textNodes(s.engine.getSections()[0].model.state.roots)[1];
  s.setSelection(0, { anchor: { nodeId: postBibLeaf.id, offset: 5 }, focus: { nodeId: postBibLeaf.id, offset: 5 } });
  expect(s.saveAcademicNote({ kind: 'endnote', text: 'Nota final Canvas' }, apaTemplate)).toBe(true);
  expect(s.getAcademicNotes()).toHaveLength(1);
  expect(s.pages.map(p => p.html).join('')).toContain('Nota final Canvas');

  const objects = s.getAcademicObjects();
  expect(objects).toHaveLength(1);
  expect(s.applyAcademicCaption({ id: objects[0].id, title: 'Resultados', note: 'Nota tabla', sourceId: '', attribution: '' }, [source], apaTemplate)).toBe(true);
  expect(s.pages.map(p => p.html).join('')).toContain('Resultados');

  const coverRes = s.insertAcademicSection({
   kind: 'cover',
   title: 'Portada Canvas',
   authors: 'Ana Perez',
   affiliations: 'Universidad',
   course: '',
   instructor: '',
   date: '2026',
   authorNote: '',
   professional: false,
  }, apaTemplate);
  expect(coverRes.ok).toBe(true);
  expect(s.pages[0].html).toContain('Portada Canvas');

  const tocRes = s.rebuildToc(
   true,
   1,
   { template: apaTemplate },
  );
  expect(tocRes.found).toBe(true);
  expect(s.pages[tocRes.activePageIndex].html).toContain('word-toc-page-section');
  expect(s.pages[tocRes.activePageIndex].html).toContain('Introduccion');
  expect(tocRes.headings[0].pageIndex).toBeGreaterThan(tocRes.activePageIndex);

  expect(s.updateAcademicDocument([source], apaTemplate)).toBe(true);
  expect('applyDomTransaction' in s).toBe(false);
  expect(syncSpy).not.toHaveBeenCalled();

  expect(s.undo()).toBe(true);
  expect(s.undo()).toBe(true);
 });

 it('evaluates CanvasPerfMonitor thresholds and keeps multi-section >2500-node keystrokes isolated to the edited section', () => {
  const s = new CanvasEditSession(geometry, { font: '10px serif', lineHeight: 12 }, measure);
  const sections = Array.from({ length: 10 }, (_, secIdx) => ({
   id: `sec-${secIdx}`,
   html: Array.from({ length: 140 }, (_, pIdx) => `<p>Sección ${secIdx} párrafo ${pIdx} de prueba.</p>`).join(''),
   breakBefore: secIdx > 0 ? ('manual' as const) : undefined,
  }));
  s.load(sections);
  const totalNodes = s.engine.getSections().reduce(
   (sum, sec) => sum + sec.model.state.roots.length + textNodes(sec.model.state.roots).length,
   0,
  );
  expect(totalNodes).toBeGreaterThan(2500);

  const untouchedState = s.engine.getSections()[9].model.state;
  const firstLeaf = textNodes(s.engine.getSections()[0].model.state.roots)[0];
  s.setSelection(0, { anchor: { nodeId: firstLeaf.id, offset: 4 }, focus: { nodeId: firstLeaf.id, offset: 4 } });

  const perf = new CanvasPerfMonitor();
  for (let i = 0; i < 5; i++) {
   const t0 = perf.now();
   expect(s.insert(String(i))).toBe(true);
   perf.record('layout', perf.now() - t0, totalNodes, s.pages.length);
  }
  expect(s.engine.getSections()[9].model.state).toBe(untouchedState);
  const liveReport = perf.getReport();
  expect(liveReport.lastNodeCount).toBe(totalNodes);
  expect(liveReport.phases.layout.count).toBe(5);

  const smoothPerf = new CanvasPerfMonitor();
  for (let i = 0; i < 8; i++) smoothPerf.record('layout', 4.2, totalNodes, s.pages.length);
  expect(smoothPerf.getReport().workerRecommendation.offloadToWorker).toBe(false);

  const heavyPerf = new CanvasPerfMonitor();
  for (let i = 0; i < 8; i++) heavyPerf.record('layout', 22.5, totalNodes, s.pages.length);
  expect(heavyPerf.getReport().workerRecommendation.offloadToWorker).toBe(true);
 });

 it('builds academic citations, bibliography links, and multi-page TOC directly as DocumentNode trees without HTML parsing', () => {
  const s = new CanvasEditSession({ width: 520, height: 260, top: 36, right: 36, bottom: 36, left: 36 }, { font: '12px "Georgia"', lineHeight: 20 }, measure);
  const headingsHtml = Array.from({ length: 18 }, (_, i) => `<h1>Sección ${i + 1}</h1><p>Detalle ${i + 1}</p>`).join('');
  s.load([
   {
    id: 'toc-sec',
    html: '<div class="word-toc-page-section" data-word-toc="true" data-native-word-toc="true"><div class="word-toc-header">Contenido Personalizado</div><div class="word-toc-entry" style="font-family: Georgia; font-size: 11pt; line-height: 1.5"><span class="word-toc-title">Previo</span><span class="word-toc-dots"></span><span class="word-toc-page">1</span></div></div>',
    breakBefore: 'manual',
   },
   { id: 'body-sec', html: headingsHtml, breakBefore: 'manual' },
  ]);

  const res = s.rebuildToc(false, 0);
  expect(res.found).toBe(true);
  expect(res.headings).toHaveLength(18);
  const tocPages = s.pages.filter(p => p.html.includes('word-toc-page-section'));
  expect(tocPages.length).toBeGreaterThan(1);
  expect(tocPages[0].html).toContain('Contenido Personalizado');
  expect(tocPages[0].html).toContain('Georgia');
  expect(res.headings[0].pageIndex).toBeGreaterThanOrEqual(tocPages.length);

  const apa = APA_STYLE_TEMPLATES[0];
  const src = {
   ...emptySource(),
   id: 'doi-1',
   kind: 'article' as const,
   authors: [{ family: 'Rivera', given: 'Carlos' }],
   year: '2025',
   title: 'Modelo directo en nodos',
   container: 'Revista Ingeniería',
   volume: '12',
   pages: '10-22',
   doi: '10.1234/weave.2025',
  };
  const bodyIdx = s.engine.getSections().findIndex(sec => !sec.pages.some(p => p.html.includes('word-toc-page-section')));
  const leaf = textNodes(s.engine.getSections()[bodyIdx].model.state.roots)[1];
  s.setSelection(bodyIdx, { anchor: { nodeId: leaf.id, offset: 0 }, focus: { nodeId: leaf.id, offset: 0 } });
  expect(s.insertCitation({ sourceId: 'doi-1', narrative: false, locator: '' }, [src], apa)).toBe(true);
  expect(s.insertOrRefreshBibliography([src], apa).ok).toBe(true);
  const bibHtml = s.pages.map(p => p.html).join('');
  expect(bibHtml).toMatch(/<i[^>]*>Revista Ingeniería<\/i>/);
  expect(bibHtml).toContain('https://doi.org/10.1234/weave.2025');
 });

 it('selects word and full paragraph by coordinates and toggles row top border on APA Total rows', () => {
  const s = new CanvasEditSession(geometry, { font: '12px "Times New Roman"', lineHeight: 18 }, measure);
  s.load([{
   id: 'apa-tbl',
   html: '<p>Palabra uno dos</p><table data-apa-table="true" style="width: 100%"><thead><tr><th style="border: none">Concepto</th><th style="border: none">Monto</th></tr></thead><tbody><tr><td style="border: none">Activo</td><td style="border: none">100</td></tr><tr><td style="border: none">Total</td><td style="border: none">100</td></tr></tbody></table>',
  }]);

  const cmd = s.displayLists[0].commands.find(c => c.kind === 'text' && c.text === 'n' && (c.source?.start.offset ?? -1) >= 8);
  if (!cmd || cmd.kind !== 'text' || !cmd.source) throw new Error('Expected text command for paragraph');
  const hitX = cmd.x + cmd.source.width * 0.55;
  const hitY = cmd.source.top + cmd.source.height / 2;

  expect(s.selectWordAt('apa-tbl', hitX, hitY)).toBe(true);
  expect(s.selectedText()).toBe('uno');
  expect(s.selectParagraphAt('apa-tbl', hitX, hitY)).toBe(true);
  expect(s.selectedText()).toBe('Palabra uno dos');

  const totalLeaf = textNodes(s.engine.getSections()[0].model.state.roots).find(t => t.text.includes('Total'))!;
  expect(totalLeaf).toBeDefined();
  s.setSelection(0, { anchor: { nodeId: totalLeaf.id, offset: 0 }, focus: { nodeId: totalLeaf.id, offset: 0 } });
  expect(s.getSelectionContext()?.table?.rowHasTopBorder).toBe(false);

  const countBefore = s.displayLists.flatMap(d => d.commands).filter(c => c.kind === 'rect').length;
  expect(s.toggleTableRowTopBorder()).toBe(true);
  expect(s.getSelectionContext()?.table?.rowHasTopBorder).toBe(true);
  expect(s.pages.map(p => p.html).join('')).toContain('data-word-top-border="true"');
  expect(s.displayLists.flatMap(d => d.commands).filter(c => c.kind === 'rect').length).toBeGreaterThan(countBefore);

  expect(s.undo()).toBe(true);
  expect(s.getSelectionContext()?.table?.rowHasTopBorder).toBe(false);
 });

 it('builds hierarchical TOC with progressive indentation, top-level bolding in APA 7 mode, and continuous dot leaders', () => {
  const tocGeom = { width: 700, height: 900, top: 60, right: 60, bottom: 60, left: 60 };
  const s = new CanvasEditSession(tocGeom, { font: '12px "Times New Roman"', lineHeight: 24 }, measure);
  const apaTemplate = APA_STYLE_TEMPLATES[0];
  s.load([{
   id: 'body-sec',
   html: [
    '<h1>1. INTRODUCCIÓN</h1>',
    '<h2>1.1. PLANTEAMIENTO</h2>',
    '<h3>1.1.1. Objetivo General</h3>',
    '<h4>Primaria</h4>',
    '<h1>2. CAPÍTULO II</h1>',
   ].join(''),
  }]);

  const tocRes = s.rebuildToc(true, 0, { template: apaTemplate });
  expect(tocRes.found).toBe(true);
  const tocSec = s.engine.getSections().find(sec =>
   sec.model.state.roots.some(r => r.kind === 'element' && r.attributes['class']?.includes('word-toc-page-section')),
  )!;
  expect(tocSec).toBeDefined();

  const tocSectionRoot = tocSec.model.state.roots.find(
   r => r.kind === 'element' && r.attributes['class']?.includes('word-toc-page-section'),
  );
  if (!tocSectionRoot || tocSectionRoot.kind !== 'element') throw new Error('Expected TOC root');
  const entries = tocSectionRoot.children.filter(
   c => c.kind === 'element' && c.attributes['class']?.includes('word-toc-entry'),
  );
  expect(entries).toHaveLength(5);

  const stylesByEntry = entries.map(e => (e.kind === 'element' ? e.attributes['style'] ?? '' : ''));
  const levelsByEntry = entries.map(e => (e.kind === 'element' ? e.attributes['data-toc-level'] : ''));
  expect(levelsByEntry).toEqual(['1', '2', '3', '4', '1']);
  expect(stylesByEntry[0]).toContain('padding-left: 0pt');
  expect(stylesByEntry[0]).toContain('font-weight: 700');
  expect(stylesByEntry[1]).toContain('padding-left: 18pt');
  expect(stylesByEntry[1]).toContain('font-weight: 400');
  expect(stylesByEntry[2]).toContain('padding-left: 36pt');
  expect(stylesByEntry[3]).toContain('padding-left: 54pt');
  expect(stylesByEntry[4]).toContain('padding-left: 0pt');
  expect(stylesByEntry[4]).toContain('font-weight: 700');
  expect(stylesByEntry[4]).toContain('margin-top: 4pt');

  // Verify applyTemplateToDocument preserves top-level bold and progressive indentation
  s.applyTemplateToDocument(apaTemplate, tocGeom, { font: '16px "Times New Roman"', lineHeight: 32, apaBorders: true });
  const refreshedRoot = s.engine.getSections()[0].model.state.roots.find(
   r => r.kind === 'element' && r.attributes['class']?.includes('word-toc-page-section'),
  );
  if (!refreshedRoot || refreshedRoot.kind !== 'element') throw new Error('Expected refreshed TOC root');
  const refreshedEntries = refreshedRoot.children.filter(
   c => c.kind === 'element' && c.attributes['class']?.includes('word-toc-entry'),
  );
  expect(refreshedEntries[0].kind === 'element' ? refreshedEntries[0].attributes['style'] : '').toContain('font-weight: 700');
  expect(refreshedEntries[1].kind === 'element' ? refreshedEntries[1].attributes['style'] : '').toContain('padding-left: 18pt');

  // Verify rendered display list increases glyph start X with nesting level and uses continuous dots
  const tocDl = s.displayLists[0];
  const leaderCmds = tocDl.commands.filter(c => c.kind === 'text' && /^\.+$/.test(c.text));
  expect(leaderCmds.length).toBeGreaterThan(0);

  const entryStartX = refreshedEntries.map(entry => {
   const titleLeaf = textNodes([entry])[0];
   const firstCmd = tocDl.commands.find(
    (c): c is Extract<typeof c, { kind: 'text' }> => c.kind === 'text' && c.source?.start.nodeId === titleLeaf.id,
   );
   if (!firstCmd) throw new Error(`Missing rendered glyph for TOC entry ${entry.id}`);
   return firstCmd.x;
  });
  expect(entryStartX[0]).toBeLessThan(entryStartX[1]);
  expect(entryStartX[1]).toBeLessThan(entryStartX[2]);
  expect(entryStartX[2]).toBeLessThan(entryStartX[3]);
  expect(entryStartX[4]).toBe(entryStartX[0]);
 });

 it('attaches a figure caption to an image with undo/redo and lays out inline SVG wrappers cleanly',()=>{
  const s=new CanvasEditSession({width:500,height:400,top:20,right:20,bottom:20,left:20},{lineHeight:20},measure);
  s.load([{id:'p',html:'<img src="diagram.png" width="120" height="80"><p>Texto <span class="word-icon-inline"><svg viewBox="0 0 24 24" width="22" height="22"><circle cx="12" cy="12" r="9"/></svg></span> fin</p>'}]);
  const imgCmd=s.displayLists[0].commands.find((c): c is Extract<typeof c,{kind:'image'}>=>c.kind==='image'&&c.assetId==='diagram.png')!;
  expect(imgCmd).toBeDefined();
  expect(s.displayLists[0].commands.some(c=>c.kind==='image'&&c.assetId.startsWith('data:image/svg+xml'))).toBe(true);

  expect(s.insertImageCaption(imgCmd.nodeId!,'Figura 1: Arquitectura')).toBe(true);
  expect(s.pages[0].html).toContain('<figure');
  expect(s.pages[0].html).toContain('Figura 1: Arquitectura');
  expect(s.selectedText()).toBe('Figura 1: Arquitectura');

  expect(s.undo()).toBe(true);
  expect(s.pages[0].html).not.toContain('<figcaption');
  expect(s.undo(true)).toBe(true);
  expect(s.pages[0].html).toContain('Figura 1: Arquitectura');
 });

 it('supports Fase 4 table operations (addRowAbove/ColLeft, splitCell, shading, verticalAlign, repeatHeader, Tab nav) and multilevel lists',()=>{
  const s=new CanvasEditSession({width:500,height:400,top:20,right:20,bottom:20,left:20},{lineHeight:20},measure);
  s.load([{id:'p',html:'<table><thead><tr><th>H1</th><th>H2</th></tr></thead><tbody><tr><td>A1</td><td>B1</td></tr></tbody></table>'}]);
  const a1=textNodes(s.engine.getSections()[0].model.state.roots).find(t=>t.text==='A1')!;
  s.setSelection(0,{anchor:{nodeId:a1.id,offset:0},focus:{nodeId:a1.id,offset:0}});

  expect(s.setTableCellBackground('#dbeafe')).toBe(true);
  expect(s.setTableCellVerticalAlign('middle')).toBe(true);
  expect(s.toggleTableHeaderRepeat()).toBe(true);
  const ctx=s.getSelectionContext();
  expect(ctx?.table?.background).toBe('#dbeafe');
  expect(ctx?.table?.verticalAlign).toBe('middle');
  expect(ctx?.table?.repeatHeader).toBe(false);
  expect(s.pages[0].html).toContain('data-repeat-header="false"');

  expect(s.modifyTable('addRowAbove')).toBe(true);
  expect(s.modifyTable('addColLeft')).toBe(true);
  expect(s.modifyTable('splitCell')).toBe(true);
  expect(s.pages[0].html).toContain('colspan="2"');

  // Navigate backward and forward across cells and add a row when tabbing past the final cell
  const leaves=textNodes(s.engine.getSections()[0].model.state.roots);
  const lastLeaf=leaves[leaves.length-1];
  s.setSelection(0,{anchor:{nodeId:lastLeaf.id,offset:0},focus:{nodeId:lastLeaf.id,offset:0}});
  const rowCountBefore=(s.pages[0].html.match(/<tr>/g)||[]).length;
  expect(s.navigateTableCell(1)).toBe(true);
  expect((s.pages[0].html.match(/<tr>/g)||[]).length).toBe(rowCountBefore+1);

  // Multilevel lists: Tab indents sub-item to alpha marker and restart resets ordered ordinal
  s.load([{id:'p',html:'<ol><li>Primero</li><li>Segundo</li><li>Tercero</li></ol>'}]);
  const secondLeaf=textNodes(s.engine.getSections()[0].model.state.roots).find(t=>t.text==='Segundo')!;
  s.setSelection(0,{anchor:{nodeId:secondLeaf.id,offset:0},focus:{nodeId:secondLeaf.id,offset:0}});
  expect(s.indentListItem(1)).toBe(true);
  expect(s.pages[0].html).toContain('data-list-level="1"');
  const markerTexts=s.displayLists[0].commands.filter((c): c is Extract<typeof c,{kind:'text'}>=>c.kind==='text'&&!c.source).map(c=>c.text);
  expect(markerTexts.join('|')).toContain('a.');

  const thirdLeaf=textNodes(s.engine.getSections()[0].model.state.roots).find(t=>t.text==='Tercero')!;
  s.setSelection(0,{anchor:{nodeId:thirdLeaf.id,offset:0},focus:{nodeId:thirdLeaf.id,offset:0}});
  expect(s.restartListNumbering(1)).toBe(true);
  expect(s.pages[0].html).toContain('value="1"');
 });

 it('generates & auto-updates Table and Figure indexes alongside TOC and renders per-page Canvas footnotes',()=>{
  const apaTemplate=APA_STYLE_TEMPLATES[0];
  const s=new CanvasEditSession({width:600,height:800,top:40,right:40,bottom:40,left:40},{font:'12px serif',lineHeight:18},measure);
  s.load([
   {
    id:'sec-1',
    html:
     '<h1>1. Resultados</h1>'+
     '<p>Primer dato con nota al pie.<a data-word-note-id="n1" data-note-kind="footnote" data-note-content="Aclaración tabla.">1</a></p>'+
     '<table id="tbl-res" data-word-object-id="tbl-res" data-apa-captioned="true" data-apa-title="Resumen trimestral"><thead><tr><th>Año</th><th>Total</th></tr></thead><tbody><tr><td>2026</td><td>100</td></tr></tbody></table>',
   },
   {
    id:'sec-2',
    breakBefore:'manual',
    html:
     '<h2>1.1 Evidencia visual</h2>'+
     '<figure><img id="fig-arch" data-word-object-id="fig-arch" src="arch.png" width="120" height="80"><figcaption>Figura 1: Arquitectura del sistema</figcaption></figure>'+
     '<p>Segunda sección con segunda nota.<a data-word-note-id="n2" data-note-kind="footnote" data-note-content="Fuente propia.">2</a></p>',
   },
  ]);

  const tableIdx=s.rebuildObjectIndex('table',true,0,{template:apaTemplate});
  expect(tableIdx.found).toBe(true);
  expect(tableIdx.count).toBe(1);
  expect(s.pages[tableIdx.activePageIndex].html).toContain('Índice de tablas');
  expect(s.pages[tableIdx.activePageIndex].html).toContain('Resumen trimestral');

  const figIdx=s.rebuildObjectIndex('figure',true,0,{template:apaTemplate});
  expect(figIdx.found).toBe(true);
  expect(figIdx.count).toBe(1);
  expect(s.pages[figIdx.activePageIndex].html).toContain('Índice de figuras');
  expect(s.pages[figIdx.activePageIndex].html).toContain('Arquitectura del sistema');

  // Rebuilding main TOC must NOT clobber Table/Figure indexes and must keep page numbers aligned
  const tocRes=s.rebuildToc(true,0,{template:apaTemplate});
  expect(tocRes.found).toBe(true);
  expect(s.pages.some(p=>p.html.includes('data-word-list-of="tables"'))).toBe(true);
  expect(s.pages.some(p=>p.html.includes('data-word-list-of="figures"'))).toBe(true);

  // Per-page footnotes appear on their own display list pages
  const secPagesWithText=s.displayLists.map(dl=>dl.commands.filter((c):c is Extract<typeof c,{kind:'text'}>=>c.kind==='text').map(c=>c.text).join(''));
  const n1Pages=secPagesWithText.filter(t=>t.includes('Aclaración tabla.'));
  const n2Pages=secPagesWithText.filter(t=>t.includes('Fuente propia.'));
  expect(n1Pages.length).toBe(1);
  expect(n2Pages.length).toBe(1);
  expect(secPagesWithText.findIndex(t=>t.includes('Aclaración tabla.'))).toBeLessThan(
   secPagesWithText.findIndex(t=>t.includes('Fuente propia.')),
  );
 });

 it('tracks insertions and deletions, accepts/rejects revisions, and manages anchored comments',()=>{
  const s=new CanvasEditSession({width:500,height:300,top:20,right:20,bottom:20,left:20});
  s.load([{id:'p1',html:'<p>Hola mundo</p>'}]);
  s.trackChangesEnabled=true;

  const leaf=textNodes(s.engine.getSections()[0].model.state.roots)[0];
  s.setSelection(0,{anchor:{nodeId:leaf.id,offset:leaf.text.length},focus:{nodeId:leaf.id,offset:leaf.text.length}});
  expect(s.insert('!')).toBe(true);
  expect(s.insert('?')).toBe(true); // coalesces inside same <ins>

  let revs=s.listRevisions();
  expect(revs.filter(r=>r.kind==='ins').length).toBe(1);
  expect(revs[0].text).toBe('!?');

  // Tracked backspace on existing uncommitted text marks <del>
  const firstLeaf=textNodes(s.engine.getSections()[0].model.state.roots)[0];
  s.setSelection(0,{anchor:{nodeId:firstLeaf.id,offset:firstLeaf.text.length},focus:{nodeId:firstLeaf.id,offset:firstLeaf.text.length}});
  expect(s.delete(true)).toBe(true);
  revs=s.listRevisions();
  expect(revs.some(r=>r.kind==='ins')).toBe(true);
  expect(revs.some(r=>r.kind==='del'&&r.text==='o')).toBe(true);

  const insId=revs.find(r=>r.kind==='ins')!.id;
  const delId=revs.find(r=>r.kind==='del')!.id;
  expect(s.acceptRevision(insId)).toBe(true);
  expect(s.rejectRevision(delId)).toBe(true);
  expect(s.listRevisions().length).toBe(0);
  expect(s.getReadableText()).toContain('Hola mundo!?');

  // Anchored comment on selection + locate + remove
  const updatedLeaf=textNodes(s.engine.getSections()[0].model.state.roots)[0];
  s.setSelection(0,{anchor:{nodeId:updatedLeaf.id,offset:0},focus:{nodeId:updatedLeaf.id,offset:4}});
  const anchored=s.wrapSelectionWithCommentAnchor('cmt-canvas-1',0);
  expect(anchored?.quote).toBe('Hola');
  expect(s.findCommentLocation('cmt-canvas-1')?.pageIndex).toBe(0);
  expect(s.removeCommentAnchor('cmt-canvas-1')).toBe(true);
  expect(s.findCommentLocation('cmt-canvas-1')).toBeNull();
  expect(s.getReadableText()).toContain('Hola');
 });

 it('overlays multi-match search highlights distinguishing active match and reads firstLineIndentPt (Fase 7)',()=>{
  const s=new CanvasEditSession({width:500,height:300,top:20,right:20,bottom:20,left:20});
  s.load([{id:'p1',html:'<p style="text-indent: 36pt;">Uno alfa dos alfa tres alfa.</p>'}]);
  const leaf=textNodes(s.engine.getSections()[0].model.state.roots)[0];
  s.setSelection(0,{anchor:{nodeId:leaf.id,offset:0},focus:{nodeId:leaf.id,offset:0}});
  expect(s.getSelectionContext()?.formats.firstLineIndentPt).toBe(36);

  const matches=s.findMatches('alfa',false,false);
  expect(matches.length).toBe(3);
  s.setSearchHighlights(matches,1);

  const overlaid=s.overlay(s.displayLists[0]);
  expect(overlaid.searchHighlights?.length).toBe(3);
  expect(overlaid.activeSearchHighlight).toBeTruthy();
  expect(overlaid.activeSearchHighlight?.x).toBe(overlaid.searchHighlights![1].x);

  s.clearSearchHighlights();
  const cleared=s.overlay(s.displayLists[0]);
  expect(cleared.searchHighlights).toBeUndefined();
  expect(cleared.activeSearchHighlight).toBeUndefined();
 });

 it('toggles lists off even when <li> wraps <p>, switches list styles without trapping, and deletes styled list items cleanly',()=>{
  const s=new CanvasEditSession(geometry);
  // 1. Nested <p> inside <li> with whitespace between items
  s.load([{id:'p1',html:'<p>Intro</p><ul>\n  <li><p>Uno</p></li>\n  <li><p>Dos</p></li>\n  <li><p>Tres</p></li>\n</ul>'}]);
  let leaves=textNodes(s.engine.getSections()[0].model.state.roots);
  // Select the last two items and apply a paragraph style rule (H2), then delete them via Backspace
  const tpl=BUILTIN_STYLE_TEMPLATES[0];
  const dosLeaf=leaves.find(l=>l.text==='Dos')!;
  const tresLeaf=leaves.find(l=>l.text==='Tres')!;
  s.setSelection(0,{anchor:{nodeId:dosLeaf.id,offset:0},focus:{nodeId:tresLeaf.id,offset:tresLeaf.text.length}});
  expect(s.applyBlockRule(tpl.rules.H2,tpl)).toBe(true);

  // Delete the selected last two list items
  expect(s.delete(true)).toBe(true);
  // Backspace once more on the now-empty remaining item removes it and moves caret to 'Uno'
  expect(s.delete(true)).toBe(true);
  expect(s.getReadableText()).not.toContain('Dos');
  expect(s.getReadableText()).not.toContain('Tres');
  expect(s.getReadableText()).toContain('Uno');

  // 2. Switch list styles (circle, lower-alpha, upper-roman) without accidentally toggling off, then toggle off back to <p>
  leaves=textNodes(s.engine.getSections()[0].model.state.roots);
  const unoLeaf=leaves.find(l=>l.text==='Uno')!;
  s.setSelection(0,{anchor:{nodeId:unoLeaf.id,offset:0},focus:{nodeId:unoLeaf.id,offset:0}});
  expect(s.applyListStyle('circle')).toBe(true);
  expect(s.pages[0].html).toContain('list-style-type: circle');
  expect(s.applyListStyle('lower-alpha')).toBe(true);
  expect(s.pages[0].html).toContain('<ol');
  expect(s.pages[0].html).toContain('list-style-type: lower-alpha');
  expect(s.applyListStyle('upper-roman')).toBe(true);
  expect(s.pages[0].html).toContain('list-style-type: upper-roman');

  // Toggle off ordered list -> must leave list and become <p>
  expect(s.toggleList('ol')).toBe(true);
  expect(s.pages[0].html).not.toContain('<ol');
  expect(s.pages[0].html).not.toContain('<li');

  // 3. Create a new list in default style, press Enter twice to exit, and Backspace on single <li> to exit
  leaves=textNodes(s.engine.getSections()[0].model.state.roots);
  const pLeaf=leaves.find(l=>l.text==='Uno')!;
  s.setSelection(0,{anchor:{nodeId:pLeaf.id,offset:pLeaf.text.length},focus:{nodeId:pLeaf.id,offset:pLeaf.text.length}});
  expect(s.toggleList('ul')).toBe(true);
  expect(s.pages[0].html).toContain('<ul>');
  // Enter creates an empty <li>, second Enter exits the list into a <p>
  expect(s.enter()).toBe(true);
  expect(s.enter()).toBe(true);
  expect(s.getSelectionContext()?.formats.insertUnorderedList).toBe(false);

  // Backspace on the first/only <li> at offset 0 exits the list cleanly
  leaves=textNodes(s.engine.getSections()[0].model.state.roots);
  const firstLiLeaf=leaves.find(l=>l.text==='Uno')!;
  s.setSelection(0,{anchor:{nodeId:firstLiLeaf.id,offset:0},focus:{nodeId:firstLiLeaf.id,offset:0}});
  expect(s.delete(true)).toBe(true);
  expect(s.pages[0].html).not.toContain('<ul');
  expect(s.pages[0].html).not.toContain('<li');
 });

 it('splices pasted lists into the current list instead of nesting and allows deleting/exiting even pre-existing nested lists',()=>{
  const s=new CanvasEditSession(geometry);
  s.load([{id:'p1',html:'<ol><li>dsadssdad</li><li>sadsadsad</li></ol>'}]);
  let leaves=textNodes(s.engine.getSections()[0].model.state.roots);
  const second=leaves[1];
  s.setSelection(0,{anchor:{nodeId:second.id,offset:second.text.length},focus:{nodeId:second.id,offset:second.text.length}});

  // Pasting a copied ordered list inside an ordered list splices <li>s cleanly instead of nesting <ol> inside <ol>
  expect(s.pasteHtml('<ol><li>dsadssdad</li><li>sadsadsad</li></ol>')).toBe(true);
  const rootsAfterPaste=s.engine.getSections()[0].model.state.roots;
  expect(rootsAfterPaste).toHaveLength(1);
  expect(rootsAfterPaste[0].kind === 'element' && rootsAfterPaste[0].tag).toBe('ol');
  expect(rootsAfterPaste[0].kind === 'element' ? rootsAfterPaste[0].children.filter(c => c.kind === 'element' && c.tag === 'li').length : 0).toBe(4);

  // Even if a document already has a nested <ol> inside <ol>, Backspace/Delete and toggleList cleanly exit without throwing
  s.load([{id:'p1',html:'<ol><li>dsadssdadsadsadsad</li><ol><li></li><li>sadsadsad</li></ol></ol>'}]);
  leaves=textNodes(s.engine.getSections()[0].model.state.roots);
  const emptyLiNode=s.engine.getSections()[0].model.state.roots[0];
  expect(emptyLiNode.kind).toBe('element');
  const innerOl=(emptyLiNode as Extract<typeof emptyLiNode,{kind:'element'}>).children.find(c=>c.kind==='element'&&c.tag==='ol') as Extract<typeof emptyLiNode,{kind:'element'}>;
  const emptyInnerLi=innerOl.children[0];
  s.setSelection(0,{anchor:{nodeId:emptyInnerLi.id,offset:0},focus:{nodeId:emptyInnerLi.id,offset:0}});
  expect(s.delete(true)).toBe(true);
  expect(s.getSelectionContext()?.formats.insertOrderedList).toBe(false);
  expect(s.pages[0].html).toContain('<p>');

  // Forward Delete (Supr) at the end of a <ul><li> merges the first item of a following <ol><li> directly
  s.load([{id:'p1',html:'<ul><li>primero</li><li>segundo</li></ul><ol style="list-style-type: lower-alpha"><li>tercero</li></ol>'}]);
  leaves=textNodes(s.engine.getSections()[0].model.state.roots);
  const seg=leaves.find(l=>l.text==='segundo')!;
  s.setSelection(0,{anchor:{nodeId:seg.id,offset:seg.text.length},focus:{nodeId:seg.id,offset:seg.text.length}});
  expect(s.delete(false)).toBe(true);
  expect(s.getReadableText()).toContain('segundotercero');
  expect(s.pages[0].html).not.toContain('<ol');
 });

 it('moves caret by word with Ctrl+Left/Right and to visual line start/end with Home/End (Fn+Left/Right)',()=>{
  const s=new CanvasEditSession({width:220,height:300,top:20,right:20,bottom:20,left:20});
  s.load([{id:'p1',html:'<p>Hola <b>mundo</b> cruel desde el editor de texto largo</p><p>Siguiente</p>'}]);
  const leaves=textNodes(s.engine.getSections()[0].model.state.roots);
  const firstLeaf=leaves[0]; // "Hola "
  const boldLeaf=leaves[1]; // "mundo"
  const thirdLeaf=leaves[2]; // " cruel desde el editor de texto largo"

  // Start at beginning of "Hola "
  s.setSelection(0,{anchor:{nodeId:firstLeaf.id,offset:0},focus:{nodeId:firstLeaf.id,offset:0}});
  // Ctrl+Right -> end of "Hola"
  s.moveWord(1);
  expect(s.selection?.focus).toEqual({nodeId:firstLeaf.id,offset:4});
  // Ctrl+Right -> crosses inline <b> boundary to end of "mundo"
  s.moveWord(1);
  expect(s.selection?.focus).toEqual({nodeId:boldLeaf.id,offset:5});
  // Ctrl+Left -> start of "mundo"
  s.moveWord(-1);
  expect(s.selection?.focus).toEqual({nodeId:boldLeaf.id,offset:0});
  // Ctrl+Shift+Right -> selects "mundo"
  s.moveWord(1,true);
  expect(s.selectedText()).toBe('mundo');

  // End (Fn+Right) moves to end of current visual line (not end of entire paragraph when wrapped)
  s.setSelection(0,{anchor:{nodeId:firstLeaf.id,offset:0},focus:{nodeId:firstLeaf.id,offset:0}});
  s.moveLineBoundary(true);
  const endOfLine1=s.selection!.focus;
  expect(endOfLine1.nodeId).toBe(thirdLeaf.id);
  expect(endOfLine1.offset).toBeGreaterThan(0);
  expect(endOfLine1.offset).toBeLessThan(thirdLeaf.text.length);

  // Home (Fn+Left) returns to start of that same visual line
  s.moveLineBoundary(false);
  expect(s.selection?.focus).toEqual({nodeId:firstLeaf.id,offset:0});
 });

 it('pastes rows and text inside active table cells and splits content cleanly on insertPageBreak',()=>{
  const s=new CanvasEditSession({width:500,height:400,top:20,right:20,bottom:20,left:20});
  s.load([{id:'p1',html:'<table style="width:100%"><tbody><tr><td><p>A1</p></td><td><p>B1</p></td></tr><tr><td></td><td></td></tr></tbody></table>'}]);
  const tableNode=s.engine.getSections()[0].model.state.roots[0] as Extract<DocumentNode,{kind:'element'}>;
  const tbody=tableNode.children[0] as Extract<DocumentNode,{kind:'element'}>;
  const row2=tbody.children[1] as Extract<DocumentNode,{kind:'element'}>;
  const emptyCell1=row2.children[0];

  // 1) Pasting small styled HTML into an empty cell puts it INSIDE that cell, not after the table
  s.setSelection(0,{anchor:{nodeId:emptyCell1.id,offset:0},focus:{nodeId:emptyCell1.id,offset:0}});
  expect(s.pasteHtml('<p style="font-weight:bold">Fase 4</p>')).toBe(true);
  expect(s.engine.getSections()[0].model.state.roots).toHaveLength(1);
  expect(s.pages[0].html).toContain('Fase 4');

  // 2) Pasting a multi-column row into a cell populates the existing table's cells instead of appending a second table
  const leavesAfter=textNodes(s.engine.getSections()[0].model.state.roots);
  const f4Leaf=leavesAfter.find(l=>l.text==='Fase 4')!;
  s.setSelection(0,{anchor:{nodeId:f4Leaf.id,offset:0},focus:{nodeId:f4Leaf.id,offset:0}});
  expect(s.pasteTable('<table><tbody><tr><td>Col 1</td><td>Col 2</td></tr></tbody></table>')).toBe(true);
  expect(s.engine.getSections()[0].model.state.roots).toHaveLength(1);
  expect(s.pages[0].html.match(/<table/g)?.length).toBe(1);
  expect(s.pages[0].html).toContain('Col 1');
  expect(s.pages[0].html).toContain('Col 2');

  // 3) insertPageBreak above a heading moves the heading and following content onto the new page
  s.load([{id:'p1',html:'<p>Tabla previa</p><p></p><h1>CAPÍTULO II: ESTUDIO DE MERCADO</h1><p>Contenido del capítulo</p>'}]);
  const roots3=s.engine.getSections()[0].model.state.roots;
  const emptyP=roots3[1];
  s.setSelection(0,{anchor:{nodeId:emptyP.id,offset:0},focus:{nodeId:emptyP.id,offset:0}});
  expect(s.insertPageBreak(0)).toBe(true);
  expect(s.pages.length).toBe(2);
  expect(s.pages[0].html).toContain('Tabla previa');
  expect(s.pages[0].html).not.toContain('CAPÍTULO II');
  expect(s.pages[1].html).toContain('CAPÍTULO II: ESTUDIO DE MERCADO');
  expect(s.pages[1].html).toContain('Contenido del capítulo');
  expect(s.pages[1].breakBefore).toBe('manual');
 });

 it('merges selected separate lists or whitespace-separated paragraphs into a single continuous 1, 2, 3 numbered list',()=>{
  const s=new CanvasEditSession({width:500,height:400,top:20,right:20,bottom:20,left:20});
  // Case 1: Three separate <ul> elements (common from DOCX import / paste)
  s.load([{id:'p1',html:'<ul><li>Uno</li></ul>\n<ul><li>Dos</li></ul>\n<ul><li>Tres</li></ul>'}]);
  let leaves=textNodes(s.engine.getSections()[0].model.state.roots).filter(l=>l.text.trim());
  s.setSelection(0,{anchor:{nodeId:leaves[0].id,offset:0},focus:{nodeId:leaves[2].id,offset:leaves[2].text.length}});
  expect(s.toggleList('ol')).toBe(true);
  const roots1=s.engine.getSections()[0].model.state.roots.filter(r=>r.kind==='element');
  expect(roots1).toHaveLength(1);
  expect(roots1[0].kind==='element'&&roots1[0].tag).toBe('ol');
  expect(roots1[0].kind==='element'?roots1[0].children.filter(c=>c.kind==='element'&&c.tag==='li').length:0).toBe(3);
  const markers1=s.displayLists[0].commands.filter((c):c is Extract<typeof c,{kind:'text'}>=>c.kind==='text'&&/^\d+\.$/.test(c.text)).map(c=>c.text);
  expect(markers1).toEqual(['1.','2.','3.']);

  // Case 2: Three <p> elements separated by newline text nodes
  s.load([{id:'p1',html:'<p>Alpha</p>\n<p>Beta</p>\n<p>Gamma</p>'}]);
  leaves=textNodes(s.engine.getSections()[0].model.state.roots).filter(l=>l.text.trim());
  s.setSelection(0,{anchor:{nodeId:leaves[0].id,offset:0},focus:{nodeId:leaves[2].id,offset:leaves[2].text.length}});
  expect(s.applyListStyle('decimal')).toBe(true);
  const roots2=s.engine.getSections()[0].model.state.roots.filter(r=>r.kind==='element');
  expect(roots2).toHaveLength(1);
  const markers2=s.displayLists[0].commands.filter((c):c is Extract<typeof c,{kind:'text'}>=>c.kind==='text'&&/^\d+\.$/.test(c.text)).map(c=>c.text);
  expect(markers2).toEqual(['1.','2.','3.']);
 });

 it('renders selection highlights reliably on pages with footnotes, trailing spaces, and table cells',()=>{
  const s=new CanvasEditSession({width:500,height:400,top:20,right:20,bottom:20,left:20});
  s.load([{id:'p1',html:'<p>Texto con nota<sup data-word-note-id="fn1" data-note-content="Nota al pie">1</sup> y espacio   </p><table style="width:100%"><tbody><tr><td><p>Celda A  </p></td><td><p>Celda B</p></td></tr></tbody></table>'}]);
  const leaves=textNodes(s.engine.getSections()[0].model.state.roots);
  const firstLeaf=leaves[0];
  const cellALeaf=leaves.find(l=>l.text.includes('Celda A'))!;
  const cellBLeaf=leaves.find(l=>l.text.includes('Celda B'))!;

  // Selection on a page containing a bottom footnote still emits visible selection rects
  s.setSelection(0,{anchor:{nodeId:firstLeaf.id,offset:0},focus:{nodeId:firstLeaf.id,offset:firstLeaf.text.length}});
  const overlaid1=s.overlay(s.displayLists[0]);
  expect(overlaid1.selections?.length).toBeGreaterThan(0);

  // Selection inside table cells (including trailing spaces) emits visible selection rects
  s.setSelection(0,{anchor:{nodeId:cellALeaf.id,offset:0},focus:{nodeId:cellBLeaf.id,offset:cellBLeaf.text.length}});
  const overlaid2=s.overlay(s.displayLists[0]);
  expect(overlaid2.selections?.length).toBeGreaterThanOrEqual(2);
 });

 it('matches accented and unaccented Spanish terms in findMatches while preserving exact selection offsets',()=>{
  const s=new CanvasEditSession({width:500,height:400,top:20,right:20,bottom:20,left:20});
  s.load([{id:'p1',html:'<p>6.2.1 Cálculo de la amortización y cálculo rápido de años.</p>'}]);
  const matches=s.findMatches('calculo',false,false);
  expect(matches).toHaveLength(2);
  s.selectMatch(matches[0]);
  expect(s.selectedText()).toBe('Cálculo');
  s.selectMatch(matches[1]);
  expect(s.selectedText()).toBe('cálculo');

  const amort=s.findMatches('amortizacion',false,true);
  expect(amort).toHaveLength(1);
  s.selectMatch(amort[0]);
  expect(s.selectedText()).toBe('amortización');
 });

 it('removes mixed nested lists across a full selection and preserves nested children when unwrapping a single parent item',()=>{
  const s=new CanvasEditSession({width:500,height:600,top:20,right:20,bottom:20,left:20});
  const nestedHtml =
    '<ul>' +
      '<li><b>Diseño:</b>' +
        '<ul>' +
          '<li><b>Diseño de Arquitectura:</b> Descomposición en 4 vistas esenciales:' +
            '<ol>' +
              '<li><i>Arquitectura de Backend.</i></li>' +
              '<li><i>Arquitectura de Frontend.</i></li>' +
            '</ol>' +
          '</li>' +
          '<li>Diseño de interfaz / experiencia de usuario.</li>' +
        '</ul>' +
      '</li>' +
      '<li><b>Implementación:</b> Técnicas y convenciones.</li>' +
      '<li><b>Pruebas:</b> Pruebas unitarias y de carga.</li>' +
    '</ul>';

  // Case 1: Select from "Diseño:" through "Pruebas:" (spanning nested <ul> and <ol>) and toggle off <ul>
  s.load([{id:'p1',html:nestedHtml}]);
  let leaves=textNodes(s.engine.getSections()[0].model.state.roots).filter(l=>l.text.trim());
  const firstLeaf=leaves[0];
  const lastLeaf=leaves[leaves.length-1];
  s.setSelection(0,{anchor:{nodeId:firstLeaf.id,offset:0},focus:{nodeId:lastLeaf.id,offset:lastLeaf.text.length}});
  expect(s.toggleList('ul')).toBe(true);
  expect(s.pages[0].html).not.toContain('<ul');
  expect(s.pages[0].html).not.toContain('<ol');
  expect(s.pages[0].html).not.toContain('<li');
  const fullTextAfterRemove=s.getReadableText();
  expect(fullTextAfterRemove).toContain('Diseño:');
  expect(fullTextAfterRemove).toContain('Diseño de Arquitectura:');
  expect(fullTextAfterRemove).toContain('Arquitectura de Backend.');
  expect(fullTextAfterRemove).toContain('Arquitectura de Frontend.');
  expect(fullTextAfterRemove).toContain('Diseño de interfaz');
  expect(fullTextAfterRemove).toContain('Implementación:');
  expect(fullTextAfterRemove).toContain('Pruebas:');

  // Case 2: Put caret ONLY on "Diseño:" and toggle off <ul> -> "Diseño:" becomes <p> AND all nested children are preserved and rendered
  s.load([{id:'p2',html:nestedHtml}]);
  leaves=textNodes(s.engine.getSections()[0].model.state.roots).filter(l=>l.text.trim());
  const disenoLeaf=leaves.find(l=>l.text.includes('Diseño:'))!;
  s.setSelection(0,{anchor:{nodeId:disenoLeaf.id,offset:0},focus:{nodeId:disenoLeaf.id,offset:0}});
  expect(s.toggleList('ul')).toBe(true);
  expect(s.getSelectionContext()?.formats.insertUnorderedList).toBe(false);
  const renderedAfterSingle=s.displayLists[0].commands
    .filter((c):c is Extract<typeof c,{kind:'text'}>=>c.kind==='text')
    .map(c=>c.text)
    .join('');
  expect(renderedAfterSingle).toContain('Diseño:');
  expect(renderedAfterSingle).toContain('Diseño de Arquitectura:');
  expect(renderedAfterSingle).toContain('Arquitectura de Backend.');
  expect(renderedAfterSingle).toContain('Arquitectura de Frontend.');
  expect(renderedAfterSingle).toContain('Diseño de interfaz');
  expect(renderedAfterSingle).toContain('Implementación:');
  expect(renderedAfterSingle).toContain('Pruebas:');

  // Case 3: Backspace at offset 0 on "Diseño:" also unwraps it without losing nested children
  s.load([{id:'p3',html:nestedHtml}]);
  leaves=textNodes(s.engine.getSections()[0].model.state.roots).filter(l=>l.text.trim());
  const disenoLeafBs=leaves.find(l=>l.text.includes('Diseño:'))!;
  s.setSelection(0,{anchor:{nodeId:disenoLeafBs.id,offset:0},focus:{nodeId:disenoLeafBs.id,offset:0}});
  expect(s.delete(true)).toBe(true);
  const renderedAfterBs=s.displayLists[0].commands
    .filter((c):c is Extract<typeof c,{kind:'text'}>=>c.kind==='text')
    .map(c=>c.text)
    .join('');
  expect(renderedAfterBs).toContain('Diseño:');
  expect(renderedAfterBs).toContain('Diseño de Arquitectura:');
  expect(renderedAfterBs).toContain('Arquitectura de Backend.');
  expect(renderedAfterBs).toContain('Pruebas:');

  // Case 4: Select ONLY a nested <ol> item ("Arquitectura de Backend.") and toggle off <ol>
  s.load([{id:'p4',html:nestedHtml}]);
  leaves=textNodes(s.engine.getSections()[0].model.state.roots).filter(l=>l.text.trim());
  const backendLeaf=leaves.find(l=>l.text.includes('Arquitectura de Backend.'))!;
  s.setSelection(0,{anchor:{nodeId:backendLeaf.id,offset:0},focus:{nodeId:backendLeaf.id,offset:0}});
  expect(s.getSelectionContext()?.formats.insertOrderedList).toBe(true);
  expect(s.getSelectionContext()?.formats.insertUnorderedList).toBe(false);
  expect(s.toggleList('ol')).toBe(true);
  expect(s.getSelectionContext()?.formats.insertOrderedList).toBe(false);
  expect(s.getSelectionContext()?.formats.insertUnorderedList).toBe(false);
  const textAfterNestedOl=s.getReadableText();
  expect(textAfterNestedOl).toContain('Diseño de Arquitectura:');
  expect(textAfterNestedOl).toContain('Arquitectura de Backend.');
  expect(textAfterNestedOl).toContain('Arquitectura de Frontend.');
  expect(textAfterNestedOl).toContain('Pruebas:');

  // Case 5: Direct sibling nested lists (<ul><li>A</li><ul><li>B</li><ol><li>C</li></ol></ul><li>D</li></ul>) toggle off cleanly
  s.load([{id:'p5',html:'<ul><li>A</li><ul><li>B</li><ol><li>C</li></ol></ul><li>D</li></ul>'}]);
  leaves=textNodes(s.engine.getSections()[0].model.state.roots).filter(l=>l.text.trim());
  s.setSelection(0,{anchor:{nodeId:leaves[0].id,offset:0},focus:{nodeId:leaves[leaves.length-1].id,offset:leaves[leaves.length-1].text.length}});
  expect(s.toggleList('ul')).toBe(true);
  expect(s.pages[0].html).not.toContain('<ul');
  expect(s.pages[0].html).not.toContain('<ol');
  expect(s.pages[0].html).not.toContain('<li');
  expect(s.getReadableText()).toContain('A');
  expect(s.getReadableText()).toContain('B');
  expect(s.getReadableText()).toContain('C');
  expect(s.getReadableText()).toContain('D');
 });

 it('deletes stray empty paragraphs, wraps naked pasted text on style apply, and toggles bold/italic across empty lines and nested spans',()=>{
  const s=new CanvasEditSession({width:500,height:600,top:20,right:20,bottom:20,left:20});
  const brokenPastedHtml =
    '<p style="font-family: Google Sans Text, sans-serif;">El Marco es la <b>base referencial</b> en la ingeniería de software</p>' +
    '<p style="font-family: Google Sans Text, sans-serif;"></p>' +
    '. Independientemente de la estrategia.';

  // 1) Backspace at offset 0 of naked root text removes the preceding empty <p>
  s.load([{id:'bp1',html:brokenPastedHtml}]);
  let leaves=textNodes(s.engine.getSections()[0].model.state.roots);
  const indepLeaf=leaves.find(l=>l.text.includes('. Independientemente'))!;
  s.setSelection(0,{anchor:{nodeId:indepLeaf.id,offset:0},focus:{nodeId:indepLeaf.id,offset:0}});
  expect(s.delete(true)).toBe(true);
  // Second Backspace merges the naked text into the preceding <p>
  leaves=textNodes(s.engine.getSections()[0].model.state.roots);
  const indepLeaf2=leaves.find(l=>l.text.includes('. Independientemente'))!;
  s.setSelection(0,{anchor:{nodeId:indepLeaf2.id,offset:0},focus:{nodeId:indepLeaf2.id,offset:0}});
  expect(s.delete(true)).toBe(true);
  expect(s.pages[0].html).not.toContain('<p style="font-family: Google Sans Text, sans-serif;"></p>');
  expect(s.getReadableText()).toContain('ingeniería de software. Independientemente');

  // 2) Applying Normal style works even on naked root text and strips external Google Sans Text font
  s.load([{id:'bp2',html:brokenPastedHtml}]);
  leaves=textNodes(s.engine.getSections()[0].model.state.roots);
  s.setSelection(0,{anchor:{nodeId:leaves[0].id,offset:0},focus:{nodeId:leaves[leaves.length-1].id,offset:leaves[leaves.length-1].text.length}});
  const applied = s.applyBlockRule({
    target:'P',label:'Normal',fontFamily:'Times New Roman',fontSizePt:12,bold:false,italic:false,underline:false,strikeThrough:false,uppercase:false,color:'#000000',align:'left',lineHeight:1.5,spaceBeforePt:0,spaceAfterPt:6,firstLineIndentPt:0,
  });
  expect(applied).toBe(true);
  expect(s.pages[0].html).not.toContain('Google Sans Text');
  expect(s.pages[0].html).toContain('Times New Roman');
  expect(s.engine.getSections()[0].model.state.roots.every(r=>r.kind==='element'&&r.tag==='p')).toBe(true);

  // 3) Toggling Bold/Italic works even when selection starts on an empty <p> or covers a <span> with nested <b>
  s.load([{id:'bp3',html:'<p></p><p><span style="font-family: Google Sans Text;">Texto con <b>negrita</b> interna</span></p>'}]);
  const roots3=s.engine.getSections()[0].model.state.roots;
  const emptyP=roots3[0];
  const leaves3=textNodes(roots3);
  const lastLeaf3=leaves3[leaves3.length-1];
  s.setSelection(0,{anchor:{nodeId:emptyP.id,offset:0},focus:{nodeId:lastLeaf3.id,offset:lastLeaf3.text.length}});
  expect(s.toggleInlineCommand('italic')).toBe(true);
  expect(s.pages[0].html).toContain('font-style: italic');
  expect(s.toggleInlineCommand('bold')).toBe(true);
  expect(s.pages[0].html).toContain('font-weight: bold');
 });

 it('converts leaf divs and APA run-in headings to lists without duplicating or sharing node IDs across splits',()=>{
  const s=new CanvasEditSession({width:500,height:600,top:20,right:20,bottom:20,left:20});
  s.load([{id:'dup1',html:'<div>Capacitación y soporte al usuario</div><p data-apa-run-in="4"><span data-apa-heading-level="4">Migración de datos</span></p>'}]);
  let leaves=textNodes(s.engine.getSections()[0].model.state.roots);
  s.setSelection(0,{anchor:{nodeId:leaves[0].id,offset:0},focus:{nodeId:leaves[leaves.length-1].id,offset:leaves[leaves.length-1].text.length}});
  expect(s.toggleList('ul')).toBe(true);
  expect(s.pages[0].html).toContain('<ul');
  expect(s.pages[0].html).not.toContain('data-apa-heading-level');

  // Verify every node ID in the tree is strictly unique after split + toggleList
  const collectIds=(nodes:readonly DocumentNode[], out:string[]=[])=>{
    for(const n of nodes){out.push(n.id);if(n.kind==='element')collectIds(n.children,out);}
    return out;
  };
  leaves=textNodes(s.engine.getSections()[0].model.state.roots);
  s.setSelection(0,{anchor:{nodeId:leaves[0].id,offset:5},focus:{nodeId:leaves[0].id,offset:5}});
  expect(s.enter()).toBe(true);
  const ids=collectIds(s.engine.getSections()[0].model.state.roots);
  expect(new Set(ids).size).toBe(ids.length);
 });

 it('splits <br>-separated pasted lines into list items and applies the document template font while preserving bold',()=>{
  const s=new CanvasEditSession({width:500,height:600,top:20,right:20,bottom:20,left:20});
  s.load([{id:'pf1',html:'<p style="font-family: Google Sans Text, sans-serif;"><span style="font-family: Google Sans Text;"><b>Definición:</b> Tiempo de respuesta.<br><b>El problema común:</b> Se vuelve lento.</span></p>'}]);
  const leaves=textNodes(s.engine.getSections()[0].model.state.roots);
  s.setSelection(0,{anchor:{nodeId:leaves[0].id,offset:0},focus:{nodeId:leaves[leaves.length-1].id,offset:leaves[leaves.length-1].text.length}});
  const mockTemplate={
    id:'t1',name:'APA',rules:{
      P:{target:'P' as const,label:'Normal',fontFamily:'Times New Roman',fontSizePt:12,bold:false,italic:false,underline:false,strikeThrough:false,uppercase:false,color:'#000000',align:'left' as const,lineHeight:1.5,spaceBeforePt:0,spaceAfterPt:6,firstLineIndentPt:0},
    },
  } as any;
  expect(s.toggleList('ul',undefined,mockTemplate)).toBe(true);
  expect(s.pages[0].html).toContain('<ul');
  expect(s.pages[0].html).toContain('Times New Roman');
  expect(s.pages[0].html).not.toContain('Google Sans Text');
  expect(s.pages[0].html).toContain('<b>Definición:</b>');
  expect(s.pages[0].html).toContain('<b>El problema común:</b>');
  expect(s.pages[0].html.match(/<li\b/g)?.length).toBe(2);
  expect(s.getSelectionContext()?.formats.fontName).toBe('Times New Roman');
 });

 it('converts Gemini-pasted paragraphs (even nested in <p> or <blockquote>) to lists without disappearing, unwraps <li> to H1-H5, and merges across pasted blocks cleanly',()=>{
  const s=new CanvasEditSession({width:500,height:600,top:20,right:20,bottom:20,left:20},{apaBorders:true});
  const apaTpl=BUILTIN_STYLE_TEMPLATES.find(t=>t.academicStyle==='apa7')||BUILTIN_STYLE_TEMPLATES[0];

  // 1) Pre-existing or pasted <p><p>Incidencia...</p></p> toggled into <ul> never vanishes
  s.load([{
    id:'sw1',
    html:
      '<ul>\n  <li><b>Impacto Crítico:</b> Sistemas donde un fallo pone en peligro la vida.</li>\n</ul>\n' +
      '<p><p>Incidencia en la estimación: Cuanto mayor sea la criticidad de fallas del sistema, mayores serán el esfuerzo, el tiempo y el costo del proyecto.</p></p>\n' +
      '<h4>Métodos De Estimaciones</h4>',
  }]);
  let leaves=textNodes(s.engine.getSections()[0].model.state.roots);
  const incLeaf=leaves.find(l=>l.text.includes('Incidencia en la estimación'))!;
  s.setSelection(0,{anchor:{nodeId:incLeaf.id,offset:0},focus:{nodeId:incLeaf.id,offset:0}});
  expect(s.toggleList('ul',undefined,apaTpl)).toBe(true);
  expect(s.getReadableText()).toContain('Incidencia en la estimación: Cuanto mayor sea la criticidad');
  expect(s.pages[0].html).not.toMatch(/<p[^>]*>\s*<ul/i);

  // 2) Applying H2 / H4 (APA run-in) on a pasted list item or leaf <div> unwraps it into a real heading
  leaves=textNodes(s.engine.getSections()[0].model.state.roots);
  const incInList=leaves.find(l=>l.text.includes('Incidencia en la estimación'))!;
  s.setSelection(0,{anchor:{nodeId:incInList.id,offset:5},focus:{nodeId:incInList.id,offset:5}});
  expect(s.applyBlockRule(apaTpl.rules.H2,apaTpl)).toBe(true);
  expect(s.getSelectionContext()?.formats.heading).toBe('H2');
  expect(s.getSelectionContext()?.formats.insertUnorderedList).toBe(false);
  expect(s.pages[0].html).toContain('<h2');

  if(apaTpl.academicStyle==='apa7'&&apaTpl.rules.H4){
    expect(s.applyBlockRule(apaTpl.rules.H4,apaTpl)).toBe(true);
    expect(s.getSelectionContext()?.formats.heading).toBe('H4');
    expect(s.pages[0].html).toContain('data-apa-run-in="4"');
  }

  // 3) Delete at end of paragraph above (even across an empty <p><br></p> and multi-run <b> spans) pulls pasted text up without losing text or jumping caret to start
  s.load([{
    id:'mrg1',
    html:'<p>Párrafo superior antes del salto</p>\n<p><br></p>\n<p><b>Texto pegado:</b> traído desde abajo</p>',
  }]);
  leaves=textNodes(s.engine.getSections()[0].model.state.roots);
  const topLeaf=leaves.find(l=>l.text==='Párrafo superior antes del salto')!;
  s.setSelection(0,{anchor:{nodeId:topLeaf.id,offset:topLeaf.text.length},focus:{nodeId:topLeaf.id,offset:topLeaf.text.length}});
  // First forward Delete removes the empty <p><br></p> and keeps caret at the end of topLeaf
  expect(s.delete(false)).toBe(true);
  expect(s.selection?.focus).toEqual({nodeId:topLeaf.id,offset:topLeaf.text.length});
  // Second forward Delete pulls "Texto pegado: traído desde abajo" onto the same paragraph cleanly
  expect(s.delete(false)).toBe(true);
  expect(s.getReadableText()).toContain('Párrafo superior antes del saltoTexto pegado: traído desde abajo');

  // 4) Backspace right after a bold run inside the same paragraph deletes ':', NOT unwrapping or merging blocks prematurely
  leaves=textNodes(s.engine.getSections()[0].model.state.roots);
  const afterBold=leaves.find(l=>l.text===' traído desde abajo')!;
  s.setSelection(0,{anchor:{nodeId:afterBold.id,offset:0},focus:{nodeId:afterBold.id,offset:0}});
  expect(s.delete(true)).toBe(true);
  expect(s.getReadableText().replace(/\s+/g,' ')).toContain('Texto pegado traído desde abajo');
  expect(s.pages[0].html).toContain('<b>Texto pegado</b> traído desde abajo');
 });

 it('copies and pastes tables with merged cells (colspan/rowspan), empty header cells, column widths, highlights, and right/center alignments across Weave sessions',()=>{
  const tableGeom={width:700,height:800,top:30,right:30,bottom:30,left:30};
  const cocomoSourceHtml=`
    <table style="width: 100%; table-layout: fixed; border-collapse: collapse;">
      <colgroup>
        <col style="width: 28%"><col style="width: 14%"><col style="width: 14%"><col style="width: 14%"><col style="width: 15%"><col style="width: 15%">
      </colgroup>
      <thead>
        <tr>
          <th style="border: 1px solid #1e293b; background-color: #dbe5f1; text-align: center;"><p style="text-align: center; font-weight: bold;">Tipo de objeto</p></th>
          <th style="border: 1px solid #1e293b; background-color: #dbe5f1; text-align: center;"><p style="text-align: center; font-weight: bold;">Cantidad</p></th>
          <th colspan="3" style="border: 1px solid #1e293b; background-color: #dbe5f1; text-align: center;"><p style="text-align: center; font-weight: bold;">Factor de peso</p></th>
          <th style="border: 1px solid #1e293b; background-color: #dbe5f1; text-align: center;"><p style="text-align: center; font-weight: bold;">Total</p></th>
        </tr>
        <tr>
          <th style="border: 1px solid #1e293b; background-color: #dbe5f1;"><p></p></th>
          <th style="border: 1px solid #1e293b; background-color: #dbe5f1;"><p></p></th>
          <th style="border: 1px solid #1e293b; background-color: #dbe5f1; text-align: center;"><p style="text-align: center; font-weight: bold;">Simple</p></th>
          <th style="border: 1px solid #1e293b; background-color: #dbe5f1; text-align: center;"><p style="text-align: center; font-weight: bold;">Medio</p></th>
          <th style="border: 1px solid #1e293b; background-color: #dbe5f1; text-align: center;"><p style="text-align: center; font-weight: bold;">Avanzado</p></th>
          <th style="border: 1px solid #1e293b; background-color: #dbe5f1;"><p></p></th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td style="border: 1px solid #1e293b;"><p style="font-weight: bold;">Pantallas</p></td>
          <td style="border: 1px solid #1e293b; text-align: center;"><p style="text-align: center; font-weight: bold;">24</p></td>
          <td style="border: 1px solid #1e293b; text-align: center;"><p style="text-align: center; font-weight: bold;">1</p></td>
          <td style="border: 1px solid #1e293b; background-color: #ffff00; text-align: center;"><p style="text-align: center; font-weight: bold;">2</p></td>
          <td style="border: 1px solid #1e293b; text-align: center;"><p style="text-align: center; font-weight: bold;">3</p></td>
          <td style="border: 1px solid #1e293b; text-align: center;"><p style="text-align: center; font-weight: bold;">48</p></td>
        </tr>
        <tr>
          <td colspan="5" style="border: 1px solid #1e293b; text-align: right;"><p style="text-align: right; font-weight: bold;">Puntos objeto (PO)</p></td>
          <td style="border: 1px solid #1e293b; text-align: center;"><p style="text-align: center; font-weight: bold;">208</p></td>
        </tr>
      </tbody>
    </table>
  `;

  // 1) Copy from Doc #1 and paste into Doc #2 (which has a custom default table template)
  const doc1=new CanvasEditSession(tableGeom);
  doc1.load([{id:'d1',html:cocomoSourceHtml}]);
  doc1.selectAll();
  const copiedHtml=doc1.selectedHtml();
  const copiedText=doc1.selectedText();
  expect(copiedText).toContain('Tipo de objeto\tCantidad\tFactor de peso\tTotal');

  const doc2=new CanvasEditSession(tableGeom);
  doc2.load([{id:'d2',html:'<p><i><b>COCOMO II</b></i></p><p></p>'}]);
  const destLeaves=textNodes(doc2.engine.getSections()[0].model.state.roots);
  const emptyDest=destLeaves[destLeaves.length-1];
  doc2.setSelection(0,{anchor:{nodeId:emptyDest.id,offset:0},focus:{nodeId:emptyDest.id,offset:0}});
  const defaultCustomRule=BUILTIN_STYLE_TEMPLATES[0].tableStyle;
  expect(doc2.pasteTable(copiedHtml,false,0,defaultCustomRule)).toBe(true);

  const pastedHtml=doc2.pages[0].html;
  const dom=new DOMParser().parseFromString(pastedHtml,'text/html');
  const rows=Array.from(dom.querySelectorAll('table tr'));
  expect(rows).toHaveLength(4);
  // Row 1 MUST still have all 6 cells so "Simple | Medio | Avanzado" sit in columns 2, 3, 4 under "Factor de peso"
  const row1Cells=Array.from(rows[1].querySelectorAll('th, td'));
  expect(row1Cells).toHaveLength(6);
  expect(row1Cells[0].textContent?.trim()).toBe('');
  expect(row1Cells[1].textContent?.trim()).toBe('');
  expect(row1Cells[2].textContent?.trim()).toBe('Simple');
  expect(row1Cells[3].textContent?.trim()).toBe('Medio');
  expect(row1Cells[4].textContent?.trim()).toBe('Avanzado');
  expect(row1Cells[5].textContent?.trim()).toBe('');

  // Verify yellow highlight (#ffff00) and right alignment on "Puntos objeto (PO)" (colspan="5") survived!
  expect(pastedHtml.toLowerCase()).toContain('#ffff00');
  const poCell=rows[3].querySelector('td[colspan="5"]') as HTMLElement;
  expect(poCell).toBeTruthy();
  expect(poCell.getAttribute('style')||'').toContain('text-align: right');

  // Verify Canvas X coordinate of "Simple" sits strictly under "Factor de peso" (to the right of "Cantidad"), never under column 0!
  const cmds=doc2.displayLists[0].commands.filter((c):c is Extract<typeof c,{kind:'text'}>=>c.kind==='text'&&!!c.text);
  const cantidadCmd=cmds.find(c=>c.text==='C'&&c.y<120)!;
  const simpleCmd=cmds.find(c=>c.text==='S')!;
  expect(simpleCmd.x).toBeGreaterThan(cantidadCmd.x + 40);

  // 2) Also verify rowspan="2" merged header tables copy & paste with exact column positions
  const rowspanTableHtml=
    '<table><thead>' +
    '<tr><th rowspan="2">Tipo</th><th rowspan="2">Cant</th><th colspan="2">Peso</th></tr>' +
    '<tr><th>Simple</th><th>Medio</th></tr>' +
    '</thead><tbody><tr><td>Pantallas</td><td>24</td><td>1</td><td>2</td></tr></tbody></table>';
  const doc3=new CanvasEditSession(tableGeom);
  doc3.load([{id:'d3',html:rowspanTableHtml}]);
  doc3.selectAll();
  const copiedRowspanHtml=doc3.selectedHtml();
  const doc4=new CanvasEditSession(tableGeom);
  doc4.load([{id:'d4',html:'<p></p>'}]);
  expect(doc4.pasteTable(copiedRowspanHtml,false,0,defaultCustomRule)).toBe(true);
  const dom4=new DOMParser().parseFromString(doc4.pages[0].html,'text/html');
  expect(dom4.querySelector('th[rowspan="2"]')?.textContent?.trim()).toBe('Tipo');
  expect(dom4.querySelector('th[colspan="2"]')?.textContent?.trim()).toBe('Peso');
  expect(dom4.querySelectorAll('table tr')[1].querySelectorAll('th, td')).toHaveLength(2);
 });

 it('keeps progressive multilevel list indentation intact across all levels after changing document template or page margins',()=>{
  const g1={width:600,height:700,top:40,right:40,bottom:40,left:40};
  const g2={width:600,height:700,top:40,right:40,bottom:40,left:72};
  const s=new CanvasEditSession(g1,{font:'16px "Times New Roman"',lineHeight:32},measure);
  s.load([{
    id:'ml1',
    html:
      '<ul>' +
        '<li><b>Estudio de campo:</b> Observación real.</li>' +
        '<li><b>Modelo del Dominio:</b>' +
          '<ul>' +
            '<li>Representa el alcance conceptual.</li>' +
            '<li>Aclaración crítica.<ul><li>Subnivel 3 anidado.</li></ul></li>' +
          '</ul>' +
        '</li>' +
        '<li data-list-level="1">Subnivel 2 por atributo.</li>' +
        '<li data-list-level="2">Subnivel 3 por atributo.</li>' +
      '</ul>',
  }]);

  const apaTimes=BUILTIN_STYLE_TEMPLATES.find(t=>t.id==='apa-times-12')!;
  expect(s.applyTemplateToDocument(apaTimes,g2,{font:'16px "Times New Roman"',lineHeight:32,apaBorders:true})).toBe(true);

  const texts=s.displayLists[0].commands.filter((c):c is Extract<typeof c,{kind:'text'}>=>c.kind==='text'&&!!c.text);
  const lineStartX=(needle:string)=>{
    const byY=new Map<number,typeof texts>();
    for(const t of texts){const arr=byY.get(t.y)||[];arr.push(t);byY.set(t.y,arr);}
    for(const line of byY.values()){
      line.sort((a,b)=>a.x-b.x);
      if(line.map(t=>t.text).join('').includes(needle)){
        const markerOrFirst=line.find(t=>t.text===needle[0]);
        if(markerOrFirst)return markerOrFirst.x;
      }
    }
    return -1;
  };

  const x1=lineStartX('Estudio');
  const x2Nested=lineStartX('Representa');
  const x3Nested=lineStartX('Subnivel 3 anidado');
  const x2Attr=lineStartX('Subnivel 2 por atributo');
  const x3Attr=lineStartX('Subnivel 3 por atributo');

  expect(x1).toBeGreaterThan(g2.left);
  expect(x2Nested).toBeGreaterThanOrEqual(x1 + 19);
  expect(x3Nested).toBeGreaterThanOrEqual(x2Nested + 19);
  expect(x2Attr).toBeGreaterThanOrEqual(x1 + 19);
  expect(x3Attr).toBeGreaterThanOrEqual(x2Attr + 19);
 });

 it('supports code block creation via ``` + Enter, newline Enter, Tab/Shift+Tab indentation, fenced paste, exit, and template preservation',()=>{
  const s=new CanvasEditSession({width:600,height:700,top:20,right:20,bottom:20,left:20});
  s.load([{id:'cb1',html:'<p>```python</p>'}]);
  const leaf=textNodes(s.engine.getSections()[0].model.state.roots)[0];
  s.setSelection(0,{anchor:{nodeId:leaf.id,offset:leaf.text.length},focus:{nodeId:leaf.id,offset:leaf.text.length}});

  // 1) ```python + Enter converts paragraph into a code block and focuses inside <code>
  expect(s.enter()).toBe(true);
  expect(s.isInsideCodeBlock()).toBe(true);
  expect(s.pages[0].html).toContain('word-code-block');
  expect(s.pages[0].html).toContain('python');

  // 2) Typing, Enter (inserts \n), Tab (2 spaces), and Shift+Tab (outdent 2 spaces) inside <pre>
  expect(s.insert('def hola():')).toBe(true);
  expect(s.enter()).toBe(true);
  expect(s.indentCodeBlock(1)).toBe(true);
  expect(s.insert('return 1')).toBe(true);
  expect(s.pages[0].html).toContain('def hola():\n  return 1');
  expect(s.indentCodeBlock(-1)).toBe(true);
  expect(s.pages[0].html).toContain('def hola():\nreturn 1');

  // 3) Pasting raw multi-line ASCII diagram inside <pre> preserves spaces and newlines verbatim
  expect(s.pastePlainText('\n   [ A ] <---> [ B ]')).toBe(true);
  expect(s.pages[0].html).toContain('   [ A ] &lt;---&gt; [ B ]');

  // 4) Exiting code block via enter(true) moves caret into a new <p> outside <pre>
  expect(s.enter(true)).toBe(true);
  expect(s.isInsideCodeBlock()).toBe(false);

  // 5) Applying APA template preserves the code block's monospace font and structure
  const apaTimes=BUILTIN_STYLE_TEMPLATES.find(t=>t.id==='apa-times-12')!;
  expect(s.applyTemplateToDocument(apaTimes,{width:600,height:700,top:20,right:20,bottom:20,left:20},{font:'16px "Times New Roman"',lineHeight:32})).toBe(true);
  expect(s.pages[0].html).toContain('JetBrains Mono');
  expect(s.pages[0].html).toContain('word-code-block');

  // 6) Pasting a Markdown fenced code block outside <pre> creates a code block automatically
  expect(s.pastePlainText('```ts\nconst x = 1;\n```')).toBe(true);
  expect(s.pages[0].html).toContain('const x = 1;');
 });

});
