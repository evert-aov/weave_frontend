import {TestBed} from '@angular/core/testing';
import {afterEach,describe,it,expect,vi} from 'vitest';
import {WordCanvasEditorComponent} from './word-canvas-editor.component';
import {CanvasPageRenderer} from '../../engine/canvas-page-renderer';
import {textNodes} from '../../engine/document-model';
import {ProofreadingService} from '../../../../core/services/proofreading.service';
afterEach(()=>{TestBed.resetTestingModule();vi.restoreAllMocks();});
describe('Canvas document viewport',()=>{
 it('edits through a single input proxy and mounts only a bounded set of pages',async()=>{
  vi.spyOn(CanvasPageRenderer.prototype,'render').mockImplementation(()=>{});
  const fixture=TestBed.createComponent(WordCanvasEditorComponent);
  const pages=Array.from({length:140},(_,i)=>({id:'p'+i,html:'<p>Texto conservado '+i+'</p>',breakBefore:'manual' as const}));
  fixture.componentRef.setInput('pages',pages);
  fixture.componentRef.setInput('geometry',{width:600,height:800,top:50,right:50,bottom:50,left:50});
  fixture.detectChanges();await fixture.whenStable();fixture.detectChanges();
  const root:HTMLElement=fixture.nativeElement,editor=fixture.componentInstance;
  expect(root.querySelectorAll('[contenteditable]')).toHaveLength(0);
  expect(root.querySelectorAll('textarea')).toHaveLength(1);
  expect(root.querySelectorAll('canvas').length).toBeLessThan(8);
  const s=editor.session!,node=textNodes(s.engine.getSections()[0].model.state.roots)[0];
  s.setSelection(0,{anchor:{nodeId:node.id,offset:5},focus:{nodeId:node.id,offset:5}});
  const changed=vi.spyOn(editor.changed,'emit');
  root.querySelector('textarea')!.dispatchEvent(new InputEvent('beforeinput',{inputType:'insertText',data:' á',bubbles:true,cancelable:true}));
  fixture.detectChanges();expect(changed).toHaveBeenCalled();
  expect(s.engine.getSourcePages()[0].html).toContain('Texto á conservado');
  expect(root.querySelectorAll('[contenteditable]')).toHaveLength(0);
 });
 it('selects, resizes and deletes images in the canvas viewport',async()=>{
  vi.spyOn(CanvasPageRenderer.prototype,'render').mockImplementation(()=>{});
  const fixture=TestBed.createComponent(WordCanvasEditorComponent);
  const pages=[{
   id:'p0',
   html:'<p>Foto</p><img id="my-img" src="data:image/png;base64,123" style="width:180px;height:90px;" width="180" height="90">',
  }];
  fixture.componentRef.setInput('pages',pages);
  fixture.componentRef.setInput('geometry',{width:600,height:800,top:50,right:50,bottom:50,left:50});
  fixture.detectChanges();await fixture.whenStable();fixture.detectChanges();
  const root:HTMLElement=fixture.nativeElement,comp=fixture.componentInstance;
  const canvas=root.querySelector('canvas')!;
  vi.spyOn(canvas,'getBoundingClientRect').mockReturnValue({left:0,top:0,right:600,bottom:800,width:600,height:800,x:0,y:0,toJSON:()=>{}} as DOMRect);
  canvas.dispatchEvent(new PointerEvent('pointerdown',{clientX:60,clientY:75,button:0,bubbles:true}));
  fixture.detectChanges();
  expect(comp.selectedImage()).not.toBeNull();
  expect(root.querySelector('.canvas-image-selection-box')).not.toBeNull();
  expect(root.querySelector('.canvas-img-resize-handle')).not.toBeNull();

  const handle=root.querySelector('.canvas-img-resize-handle') as HTMLElement;
  handle.dispatchEvent(new PointerEvent('pointerdown',{clientX:100,clientY:100,button:0,bubbles:true}));
  window.dispatchEvent(new PointerEvent('pointermove',{clientX:200,clientY:100,bubbles:true}));
  window.dispatchEvent(new PointerEvent('pointerup',{bubbles:true}));
  fixture.detectChanges();
  expect(comp.selectedImage()?.width).toBeGreaterThan(180);

  comp.deleteSelectedImage();
  fixture.detectChanges();
  expect(comp.selectedImage()).toBeNull();
  expect(comp.session?.engine.getSourcePages()[0].html).not.toContain('data:image/png');
 });
 it('copies and pastes a selected image through clipboard HTML',async()=>{
  vi.spyOn(CanvasPageRenderer.prototype,'render').mockImplementation(()=>{});
  const fixture=TestBed.createComponent(WordCanvasEditorComponent);
  fixture.componentRef.setInput('pages',[{id:'p',html:'<img src="https://example.com/photo.png" width="80" height="50" alt="Foto">'}]);
  fixture.componentRef.setInput('geometry',{width:600,height:800,top:50,right:50,bottom:50,left:50});
  fixture.detectChanges();await fixture.whenStable();fixture.detectChanges();
  const editor=fixture.componentInstance,session=editor.session!;
  const command=session.displayLists[0].commands.find(c=>c.kind==='image')!;
  editor.selectedImage.set({pageId:session.displayLists[0].id,assetId:"https://example.com/photo.png",nodeId:command.nodeId!,pageIndex:0,x:50,y:50,width:80,height:50});
  const data=new Map<string,string>();
  const clipboard={items:[],setData:(type:string,value:string)=>data.set(type,value),getData:(type:string)=>data.get(type)||''};
  const event={clipboardData:clipboard,preventDefault:vi.fn()} as unknown as ClipboardEvent;
  editor.copy(event,false);expect(data.get('text/html')).toContain('photo.png');
  await editor.paste(event);
  expect(session.displayLists.flatMap(p=>p.commands).filter(c=>c.kind==='image')).toHaveLength(2);
  expect(session.undo()).toBe(true);
  expect(session.displayLists.flatMap(p=>p.commands).filter(c=>c.kind==='image')).toHaveLength(1);
 });

 it('pastes an Excel table through clipboard HTML and preserves tabular content',async()=>{
  vi.spyOn(CanvasPageRenderer.prototype,'render').mockImplementation(()=>{});
  const fixture=TestBed.createComponent(WordCanvasEditorComponent);
  fixture.componentRef.setInput('pages',[{id:'p',html:'<p>Documento inicial</p>'}]);
  fixture.componentRef.setInput('geometry',{width:600,height:800,top:50,right:50,bottom:50,left:50});
  fixture.detectChanges();await fixture.whenStable();fixture.detectChanges();
  const editor=fixture.componentInstance,session=editor.session!;
  const tableHtml='<table><thead><tr><th>Producto</th><th>Precio</th></tr></thead><tbody><tr><td>Manzana</td><td>1.50</td></tr></tbody></table>';
  const clipboard={items:[],getData:(type:string)=>type==='text/html'?tableHtml:'Producto\tPrecio\nManzana\t1.50'};
  const event={clipboardData:clipboard,preventDefault:vi.fn()} as unknown as ClipboardEvent;
  await editor.paste(event);
  expect(session.engine.getSourcePages()[0].html).toContain('Producto');
  expect(session.engine.getSourcePages()[0].html).toContain('1.50');
  expect(session.undo()).toBe(true);
  expect(session.engine.getSourcePages()[0].html).not.toContain('Producto');
 });

 it('pastes tab-separated Excel plain text as a table when HTML is absent',async()=>{
  vi.spyOn(CanvasPageRenderer.prototype,'render').mockImplementation(()=>{});
  const fixture=TestBed.createComponent(WordCanvasEditorComponent);
  fixture.componentRef.setInput('pages',[{id:'p',html:'<p>Inicio</p>'}]);
  fixture.componentRef.setInput('geometry',{width:600,height:800,top:50,right:50,bottom:50,left:50});
  fixture.detectChanges();await fixture.whenStable();fixture.detectChanges();
  const editor=fixture.componentInstance,session=editor.session!;
  const clipboard={items:[],getData:(type:string)=>type==='text/plain'?'Col1\tCol2\nVal1\tVal2':''};
  const event={clipboardData:clipboard,preventDefault:vi.fn()} as unknown as ClipboardEvent;
  await editor.paste(event);
  expect(session.engine.getSourcePages()[0].html).toContain('Col1');
  expect(session.engine.getSourcePages()[0].html).toContain('Val2');
  expect(session.engine.getSourcePages()[0].html).toContain('<table');
 });

 it('toggles bold and italic with Ctrl shortcuts and respects read-only mode',async()=>{
  vi.spyOn(CanvasPageRenderer.prototype,'render').mockImplementation(()=>{});
  const fixture=TestBed.createComponent(WordCanvasEditorComponent);
  fixture.componentRef.setInput('pages',[{id:'p',html:'<p>Texto</p>'}]);
  fixture.componentRef.setInput('geometry',{width:600,height:800,top:50,right:50,bottom:50,left:50});
  fixture.detectChanges();await fixture.whenStable();fixture.detectChanges();
  const editor=fixture.componentInstance,s=editor.session!;
  const leaf=textNodes(s.engine.getSections()[0].model.state.roots)[0];
  s.setSelection(0,{anchor:{nodeId:leaf.id,offset:0},focus:{nodeId:leaf.id,offset:leaf.text.length}});
  const toggle=vi.spyOn(s,'toggleInlineCommand');
  const input:HTMLTextAreaElement=fixture.nativeElement.querySelector('textarea');
  const bold=new KeyboardEvent('keydown',{key:'b',ctrlKey:true,bubbles:true,cancelable:true});input.dispatchEvent(bold);
  expect(bold.defaultPrevented).toBe(true);expect(toggle).toHaveBeenLastCalledWith('bold');
  input.dispatchEvent(new KeyboardEvent('keydown',{key:'i',ctrlKey:true,bubbles:true,cancelable:true}));
  expect(toggle).toHaveBeenLastCalledWith('italic');
  fixture.componentRef.setInput('readOnly',true);fixture.detectChanges();
  toggle.mockClear();input.dispatchEvent(new KeyboardEvent('keydown',{key:'b',ctrlKey:true,bubbles:true,cancelable:true}));expect(toggle).not.toHaveBeenCalled();
 });

 it('allows resizing table columns and rows by dragging borders on canvas',async()=>{
  vi.spyOn(CanvasPageRenderer.prototype,'render').mockImplementation(()=>{});
  const fixture=TestBed.createComponent(WordCanvasEditorComponent);
  const tableHtml='<table style="width:100%; table-layout:fixed"><colgroup><col style="width:50%"><col style="width:50%"></colgroup><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>1</td><td>2</td></tr></tbody></table>';
  fixture.componentRef.setInput('pages',[{id:'p',html:tableHtml}]);
  fixture.componentRef.setInput('geometry',{width:600,height:800,top:50,right:50,bottom:50,left:50});
  fixture.detectChanges();await fixture.whenStable();fixture.detectChanges();
  const editor=fixture.componentInstance,session=editor.session!;
  const page=session.displayLists[0];
  expect(page.tables).toBeDefined();
  const tbl=page.tables![0];

  const canvas:HTMLCanvasElement=fixture.nativeElement.querySelector('canvas')!;
  vi.spyOn(canvas,'getBoundingClientRect').mockReturnValue({left:0,top:0,right:600,bottom:800,width:600,height:800,x:0,y:0,toJSON:()=>{}} as DOMRect);

  // Hover over vertical column border (between col 0 and col 1)
  const colBorder=tbl.colBorders[0];
  canvas.dispatchEvent(new PointerEvent('pointermove',{clientX:colBorder.x,clientY:colBorder.top+10,bubbles:true}));
  expect(canvas.style.cursor).toBe('col-resize');

  // Drag column border
  canvas.dispatchEvent(new PointerEvent('pointerdown',{clientX:colBorder.x,clientY:colBorder.top+10,button:0,bubbles:true}));
  expect(editor.isResizingTable).toBe(true);
  window.dispatchEvent(new PointerEvent('pointermove',{clientX:colBorder.x+50,clientY:colBorder.top+10,bubbles:true}));
  window.dispatchEvent(new PointerEvent('pointerup',{bubbles:true}));
  fixture.detectChanges();
  expect(editor.isResizingTable).toBe(false);
  expect(session.engine.getSourcePages()[0].html).toContain('width: 60%');
  expect(session.engine.getSourcePages()[0].html).toContain('width: 40%');

  // Hover over row border
  const updatedTbl=session.displayLists[0].tables![0];
  const rowBorder=updatedTbl.rowBorders[0];
  canvas.dispatchEvent(new PointerEvent('pointermove',{clientX:rowBorder.left+20,clientY:rowBorder.y,bubbles:true}));
  expect(canvas.style.cursor).toBe('row-resize');

  // Drag row border
  canvas.dispatchEvent(new PointerEvent('pointerdown',{clientX:rowBorder.left+20,clientY:rowBorder.y,button:0,bubbles:true}));
  expect(editor.isResizingTable).toBe(true);
  window.dispatchEvent(new PointerEvent('pointermove',{clientX:rowBorder.left+20,clientY:rowBorder.y+30,bubbles:true}));
  window.dispatchEvent(new PointerEvent('pointerup',{bubbles:true}));
  fixture.detectChanges();
  expect(editor.isResizingTable).toBe(false);
  expect(session.engine.getSourcePages()[0].html).toContain('height:');
 });

 it('applies proofreading autocorrection, notice undo, and repetition warnings on Canvas input',async()=>{
  vi.spyOn(CanvasPageRenderer.prototype,'render').mockImplementation(()=>{});
  const writing=TestBed.inject(ProofreadingService);
  writing.setLanguage('es');
  writing.enabled.set(true);
  const fixture=TestBed.createComponent(WordCanvasEditorComponent);
  fixture.componentRef.setInput('pages',[{id:'p',html:'<p>Hola tambien</p>'}]);
  fixture.componentRef.setInput('geometry',{width:600,height:800,top:50,right:50,bottom:50,left:50});
  fixture.detectChanges();await fixture.whenStable();fixture.detectChanges();
  const s=fixture.componentInstance.session!,node=textNodes(s.engine.getSections()[0].model.state.roots)[0];
  s.setSelection(0,{anchor:{nodeId:node.id,offset:node.text.length},focus:{nodeId:node.id,offset:node.text.length}});
  const proxy:HTMLTextAreaElement=fixture.nativeElement.querySelector('textarea');
  proxy.dispatchEvent(new InputEvent('beforeinput',{inputType:'insertText',data:' ',bubbles:true,cancelable:true}));
  fixture.detectChanges();
  expect(s.pages[0].html).toContain('Hola también');
  expect(writing.notice()?.kind).toBe('correction');
  expect(writing.notice()?.after).toBe('también');

  writing.undo();
  fixture.detectChanges();
  expect(s.pages[0].html).toContain('Hola tambien');
  expect(writing.notice()).toBeNull();

  const updatedNode=textNodes(s.engine.getSections()[0].model.state.roots)[0];
  s.setSelection(0,{anchor:{nodeId:updatedNode.id,offset:updatedNode.text.length},focus:{nodeId:updatedNode.id,offset:updatedNode.text.length}});
  s.insert('hola hola');
  proxy.dispatchEvent(new InputEvent('beforeinput',{inputType:'insertText',data:' ',bubbles:true,cancelable:true}));
  fixture.detectChanges();
  expect(writing.notice()?.kind).toBe('repetition');
  expect(writing.notice()?.before).toBe('hola');
 });

 it('toggles checkboxes on click and emits linkClick on Ctrl+click',async()=>{
  vi.spyOn(CanvasPageRenderer.prototype,'render').mockImplementation(()=>{});
  const fixture=TestBed.createComponent(WordCanvasEditorComponent);
  fixture.componentRef.setInput('pages',[{id:'p',html:'<p><input type="checkbox" /> Item <a href="https://weave.test">Enlace</a></p>'}]);
  fixture.componentRef.setInput('geometry',{width:600,height:800,top:50,right:50,bottom:50,left:50});
  fixture.detectChanges();await fixture.whenStable();fixture.detectChanges();
  const editor=fixture.componentInstance;
  const session=editor.session!;
  const canvas:HTMLCanvasElement=fixture.nativeElement.querySelector('canvas');
  const boxCmd=session.displayLists[0].commands.find((c):c is Extract<typeof c,{kind:'text'}>=>c.kind==='text'&&c.text==='[');
  expect(boxCmd?.source).toBeTruthy();
  canvas.dispatchEvent(new PointerEvent('pointerdown',{clientX:boxCmd!.x+1,clientY:boxCmd!.source!.top+2,button:0,bubbles:true}));
  fixture.detectChanges();
  expect(session.pages[0].html).toContain('checked');

  const emitted: string[]=[];
  const sub=editor.linkClick.subscribe(href=>emitted.push(href));
  const linkCmd=session.displayLists[0].commands.find((c):c is Extract<typeof c,{kind:'text'}>=>c.kind==='text'&&c.text==='E');
  expect(linkCmd?.source).toBeTruthy();
  canvas.dispatchEvent(new PointerEvent('pointerdown',{clientX:linkCmd!.x+1,clientY:linkCmd!.source!.top+2,button:0,ctrlKey:true,bubbles:true}));
  fixture.detectChanges();
  expect(emitted).toEqual(['https://weave.test']);
  sub.unsubscribe();
 });

 it('exposes semantic accessibility tree, Ctrl+End navigation, continuous web/draft views, and perf metrics',async()=>{
  vi.spyOn(CanvasPageRenderer.prototype,'render').mockImplementation(()=>{});
  const fixture=TestBed.createComponent(WordCanvasEditorComponent);
  fixture.componentRef.setInput('pages',[{id:'p',html:'<h1>Titulo</h1><p><input type="checkbox" checked /> Tarea</p>'}]);
  fixture.componentRef.setInput('geometry',{width:600,height:800,top:50,right:50,bottom:50,left:50});
  fixture.componentRef.setInput('viewMode','web');
  fixture.detectChanges();await fixture.whenStable();fixture.detectChanges();

  const editor=fixture.componentInstance;
  const hostEl:HTMLElement=fixture.nativeElement;
  expect(hostEl.querySelector('canvas')?.getAttribute('aria-hidden')).toBe('true');
  expect(hostEl.querySelector('canvas')?.classList.contains('canvas-continuous-sheet')).toBe(true);
  expect(hostEl.querySelector('[role="document"]')).toBeTruthy();
  const heading=hostEl.querySelector('[role="heading"]');
  expect(heading?.getAttribute('aria-level')).toBe('1');
  expect(heading?.textContent?.trim()).toBe('Titulo');
  const checkbox=hostEl.querySelector('[role="checkbox"]');
  expect(checkbox?.getAttribute('aria-checked')).toBe('true');

  const proxy:HTMLTextAreaElement=hostEl.querySelector('textarea')!;
  proxy.dispatchEvent(new KeyboardEvent('keydown',{key:'End',ctrlKey:true,bubbles:true}));
  fixture.detectChanges();
  expect(proxy.getAttribute('aria-activedescendant')).toContain('canvas-a11y-');
  expect(editor.perfReport()?.phases.render.count).toBeGreaterThan(0);
 });

 it('renders table rows/cells in accessibility tree and skips a11y recomputation during scroll',async()=>{
  vi.spyOn(CanvasPageRenderer.prototype,'render').mockImplementation(()=>{});
  const fixture=TestBed.createComponent(WordCanvasEditorComponent);
  fixture.componentRef.setInput('pages',[{
   id:'p0',
   html:'<table><thead><tr><th>Nombre</th><th>Valor</th></tr></thead><tbody><tr><td>Alfa</td><td>42</td></tr></tbody></table>',
  }]);
  fixture.componentRef.setInput('geometry',{width:600,height:800,top:50,right:50,bottom:50,left:50});
  fixture.detectChanges();await fixture.whenStable();fixture.detectChanges();

  const editor=fixture.componentInstance;
  const hostEl:HTMLElement=fixture.nativeElement;
  expect(hostEl.querySelectorAll('[role="table"] [role="row"]')).toHaveLength(2);
  expect(Array.from(hostEl.querySelectorAll('[role="columnheader"]')).map(el=>el.textContent?.trim())).toEqual(['Nombre','Valor']);
  expect(Array.from(hostEl.querySelectorAll('[role="cell"]')).map(el=>el.textContent?.trim())).toEqual(['Alfa','42']);

  const firstRef=editor.accessibleBlocks();
  const activeSpy=vi.spyOn(editor.session!,'getActiveAccessibleBlockId');
  editor.refresh();
  fixture.detectChanges();
  expect(editor.accessibleBlocks()).toBe(firstRef);
  expect(activeSpy).not.toHaveBeenCalled();
 });

 it('edits rich formatted headers/footers inline and projects rich Canvas decorations',async()=>{
  vi.spyOn(CanvasPageRenderer.prototype,'render').mockImplementation(()=>{});
  const fixture=TestBed.createComponent(WordCanvasEditorComponent);
  fixture.componentRef.setInput('pages',[{id:'p0',html:'<p>Contenido principal</p>'}]);
  fixture.componentRef.setInput('geometry',{width:600,height:800,top:72,right:72,bottom:72,left:72});
  fixture.componentRef.setInput('layoutConfig',{showHeaderFooter:true,headerHtml:'<p>Inicial</p>',footerHtml:''});
  fixture.detectChanges();await fixture.whenStable();fixture.detectChanges();

  const editor=fixture.componentInstance;
  const hostEl:HTMLElement=fixture.nativeElement;
  const emitted:{headerHtml?:string;footerHtml?:string}[]=[];
  const sub=editor.headerFooterChange.subscribe(ev=>emitted.push(ev));

  editor.openHeaderFooterEditor('header',0);
  fixture.detectChanges();
  await Promise.resolve();
  fixture.detectChanges();

  // Strictly pure Canvas editing: zero contenteditable elements even while editing header/footer!
  expect(hostEl.querySelectorAll('[contenteditable]')).toHaveLength(0);
  expect(hostEl.querySelector('.canvas-region-bar')).toBeTruthy();

  const proxyEl=hostEl.querySelector('.canvas-input-proxy') as HTMLTextAreaElement;
  expect(proxyEl).toBeTruthy();
  const inputEvent=new InputEvent('beforeinput',{inputType:'insertText',data:'Encabezado Rico',cancelable:true});
  proxyEl.dispatchEvent(inputEvent);
  fixture.detectChanges();

  const editingDecorations=editor.exportDisplayLists()[0].decorations?.activeRegionEdit;
  expect(editingDecorations?.zone).toBe('header');
  expect(editingDecorations?.lines[0]?.runs[0]?.text).toBe('Encabezado Rico');

  editor.formatRegion('bold');
  editor.formatRegion('justifyCenter');
  editor.applyRegionColor('#b91c1c');
  editor.commitRegionEdit();
  fixture.detectChanges();

  expect(emitted).toHaveLength(1);
  expect(emitted[0].headerHtml).toContain('<strong>');
  expect(emitted[0].headerHtml).toContain('text-align: center');
  expect(emitted[0].headerHtml).toContain('Encabezado Rico');
  expect(hostEl.querySelectorAll('[contenteditable]')).toHaveLength(0);

  fixture.componentRef.setInput('layoutConfig',{showHeaderFooter:true,headerHtml:emitted[0].headerHtml,footerHtml:''});
  fixture.detectChanges();
  const lines=editor.exportDisplayLists()[0].decorations?.headerLines;
  expect(lines?.[0].align).toBe('center');
  expect(lines?.[0].runs[0].bold).toBe(true);
  expect(lines?.[0].runs[0].color).toBeTruthy();
  sub.unsubscribe();
 });

 it('selects word on double-click and full paragraph on triple-click',async()=>{
  vi.spyOn(CanvasPageRenderer.prototype,'render').mockImplementation(()=>{});
  const fixture=TestBed.createComponent(WordCanvasEditorComponent);
  fixture.componentRef.setInput('pages',[{id:'p0',html:'<p>Primera segunda tercera</p>'}]);
  fixture.componentRef.setInput('geometry',{width:600,height:800,top:50,right:50,bottom:50,left:50});
  fixture.detectChanges();await fixture.whenStable();fixture.detectChanges();

  const editor=fixture.componentInstance;
  const session=editor.session!;
  const cmd=session.displayLists[0].commands.find(c=>c.kind==='text'&&c.text==='g'&&(c.source?.start.offset??-1)>=8)!;
  expect(cmd).toBeDefined();
  if(cmd.kind!=='text'||!cmd.source)throw new Error('Expected text command');

  const canvas:HTMLCanvasElement=fixture.nativeElement.querySelector('canvas')!;
  vi.spyOn(canvas,'getBoundingClientRect').mockReturnValue({left:0,top:0,right:600,bottom:800,width:600,height:800,x:0,y:0,toJSON:()=>{}} as DOMRect);
  const hitX=cmd.x+Math.max(10,cmd.source.width*0.45);
  const hitY=cmd.source.top+cmd.source.height/2;

  canvas.dispatchEvent(new PointerEvent('pointerdown',{clientX:hitX,clientY:hitY,button:0,detail:2,bubbles:true}));
  canvas.dispatchEvent(new PointerEvent('pointerup',{clientX:hitX,clientY:hitY,button:0,bubbles:true}));
  expect(session.selectedText()).toBe('segunda');

  canvas.dispatchEvent(new PointerEvent('pointerdown',{clientX:hitX,clientY:hitY,button:0,detail:3,bubbles:true}));
  canvas.dispatchEvent(new PointerEvent('pointerup',{clientX:hitX,clientY:hitY,button:0,bubbles:true}));
  expect(session.selectedText()).toBe('Primera segunda tercera');
 });

 it('exposes semi-invisible table gridlines only in editor viewport, avoids accidental border resize, and keeps session identity on resize',async()=>{
  vi.spyOn(CanvasPageRenderer.prototype,'render').mockImplementation(()=>{});
  const fixture=TestBed.createComponent(WordCanvasEditorComponent);
  fixture.componentRef.setInput('pages',[{
   id:'p0',
   html:'<table data-apa-table="true" style="width: 100%"><tbody><tr><td style="border: none">Concepto</td><td style="border: none">Total</td></tr><tr><td style="border: none">Alfa</td><td style="border: none">100</td></tr></tbody></table>',
  }]);
  fixture.componentRef.setInput('geometry',{width:600,height:800,top:50,right:50,bottom:50,left:50});
  fixture.detectChanges();await fixture.whenStable();fixture.detectChanges();

  const editor=fixture.componentInstance;
  const initialSession=editor.session!;
  let changedEmits=0;
  const sub=editor.changed.subscribe(nextPages=>{
   changedEmits++;
   // Simulate PureDocEditorComponent.acceptCanvasPages syncing pages input back into WordCanvasEditorComponent
   fixture.componentRef.setInput('pages',nextPages);
   fixture.detectChanges();
  });

  // Viewport displays table gridlines, PDF export lists do not
  expect(editor.visiblePages()[0].page.decorations?.showTableGridlines).toBe(true);
  expect(editor.exportDisplayLists()[0].decorations?.showTableGridlines).toBeFalsy();

  const canvas:HTMLCanvasElement=fixture.nativeElement.querySelector('canvas')!;
  vi.spyOn(canvas,'getBoundingClientRect').mockReturnValue({left:0,top:0,right:600,bottom:800,width:600,height:800,x:0,y:0,toJSON:()=>{}} as DOMRect);
  const tbl=initialSession.displayLists[0].tables![0];
  const colBorder=tbl.colBorders[0];

  // Click without dragging on border must not emit a resize or recreate the session
  canvas.dispatchEvent(new PointerEvent('pointerdown',{clientX:colBorder.x,clientY:colBorder.top+5,button:0,bubbles:true}));
  window.dispatchEvent(new PointerEvent('pointerup',{clientX:colBorder.x,clientY:colBorder.top+5,bubbles:true}));
  expect(changedEmits).toBe(0);
  expect(editor.session).toBe(initialSession);

  // Real drag resize emits once with matching array identity, preserving the session instance
  canvas.dispatchEvent(new PointerEvent('pointerdown',{clientX:colBorder.x,clientY:colBorder.top+5,button:0,bubbles:true}));
  window.dispatchEvent(new PointerEvent('pointermove',{clientX:colBorder.x+40,clientY:colBorder.top+5,bubbles:true}));
  window.dispatchEvent(new PointerEvent('pointerup',{clientX:colBorder.x+40,clientY:colBorder.top+5,bubbles:true}));
  fixture.detectChanges();
  expect(changedEmits).toBe(1);
  expect(editor.session).toBe(initialSession);
  sub.unsubscribe();
 });

 it('provides alignment and caption controls on a selected Canvas image and emits dropped image files',async()=>{
  vi.spyOn(CanvasPageRenderer.prototype,'render').mockImplementation(()=>{});
  const fixture=TestBed.createComponent(WordCanvasEditorComponent);
  fixture.componentRef.setInput('pages',[{id:'p',html:'<img src="https://example.com/chart.png" width="120" height="80" alt="Gráfico">'}]);
  fixture.componentRef.setInput('geometry',{width:600,height:800,top:50,right:50,bottom:50,left:50});
  fixture.detectChanges();await fixture.whenStable();fixture.detectChanges();
  const editor=fixture.componentInstance,session=editor.session!;
  const cmd=session.displayLists[0].commands.find(c=>c.kind==='image')!;
  editor.selectedImage.set({pageId:session.displayLists[0].id,assetId:'https://example.com/chart.png',nodeId:cmd.nodeId!,pageIndex:0,x:cmd.x,y:cmd.y,width:cmd.width,height:cmd.height});
  fixture.detectChanges();

  const root=fixture.nativeElement as HTMLElement;
  const toolbarButtons=Array.from(root.querySelectorAll('.canvas-img-tool-btn')) as HTMLButtonElement[];
  expect(toolbarButtons.map(b=>b.textContent?.trim())).toEqual(['Izq','Cen','Der','+ Pie']);

  toolbarButtons[1].click();
  fixture.detectChanges();
  expect(session.pages[0].html).toContain('text-align: center');
  expect(editor.selectedImage()?.x).toBeGreaterThan(cmd.x);

  toolbarButtons[3].click();
  fixture.detectChanges();
  expect(session.pages[0].html).toContain('<figure');
  expect(session.pages[0].html).toContain('<figcaption');

  const dropped: Array<{file:File;pageIndex:number}>=[];
  const sub=editor.imageDrop.subscribe(ev=>dropped.push(ev));
  const file=new File(['img'], 'captura.png', {type:'image/png'});
  const canvas=root.querySelector('canvas')!;
  const dropEvent=new Event('drop',{bubbles:true,cancelable:true}) as DragEvent;
  Object.defineProperty(dropEvent,'dataTransfer',{value:{files:[file],types:['Files']}});
  canvas.dispatchEvent(dropEvent);
  expect(dropped).toHaveLength(1);
  expect(dropped[0]).toEqual({file,pageIndex:0});
  sub.unsubscribe();
 });

 it('handles Tab/Shift+Tab in multilevel lists & tables and emits tableContextMenu on right-click',async()=>{
  vi.spyOn(CanvasPageRenderer.prototype,'render').mockImplementation(()=>{});
  const fixture=TestBed.createComponent(WordCanvasEditorComponent);
  fixture.componentRef.setInput('pages',[{id:'p',html:'<ol><li>Uno</li><li>Dos</li></ol><table><tr><td>C1</td><td>C2</td></tr></table>'}]);
  fixture.componentRef.setInput('geometry',{width:600,height:800,top:50,right:50,bottom:50,left:50});
  fixture.detectChanges();await fixture.whenStable();fixture.detectChanges();
  const editor=fixture.componentInstance,session=editor.session!;
  const proxy=fixture.nativeElement.querySelector('textarea')!;

  // Focus second list item and Tab -> data-list-level="1", Shift+Tab -> level 0
  const listLeaves=session.engine.getSections()[0].model.state.roots[0];
  const dosPos=session.displayLists[0].commands.find((c): c is Extract<typeof c,{kind:'text'}>=>c.kind==='text'&&c.text==='D'&&Boolean(c.source))!;
  session.setSelection(0,{anchor:dosPos.source!.start,focus:dosPos.source!.start});
  proxy.dispatchEvent(new KeyboardEvent('keydown',{key:'Tab',bubbles:true,cancelable:true}));
  expect(session.pages[0].html).toContain('data-list-level="1"');
  proxy.dispatchEvent(new KeyboardEvent('keydown',{key:'Tab',shiftKey:true,bubbles:true,cancelable:true}));
  expect(session.pages[0].html).not.toContain('data-list-level=');

  // Right-click inside table cell emits tableContextMenu with pointer coordinates
  const canvas:HTMLCanvasElement=fixture.nativeElement.querySelector('canvas')!;
  vi.spyOn(canvas,'getBoundingClientRect').mockReturnValue({left:0,top:0,right:600,bottom:800,width:600,height:800,x:0,y:0,toJSON:()=>{}} as DOMRect);
  const c1Glyph=session.displayLists[0].commands.find((c): c is Extract<typeof c,{kind:'text'}>=>c.kind==='text'&&c.text==='C'&&Boolean(c.source))!;
  const menus:Array<{clientX:number;clientY:number;pageIndex:number}>=[];
  const sub=editor.tableContextMenu.subscribe(m=>menus.push(m));
  canvas.dispatchEvent(new MouseEvent('contextmenu',{clientX:c1Glyph.x+2,clientY:c1Glyph.y-2,bubbles:true,cancelable:true}));
  expect(menus).toHaveLength(1);
  expect(menus[0].pageIndex).toBe(0);
  expect(session.getSelectionContext()?.table).toBeTruthy();

  // Tab from second cell C2 navigates past last cell and appends a second row
  proxy.dispatchEvent(new KeyboardEvent('keydown',{key:'Tab',bubbles:true,cancelable:true}));
  proxy.dispatchEvent(new KeyboardEvent('keydown',{key:'Tab',bubbles:true,cancelable:true}));
  expect((session.pages[0].html.match(/<tr>/g)||[]).length).toBe(2);
  void listLeaves;
  sub.unsubscribe();
 });

 it('preserves surrounding paragraphs and lists when pasting Gemini mixed HTML containing a table, and splits multi-line plain text into paragraphs',async()=>{
  vi.spyOn(CanvasPageRenderer.prototype,'render').mockImplementation(()=>{});
  const fixture=TestBed.createComponent(WordCanvasEditorComponent);
  fixture.componentRef.setInput('pages',[{id:'p',html:'<p>Inicio</p>'}]);
  fixture.componentRef.setInput('geometry',{width:600,height:800,top:50,right:50,bottom:50,left:50});
  fixture.detectChanges();await fixture.whenStable();fixture.detectChanges();
  const editor=fixture.componentInstance,session=editor.session!;

  const geminiHtml=`
    <p>Ejemplo para estimar KLDC:</p>
    <table><thead><tr><th>Proyecto</th><th>KLDC Esperadas</th></tr></thead><tbody><tr><td>P-A</td><td>65,57</td></tr></tbody></table>
    <p>Se calcula el KLDC de 3 proyectos:</p>
    <ul><li>Optimista: El que generó menos KLDC</li></ul>
  `;
  const clipboard={items:[],getData:(type:string)=>type==='text/html'?geminiHtml:'Ejemplo'};
  const event={clipboardData:clipboard,preventDefault:vi.fn()} as unknown as ClipboardEvent;
  await editor.paste(event);
  const htmlAfter=session.engine.getSourcePages()[0].html;
  expect(htmlAfter).toContain('Ejemplo para estimar KLDC:');
  expect(htmlAfter).toContain('65,57');
  expect(htmlAfter).toContain('Se calcula el KLDC de 3 proyectos:');
  expect(htmlAfter).toContain('Optimista: El que generó menos KLDC');

  // Plain-text multi-line paste creates individual <p> paragraphs that can be converted to lists or headings
  const plainClipboard={items:[],getData:(type:string)=>type==='text/plain'?'Primera línea pegada\nSegunda línea pegada':''};
  const plainEvent={clipboardData:plainClipboard,preventDefault:vi.fn()} as unknown as ClipboardEvent;
  await editor.paste(plainEvent);
  const htmlAfterPlain=session.engine.getSourcePages()[0].html;
  expect(htmlAfterPlain).toContain('<p>Primera línea pegada</p>');
  expect(htmlAfterPlain).toContain('<p>Segunda línea pegada</p>');
 });

 it('round-trips a Weave table with merged cells, empty sub-header cells, highlights, and alignments through copy() and paste()',async()=>{
  vi.spyOn(CanvasPageRenderer.prototype,'render').mockImplementation(()=>{});
  const srcFixture=TestBed.createComponent(WordCanvasEditorComponent);
  srcFixture.componentRef.setInput('pages',[{
   id:'src',
   html:'<table style="width:100%;table-layout:fixed;border-collapse:collapse"><colgroup><col style="width:30%"><col style="width:35%"><col style="width:35%"></colgroup><thead><tr><th style="border:1px solid #000;background-color:#dbe5f1">Tipo</th><th colspan="2" style="border:1px solid #000;background-color:#dbe5f1;text-align:center">Factor</th></tr><tr><th style="border:1px solid #000;background-color:#dbe5f1"></th><th style="border:1px solid #000;background-color:#dbe5f1;text-align:center">Simple</th><th style="border:1px solid #000;background-color:#dbe5f1;text-align:center">Medio</th></tr></thead><tbody><tr><td style="border:1px solid #000">Pantallas</td><td style="border:1px solid #000;background-color:#ffff00;text-align:center">2</td><td style="border:1px solid #000;text-align:right">48</td></tr></tbody></table>',
  }]);
  srcFixture.componentRef.setInput('geometry',{width:600,height:800,top:50,right:50,bottom:50,left:50});
  srcFixture.detectChanges();await srcFixture.whenStable();srcFixture.detectChanges();

  const srcEditor=srcFixture.componentInstance;
  srcEditor.session!.selectAll();
  const data=new Map<string,string>();
  const clipboard={items:[],setData:(t:string,v:string)=>data.set(t,v),getData:(t:string)=>data.get(t)||''};
  const copyEv={clipboardData:clipboard,preventDefault:vi.fn()} as unknown as ClipboardEvent;
  srcEditor.copy(copyEv,false);

  const dstFixture=TestBed.createComponent(WordCanvasEditorComponent);
  dstFixture.componentRef.setInput('pages',[{id:'dst',html:'<p></p>'}]);
  dstFixture.componentRef.setInput('geometry',{width:600,height:800,top:50,right:50,bottom:50,left:50});
  dstFixture.detectChanges();await dstFixture.whenStable();dstFixture.detectChanges();
  const dstEditor=dstFixture.componentInstance;
  await dstEditor.paste({clipboardData:clipboard,preventDefault:vi.fn()} as unknown as ClipboardEvent);

  const outHtml=dstEditor.session!.pages[0].html;
  const parsed=new DOMParser().parseFromString(outHtml,'text/html');
  const row1Cells=Array.from(parsed.querySelectorAll('table tr')[1].querySelectorAll('th, td'));
  expect(row1Cells).toHaveLength(3);
  expect(row1Cells[0].textContent?.trim()).toBe('');
  expect(row1Cells[1].textContent?.trim()).toBe('Simple');
  expect(row1Cells[2].textContent?.trim()).toBe('Medio');
  expect(outHtml.toLowerCase()).toContain('#ffff00');
 });

});
