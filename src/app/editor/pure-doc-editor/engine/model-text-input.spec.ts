import {afterEach,describe,it,expect} from 'vitest';
import {applyModelTextInput} from './model-text-input';
afterEach(()=>{window.getSelection()?.removeAllRanges();document.body.replaceChildren();});
function setup(html:string) {const body=document.createElement('div');body.setAttribute('contenteditable','true');body.innerHTML=html;document.body.append(body);return body;}
function edit(body:HTMLElement,type:string,data:string|null=null) {const event=new InputEvent('beforeinput',{inputType:type,data,cancelable:true});return {handled:applyModelTextInput(body,event),event};}
describe('logical text input bridge',()=>{
 it('inserts into the same formatted text node and publishes one input for save/pagination',()=>{
   const body=setup('<p><b>Hola</b></p>'),text=body.querySelector('b')!.firstChild!;
   window.getSelection()!.collapse(text,2);let inputs=0;body.addEventListener('input',()=>inputs++);
   const result=edit(body,'insertText','á');expect(result.handled).toBe(true);expect(result.event.defaultPrevented).toBe(true);
   expect(body.innerHTML).toBe('<p><b>Hoála</b></p>');expect(body.querySelector('b')!.firstChild).toBe(text);
   expect(window.getSelection()!.anchorOffset).toBe(3);expect(inputs).toBe(1);
 });
 it('deletes whole emoji and combining sequences',()=>{
   const body=setup('<p>A😀áZ</p>'),text=body.querySelector('p')!.firstChild!;
   window.getSelection()!.collapse(text,3);expect(edit(body,'deleteContentBackward').handled).toBe(true);expect(text.textContent).toBe('AáZ');
   expect(edit(body,'deleteContentForward').handled).toBe(true);expect(text.textContent).toBe('AZ');
 });
 it('replaces selection across inline styles and preserves the surrounding paragraph',()=>{
   const body=setup('<p><b>Hola</b><i>mundo</i></p>');const b=body.querySelector('b')!.firstChild!,i=body.querySelector('i')!.firstChild!;
   window.getSelection()!.setBaseAndExtent(b,2,i,3);expect(edit(body,'insertText','!').handled).toBe(true);
   expect(body.innerHTML).toBe('<p><b>Ho!</b><i>do</i></p>');
 });
 it('delegates cross-paragraph deletion, newline and IME to structural/native input',()=>{
   const body=setup('<p>Uno</p><p>Dos</p>'),p=body.querySelectorAll('p');window.getSelection()!.setBaseAndExtent(p[0].firstChild!,1,p[1].firstChild!,1);
   expect(edit(body,'deleteContentBackward').handled).toBe(false);
   window.getSelection()!.collapse(p[0].firstChild!,1);expect(edit(body,'insertParagraph').handled).toBe(false);
   expect(applyModelTextInput(body,new InputEvent('beforeinput',{inputType:'insertText',data:'á',cancelable:true,isComposing:true}))).toBe(false);
   expect(body.innerHTML).toBe('<p>Uno</p><p>Dos</p>');
 });
});
