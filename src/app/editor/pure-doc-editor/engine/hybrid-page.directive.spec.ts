import { TestBed } from '@angular/core/testing';
import { ElementRef } from '@angular/core';
import { afterEach,describe,expect,it,vi } from 'vitest';
import { HybridPageDirective } from './hybrid-page.directive';
import { CanvasPageRenderer } from './canvas-page-renderer';
const originalFonts=Object.getOwnPropertyDescriptor(document,'fonts');
const originalRect=Object.getOwnPropertyDescriptor(Range.prototype,'getBoundingClientRect');
let dispose: (()=>void)|undefined;
afterEach(()=>{
  dispose?.();dispose=undefined;window.getSelection()?.removeAllRanges();
  if(originalFonts)Object.defineProperty(document,'fonts',originalFonts);else Reflect.deleteProperty(document,'fonts');
  if(originalRect)Object.defineProperty(Range.prototype,'getBoundingClientRect',originalRect);else Reflect.deleteProperty(Range.prototype,'getBoundingClientRect');
  TestBed.resetTestingModule();vi.restoreAllMocks();vi.unstubAllGlobals();document.body.replaceChildren();
});
function setup(editable=false) {
  let intersect!:(entries:{isIntersecting:boolean}[])=>void;
  const disconnect=vi.fn();
  vi.stubGlobal('IntersectionObserver',class {constructor(callback:typeof intersect){intersect=callback;}observe(){}disconnect=disconnect;});
  vi.stubGlobal('ResizeObserver',class {observe(){}disconnect(){} });
  const frames=new Map<number,FrameRequestCallback>();let next=0;
  vi.stubGlobal('requestAnimationFrame',(callback:FrameRequestCallback)=>{frames.set(++next,callback);return next;});
  vi.stubGlobal('cancelAnimationFrame',(id:number)=>frames.delete(id));
  const flush=()=>{const current=[...frames.values()];frames.clear();current.forEach(callback=>callback(0));};
  const sheet=document.createElement('div'),body=document.createElement('div');body.innerHTML='<p>Texto conservado</p>';
  if(editable)body.setAttribute('contenteditable','true');
  sheet.append(body);document.body.append(sheet);
  Object.defineProperty(body,'clientWidth',{value:600});Object.defineProperty(body,'clientHeight',{value:800});
  vi.spyOn(body,'getBoundingClientRect').mockReturnValue({width:600,height:800,left:0,top:0} as DOMRect);
  Object.defineProperty(Range.prototype,'getBoundingClientRect',{configurable:true,value:()=>({width:8,height:16,left:0,top:0})});
  vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue({measureText:()=>({fontBoundingBoxAscent:12})} as unknown as CanvasRenderingContext2D);
  Object.defineProperty(document,'fonts',{configurable:true,value:{check:()=>true,addEventListener:vi.fn(),removeEventListener:vi.fn()}});
  TestBed.configureTestingModule({providers:[{provide:ElementRef,useValue:new ElementRef(body)}]});
  const render=vi.spyOn(CanvasPageRenderer.prototype,'render').mockImplementation(()=>{});
  const directive=TestBed.runInInjectionContext(()=>new HybridPageDirective());
  directive.wordHybridPage=true;directive.ngAfterViewInit();dispose=()=>directive.ngOnDestroy();
  const visible=(value:boolean)=>intersect([{isIntersecting:value}]);
  return {sheet,body,render,directive,flush,visible,disconnect,canvas:()=>sheet.querySelector('canvas')};
}
describe('hybrid page lifecycle',()=>{
  it('renders only near the viewport, restores DOM throughout printing and detaches on destroy',()=>{
    const h=setup();expect(h.render).not.toHaveBeenCalled();
    h.visible(true);h.flush();expect(h.render).toHaveBeenCalledTimes(1);expect(h.canvas()).not.toBeNull();
    expect(h.body.classList.contains('word-hybrid-source')).toBe(true);expect(h.body.innerHTML).toBe('<p>Texto conservado</p>');
    window.dispatchEvent(new Event('beforeprint'));expect(h.canvas()).toBeNull();
    document.dispatchEvent(new Event('selectionchange'));h.flush();expect(h.canvas()).toBeNull();
    window.dispatchEvent(new Event('afterprint'));h.flush();expect(h.canvas()).not.toBeNull();
    h.visible(false);expect(h.canvas()).toBeNull();h.directive.ngOnDestroy();dispose=undefined;
    expect(h.disconnect).toHaveBeenCalled();window.dispatchEvent(new Event('afterprint'));h.flush();expect(h.canvas()).toBeNull();
  });
  it('restores the identical text node before pointer and input handlers run, and protects composition',async()=>{
    const h=setup(true),text=h.body.querySelector('p')!.firstChild!;
    h.visible(true);h.flush();expect(h.canvas()).not.toBeNull();
    const initialCanvas=h.canvas();
    let restored=false;
    h.body.addEventListener('pointerdown',()=>{restored=!h.canvas()&&!h.body.classList.contains('word-hybrid-source');});
    h.body.dispatchEvent(new Event('pointerdown',{bubbles:true}));expect(restored).toBe(true);
    h.body.focus();window.getSelection()?.collapse(text,5);
    h.body.dispatchEvent(new Event('compositionstart'));text.textContent='Texto corregido con á';
    h.body.dispatchEvent(new InputEvent('beforeinput',{inputType:'insertCompositionText'}));
    await Promise.resolve();h.flush();expect(h.canvas()).toBeNull();expect(h.body.querySelector('p')!.firstChild).toBe(text);
    h.body.dispatchEvent(new Event('compositionend'));h.flush();expect(h.canvas()).toBeNull();
    expect(initialCanvas?.width).toBe(0);expect(initialCanvas?.height).toBe(0);
    h.body.blur();window.getSelection()?.removeAllRanges();document.dispatchEvent(new Event('selectionchange'));h.flush();
    expect(h.canvas()).not.toBeNull();expect(h.body.textContent).toBe('Texto corregido con á');
    h.directive.wordHybridPage=false;h.directive.ngOnChanges();expect(h.canvas()).toBeNull();
    expect(h.body.querySelector('p')!.firstChild).toBe(text);
  });
  it('keeps cross-page ranges and editable carets native without replacing the DOM',()=>{
    const h=setup(true);h.visible(true);h.flush();expect(h.canvas()).not.toBeNull();
    const other=document.createElement('div');other.textContent='Segunda página';document.body.append(other);
    const text=h.body.querySelector('p')!.firstChild!,range=document.createRange();range.setStart(text,2);range.setEnd(other.firstChild!,5);
    const selection=window.getSelection()!;selection.removeAllRanges();selection.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));h.flush();expect(h.canvas()).toBeNull();
    expect(selection.toString()).toContain('conservado');expect(selection.anchorNode).toBe(text);
    selection.collapse(text,3);document.dispatchEvent(new Event('selectionchange'));h.flush();expect(h.canvas()).toBeNull();
    selection.removeAllRanges();document.dispatchEvent(new Event('selectionchange'));h.flush();expect(h.canvas()).not.toBeNull();
  });
  it('does not measure or draw the active page during typing, deleting or caret movement',async()=>{
    const h=setup(true);h.visible(true);h.flush();
    const text=h.body.querySelector('p')!.firstChild!;
    const measure=vi.spyOn(Range.prototype,'getBoundingClientRect');
    h.body.focus();window.getSelection()?.collapse(text,2);
    document.dispatchEvent(new Event('selectionchange'));
    measure.mockClear();h.render.mockClear();
    for(let i=0;i<30;i++) {
      h.body.dispatchEvent(new InputEvent('beforeinput',{inputType:i%2?'deleteContentBackward':'insertText'}));
      text.textContent=i%2?'Texto':'Texto añadido';
      window.getSelection()?.collapse(text,2);
      document.dispatchEvent(new Event('selectionchange'));
      await Promise.resolve();h.flush();
    }
    expect(measure).not.toHaveBeenCalled();expect(h.render).not.toHaveBeenCalled();expect(h.canvas()).toBeNull();
    h.body.blur();window.getSelection()?.removeAllRanges();document.dispatchEvent(new Event('selectionchange'));h.flush();
    expect(h.render).toHaveBeenCalledTimes(1);
  });
  it('stays native after placing a caret without typing, including leaving and reentering the viewport',()=>{
    const h=setup(true);h.visible(true);h.flush();
    const text=h.body.querySelector('p')!.firstChild!,html=h.body.innerHTML;
    const measure=vi.spyOn(Range.prototype,'getBoundingClientRect');
    h.body.dispatchEvent(new Event('pointerdown',{bubbles:true}));
    h.body.focus();window.getSelection()?.collapse(text,3);
    document.dispatchEvent(new Event('selectionchange'));
    measure.mockClear();h.render.mockClear();
    for(let i=0;i<20;i++) {
      h.visible(false);h.visible(true);
      document.dispatchEvent(new Event('selectionchange'));h.flush();
    }
    expect(h.body.innerHTML).toBe(html);expect(window.getSelection()?.anchorNode).toBe(text);
    expect(measure).not.toHaveBeenCalled();expect(h.render).not.toHaveBeenCalled();expect(h.canvas()).toBeNull();
  });
  it('does not retry unsupported neighboring pages on unrelated selection events',async()=>{
    const h=setup();h.visible(true);h.flush();const previous=h.canvas()!;
    h.body.innerHTML='<ul><li>Native list</li></ul>';
    await Promise.resolve();
    const reads=vi.spyOn(h.body,'querySelectorAll');
    h.visible(true);h.flush();expect(h.canvas()).toBeNull();
    expect(previous.width).toBe(0);expect(previous.height).toBe(0);
    const initialReads=reads.mock.calls.length;expect(initialReads).toBeGreaterThan(0);
    for(let i=0;i<30;i++){document.dispatchEvent(new Event('selectionchange'));h.flush();}
    expect(reads).toHaveBeenCalledTimes(initialReads);
    h.body.innerHTML='<p>Now supported</p>';await Promise.resolve();h.flush();
    expect(h.canvas()).not.toBeNull();
  });
});
