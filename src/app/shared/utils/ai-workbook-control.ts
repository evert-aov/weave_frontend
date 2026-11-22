import {rewriteSheetReferences,shiftWorkbookAxis} from './ai-workbook-structure';
/** Structured workbook operations. All mutations are prepared on a copy before publication. */
export function workbookFingerprint(value:unknown):string {
 const text=JSON.stringify(value);let a=2166136261,b=5381;
 for(let i=0;i<text.length;i++){a=Math.imul(a^text.charCodeAt(i),16777619);b=Math.imul(b,33)^text.charCodeAt(i);}
 return `${text.length}:${a>>>0}:${b>>>0}`;
}
const safeKey=(key:string)=>!['__proto__','prototype','constructor'].includes(key);

function colLettersToIndex(letters:string):number {
 let n=0;for(const ch of letters.toUpperCase())n=n*26+ch.charCodeAt(0)-64;return n-1;
}
function colIndexToLetters(index:number):string {
 let out='';for(let n=index+1;n>0;n=Math.floor((n-1)/26))out=String.fromCharCode(65+(n-1)%26)+out;return out;
}
function parseA1Ref(ref:string):{col:number;row:number}|null {
 const m=/^\$?([A-Za-z]{1,3})\$?([1-9]\d{0,6})$/.exec(ref.trim());
 if(!m)return null;
 return {col:colLettersToIndex(m[1]),row:Number(m[2])-1};
}
function parseRangeSpec(spec:any):{startRow:number;endRow:number;startCol:number;endCol:number} {
 if(typeof spec==='string'){
  const parts=spec.split(':').map(s=>s.trim());
  const a=parseA1Ref(parts[0]);const b=parts[1]?parseA1Ref(parts[1]):a;
  if(!a||!b)throw Error('Rango A1 inválido');
  return {startRow:Math.min(a.row,b.row),endRow:Math.max(a.row,b.row),startCol:Math.min(a.col,b.col),endCol:Math.max(a.col,b.col)};
 }
 if(spec&&typeof spec==='object'&&[spec.startRow,spec.endRow,spec.startCol,spec.endCol].every(Number.isInteger)){
  return {startRow:spec.startRow,endRow:spec.endRow,startCol:spec.startCol,endCol:spec.endCol};
 }
 throw Error('Rango inválido');
}
function buildBorderStyle(preset:string,color='#000000'):Record<string,any>|undefined {
 const thin={style:'thin',color},med={style:'medium',color},thick={style:'thick',color},dbl={style:'double',color};
 switch(preset){
  case 'all':return {top:thin,right:thin,bottom:thin,left:thin};
  case 'bottom':return {bottom:thin};
  case 'top':return {top:thin};
  case 'left':return {left:thin};
  case 'right':return {right:thin};
  case 'thickBottom':return {bottom:thick};
  case 'bottomDouble':return {bottom:dbl};
  case 'topBottom':return {top:thin,bottom:thin};
  case 'topThickBottom':return {top:thin,bottom:thick};
  case 'topDoubleBottom':return {top:thin,bottom:dbl};
  case 'none':return undefined;
  default:return {top:med,right:med,bottom:med,left:med};
 }
}

export function workbookControlField(book:any,prefix='') {
 return {id:`${prefix}workbook:control`,text:JSON.stringify({revision:workbookFingerprint(book),activeSheetId:book.activeSheetId,sheets:(book.sheets||[]).map((s:any)=>({id:s.id,name:s.name,type:s.type,cells:Object.keys(s.data||{}).length,merges:s.merges||[],conditionalRules:s.conditionalRules||[],colWidths:s.colWidths||{},rowHeights:s.rowHeights||{},charts:(s.charts||[]).map((c:any)=>({id:c.id,category:c.category,subType:c.subType,title:c.title,range:c.range,dataConfig:c.dataConfig,appearance:c.appearance,x:c.x,y:c.y,width:c.width,height:c.height})),tables:s.tables||[],definedNames:s.definedNames||{},freezePanes:s.freezePanes,pageLayout:s.pageLayout})),operations:['setCells(sheetId,cells)','setRangeStyle(sheetId,range,style,borderPreset?)','clearRange(sheetId,range,mode?)','fillRange(sheetId,range,direction?)','sortRange(sheetId,range,column,direction?,hasHeaders?)','findReplace(sheetId?,query,replacement,matchCase?,wholeCell?)','mergeCells(sheetId,range)','unmergeCells(sheetId,range)','upsertChart(sheetId,chart)','removeChart(sheetId,chartId)','addConditionalRule(sheetId,rule)','removeConditionalRule(sheetId,ruleId)','setDimensions(sheetId,colWidths?,rowHeights?)','addSheet(sheet)','removeSheet(sheetId)','renameSheet(sheetId,name)','selectSheet(sheetId)','configureSheet(sheetId,patch)','replaceSheet(sheetId,sheet)','moveSheet(sheetId,index)','insertRows/deleteRows/insertColumns/deleteColumns(sheetId,index,count)']})};
}
export function applyWorkbookOperations(book:any,value:string):any {
 const request=JSON.parse(value);if(!Array.isArray(request.operations)||request.operations.length>500)throw Error('Operaciones de libro inválidas');
 const next=JSON.parse(JSON.stringify(book));
 const sheet=(id:string)=>{const found=next.sheets.find((s:any)=>s.id===id);if(!found)throw Error('Hoja inexistente');return found;};
 for(const op of request.operations){
  if(op.type==='addSheet'){if(!op.sheet||typeof op.sheet.id!=='string'||next.sheets.some((s:any)=>s.id===op.sheet.id))throw Error('ID de hoja duplicado');next.sheets.push({type:'grid',data:{},...op.sheet});}
  else if(op.type==='removeSheet'){const old=sheet(op.sheetId).name;rewriteSheetReferences(next,old);if(next.sheets.length===1)throw Error('El libro necesita al menos una hoja');next.sheets=next.sheets.filter((s:any)=>s.id!==op.sheetId);}
  else if(op.type==='selectSheet'){sheet(op.sheetId);next.activeSheetId=op.sheetId;}
  else if(op.type==='moveSheet'){const found=sheet(op.sheetId);if(!Number.isInteger(op.index)||op.index<0||op.index>=next.sheets.length)throw Error('Posición de hoja inválida');next.sheets.splice(next.sheets.indexOf(found),1);next.sheets.splice(op.index,0,found);}
  else if(op.type==='renameSheet'){
   const found=sheet(op.sheetId),old=found.name;found.name=op.name;
   rewriteSheetReferences(next,old,op.name);
  }
  else if(['insertRows','deleteRows','insertColumns','deleteColumns'].includes(op.type)){shiftWorkbookAxis(next,sheet(op.sheetId),op.type.endsWith('Rows')?'row':'column',op.index,op.count??1,op.type.startsWith('delete'));}
  else if(op.type==='setCells'){
   const found=sheet(op.sheetId);if(!op.cells||typeof op.cells!=='object'||Array.isArray(op.cells))throw Error('Celdas inválidas');
   if(!found.data)found.data={};
   for(const [id,cell] of Object.entries(op.cells)){
    if(!/^[A-Z]{1,3}[1-9]\d{0,6}$/.test(id))throw Error('Dirección de celda inválida');
    if(cell===null)delete found.data[id];else found.data[id]={raw:'',...found.data[id],...(typeof cell==='object'?cell:{raw:String(cell)})};
   }
  }else if(op.type==='setRangeStyle'){
   const found=sheet(op.sheetId),r=parseRangeSpec(op.range);if(!found.data)found.data={};
   const cellCount=(r.endRow-r.startRow+1)*(r.endCol-r.startCol+1);if(cellCount>20000)throw Error('Rango demasiado grande para dar formato');
   for(let row=r.startRow;row<=r.endRow;row++){
    for(let col=r.startCol;col<=r.endCol;col++){
     const id=`${colIndexToLetters(col)}${row+1}`;
     const prevCell=found.data[id]||{raw:''};
     const nextStyle={...(prevCell.style||{}),...(op.style||{})};
     if(op.borderPreset){
      const color=op.borderColor||'#000000';
      if(op.borderPreset==='none'){delete nextStyle.borders;delete nextStyle.border;}
      else if(op.borderPreset==='outside'||op.borderPreset==='thickOutside'){
       const edge={style:op.borderPreset==='thickOutside'?'thick':'thin',color};
       const b={...(nextStyle.borders||{})};
       if(row===r.startRow)b.top=edge;if(row===r.endRow)b.bottom=edge;if(col===r.startCol)b.left=edge;if(col===r.endCol)b.right=edge;
       nextStyle.borders=b;
      }else{nextStyle.borders=buildBorderStyle(op.borderPreset,color);}
     }
     found.data[id]={...prevCell,style:nextStyle};
    }
   }
  }else if(op.type==='clearRange'){
   const found=sheet(op.sheetId),r=parseRangeSpec(op.range),mode=op.mode||'all';
   if(found.data){
    for(let row=r.startRow;row<=r.endRow;row++)for(let col=r.startCol;col<=r.endCol;col++){
     const id=`${colIndexToLetters(col)}${row+1}`;const cell=found.data[id];if(!cell)continue;
     if(mode==='all')delete found.data[id];
     else if(mode==='values')found.data[id]={...cell,raw:''};
     else if(mode==='styles')found.data[id]={raw:cell.raw};
    }
   }
  }else if(op.type==='fillRange'){
   const found=sheet(op.sheetId),r=parseRangeSpec(op.range),dir=op.direction==='right'?'right':'down';
   if(!found.data)found.data={};
   if(dir==='down'&&r.endRow>r.startRow){
    for(let c=r.startCol;c<=r.endCol;c++){
     const first=found.data[`${colIndexToLetters(c)}${r.startRow+1}`]||{raw:''};
     const second=r.endRow-r.startRow>=1?found.data[`${colIndexToLetters(c)}${r.startRow+2}`]:undefined;
     const num1=Number(first.raw),num2=second?Number(second.raw):NaN;
     const step=first.raw.trim()!==''&&second&&second.raw.trim()!==''&&Number.isFinite(num1)&&Number.isFinite(num2)?num2-num1:null;
     for(let row=r.startRow+1;row<=r.endRow;row++){
      const raw=step!==null&&!first.raw.startsWith('=')?String(num1+step*(row-r.startRow)):first.raw;
      found.data[`${colIndexToLetters(c)}${row+1}`]={raw,...(first.style?{style:{...first.style}}:{})};
     }
    }
   }else if(dir==='right'&&r.endCol>r.startCol){
    for(let row=r.startRow;row<=r.endRow;row++){
     const first=found.data[`${colIndexToLetters(r.startCol)}${row+1}`]||{raw:''};
     for(let col=r.startCol+1;col<=r.endCol;col++){
      found.data[`${colIndexToLetters(col)}${row+1}`]={raw:first.raw,...(first.style?{style:{...first.style}}:{})};
     }
    }
   }
  }else if(op.type==='sortRange'){
   const found=sheet(op.sheetId),r=parseRangeSpec(op.range),desc=op.direction==='desc';
   const keyCol=typeof op.column==='string'?(/^\d+$/.test(op.column)?Number(op.column):colLettersToIndex(op.column)):Number(op.column);
   const startRow=op.hasHeaders?r.startRow+1:r.startRow;
   const rows:Record<number,any>[]=[];
   for(let row=startRow;row<=r.endRow;row++){
    const record:Record<number,any>={};
    for(let col=r.startCol;col<=r.endCol;col++)record[col]=found.data?.[`${colIndexToLetters(col)}${row+1}`];
    rows.push(record);
   }
   rows.sort((a,b)=>{
    const va=a[keyCol]?.raw??'',vb=b[keyCol]?.raw??'';
    const na=Number(va),nb=Number(vb);
    const cmp=va!==''&&vb!==''&&Number.isFinite(na)&&Number.isFinite(nb)?na-nb:String(va).localeCompare(String(vb),'es',{numeric:true,sensitivity:'base'});
    return desc?-cmp:cmp;
   });
   if(!found.data)found.data={};
   rows.forEach((record,idx)=>{
    const row=startRow+idx;
    for(let col=r.startCol;col<=r.endCol;col++){
     const id=`${colIndexToLetters(col)}${row+1}`;
     if(record[col])found.data[id]=record[col];else delete found.data[id];
    }
   });
  }else if(op.type==='findReplace'){
   const targets=op.sheetId?[sheet(op.sheetId)]:next.sheets;
   const q=String(op.query||''),rep=String(op.replacement??'');
   if(!q)throw Error('Consulta vacía para reemplazar');
   for(const s of targets){
    for(const [id,cell] of Object.entries(s.data||{}) as [string,any][]){
     const raw=String(cell?.raw??'');
     if(op.wholeCell){
      if(op.matchCase?raw===q:raw.toLowerCase()===q.toLowerCase())s.data[id]={...cell,raw:rep};
     }else{
      const flags=op.matchCase?'g':'gi';
      const escaped=q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
      const nextRaw=raw.replace(new RegExp(escaped,flags),rep);
      if(nextRaw!==raw)s.data[id]={...cell,raw:nextRaw};
     }
    }
   }
  }else if(op.type==='mergeCells'){
   const found=sheet(op.sheetId),r=parseRangeSpec(op.range);
   found.merges=[...(found.merges||[]).filter((m:any)=>m.endRow<r.startRow||m.startRow>r.endRow||m.endCol<r.startCol||m.startCol>r.endCol),r];
  }else if(op.type==='unmergeCells'){
   const found=sheet(op.sheetId),r=parseRangeSpec(op.range);
   found.merges=(found.merges||[]).filter((m:any)=>m.endRow<r.startRow||m.startRow>r.endRow||m.endCol<r.startCol||m.startCol>r.endCol);
  }else if(op.type==='upsertChart'){
   const found=sheet(op.sheetId),rawChart=op.chart||{};
   const chart={x:100,y:80,width:480,height:300,subType:'clusteredColumn',category:'column',title:'Gráfico',...rawChart,range:parseRangeSpec(rawChart.range)};
   if(!chart.id)chart.id=`chart-${Date.now()}-${Math.random().toString(36).slice(2,6)}`;
   found.charts=[...(found.charts||[]).filter((c:any)=>c.id!==chart.id),chart];
  }else if(op.type==='removeChart'){
   const found=sheet(op.sheetId);
   found.charts=(found.charts||[]).filter((c:any)=>c.id!==op.chartId);
  }else if(op.type==='addConditionalRule'){
   const found=sheet(op.sheetId),rawRule=op.rule||{};
   const rule={...rawRule,id:rawRule.id||`cond-${Date.now()}-${Math.random().toString(36).slice(2,6)}`,range:parseRangeSpec(rawRule.range)};
   found.conditionalRules=[...(found.conditionalRules||[]).filter((r:any)=>r.id!==rule.id),rule];
  }else if(op.type==='removeConditionalRule'){
   const found=sheet(op.sheetId);
   found.conditionalRules=(found.conditionalRules||[]).filter((r:any)=>r.id!==op.ruleId);
  }else if(op.type==='setDimensions'){
   const found=sheet(op.sheetId);
   if(op.colWidths){
    found.colWidths={...(found.colWidths||{})};
    for(const [k,v] of Object.entries(op.colWidths)){
     const colIdx=/^\d+$/.test(k)?Number(k):colLettersToIndex(k);
     if(Number.isInteger(colIdx)&&colIdx>=0&&Number.isFinite(Number(v))&&Number(v)>=24)found.colWidths[colIdx]=Number(v);
    }
   }
   if(op.rowHeights){
    found.rowHeights={...(found.rowHeights||{})};
    for(const [k,v] of Object.entries(op.rowHeights)){
     const rowIdx=Number(k);
     if(Number.isInteger(rowIdx)&&rowIdx>=0&&Number.isFinite(Number(v))&&Number(v)>=16)found.rowHeights[rowIdx]=Number(v);
    }
   }
  }else if(op.type==='configureSheet'){
   const found=sheet(op.sheetId);const allowed=new Set(['merges','colWidths','rowHeights','freezePanes','conditionalRules','charts','tables','definedNames','workbookNames','artwork','inkStrokes','pageLayout']);
   for(const [key,item] of Object.entries(op.patch||{})){if(!allowed.has(key))throw Error('Configuración de hoja desconocida');found[key]=item;}
  }else if(op.type==='replaceSheet'){
   const found=sheet(op.sheetId);if(op.sheet?.id!==found.id)throw Error('La sustitución debe conservar el ID');next.sheets[next.sheets.indexOf(found)]=op.sheet;
  }else throw Error('Operación de libro desconocida');
 }
 const ids=new Set(),names=new Set();
 const validate=(value:any):void=>{if(value&&typeof value==='object')for(const [key,child] of Object.entries(value)){if(!safeKey(key))throw Error('Clave inválida');validate(child);}};validate(next);
 for(const s of next.sheets){
  if(typeof s.id!=='string'||!s.id||ids.has(s.id)||typeof s.name!=='string'||!s.name.trim()||s.name.length>31||/[\\/?*\[\]:]/.test(s.name)||names.has(s.name.toLowerCase()))throw Error('Nombre o ID de hoja inválido');
  ids.add(s.id);names.add(s.name.toLowerCase());
  if(!['grid','chart'].includes(s.type)||!s.data||Array.isArray(s.data))throw Error('Modelo de hoja inválido');
  const range=(r:any)=>{
    if(!r||![r.startCol,r.endCol,r.startRow,r.endRow].every(Number.isInteger)||r.startCol<0||r.startRow<0||r.endCol>=16384||r.endRow>=1048576||r.startCol>r.endCol||r.startRow>r.endRow)throw Error('Rango inválido');
  };
  for(const [id,cell] of Object.entries(s.data) as [string,any][]){
    const match=/^([A-Z]{1,3})([1-9]\d{0,6})$/.exec(id);let column=0;
    if(match)for(const ch of match[1])column=column*26+ch.charCodeAt(0)-64;
    if(!match||column>16384||Number(match[2])>1048576||!cell||typeof cell.raw!=='string')throw Error('Valor o dirección de celda inválidos');
  }
  for(const r of s.merges||[])range(r);
  for(const table of s.tables||[]){range(table.range);if(typeof table.name!=='string'||!Array.isArray(table.columns)||table.columns.length!==table.range.endCol-table.range.startCol+1||!table.columns.every((c:any)=>typeof c==='string'))throw Error('Tabla inválida');}
  for(const key of ['definedNames','workbookNames'])if(s[key]&&(typeof s[key]!=='object'||Array.isArray(s[key])||!Object.values(s[key]).every(v=>typeof v==='string')))throw Error('Nombres definidos inválidos');
  const categories=new Set(['column','line','pie','bar','area','scatter','map','stock','surface','radar','treemap','sunburst','histogram','boxWhisker','waterfall','funnel','combo']);
  for(const chart of s.charts||[]){
    if(typeof chart.id!=='string'||!categories.has(chart.category)||typeof chart.subType!=='string'||typeof chart.title!=='string'||![chart.x,chart.y,chart.width,chart.height].every(Number.isFinite)||chart.width<=0||chart.height<=0)throw Error('Gráfico inválido');
    range(chart.range);
  }
 }
 if(!ids.has(next.activeSheetId))next.activeSheetId=next.sheets[0].id;
 return next;
}
