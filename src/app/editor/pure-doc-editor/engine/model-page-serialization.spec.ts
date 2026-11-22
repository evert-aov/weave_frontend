import {describe,it,expect} from 'vitest';
import {DocumentCanvasEngine} from './document-engine';
import {textNodes} from './document-model';
const geometry={width:100,height:65,top:5,right:5,bottom:5,left:5};
const measure=(text:string)=>({width:text.length*8,ascent:8,descent:2});
const parse=(html:string)=>{const root=document.createElement('div');root.innerHTML=html;return root;};
describe('lossless page projection',()=>{
 it('preserves every space, empty block and image once through repagination and edit',()=>{
  const html='<p>  uno dos tres cuatro cinco seis siete ocho nueve diez </p><p></p><img src="one" width="20" height="20"><p>después</p><img src="one" width="20" height="20">';
  const engine=new DocumentCanvasEngine(measure,{lineHeight:10});engine.syncPages([{id:'first',html}],geometry);
  const check=(expected:string)=>{
   const output=parse(engine.getPages().map(p=>p.html).join(''));
   expect(output.textContent).toBe(expected);expect(output.querySelectorAll('img')).toHaveLength(2);
   expect(engine.getPages().length).toBeGreaterThan(1);
  };
  check(parse(html).textContent!);
  const leaf=textNodes(engine.getSections()[0].model.state.roots)[0];
  engine.applyOperation(0,{type:'replaceText',selection:{anchor:{nodeId:leaf.id,offset:2},focus:{nodeId:leaf.id,offset:2}},text:'X'},geometry);
  check('  X'+parse(html).textContent!.slice(2));
  engine.undo(0,geometry);check(parse(html).textContent!);
 });
 it('does not commit an operation whose layout fails',()=>{
  const engine=new DocumentCanvasEngine(measure);engine.syncPages([{id:'p',html:'<p>ok</p>'}],geometry);
  const before=engine.getSections()[0].model.state;
  expect(()=>engine.applyOperation(0,{type:'insertNodes',index:1,nodes:[{id:'bad',kind:'element',tag:'video',attributes:{},children:[]}]},geometry)).toThrow();
  expect(engine.getSections()[0].model.state).toBe(before);
 });
});
