import { describe,it,expect } from 'vitest';
import { DocumentModel, DocumentState, textNodes } from './document-model';
import { DocumentModelDomAdapter } from './document-model-dom';
function fixture():DocumentState{return {revision:0,selection:null,roots:[{id:'p',kind:'element',tag:'p',attributes:{style:'line-height:2'},children:[{id:'a',kind:'text',text:'Hola '},{id:'b',kind:'element',tag:'b',attributes:{},children:[{id:'c',kind:'text',text:'mundo'}]}]},{id:'other',kind:'text',text:'Sin cambios'}]};}
describe('Canvas document model',()=>{
  it('replaces text across formatted runs and reverses it without rebuilding untouched subtrees',()=>{
    const original=fixture(),model=new DocumentModel(original);
    model.apply({type:'replaceText',selection:{anchor:{nodeId:'c',offset:3},focus:{nodeId:'a',offset:2}},text:'á'});
    expect(textNodes(model.state.roots).map(n=>n.text)).toEqual(['Hoá','do','Sin cambios']);
    expect(model.state.roots[1]).toBe(original.roots[1]);expect(original.roots[0]).not.toBe(model.state.roots[0]);
    expect(model.undo()).toBe(true);expect(model.state).toBe(original);expect(model.redo()).toBe(true);
    expect(textNodes(model.state.roots)[0].text).toBe('Hoá');
  });
  it('rejects cuts inside emoji and combining characters without changing history',()=>{
    for(const text of ['á','😀']) {
      const state:DocumentState={revision:0,selection:null,roots:[{id:'t',kind:'text',text}]},model=new DocumentModel(state);
      expect(()=>model.apply({type:'replaceText',selection:{anchor:{nodeId:'t',offset:1},focus:{nodeId:'t',offset:2}},text:''})).toThrow();
      expect(model.state).toBe(state);expect(model.undo()).toBe(false);
    }
  });
  it('preserves table/image attributes and stable logical positions when capturing DOM',()=>{
    const root=document.createElement('div');root.innerHTML='<p>Texto</p><table><tr><td colspan="2"><img src="/image.png" alt="Foto"></td></tr></table>';
    const adapter=new DocumentModelDomAdapter(),first=adapter.capture(root),text=root.querySelector('p')!.firstChild!;
    const position=adapter.position(text,2);text.textContent='Texto nuevo';
    const second=adapter.capture(root,1);expect(adapter.position(text,2)).toEqual(position);
    expect(JSON.stringify(second.roots)).toContain('colspan');expect(JSON.stringify(second.roots)).toContain('/image.png');
    expect(first.revision).toBe(0);expect(root.querySelector('img')?.getAttribute('alt')).toBe('Foto');adapter.clear();expect(adapter.position(text,2)).toBeNull();
  });
});
