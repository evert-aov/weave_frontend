import {describe,it,expect,vi,afterEach} from 'vitest';
import {WordNavigationController} from './word-navigation.controller';
afterEach(()=>{document.body.replaceChildren();vi.unstubAllGlobals();});
describe('virtual Canvas zoom anchoring',()=>{
 it('retains the same page point when zoom destroys the original Canvas slot',()=>{
  vi.stubGlobal('requestAnimationFrame',()=>1);vi.stubGlobal('cancelAnimationFrame',()=>{});
  const viewport=document.createElement('main'),space=document.createElement('div'),page=document.createElement('canvas');
  space.className='canvas-document-space';page.className='word-page-sheet';page.setAttribute('data-canvas-index','10');
  viewport.append(space);space.append(page);document.body.append(viewport);viewport.scrollTop=10000;
  vi.spyOn(viewport,'getBoundingClientRect').mockReturnValue({top:0,left:0,width:1000,height:700} as DOMRect);
  vi.spyOn(page,'getBoundingClientRect').mockReturnValue({top:100,left:0,width:600,height:800,right:600,bottom:900} as DOMRect);
  vi.spyOn(space,'getBoundingClientRect').mockImplementation(()=>({top:-8220-(viewport.scrollTop-10000),left:0} as DOMRect));
  const zoom=Object.assign(()=>100,{set:vi.fn()});
  const host={zoom,mainScrollRef:{nativeElement:viewport},refreshObjectOverlays:vi.fn()};
  const hooks={cdr:{detectChanges:()=>page.remove()}};
  const controller=new WordNavigationController(host as unknown as ConstructorParameters<typeof WordNavigationController>[0],hooks as unknown as ConstructorParameters<typeof WordNavigationController>[1]);
  controller.setDocumentZoom(120,{x:300,y:300,page});
  expect(zoom.set).toHaveBeenCalledWith(120);expect(page.isConnected).toBe(false);
  expect(viewport.scrollTop).toBe(11640);controller.cancelZoom();
 });
});
