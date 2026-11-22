import {CanvasEditSession} from '../engine/canvas-edit-session';
import {BUILTIN_STYLE_TEMPLATES} from '../constants/word-document.constants';
import {describe,it,expect} from 'vitest';
import {aiTableFields,aiTableInsertionFields,applyAiTableEdits} from './ai-table-edit';
const pages=[{id:'p',html:'<h2>Datos Históricos y Actuales de la Demanda</h2><table style="color:black"><tr><th>Año</th><th>Valor</th></tr><tr><td>2020</td><td>120</td></tr></table><table><tr><td>2024</td><td>390</td></tr></table>'}];
describe('AI structural tables',()=>{
 it('exposes both tables and merges their rows preserving content and source styling',()=>{
  const fields=aiTableFields(pages);expect(fields).toHaveLength(2);expect(fields[0].text).toContain('2024');
  const result=applyAiTableEdits(pages,new Map([[fields[0].id,JSON.stringify({action:'mergeNext'})]]));
  const root=document.createElement('div');root.innerHTML=result[0].html;
  expect(root.querySelectorAll('table')).toHaveLength(1);expect(root.querySelectorAll('tr')).toHaveLength(3);
  expect(root.querySelector('table')!.style.color).toBe('black');expect(root.textContent).toContain('390');
  expect(pages[0].html.match(/<table/g)).toHaveLength(2);
 });
 it('edits cell text safely and rejects incompatible merges before publication',()=>{
  const fields=aiTableFields(pages);
  const result=applyAiTableEdits(pages,new Map([[fields[0].id,JSON.stringify({action:'setCell',row:1,column:1,text:'<script>texto</script>'})]]));
  expect(result[0].html).toContain('&lt;script&gt;');
  const incompatible=[{id:'p',html:'<table><tr><td>Uno</td></tr></table><table><tr><td>Dos</td><td>Tres</td></tr></table>'}];
  expect(()=>applyAiTableEdits(incompatible,new Map([[aiTableFields(incompatible)[0].id,'{"action":"mergeNext"}']]))).toThrow('columnas');
 });
 it('inserts multiple native Excel tables after the summary and before the next subsection',()=>{
  const source=[{id:'p',html:'<h2>6.1 Inversión Fija</h2><table><tr><td>Resumen</td><td>108293</td></tr></table><h3>6.1.1 Cálculo de la Depreciación</h3><p>Texto conservado</p>'}];
  const fields=aiTableFields(source),payload={action:'insertAfter',tables:[{title:'Muebles',rows:[['Ítem','Cantidad','Total'],['Mesa',1,1500]],note:'Valores del Excel'},{title:'Vehículos',rows:[['Vehículo','Total'],['Quantum',86304]]}]};
  const result=applyAiTableEdits(source,new Map([[fields[0].id,JSON.stringify(payload)]]));
  const root=document.createElement('div');root.innerHTML=result[0].html;
  expect(root.querySelectorAll('table')).toHaveLength(3);
  expect(root.querySelectorAll('thead')).toHaveLength(2);
  expect(root.querySelectorAll('table')[1].textContent).toContain('Mesa11500');
  expect(Array.from(root.children).map(node=>node.tagName)).toEqual(['H2','TABLE','P','TABLE','P','P','TABLE','H3','P']);
  expect(root.querySelector('h3')!.textContent).toContain('Depreciación');
  expect(source[0].html).not.toContain('Mesa');
 });
 it('provides heading insertion anchors and maintains section context across pages',()=>{
  const source=[{id:'a',html:'<h1>Inversiones</h1><h2>6.1 Inversión Fija</h2>'},{id:'b',html:'<table><tr><td>Resumen</td></tr></table>'}];
  expect(JSON.parse(aiTableFields(source)[0].text).headingPath).toEqual(['Inversiones','6.1 Inversión Fija']);
  const field=aiTableInsertionFields(source)[1];
  const result=applyAiTableEdits(source,new Map([[field.id,JSON.stringify({action:'insertAfter',tables:[{rows:[['Nuevo']],header:false}]})]]));
  expect(result[0].html).toContain('<td');expect(result[1].html).toBe(source[1].html);
 });
 it('inserts after the final fragment of a paginated table',()=>{
  const source=[{id:'a',html:'<table data-word-flow="flow"><tr><td>Primero</td></tr></table>'},{id:'b',html:'<table data-word-continuation="flow" data-word-flow="flow"><tr><td>Último</td></tr></table><h2>Siguiente</h2>'}];
  const result=applyAiTableEdits(source,new Map([[aiTableFields(source)[0].id,JSON.stringify({action:'insertAfter',tables:[{rows:[['Insertado']]}]})]]));
  expect(result[0].html).not.toContain('Insertado');expect(result[1].html.indexOf('Último')).toBeLessThan(result[1].html.indexOf('Insertado'));
  expect(result[1].html.indexOf('Insertado')).toBeLessThan(result[1].html.indexOf('Siguiente'));
 });
 it('validates the whole insertion atomically and treats cells and titles as plain text',()=>{
  const field=aiTableFields(pages)[0];
  for(const tables of [[],[{rows:[]}],[{rows:[['a'],['b','c']]}],[{rows:[[{html:'invalid'}]]}],[{rows:[['ok']],header:'yes'}]]){
   expect(()=>applyAiTableEdits(pages,new Map([[field.id,JSON.stringify({action:'insertAfter',tables})]]))).toThrow();
  }
  const result=applyAiTableEdits(pages,new Map([[field.id,JSON.stringify({action:'insertAfter',tables:[{title:'<img onerror=bad>',rows:[['<script>bad</script>']]}]})]]));
  expect(result[0].html).not.toContain('<script>');expect(result[0].html).toContain('&lt;script&gt;');expect(pages[0].html).not.toContain('bad');
 });
 it('styles new tables under APA and restores their insertion with Canvas undo and redo',()=>{
  const template=BUILTIN_STYLE_TEMPLATES.find(t=>t.academicStyle==='apa7')!;
  const session=new CanvasEditSession({width:600,height:800,top:50,right:50,bottom:50,left:50},{font:'12px serif',lineHeight:20},text=>({width:text.length*6,ascent:10,descent:2}));session.load(pages);
  const source=session.pages,field=aiTableFields(source)[0];
  const inserted=applyAiTableEdits(source,new Map([[field.id,JSON.stringify({action:'insertAfter',tables:[{title:'Tabla nueva',rows:[['Producto','Total'],['Mesa',1500]]}]})]]),template);
  expect(inserted.map(page=>page.html).join('')).toContain('data-apa-table="true"');
  session.replacePagesWithHistory(inserted);
  expect(session.pages.map(page=>page.html).join('')).toContain('Mesa');
  session.undo();expect(session.pages.map(page=>page.html).join('')).not.toContain('Mesa');
  session.undo(true);expect(session.pages.map(page=>page.html).join('')).toContain('Mesa');
 });
 it('keeps large target descriptors bounded while detecting changes beyond the preview',()=>{
  const source=[{id:'p',html:'<h2>Fija</h2><table>'+Array.from({length:200},(_,index)=>`<tr><td>${index} ${'dato '.repeat(100)}</td></tr>`).join('')+'</table>'}];
  const first=aiTableFields(source)[0];expect(first.text.length).toBeLessThan(15000);expect(JSON.parse(first.text).partial).toBe(true);
  const changed=[{...source[0],html:source[0].html.replace('199 dato','199 cambiado')}];expect(aiTableFields(changed)[0].text).not.toBe(first.text);
 });

});
