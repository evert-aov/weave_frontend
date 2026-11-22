import {describe,it,expect} from 'vitest';
import {readAiAttachment} from './ai-attachments';
const file=(name:string,contents:string)=>({name,size:contents.length,arrayBuffer:async()=>new TextEncoder().encode(contents).buffer}) as File;
describe('AI attachments',()=>{
 it('reads textual documents and provides PDF bytes separately from text',async()=>{
  expect(await readAiAttachment(file('datos.csv','a,b\n1,2'))).toMatchObject({name:'datos.csv',text:'a,b\n1,2',mimeType:'text/plain'});
  const pdf=await readAiAttachment(file('informe.pdf','%PDF-1.7\nexample'));
  expect(pdf.mimeType).toBe('application/pdf');expect(atob(pdf.data!)).toContain('%PDF');expect(pdf.text).toBeUndefined();
 });
 it('recognizes image bytes for uploaded and pasted files without converting them to text',async()=>{
  const samples:[string,number[]][]=[['image/png',[137,80,78,71,13,10,26,10]],['image/jpeg',[255,216,255,1]],['image/gif',[71,73,70,56,57,97]],['image/webp',[82,73,70,70,0,0,0,0,87,69,66,80]]];
  for(const [mimeType,data] of samples){
   const bytes=new Uint8Array(data);
   const result=await readAiAttachment({name:'pasted-image',type:mimeType,size:bytes.length,arrayBuffer:async()=>bytes.buffer} as File);
   expect(result.mimeType).toBe(mimeType);expect(result.text).toBeUndefined();expect(Array.from(atob(result.data!),char=>char.charCodeAt(0))).toEqual(data);
  }
  await expect(readAiAttachment(file('fake.png','not an image'))).rejects.toThrow('imagen');
 });
 it('recognizes audio bytes in Base64 without converting them to text',async()=>{
  const samples:[string,string,string,number[]][]=[
   ['voz.wav','audio/wav','audio/wav',[82,73,70,70,36,0,0,0,87,65,86,69]],
   ['voz.mp3','audio/mp3','audio/mp3',[73,68,51,4,0,0]],
   ['voz.mp3','audio/mpeg','audio/mpeg',[255,251,144,0]],
   ['voz.ogg','audio/ogg;codecs=opus','audio/ogg',[79,103,103,83,0,2]],
   ['voz.aac','audio/aac','audio/aac',[255,241,96,64]],
   ['voz.flac','audio/flac','audio/flac',[102,76,97,67,0,0]],
   ['voz.webm','audio/webm;codecs=opus','audio/webm',[26,69,223,163,159]],
   ['voz.m4a','audio/mp4','audio/mp4',[0,0,0,28,102,116,121,112,77,52,65,32]],
  ];
  for(const [name,type,expectedMime,data] of samples){
   const bytes=new Uint8Array(data);
   const result=await readAiAttachment({name,type,size:bytes.length,arrayBuffer:async()=>bytes.buffer} as File);
   expect(result.mimeType).toBe(expectedMime);
   expect(result.text).toBeUndefined();
   expect(Array.from(atob(result.data!),char=>char.charCodeAt(0))).toEqual(data);
  }
  await expect(readAiAttachment(file('fake.mp3','not audio'))).rejects.toThrow('audio');
  await expect(readAiAttachment({name:'big.wav',type:'audio/wav',size:5*1024*1024} as File)).rejects.toThrow('4 MB');
 });
 it('rejects invalid, unsupported and oversized inputs',async()=>{
  await expect(readAiAttachment(file('falso.pdf','not pdf'))).rejects.toThrow('PDF');
  await expect(readAiAttachment(file('script.exe','binary'))).rejects.toThrow('Formato');
  await expect(readAiAttachment({name:'big.pdf',size:5*1024*1024} as File)).rejects.toThrow('4 MB');
 });
 it('extracts DOCX text and XLSX worksheets with formulas',async()=>{
  const {zipSync,strToU8}=await import('fflate');
  const docx=zipSync({'word/document.xml':strToU8('<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Documento adjunto</w:t></w:r></w:p></w:body></w:document>')});
  const document=await readAiAttachment({name:'a.docx',size:docx.length,arrayBuffer:async()=>docx.buffer} as File);
  expect(document.text).toBe('Documento adjunto');
  const ExcelJS=(await import('exceljs')).default,book=new ExcelJS.Workbook();
  const sheet=book.addWorksheet('Ventas');sheet.getCell('A1').value='Importe';sheet.getCell('A2').value={formula:'SUM(B1:B2)',result:120};
  const bytes=await book.xlsx.writeBuffer();
  const xlsx=await readAiAttachment({name:'a.xlsx',size:bytes.byteLength,arrayBuffer:async()=>bytes} as File);
  expect(xlsx.text).toContain('[Hoja: Ventas]');expect(xlsx.text).toContain('=SUM(B1:B2)');
 });

});
