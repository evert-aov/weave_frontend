import { applyApaObjects } from './apa-objects';
import { applyStyleRule } from './document-formatting';
import type {StyleTemplate,DocumentPage} from '../models/word-document.model';
const PREFIX='word-table:';
const INSERT_PREFIX='word-insert:';
const INSERT_INSTRUCTIONS='Para insertar tablas nativas DESPUÉS de este destino devuelve before igual a TODO este JSON y after como {"action":"insertAfter","tables":[{"title":"Título opcional","rows":[["Columna","Valor"],["Dato","120"]],"header":true,"note":"Nota opcional"}]}. Usa texto y valores del Excel/adjunto, nunca HTML/Markdown. No lo describas solo en el chat: devuelve edits.';
function inspect(pages:readonly DocumentPage[]) {
 const roots=pages.map(p=>{const root=document.createElement('div');root.innerHTML=p.html;return root;});
 const tables=roots.flatMap((root,page)=>Array.from(root.querySelectorAll('table')).filter(t=>!t.parentElement?.closest('table')).map((table,index)=>({id:`${PREFIX}${pages[page].id}:${index}`,table,page})));
 return {roots,tables};
}
function fingerprint(text:string):string {let hash=2166136261;for(let i=0;i<text.length;i++)hash=Math.imul(hash^text.charCodeAt(i),16777619);return (hash>>>0).toString(16);}
function describe(table:HTMLTableElement,budget=1600){
 const rows: {text:string;colSpan:number;rowSpan:number}[][]=[];let size=0;
 for(const row of Array.from(table.rows)){
  const cells=Array.from(row.cells).map(cell=>({text:(cell.textContent||'').slice(0,250),colSpan:cell.colSpan,rowSpan:cell.rowSpan}));
  const length=JSON.stringify(cells).length;if(size+length>budget)break;rows.push(cells);size+=length;
 }
 return {rows,rowCount:table.rows.length,partial:rows.length!==table.rows.length||Array.from(table.rows).some(row=>Array.from(row.cells).some(cell=>(cell.textContent||'').length>250))};
}
function tableContexts(roots:HTMLElement[]):Map<Element,string[]> {
 const contexts=new Map<Element,string[]>();const path:string[]=[];
 for(const root of roots)for(const node of Array.from(root.querySelectorAll('h1,h2,h3,h4,h5,h6,table'))){
  if(node.closest('.word-toc-page-section,[data-native-word-toc]')||node.parentElement?.closest('table'))continue;
  if(node.tagName==='TABLE'){contexts.set(node,path.filter(Boolean));continue;}
  if(node.hasAttribute('data-word-continuation')||!node.textContent?.trim())continue;
  const level=node.hasAttribute('data-word-chapter')?0:Number(node.tagName.slice(1));path.length=level+1;path[level]=node.textContent.trim().slice(0,500);
 }
 return contexts;
}
export function aiTableFields(pages:readonly DocumentPage[]):{id:string;text:string}[] {
 const {roots,tables}=inspect(pages),contexts=tableContexts(roots);
 return tables.map((item,index)=>{
  const headingPath=contexts.get(item.table)||[],next=tables[index+1];
  return {id:item.id,text:JSON.stringify({instructions:INSERT_INSTRUCTIONS+' También puedes unir la tabla siguiente con {"action":"mergeNext"} o editar una celda con {"action":"setCell","row":0,"column":0,"text":"nuevo texto"}. Índices desde cero.',revision:fingerprint(item.table.outerHTML),heading:headingPath.at(-1)||'',headingPath,...describe(item.table),next:next?{id:next.id,...describe(next.table,700)}:null})};
 });
}
export function aiTableInsertionFields(pages:readonly DocumentPage[]):{id:string;text:string}[] {
 const {roots}=inspect(pages);
 return roots.flatMap((root,page)=>Array.from(root.querySelectorAll('h1,h2,h3,h4,h5,h6,p[data-apa-run-in]')).map((heading,index)=>({heading,index})).filter(({heading})=>heading.textContent?.trim()&&!heading.closest('table,.word-toc-page-section,[data-native-word-toc],[data-word-continuation]')).map(({heading,index})=>({id:`${INSERT_PREFIX}${pages[page].id}:${index}`,text:JSON.stringify({instructions:INSERT_INSTRUCTIONS,heading:heading.textContent?.slice(0,1600),revision:fingerprint(heading.outerHTML),following:(heading.nextElementSibling?.textContent||'').slice(0,160)})})));
}
function insertionFragment(payload:any,template?:StyleTemplate):DocumentFragment {
 if(!Array.isArray(payload.tables)||!payload.tables.length||payload.tables.length>20)throw Error('Debes indicar entre 1 y 20 tablas');
 const fragment=document.createDocumentFragment();let total=0;
 const paragraph=(text:string,bold=false)=>{const p=document.createElement('p');p.textContent=text;if(template)applyStyleRule(p,template.rules.P);Object.assign(p.style,{textAlign:'left',textIndent:'0pt',marginTop:'0pt',marginBottom:'0pt',fontWeight:bold?'bold':'normal'});return p;};
 for(const spec of payload.tables){
  if(!spec||!Array.isArray(spec.rows)||!spec.rows.length||spec.rows.length>500)throw Error('Filas de tabla inválidas');
  const width=spec.rows[0]?.length;if(!Number.isInteger(width)||width<1||width>50)throw Error('Columnas de tabla inválidas');
  total+=spec.rows.length*width;if(total>10000)throw Error('Demasiadas celdas');
  for(const key of ['title','note'])if(spec[key]!==undefined&&(typeof spec[key]!=='string'||spec[key].length>4000))throw Error('Título o nota inválidos');
  if(spec.header!==undefined&&typeof spec.header!=='boolean')throw Error('Cabecera inválida');
  if(spec.title)fragment.append(paragraph(spec.title,true));
  const table=document.createElement('table');table.dataset['wordObjectId']=crypto.randomUUID();
  table.style.cssText='width:100%;max-width:100%;border-collapse:collapse;';
  const head=document.createElement('thead'),body=document.createElement('tbody');
  spec.rows.forEach((row:unknown,index:number)=>{
   if(!Array.isArray(row)||row.length!==width)throw Error('Las filas deben tener el mismo número de columnas');
   const tr=document.createElement('tr');
   row.forEach(value=>{
    if(typeof value!=='string'&&!(typeof value==='number'&&Number.isFinite(value))&&value!==null)throw Error('Valor de celda inválido');
    const cell=document.createElement(index===0&&spec.header!==false?'th':'td');
    cell.style.cssText=`border:1px solid #94a3b8;padding:4px 8px;width:${100/width}%;`;
    cell.append(paragraph(value===null?'':String(value),cell.tagName==='TH'));tr.append(cell);
   });
   (index===0&&spec.header!==false?head:body).append(tr);
  });
  if(head.children.length)table.append(head);table.append(body);fragment.append(table);
  if(spec.note)fragment.append(paragraph(spec.note));
 }
 if(template?.academicStyle==='apa7'){const root=document.createElement('div');root.append(fragment);applyApaObjects([root],template);fragment.append(...Array.from(root.childNodes));}
 return fragment;
}
function finalTableFragment(item:{table:HTMLTableElement;page:number},tables:{table:HTMLTableElement;page:number}[]):HTMLTableElement {
 const flow=item.table.getAttribute('data-word-flow');if(!flow)return item.table;
 let last=item.table;
 for(const next of tables.slice(tables.findIndex(t=>t.table===item.table)+1)){
  if(next.table.getAttribute('data-word-continuation')!==flow)break;last=next.table;
 }
 return last;
}
export function applyAiTableEdits(pages:readonly DocumentPage[],values:ReadonlyMap<string,string>,template?:StyleTemplate):DocumentPage[] {
 const {roots,tables}=inspect(pages),used=new Set<string>(),original=roots.map(root=>root.innerHTML);
 for(const [id,value] of values){
  if(id.startsWith(INSERT_PREFIX)){
   let anchor:Element|undefined;
   pages.forEach((page,i)=>{if(id.startsWith(`${INSERT_PREFIX}${page.id}:`)){const index=Number(id.slice(`${INSERT_PREFIX}${page.id}:`.length));if(Number.isInteger(index))anchor=roots[i].querySelectorAll('h1,h2,h3,h4,h5,h6,p[data-apa-run-in]')[index];}});
   if(!anchor||anchor.closest('table,.word-toc-page-section,[data-native-word-toc],[data-word-continuation]'))throw Error('Destino de inserción inválido');
   const payload=JSON.parse(value);if(payload.action!=='insertAfter')throw Error('Operación de inserción inválida');
   anchor.after(insertionFragment(payload,template));continue;
  }
  if(!id.startsWith(PREFIX))continue;
  const index=tables.findIndex(t=>t.id===id),item=tables[index];if(!item||used.has(id))throw Error('Destino de tabla inválido o repetido');
  const action=JSON.parse(value);
  if(action.action==='insertAfter'){
   finalTableFragment(item,tables).after(insertionFragment(action,template));
  }else if(action.action==='mergeNext'){
   const next=tables[index+1];if(!next||used.has(next.id))throw Error('No existe una tabla siguiente disponible');
   const width=(table:HTMLTableElement)=>Math.max(...Array.from(table.rows).map(r=>Array.from(r.cells).reduce((n,c)=>n+c.colSpan,0)));
   if(width(item.table)!==width(next.table))throw Error('Las tablas tienen distinto número de columnas');
   const body=item.table.tBodies[0]||item.table.createTBody();
   for(const row of Array.from(next.table.rows))body.append(row);
   next.table.remove();used.add(next.id);
  }else if(action.action==='setCell'){
   if(!Number.isInteger(action.row)||!Number.isInteger(action.column)||typeof action.text!=='string')throw Error('Celda inválida');
   const cell=item.table.rows[action.row]?.cells[action.column];if(!cell)throw Error('Celda fuera de la tabla');
   const paragraph=cell.querySelector('p')?.cloneNode(false) as HTMLElement||document.createElement('p');paragraph.textContent=action.text;cell.replaceChildren(paragraph);
  }else throw Error('Operación de tabla no admitida');
  used.add(id);
 }
 return pages.map((page,i)=>{const html=roots[i].innerHTML;return html===original[i]?page:{...page,html};});
}
export const isAiTableTarget=(id:string)=>id.startsWith(PREFIX);
