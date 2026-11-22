import {describe,it,expect} from 'vitest';
import {layoutDocument,ParagraphBlock,PageGeometry,TableBlock} from './document-layout';
const geometry:PageGeometry={width:120,height:80,top:10,right:10,bottom:10,left:10};
const measure=(text:string)=>({width:[...text].length*10,ascent:8,descent:2});
const p=(text:string):ParagraphBlock=>({kind:'paragraph',lineHeight:10,runs:[{nodeId:'a',text,font:'10px serif',color:'#000'}]});
describe('independent page layout',()=>{
 it('wraps complete words across styled runs and paginates within all margins',()=>{
   const paragraph=p('1234567 ');paragraph.runs=[...paragraph.runs,{nodeId:'b',text:'da',font:'bold 10px serif',color:'black'},{nodeId:'c',text:'tos',font:'10px serif',color:'black'}];
   const pages=layoutDocument(Array.from({length:5},()=>paragraph),geometry,measure);
   expect(pages).toHaveLength(2);
   const first=pages[0].commands.filter(c=>c.kind==='text');
   expect(first.find(c=>c.text==='d')?.source?.top).toBe(20);
   for(const page of pages)for(const command of page.commands)if(command.kind==='text'){
     expect(command.x).toBeGreaterThanOrEqual(10);expect(command.x+command.source!.width).toBeLessThanOrEqual(110);
     expect(command.source!.top+command.source!.height).toBeLessThanOrEqual(70);
   }
 });
 it('fits images proportionally and starts a new page for the next object',()=>{
   const pages=layoutDocument([{kind:'image',assetId:'photo',width:200,height:100},p('texto') ,p('más')],geometry,measure);
   expect(pages).toHaveLength(2);expect(pages[0].commands[0]).toEqual({kind:'image',assetId:'photo',x:10,y:10,width:100,height:50});
 });
 it('keeps vertically merged cells together and lays out their contents and borders',()=>{
   const table:TableBlock={kind:'table',columns:[1,1],padding:1,border:1,color:'black',rows:[
     [{rowSpan:2,blocks:[p('hola')]},{blocks:[p('a')]}],[{blocks:[p('b')]}],
     [{colSpan:2,background:'#eee',blocks:[p('fin')]}]
   ]};
   const pages=layoutDocument([p('1'),p('2'),p('3'),p('4'),table],geometry,measure);
   expect(pages).toHaveLength(2);
   expect(pages[0].commands.filter(c=>c.kind==='text').map(c=>c.text).join('')).toBe('1234');
   expect(pages[1].commands.filter(c=>c.kind==='text').map(c=>c.text).join('')).toBe('holaabfin');
   expect(pages[1].commands.some(c=>c.kind==='rect'&&c.color==='#eee')).toBe(true);
 });
 it('rejects an oversized indivisible object instead of clipping or looping',()=>{
   expect(()=>layoutDocument([{kind:'image',assetId:'x',width:100,height:900}],geometry,measure)).toThrow('exceeds page height');
   expect(()=>layoutDocument([p('texto')],{...geometry,left:120},measure)).toThrow('Invalid page geometry');
 });
 it('repeats leading table header rows across page breaks and applies cell verticalAlign',()=>{
   const table:TableBlock={kind:'table',headerRows:1,columns:[1,1],padding:1,border:1,color:'black',rows:[
     [{verticalAlign:'middle',blocks:[p('HDR')]},{blocks:[p('C2')]}],
     [{blocks:[p('fila1')]},{blocks:[p('dato')]}],
     [{blocks:[p('fila2')]},{blocks:[p('dato')]}],
     [{blocks:[p('fila3')]},{blocks:[p('dato')]}],
     [{blocks:[p('fila4')]},{blocks:[p('larga linea')]}],
     [{verticalAlign:'bottom',blocks:[p('BTM')]},{blocks:[p('a'),p('b'),p('c')]}],
   ]};
   const pages=layoutDocument([table],{width:140,height:80,top:10,right:10,bottom:10,left:10},measure);
   expect(pages.length).toBeGreaterThanOrEqual(2);
   expect(pages[0].commands.filter(c=>c.kind==='text').map(c=>c.text).join('')).toContain('HDR');
   const page2Texts=pages[1].commands.filter(c=>c.kind==='text');
   expect(page2Texts.map(c=>c.text).join('')).toContain('HDR');
   // Repeated header text has source stripped so it does not duplicate editable targets
   expect(page2Texts.filter(c=>c.text==='H').every(c=>!c.source)).toBe(true);
   // Bottom-aligned cell BTM sits lower than top of its taller sibling cell
   const btmPage=pages[pages.length-1].commands.filter(c=>c.kind==='text');
   const btmGlyph=btmPage.find(c=>c.text==='B');
   const aGlyph=btmPage.find(c=>c.text==='a');
   expect(btmGlyph&&aGlyph&&btmGlyph.y>aGlyph.y).toBe(true);
 });
});
