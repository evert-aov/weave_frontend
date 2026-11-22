import {unzipSync,strFromU8,strToU8,zipSync} from 'fflate';
export const XLSX_IMPORT_LIMITS={fileBytes:100*1024*1024,cells:2_000_000,expandedBytes:512*1024*1024};
export class XlsxImportLimitError extends Error {
 constructor(readonly code:'file'|'cells'|'expanded'){super(`XLSX_LIMIT_${code}`);}
}
/** Check ZIP metadata before ExcelJS allocates the expanded workbook. */
export function prepareXlsxReaderBuffer(buffer:ArrayBuffer):ArrayBuffer {
 if(buffer.byteLength>XLSX_IMPORT_LIMITS.fileBytes)throw new XlsxImportLimitError('file');
 let expanded=0;
 const drawings=unzipSync(new Uint8Array(buffer),{filter:file=>{
  expanded+=file.originalSize;if(expanded>XLSX_IMPORT_LIMITS.expandedBytes)throw new XlsxImportLimitError('expanded');
  return /^xl\/drawings\/drawing\d+\.xml$/.test(file.name);
 }});
 const fixes=new Map<string,string>();
 for(const [name,bytes] of Object.entries(drawings)){
  const xml=strFromU8(bytes);
  if(!/<wsDr\b[^>]*xmlns=["']http:\/\/schemas.openxmlformats.org\/drawingml\/2006\/spreadsheetDrawing["']/.test(xml))continue;
  // ExcelJS matches qualified tag names instead of namespace URIs for drawings.
  const tags='wsDr|oneCellAnchor|twoCellAnchor|absoluteAnchor|from|to|col|colOff|row|rowOff|ext|graphicFrame|nvGraphicFramePr|cNvPr|cNvGraphicFramePr|xfrm|pic|nvPicPr|cNvPicPr|blipFill|spPr|clientData|grpSp|nvGrpSpPr|cNvGrpSpPr|grpSpPr';
  let normalized=xml.replace(new RegExp(`<(/?)(${tags})(?=[\\s/>])`,'g'),'<$1xdr:$2');
  if(!/xmlns:xdr=/.test(normalized))normalized=normalized.replace('<xdr:wsDr','<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing"');
  fixes.set(name,normalized);
 }
 if(!fixes.size)return buffer;
 const files=unzipSync(new Uint8Array(buffer));for(const [name,xml] of fixes)files[name]=strToU8(xml);
 const zip=zipSync(files,{level:1});return zip.buffer.slice(zip.byteOffset,zip.byteOffset+zip.byteLength) as ArrayBuffer;
}
