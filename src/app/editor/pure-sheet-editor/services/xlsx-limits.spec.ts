import {describe,it,expect} from 'vitest';
import {zipSync,strToU8,strFromU8,unzipSync} from 'fflate';
import {prepareXlsxReaderBuffer,XLSX_IMPORT_LIMITS} from './xlsx-limits';
describe('XLSX capacity and reader compatibility',()=>{
 it('normalizes default drawing namespaces in the reader copy while retaining original XML',()=>{
  const xml='<wsDr xmlns="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing"><oneCellAnchor><from><col>1</col></from><ext cx="12" cy="10"/><clientData/></oneCellAnchor></wsDr>';
  const source=zipSync({'xl/drawings/drawing1.xml':strToU8(xml),'xl/workbook.xml':strToU8('<workbook/>')});
  const original=source.slice();const result=unzipSync(new Uint8Array(prepareXlsxReaderBuffer(source.buffer as ArrayBuffer)));
  expect(strFromU8(result['xl/drawings/drawing1.xml'])).toContain('<xdr:wsDr xmlns:xdr=');
  expect(strFromU8(result['xl/drawings/drawing1.xml'])).toContain('<xdr:oneCellAnchor>');
  expect(strFromU8(result['xl/workbook.xml'])).toBe('<workbook/>');expect(source).toEqual(original);
 });
 it('rejects excessive expanded content before decompressing entries',()=>{
  const source=zipSync({'a.xml':strToU8('small')});const view=new DataView(source.buffer);
  for(let i=0;i<source.length-28;i++)if(view.getUint32(i,true)===0x02014b50){view.setUint32(i+24,XLSX_IMPORT_LIMITS.expandedBytes+1,true);break;}
  expect(()=>prepareXlsxReaderBuffer(source.buffer as ArrayBuffer)).toThrow('XLSX_LIMIT_expanded');
 });
});
