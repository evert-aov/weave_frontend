import {findWorksheetReferences,formatWorksheetReference} from '../../editor/pure-sheet-editor/services/formula-engine.service';
function column(text:string):number {let n=0;for(const c of text)n=n*26+c.charCodeAt(0)-64;return n-1;}
function letters(index:number):string {let result='';for(let n=index+1;n>0;n=Math.floor((n-1)/26))result=String.fromCharCode(65+(n-1)%26)+result;return result;}
export function rewriteSheetReferences(book:any,oldName:string,newName?:string):void {
 const rewrite=(raw:string)=>{
  let formula=raw;
  for(const ref of findWorksheetReferences(raw).reverse())if(ref.sheetName?.toLowerCase()===oldName.toLowerCase())formula=formula.slice(0,ref.index)+(newName===undefined?'#REF!':formatWorksheetReference(newName,ref.start+(ref.end?':'+ref.end:'')))+formula.slice(ref.index+ref.token.length);
  return formula;
 };
 for(const sheet of book.sheets){
  for(const cell of Object.values(sheet.data||{}) as any[])if(cell.raw?.startsWith('='))cell.raw=rewrite(cell.raw);
  for(const key of ['definedNames','workbookNames'])if(sheet[key])for(const name of Object.keys(sheet[key]))sheet[key][name]=rewrite(sheet[key][name]);
 }
}
export function shiftWorkbookAxis(book:any,target:any,axis:'row'|'column',at:number,count:number,remove:boolean):void {
 const max=axis==='row'?1048576:16384;
 if(!Number.isInteger(at)||!Number.isInteger(count)||at<0||count<1||at+count>max)throw Error('Índice o cantidad fuera de rango');
 const move=(index:number)=>remove?(index<at?index:index>=at+count?index-count:null):(index>=at?index+count:index);
 const grid:Record<string,any>={};
 for(const [address,value] of Object.entries(target.data)){
  const match=/^([A-Z]+)(\d+)$/.exec(address)!;const old=axis==='row'?Number(match[2])-1:column(match[1]);const next=move(old);
  if(next===null)continue;if(next>=max)throw Error('La inserción sobrepasa el tamaño de la hoja');
  grid[axis==='row'?match[1]+(next+1):letters(next)+match[2]]=value;
 }target.data=grid;
 const bounds=(range:any)=>{
  const startKey=axis==='row'?'startRow':'startCol',endKey=axis==='row'?'endRow':'endCol';
  const start=move(range[startKey]),end=move(range[endKey]);
  return {...range,[startKey]:start??at,[endKey]:end??Math.max(0,at-1)};
 };
 target.merges=(target.merges||[]).map(bounds).filter((r:any)=>r.startRow<=r.endRow&&r.startCol<=r.endCol);
 const valid=(r:any)=>r.startRow<=r.endRow&&r.startCol<=r.endCol;
 target.tables=(target.tables||[]).map((table:any)=>{
  const range=bounds(table.range),columns=[...(table.columns||[])];
  if(axis==='column'){
   if(remove){const first=Math.max(at,table.range.startCol),last=Math.min(at+count,table.range.endCol+1);if(last>first)columns.splice(first-table.range.startCol,last-first);}
   else if(at>table.range.startCol&&at<=table.range.endCol)columns.splice(at-table.range.startCol,0,...Array.from({length:count},(_,i)=>`Column_${at+i+1}`));
  }
  return {...table,columns,range};
 }).filter((table:any)=>valid(table.range));
 target.conditionalRules=(target.conditionalRules||[]).map((rule:any)=>({...rule,range:bounds(rule.range)})).filter((rule:any)=>valid(rule.range));
 if(target.pageLayout?.printArea)target.pageLayout.printArea=bounds(target.pageLayout.printArea);
 if(target.freezePanes){const key=axis==='row'?'rows':'cols';if(at<target.freezePanes[key])target.freezePanes[key]=Math.max(0,target.freezePanes[key]+(remove?-Math.min(count,target.freezePanes[key]-at):count));}
 const sizeKey=axis==='row'?'rowHeights':'colWidths';if(target[sizeKey])target[sizeKey]=Object.fromEntries(Object.entries(target[sizeKey]).flatMap(([key,value])=>{const next=move(Number(key));return next===null?[]:[[next,value]];}));
 const address=(token:string,rangeEnd=false,rangeStart=false)=>{
  const m=/^(\$?)([A-Z]+)(\$?)(\d+)?$/.exec(token)!;
  if(axis==='row'&&!m[4])return token;
  const value=axis==='row'?Number(m[4])-1:column(m[2]);let next=move(value);
  if(next===null){if(rangeStart)next=at;else if(rangeEnd)next=at-1;else return '#REF!';}
  if(next<0||next>=max)return '#REF!';
  return axis==='row'?`${m[1]}${m[2]}${m[3]}${next+1}`:`${m[1]}${letters(next)}${m[3]}${m[4]||''}`;
 };
 for(const sheet of book.sheets){
  const rewrite=(raw:string)=>{
   let formula=raw;
   for(const ref of findWorksheetReferences(raw).reverse()){
    if(ref.sheetName?ref.sheetName.toLowerCase()!==target.name.toLowerCase():sheet.id!==target.id)continue;
    const deleted=(token:string)=>{const m=/^\$?([A-Z]+)\$?(\d+)?$/.exec(token)!;if(axis==='row'&&!m[2])return false;const value=axis==='row'?Number(m[2])-1:column(m[1]);return value>=at&&value<at+count;};
    const entirelyDeleted=remove&&deleted(ref.start)&&(!ref.end||deleted(ref.end));
    const a=address(ref.start,false,!!ref.end),b=ref.end?address(ref.end,true):'';
    const replacement=entirelyDeleted?'#REF!':a==='#REF!'||b==='#REF!'?'#REF!':formatWorksheetReference(ref.sheetName,a+(b?':'+b:''));
    formula=formula.slice(0,ref.index)+replacement+formula.slice(ref.index+ref.token.length);
   }return formula;
  };
  for(const cell of Object.values(sheet.data||{}) as any[])if(cell.raw?.startsWith('='))cell.raw=rewrite(cell.raw);
  for(const key of ['definedNames','workbookNames'])if(sheet[key])for(const name of Object.keys(sheet[key]))sheet[key][name]=rewrite(sheet[key][name]);
  sheet.charts=(sheet.charts||[]).map((chart:any)=>(chart.sourceSheetId||sheet.id)===target.id?{...chart,range:bounds(chart.range)}:chart).filter((chart:any)=>valid(chart.range));
 }
}
