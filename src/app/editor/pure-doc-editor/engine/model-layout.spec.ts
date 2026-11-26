import {describe,it,expect} from 'vitest';
import {layoutModelDocument,resolveDefaultModelStyles,ResolvedLayoutStyle} from './model-layout';
import {DocumentState} from './document-model';
import {htmlToDocumentState} from './document-model-dom';
import {serializeModelPages} from './model-page-serialization';
describe('document model to independent layout',()=>{
 it('uses resolved styles and preserves logical IDs without HTML measurement',()=>{
   const state:DocumentState={revision:7,selection:null,roots:[{id:'p',kind:'element',tag:'p',attributes:{},children:[{id:'t',kind:'text',text:'Hola'}]},{id:'img',kind:'element',tag:'img',attributes:{src:'photo'},children:[]}]};
   const base:ResolvedLayoutStyle={font:'12px serif',color:'black',lineHeight:16};
   const styles=new Map([['p',base],['img',{...base,width:20,height:30}]]);
   const pages=layoutModelDocument(state,{width:100,height:100,top:10,right:10,bottom:10,left:10},()=>({width:6,ascent:9,descent:3}),styles);
   expect(pages[0].revision).toBe(7);expect(pages[0].document).toBe(state);
   expect(pages[0].commands[0]).toMatchObject({kind:'text',source:{start:{nodeId:'t',offset:0}}});
   expect(pages[0].commands.at(-1)).toMatchObject({kind:'image',assetId:'photo',y:26});
   expect(()=>layoutModelDocument(state,{width:100,height:100,top:10,right:10,bottom:10,left:10},()=>({width:6,ascent:9,descent:3}),new Map())).toThrow('Unresolved layout style');
 });
 it('keeps adjacent formatted runs and their spaces on the same table-cell line',()=>{
   const state:DocumentState={revision:0,selection:null,roots:[{id:'table',kind:'element',tag:'table',attributes:{},children:[{id:'row',kind:'element',tag:'tr',attributes:{},children:[{id:'cell',kind:'element',tag:'td',attributes:{},children:[{id:'bold',kind:'element',tag:'strong',attributes:{},children:[{id:'a',kind:'text',text:'A'}]},{id:'space',kind:'text',text:' '},{id:'b',kind:'text',text:'B'}]}]}]}]};
   const base:ResolvedLayoutStyle={font:'12px serif',color:'black',lineHeight:16};
   const styles=new Map([['table',{...base,columns:[1]}],['cell',base],['bold',{...base,font:'bold 12px serif'}]]);
   const pages=layoutModelDocument(state,{width:100,height:100,top:10,right:10,bottom:10,left:10},()=>({width:6,ascent:9,descent:3}),styles);
   const text=pages[0].commands.filter(c=>c.kind==='text');
   expect(text.map(c=>c.text).join('')).toBe('A B');
   expect(new Set(text.map(c=>c.y)).size).toBe(1);
   expect(text[0].font).toBe('bold 12px serif');
 });
 it('resolves CSS inherit keywords without emitting black background rects or invalid inherit fonts',()=>{
   const html='<h1 style="font-family: Times New Roman; font-size: 16pt; font-weight: bold;"><span style="font-family: inherit; font-size: inherit; font-weight: inherit; background-color: inherit; color: inherit;">PERFIL DEL PROYECTO</span></h1>';
   const state=htmlToDocumentState(html,1);
   const styles=resolveDefaultModelStyles(state);
   const pages=layoutModelDocument(state,{width:600,height:800,top:50,right:50,bottom:50,left:50},t=>({width:[...t].length*8,ascent:12,descent:4}),styles);
   const rects=pages[0].commands.filter(c=>c.kind==='rect');
   expect(rects).toHaveLength(0);
   const texts=pages[0].commands.filter(c=>c.kind==='text');
   expect(texts.length).toBeGreaterThan(0);
   for(const cmd of texts){
     if(cmd.kind==='text'){
       expect(cmd.font).not.toContain('inherit');
       expect(cmd.font).toContain('700 21.33px "Times New Roman"');
     }
   }
 });
 it('lays out .word-toc-entry on a single line with dotted leader and right-aligned page number',()=>{
   const html=`<div class="word-toc-page-section"><div class="word-toc-header">Índice de Contenido</div><div class="word-toc-entry" data-toc-target-id="h1" data-toc-page="134" style="padding-left: 14pt; font-size: 11pt;">
     <span class="word-toc-title">La Microlocalización del Proyecto</span>
     <span class="word-toc-dots"></span>
     <span class="word-toc-page">135</span>
   </div></div>`;
   const state=htmlToDocumentState(html,1);
   const styles=resolveDefaultModelStyles(state);
   const pages=layoutModelDocument(state,{width:600,height:800,top:50,right:50,bottom:50,left:50},t=>({width:[...t].length*7,ascent:10,descent:3}),styles);
   const texts=pages[0].commands.filter((c):c is Extract<typeof c,{kind:'text'}>=>c.kind==='text'&&!!c.text);
   const entryTexts=texts.filter(t=>t.y>80);
   expect(new Set(entryTexts.map(t=>t.y)).size).toBe(1);
   const leaderCmd=entryTexts.find(t=>t.text.includes('.'));
   expect(leaderCmd).toBeDefined();
   expect(leaderCmd!.text).toMatch(/^\.+$/);
   const lastGlyph=entryTexts.at(-1)!;
   expect(lastGlyph.text).toBe('5');
   expect(lastGlyph.x).toBeGreaterThan(500);
   const serialized=serializeModelPages(state,pages);
   expect(serialized[0]).toContain('word-toc-dots');
   expect(serialized[0]).toContain('135');
 });
 it('preserves heading ID and avoids false continuation split when a heading on page 2 has leading whitespace',()=>{
   const html='<p>Página uno</p><h1 id="toc-h-0">\n  <span>PERFIL DEL PROYECTO</span>\n</h1>';
   const state=htmlToDocumentState(html,1);
   const styles=resolveDefaultModelStyles(state);
   const pages=layoutModelDocument(state,{width:300,height:65,top:10,right:10,bottom:10,left:10},t=>({width:[...t].length*6,ascent:12,descent:4}),styles);
   expect(pages).toHaveLength(2);
   const serialized=serializeModelPages(state,pages);
   expect(serialized[0]).not.toContain('<h1');
   expect(serialized[1]).toContain('id="toc-h-0"');
   expect(serialized[1]).not.toContain('data-word-continuation');
 });
 it('respects APA 7 table borders, colgroup column widths, and compact cell line height',()=>{
   const html=`<table data-apa-table="true" style="border-style: solid none; font-size: 12pt;"><colgroup><col style="width: 50%;"><col style="width: 30%;"><col style="width: 20%;"></colgroup><tbody><tr><td><p style="line-height: 1.5;">Integrantes:</p></td><td><p style="line-height: 1.5;"><br></p></td><td><p style="line-height: 1.5;"><br></p></td></tr><tr><td><p style="line-height: 1.5;">Rodríguez Araúz Evert</p></td><td><p style="line-height: 1.5;"><br></p></td><td><p style="line-height: 1.5;">223044083</p></td></tr></tbody></table>`;
   const state=htmlToDocumentState(html,1);
   const styles=resolveDefaultModelStyles(state,{font:'16px "Times New Roman"',lineHeight:36,apaBorders:true});
   const tableNode=state.roots[0];
   const tableStyle=styles.get(tableNode.id)!;
   expect(tableStyle.columns).toEqual([50,30,20]);
   expect(tableStyle.apaBorders).toBe(true);
   const pages=layoutModelDocument(state,{width:600,height:800,top:50,right:50,bottom:50,left:50},t=>({width:[...t].length*7,ascent:11,descent:3}),styles);
   const rects=pages[0].commands.filter((c):c is Extract<typeof c,{kind:'rect'}>=>c.kind==='rect');
   expect(rects.length).toBeGreaterThan(0);
   expect(rects.every(r=>r.height===1&&r.width>20)).toBe(true);
 });
 it('renders multi-column sections (.word-columns-section) side-by-side with a separator rule',()=>{
   const html=`<div class="word-columns-section" data-word-columns="2"><p>Columna izquierda</p><p>Columna derecha</p></div>`;
   const state=htmlToDocumentState(html,1);
   const styles=resolveDefaultModelStyles(state);
   const pages=layoutModelDocument(state,{width:600,height:800,top:50,right:50,bottom:50,left:50},t=>({width:[...t].length*7,ascent:11,descent:3}),styles);
   const texts=pages[0].commands.filter((c):c is Extract<typeof c,{kind:'text'}>=>c.kind==='text');
   const fullText=texts.map(t=>t.text).join('');
   expect(fullText).toContain('izquierda');
   expect(fullText).toContain('derecha');
   const leftIdx=fullText.indexOf('izquierda');
   const rightIdx=fullText.indexOf('derecha');
   expect(texts[rightIdx].x).toBeGreaterThan(texts[leftIdx].x+200);
   const rects=pages[0].commands.filter((c):c is Extract<typeof c,{kind:'rect'}>=>c.kind==='rect');
   expect(rects.some(r=>r.width===1&&r.height>=12)).toBe(true);
 });
 it('lays out stray root inline elements cleanly and ignores transient caret marker spans',()=>{
   const html='<span data-weave-caret="anchor"></span><span>Texto en linea</span>';
   const state=htmlToDocumentState(html,1);
   const styles=resolveDefaultModelStyles(state);
   const pages=layoutModelDocument(state,{width:400,height:400,top:20,right:20,bottom:20,left:20},t=>({width:[...t].length*6,ascent:10,descent:3}),styles);
   const texts=pages[0].commands.filter((c):c is Extract<typeof c,{kind:'text'}>=>c.kind==='text');
   expect(texts.map(t=>t.text).join('')).toBe('Texto en linea');
 });
 it('renders SVG graphics as image commands and anchors footnotes at the bottom of the page',()=>{
   const html=`<p>Texto principal</p><svg width="100" height="60"><rect width="100" height="60" fill="#2563eb"/></svg><div data-word-note-list="footnote"><p>1. Nota al pie de prueba.</p></div>`;
   const state=htmlToDocumentState(html,1);
   const styles=resolveDefaultModelStyles(state);
   const pages=layoutModelDocument(state,{width:600,height:800,top:50,right:50,bottom:50,left:50},t=>({width:[...t].length*7,ascent:11,descent:3}),styles);
   const images=pages[0].commands.filter((c):c is Extract<typeof c,{kind:'image'}>=>c.kind==='image');
   expect(images.length).toBe(1);
   expect(images[0].assetId).toContain('data:image/svg+xml');
   const texts=pages[0].commands.filter((c):c is Extract<typeof c,{kind:'text'}>=>c.kind==='text');
   const fullText=texts.map(t=>t.text).join('');
   const fnIdx=fullText.indexOf('Nota');
   expect(fnIdx).toBeGreaterThan(-1);
   expect(texts[fnIdx].y).toBeGreaterThan(700);
 });
 it('lays out checkbox labels cleanly without throwing inline layout errors',()=>{
   const html='<p><label><input type="checkbox" checked /> Hecho</label> <label><input type="checkbox" /> Pendiente</label></p>';
   const state=htmlToDocumentState(html,1);
   const styles=resolveDefaultModelStyles(state);
   const pages=layoutModelDocument(state,{width:500,height:400,top:20,right:20,bottom:20,left:20},t=>({width:[...t].length*6,ascent:10,descent:3}),styles);
   const fullText=pages[0].commands.filter((c):c is Extract<typeof c,{kind:'text'}>=>c.kind==='text').map(t=>t.text).join('');
   expect(fullText).toContain('[x] Hecho');
   expect(fullText).toContain('[ ] Pendiente');
 });
 it('resolves text-shadow, -webkit-text-stroke, text-transform, and paragraph borders natively',()=>{
   const html='<p style="border: 2px solid #2563eb; padding-right: 12px"><span style="text-transform: uppercase; text-shadow: 1px 2px 3px #64748b; -webkit-text-stroke: 1px #0f172a">Hola</span></p>';
   const state=htmlToDocumentState(html,1);
   const styles=resolveDefaultModelStyles(state);
   const pages=layoutModelDocument(state,{width:500,height:400,top:20,right:20,bottom:20,left:20},t=>({width:[...t].length*6,ascent:10,descent:3}),styles);
   const texts=pages[0].commands.filter((c):c is Extract<typeof c,{kind:'text'}>=>c.kind==='text');
   expect(texts.map(t=>t.text).join('')).toBe('HOLA');
   expect(texts[0].textShadow).toEqual({offsetX:1,offsetY:2,blur:3,color:'#64748b'});
   expect(texts[0].textStroke).toEqual({width:1,color:'#0f172a'});
   const rects=pages[0].commands.filter((c):c is Extract<typeof c,{kind:'rect'}>=>c.kind==='rect');
   expect(rects.some(r=>r.color==='#2563eb'&&r.height===2&&r.width>400)).toBe(true);
   expect(rects.some(r=>r.color==='#2563eb'&&r.width===2&&r.height>10)).toBe(true);
 });
 it('draws no border boxes around native or imported TOC tables and entries while preserving dot leaders',()=>{
   const html=`
     <div class="word-toc-page-section" style="border: 1px solid #94a3b8; padding: 12px;">
       <p class="word-toc-header" style="border-bottom: 1px solid #cbd5e1;">Índice de contenido</p>
       <p class="word-toc-entry" style="border: 1px solid #cbd5e1;">
         <span class="word-toc-title">1. Introducción</span>
         <span class="word-toc-dots"></span>
         <span class="word-toc-page">7</span>
       </p>
     </div>
     <table data-word-flow="toc-tbl" style="width: 100%; border-collapse: collapse;">
       <tbody>
         <tr><td style="border: 1px solid #000000;"><p><span class="word-toc-title">Capítulo I</span><span class="docx-toc-leader"></span><span>12</span></p></td></tr>
       </tbody>
     </table>
   `;
   const state=htmlToDocumentState(html,1);
   const styles=resolveDefaultModelStyles(state);
   const pages=layoutModelDocument(state,{width:600,height:500,top:30,right:30,bottom:30,left:30},t=>({width:[...t].length*6,ascent:10,descent:3}),styles);
   const rects=pages[0].commands.filter((c):c is Extract<typeof c,{kind:'rect'}>=>c.kind==='rect');
   expect(rects).toHaveLength(0);
   const texts=pages[0].commands.filter((c):c is Extract<typeof c,{kind:'text'}>=>c.kind==='text').map(t=>t.text).join('');
   expect(texts).toContain('1. Introducción');
   expect(texts).toContain('Capítulo I');
   expect(texts).toContain('.');
 });
 it('renders inline footnote calls anchored at the bottom of their respective paginated Canvas page',()=>{
  const html=`
   <p>Párrafo uno<a data-word-note-id="fn-1" data-note-kind="footnote" data-note-content="Nota página uno.">1</a></p>
   <p>Relleno A</p>
   <p>Relleno B</p>
   <p>Párrafo dos<a data-word-note-id="fn-2" data-note-kind="footnote" data-note-content="Nota página dos.">2</a></p>
  `;
  const state=htmlToDocumentState(html,1);
  const styles=resolveDefaultModelStyles(state);
  const pages=layoutModelDocument(state,{width:400,height:130,top:12,right:16,bottom:12,left:16},t=>({width:[...t].length*6,ascent:9,descent:3}),styles);
  expect(pages.length).toBeGreaterThanOrEqual(2);

  const page1Texts=pages[0].commands.filter((c):c is Extract<typeof c,{kind:'text'}>=>c.kind==='text');
  const page1Body=page1Texts.map(t=>t.text).join('');
  expect(page1Body).toContain('Nota página uno.');
  expect(page1Body).not.toContain('Nota página dos.');
  const fn1Pos=page1Body.indexOf('Nota página uno.');
  expect(fn1Pos).toBeGreaterThan(-1);
  expect(page1Texts[fn1Pos].y).toBeGreaterThan(85);
  expect(pages[0].commands.some(c=>c.kind==='rect'&&c.height===0.75)).toBe(true);

  const lastPageTexts=pages[pages.length-1].commands.filter((c):c is Extract<typeof c,{kind:'text'}>=>c.kind==='text');
  const lastPageBody=lastPageTexts.map(t=>t.text).join('');
  expect(lastPageBody).toContain('Nota página dos.');
  expect(lastPageBody).not.toContain('Nota página uno.');
 });

 it('styles tracked <ins> (green underline), <del> (red strike), and comment anchors (amber highlight)',()=>{
  const html='<p><ins data-word-rev="ins">agregado</ins> <del data-word-rev="del">borrado</del> <span class="word-comment-anchor" data-word-comment-id="c-1">anclado</span></p>';
  const state=htmlToDocumentState(html,1);
  const styles=resolveDefaultModelStyles(state);
  const pages=layoutModelDocument(state,{width:500,height:300,top:20,right:20,bottom:20,left:20},t=>({width:[...t].length*6,ascent:9,descent:3}),styles);
  const texts=pages[0].commands.filter((c):c is Extract<typeof c,{kind:'text'}>=>c.kind==='text');
  const fullText=texts.map(t=>t.text).join('');
  const rects=pages[0].commands.filter((c):c is Extract<typeof c,{kind:'rect'}>=>c.kind==='rect');

  const insPos=fullText.indexOf('agregado');
  expect(insPos).toBeGreaterThan(-1);
  const insCmd=texts[insPos];
  expect(insCmd?.color).toBe('#15803d');
  expect(rects.some(r=>r.color==='#15803d'&&r.height===1)).toBe(true);

  const delPos=fullText.indexOf('borrado');
  expect(delPos).toBeGreaterThan(-1);
  const delCmd=texts[delPos];
  expect(delCmd?.color).toBe('#b91c1c');
  expect(rects.some(r=>r.color==='#b91c1c'&&r.height===1)).toBe(true);

  expect(rects.some(r=>r.color==='#fef3c7')).toBe(true);
 });

 it('applies Microsoft Word auto line-spacing factor (1.15x) and resolves table column widths from unmerged rows after colspan headers',()=>{
  const html=`
   <p id="body-p" data-word-line-spacing="2" style="font-size: 12pt; line-height: 2;">Párrafo doble espacio Word</p>
   <table id="cover-tbl">
    <tbody>
     <tr><td colspan="2"><p>Integrantes:</p></td></tr>
     <tr><td id="cell-a" style="width: 66.2%; font-size: 12pt;"><p>Nombre</p></td><td style="width: 33.8%; font-size: 12pt;"><p>Registro</p></td></tr>
    </tbody>
   </table>
  `;
  const state=htmlToDocumentState(html,1);
  const styles=resolveDefaultModelStyles(state);
  const bodyP=state.roots.find(n=>n.kind==='element'&&n.tag==='p')!;
  const table=state.roots.find(n=>n.kind==='element'&&n.tag==='table')!;
  expect(styles.get(bodyP.id)?.lineHeight).toBeCloseTo(36.8,2);
  expect(styles.get(table.id)?.columns).toEqual([66.2,33.8]);
 });

 it('keeps multi-line .word-toc-entry rows indivisible across pages so wrapped lines never leave a 1-line orphan TOC page',()=>{
  const html=`
   <div class="word-toc-page-section">
    <div class="word-toc-entry" style="font-size: 12pt; line-height: 2;"><span class="word-toc-title">3. Protocolo de Blindaje</span><span class="word-toc-dots"></span><span class="word-toc-page">97</span></div>
    <div class="word-toc-entry" style="font-size: 12pt; line-height: 2;"><span class="word-toc-title">4. Protocolo de Embalaje</span><span class="word-toc-dots"></span><span class="word-toc-page">97</span></div>
    <div class="word-toc-entry" style="font-size: 12pt; line-height: 2;"><span class="word-toc-title">3.2 IDENTIFICACIÓN DEL PROCESO DE SERVICIO (BLOQUE, DIAGRAMA DE FLUJO)</span><span class="word-toc-dots"></span><span class="word-toc-page">98</span></div>
    <div class="word-toc-entry" style="font-size: 12pt; line-height: 2;"><span class="word-toc-title">3.2.1 Diagrama De Flujo Del Proceso</span><span class="word-toc-dots"></span><span class="word-toc-page">99</span></div>
   </div>
  `;
  const state=htmlToDocumentState(html,1);
  const styles=resolveDefaultModelStyles(state);
  // Usable height = 115px (fits 3 lines of 36.8px = 110.4px):
  // Page 1 gets entries 1 & 2 (2 lines = 73.6px); entry 3 wraps onto 2 lines (73.6px) which exceeds remaining 41.4px,
  // so entry 3 moves whole to Page 2 alongside entry 4 (73.6 + 36.8 = 110.4px <= 115px).
  const pages=layoutModelDocument(state,{width:420,height:135,top:10,right:20,bottom:10,left:20},t=>({width:[...t].length*6,ascent:11,descent:3}),styles);
  expect(pages).toHaveLength(2);
  const page1Text=pages[0].commands.filter((c):c is Extract<typeof c,{kind:'text'}>=>c.kind==='text').map(t=>t.text).join('');
  const page2Text=pages[1].commands.filter((c):c is Extract<typeof c,{kind:'text'}>=>c.kind==='text').map(t=>t.text).join('');
  expect(page1Text).toContain('3. Protocolo de Blindaje');
  expect(page1Text).toContain('4. Protocolo de Embalaje');
  expect(page1Text).not.toContain('3.2 IDENTIFICACIÓN');
  expect(page2Text).toContain('3.2 IDENTIFICACIÓN DEL PROCESO DE SERVICIO');
  expect(page2Text).toContain('DE FLUJO)');
  expect(page2Text).toContain('3.2.1 Diagrama De Flujo Del Proceso');
 });

 it('indents default lists so bullets and numbers never overlap text and honors list-style-type',()=>{
  const html=`
   <ul><li>Elemento uno</li><li>Elemento dos</li></ul>
   <ul style="list-style-type: square"><li>Cuadrado</li></ul>
   <ol style="list-style-type: upper-roman"><li>Primero</li><li>Segundo</li><li>Tercero</li></ol>
   <ol style="list-style-type: lower-alpha"><li>Alfa</li><li>Beta</li></ol>
  `;
  const state=htmlToDocumentState(html,1);
  const styles=resolveDefaultModelStyles(state);
  const pages=layoutModelDocument(state,{width:420,height:600,top:20,right:20,bottom:20,left:20},t=>({width:[...t].length*7,ascent:11,descent:3}),styles);
  const texts=pages[0].commands.filter((c):c is Extract<typeof c,{kind:'text'}>=>c.kind==='text');

  const bullet=texts.find(t=>t.text==='•')!;
  const itemOne=texts.find(t=>t.text==='E'&&t.y===bullet.y)!;
  expect(bullet).toBeTruthy();
  expect(itemOne).toBeTruthy();
  // Text is indented at least 28px from left margin (20 + 28 = 48) and bullet sits strictly to its left without overlap
  expect(itemOne.x).toBeGreaterThanOrEqual(48);
  expect(bullet.x + 7).toBeLessThan(itemOne.x);

  const square=texts.find(t=>t.text==='▪')!;
  expect(square).toBeTruthy();

  const roman3=texts.find(t=>t.text==='III.')!;
  const tercero=texts.find(t=>t.text==='T'&&t.y===roman3.y)!;
  expect(roman3).toBeTruthy();
  expect(tercero).toBeTruthy();
  expect(roman3.x + 4 * 7).toBeLessThanOrEqual(tercero.x);

  const alpha2=texts.find(t=>t.text==='b.')!;
  expect(alpha2).toBeTruthy();
 });

 it('aligns empty list item caret baseline with its list marker so the pipe never sits lower than the number',()=>{
  const html='<ol style="line-height: 2;"><li></li><li>Texto</li></ol>';
  const state=htmlToDocumentState(html,1);
  const styles=resolveDefaultModelStyles(state);
  const pages=layoutModelDocument(state,{width:420,height:300,top:20,right:20,bottom:20,left:20},t=>({width:[...t].length*7,ascent:11,descent:3}),styles);
  const texts=pages[0].commands.filter((c):c is Extract<typeof c,{kind:'text'}>=>c.kind==='text');
  const marker1=texts.find(t=>t.text==='1.')!;
  const emptyCaretCmd=texts.find(t=>t.text===''&&t.source)!;
  expect(marker1).toBeTruthy();
  expect(emptyCaretCmd).toBeTruthy();
  expect(emptyCaretCmd.y).toBe(marker1.y);
 });

 it('capitalizes Spanish accented words properly without uppercasing letters after á, é, í, ó, ú, ñ, ü',()=>{
  const html='<h3 style="text-transform: capitalize;">6.2.1 cálculo de la amortización diferida y niño pingüino</h3>';
  const state=htmlToDocumentState(html,1);
  const styles=resolveDefaultModelStyles(state);
  const pages=layoutModelDocument(state,{width:600,height:300,top:20,right:20,bottom:20,left:20},t=>({width:[...t].length*7,ascent:11,descent:3}),styles);
  const rendered=pages[0].commands.filter((c):c is Extract<typeof c,{kind:'text'}>=>c.kind==='text').map(t=>t.text).join('');
  expect(rendered).toBe('6.2.1 Cálculo De La Amortización Diferida Y Niño Pingüino');
 });

 it('renders .word-textbox and .word-note with inner padding so text never overlaps the left border and right borders stay continuous',()=>{
  const html =
    '<div class="word-textbox" style="background:#f8fafc;border:1px solid #cbd5e1;border-left:4px solid #2563eb;padding:12px 16px;margin:12px 0;">' +
      '<p style="font-weight:700;font-size:13px;color:#0f172a;margin:0 0 6px 0;">Cuadro de texto</p>' +
      '<p style="font-size:12px;color:#334155;margin:0;">Escribe o pega contenido destacado aquí.</p>' +
    '</div>' +
    '<blockquote class="word-note" style="border-left:4px solid #3b82f6;background:#f8fafc;padding:10px 16px;margin:10px 0;font-style:normal;color:#1e293b;">Nota destacada sin cursiva.</blockquote>';
  const state=htmlToDocumentState(html,1);
  const styles=resolveDefaultModelStyles(state);
  const pages=layoutModelDocument(state,{width:600,height:500,top:20,right:20,bottom:20,left:20},t=>({width:[...t].length*7,ascent:11,descent:3}),styles);
  const rects=pages[0].commands.filter((c):c is Extract<typeof c,{kind:'rect'}>=>c.kind==='rect');
  const texts=pages[0].commands.filter((c):c is Extract<typeof c,{kind:'text'}>=>c.kind==='text'&&!!c.text);

  // Text inside textbox starts strictly to the right of the 4px blue left border
  const leftBlueBars=rects.filter(r=>r.color==='#2563eb'&&r.width===4);
  expect(leftBlueBars.length).toBeGreaterThanOrEqual(2);
  const titleGlyph=texts.find(t=>t.text==='C')!;
  expect(titleGlyph.x).toBeGreaterThanOrEqual(leftBlueBars[0].x + leftBlueBars[0].width + 8);

  // Right border of the two paragraphs inside textbox connects seamlessly without a vertical gap
  const rightBorders=rects.filter(r=>r.color==='#cbd5e1'&&r.width===1&&r.height>5).sort((a,b)=>a.y-b.y);
  expect(rightBorders.length).toBe(2);
  expect(Math.abs((rightBorders[0].y + rightBorders[0].height) - rightBorders[1].y)).toBeLessThanOrEqual(0.5);

  // Note block renders non-italic with left #3b82f6 bar and clear text spacing
  const noteBar=rects.find(r=>r.color==='#3b82f6'&&r.width===4)!;
  expect(noteBar).toBeTruthy();
  const noteGlyph=texts.find(t=>t.text==='N')!;
  expect(noteGlyph.font).not.toContain('italic');
  expect(noteGlyph.x).toBeGreaterThanOrEqual(noteBar.x + noteBar.width + 6);
 });

 it('renders lists accidentally nested inside <p> or <blockquote> instead of hiding their text',()=>{
  const html =
    '<p><ul><li>Incidencia en la estimación: Cuanto mayor sea la criticidad de fallas del sistema.</li></ul></p>' +
    '<blockquote><ul><li>Cita con viñeta visible</li></ul></blockquote>';
  const state=htmlToDocumentState(html,1);
  const styles=resolveDefaultModelStyles(state);
  const pages=layoutModelDocument(state,{width:600,height:500,top:20,right:20,bottom:20,left:20},t=>({width:[...t].length*7,ascent:11,descent:3}),styles);
  const rendered=pages[0].commands.filter((c):c is Extract<typeof c,{kind:'text'}>=>c.kind==='text').map(t=>t.text).join('');
  expect(rendered).toContain('Incidencia en la estimación');
  expect(rendered).toContain('Cita con viñeta visible');
  expect(pages[0].commands.filter(c=>c.kind==='text'&&c.text==='•').length).toBeGreaterThanOrEqual(2);
 });

 it('preserves strictly increasing indentation across all list levels (0..3) for both data-list-level and nested lists even with wide template base indents',()=>{
  const html =
    '<ul style="margin-left: 36pt; padding-left: 18pt;">' +
      '<li>Nivel 1</li>' +
      '<li data-list-level="1">Nivel 2 flat</li>' +
      '<li data-list-level="2">Nivel 3 flat</li>' +
      '<li data-list-level="3">Nivel 4 flat</li>' +
      '<li>Padre<ul><li>Hijo anidado<ul><li>Nieto anidado</li></ul></li></ul></li>' +
    '</ul>';
  const state=htmlToDocumentState(html,1);
  const styles=resolveDefaultModelStyles(state);
  const pages=layoutModelDocument(state,{width:600,height:600,top:20,right:20,bottom:20,left:20},t=>({width:[...t].length*7,ascent:11,descent:3}),styles);
  const texts=pages[0].commands.filter((c):c is Extract<typeof c,{kind:'text'}>=>c.kind==='text'&&!!c.text);

  const xOfFirstChar=(prefix:string)=>{
    // Find the first text command whose surrounding line starts with prefix
    const byY=new Map<number,typeof texts>();
    for(const t of texts){const arr=byY.get(t.y)||[];arr.push(t);byY.set(t.y,arr);}
    for(const line of byY.values()){
      line.sort((a,b)=>a.x-b.x);
      const joined=line.map(t=>t.text).join('');
      if(joined.includes(prefix)){
        const firstLetter=line.find(t=>t.text===prefix[0]);
        if(firstLetter)return firstLetter.x;
      }
    }
    return -1;
  };

  const xL1=xOfFirstChar('Nivel 1');
  const xL2=xOfFirstChar('Nivel 2 flat');
  const xL3=xOfFirstChar('Nivel 3 flat');
  const xL4=xOfFirstChar('Nivel 4 flat');
  expect(xL1).toBeGreaterThan(20);
  expect(xL2).toBeGreaterThanOrEqual(xL1 + 19);
  expect(xL3).toBeGreaterThanOrEqual(xL2 + 19);
  expect(xL4).toBeGreaterThanOrEqual(xL3 + 19);

  const xPadre=xOfFirstChar('Padre');
  const xHijo=xOfFirstChar('Hijo anidado');
  const xNieto=xOfFirstChar('Nieto anidado');
  expect(xHijo).toBeGreaterThanOrEqual(xPadre + 19);
  expect(xNieto).toBeGreaterThanOrEqual(xHijo + 19);
 });

 it('preserves leading and internal spaces in <pre> code blocks so ASCII diagrams align column-for-column',()=>{
  const ascii =
    '     [ Personal ]  <--------->  [ Producto ]\n' +
    '          ^                          ^\n' +
    '          |                          |\n' +
    '          v                          v\n' +
    '     [ Proceso  ]  <--------->  [ Proyecto ]';
  const html=`<pre><code>${ascii}</code></pre>`;
  const state=htmlToDocumentState(html,1);
  const styles=resolveDefaultModelStyles(state);
  const pages=layoutModelDocument(state,{width:600,height:400,top:20,right:20,bottom:20,left:20},t=>({width:[...t].length*7,ascent:10,descent:3}),styles);
  const texts=pages[0].commands.filter((c):c is Extract<typeof c,{kind:'text'}>=>c.kind==='text');
  const rects=pages[0].commands.filter((c):c is Extract<typeof c,{kind:'rect'}>=>c.kind==='rect');

  // Renders soft shaded background box for <pre>
  expect(rects.some(r=>r.color==='#f1f5f9')).toBe(true);
  // Leading 5 spaces on "[ Personal ]" and 10 spaces on "^" are preserved (so "^" sits strictly 5*7=35px to the right of "[")
  const firstBracket=texts.find(t=>t.text==='[')!;
  const firstCaret=texts.find(t=>t.text==='^')!;
  expect(firstBracket).toBeTruthy();
  expect(firstCaret).toBeTruthy();
  expect(firstCaret.x - firstBracket.x).toBeCloseTo(5 * 7, 1);
  expect(firstBracket.font).toContain('JetBrains Mono');
 });
});
