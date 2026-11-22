import {describe,it,expect} from 'vitest';
import {applyWorkbookOperations,workbookControlField} from './ai-workbook-control';
import {sheetAiAdapter} from './ai-sheet-adapter';
const book=()=>({activeSheetId:'a',sheets:[{id:'a',name:'Datos',type:'grid',data:{A1:{raw:'1'}},charts:[]},{id:'b',name:'Resumen',type:'grid',data:{A1:{raw:'=Datos!A1'}}}]});
describe('AI workbook control',()=>{
 it('applies multiple sheet, cell and configuration operations atomically',()=>{
  const source=book();
  const next=applyWorkbookOperations(source,JSON.stringify({operations:[
   {type:'renameSheet',sheetId:'a',name:'Ventas'},
   {type:'setCells',sheetId:'a',cells:{Z900:{raw:'=SUM(A1:A8)',style:{bold:true,bgColor:'#fff'}}}},
   {type:'configureSheet',sheetId:'a',patch:{freezePanes:{rows:1,cols:0},merges:[{startRow:0,endRow:0,startCol:0,endCol:2}],charts:[{id:'chart',category:'column',subType:'clusteredColumn',title:'Ventas',x:0,y:0,width:500,height:300,range:{startRow:0,endRow:3,startCol:0,endCol:1}}]}},
   {type:'addSheet',sheet:{id:'c',name:'Nueva',type:'grid',data:{}}},
   {type:'moveSheet',sheetId:'c',index:0},{type:'selectSheet',sheetId:'c'}]}));
  expect(next.sheets[0].id).toBe('c');expect(next.activeSheetId).toBe('c');
  expect(next.sheets[1].data.Z900.raw).toBe('=SUM(A1:A8)');
  expect(next.sheets[2].data.A1.raw).toBe("='Ventas'!A1");
  expect(source.sheets[0].name).toBe('Datos');
  expect(()=>applyWorkbookOperations(source,JSON.stringify({operations:[{type:'renameSheet',sheetId:'a',name:'Resumen'}]}))).toThrow();
  expect(source.sheets[0].name).toBe('Datos');
 });
 it('exposes structural control and prioritizes the active sheet beyond the old cell cap',()=>{
  const source=book();for(let i=1;i<=300;i++)source.sheets[0].data['A'+i as 'A1']={raw:String(i)};
  source.activeSheetId='b';const saved:any[]=[];
  const adapter=sheetAiAdapter(()=> 'doc',()=>source,s=>saved.push(s));
  const fields=Array.from(adapter.fields());expect(fields[0].id).toBe('workbook:control');
  expect(fields[1].id).toBe('cell:b:A1');expect(fields.length).toBeGreaterThan(250);
  adapter.apply(new Map([['workbook:control',JSON.stringify({operations:[{type:'removeSheet',sheetId:'a'}]})]]));
  expect(saved[0].sheets).toHaveLength(1);expect(workbookControlField(source).text).toContain('revision');
 });
 it('inserts and deletes rows while updating formulas on every worksheet',()=>{
  const source=book();source.sheets[0].data.A1={raw:'10'};
  const next=applyWorkbookOperations(source,JSON.stringify({operations:[{type:'insertRows',sheetId:'a',index:0,count:2}]}));
  expect(next.sheets[0].data.A3.raw).toBe('10');expect(next.sheets[1].data.A1.raw).toBe("='Datos'!A3");
  const deleted=applyWorkbookOperations(next,JSON.stringify({operations:[{type:'deleteRows',sheetId:'a',index:2,count:1}]}));
  expect(deleted.sheets[0].data.A3).toBeUndefined();expect(deleted.sheets[1].data.A1.raw).toBe('=#REF!');
 });

 it('keeps table columns consistent when inserting before a table or deleting across its edge',()=>{
  const source:any=book();source.sheets[0].tables=[{name:'DatosTabla',range:{startRow:0,endRow:2,startCol:0,endCol:1},columns:['A','B'],hasHeaders:true}];
  const next=applyWorkbookOperations(source,JSON.stringify({operations:[{type:'insertColumns',sheetId:'a',index:0,count:1}]}));
  expect(next.sheets[0].tables[0].columns).toEqual(['A','B']);expect(next.sheets[0].tables[0].range.startCol).toBe(1);
  const deleted=applyWorkbookOperations(next,JSON.stringify({operations:[{type:'deleteColumns',sheetId:'a',index:0,count:2}]}));
  expect(deleted.sheets[0].tables[0].columns).toEqual(['B']);expect(deleted.sheets[0].tables[0].range.endCol).toBe(0);
 });

});
