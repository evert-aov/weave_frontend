import { afterEach, describe, expect, it } from 'vitest';
import { addListItems } from './list-editing';
import { DocumentFlowService } from '../services/document-flow.service';
afterEach(()=>document.body.replaceChildren());
describe('lossless list creation',()=>{
  it('moves original imported runs, including space-only spans and emphasis',()=>{
    const body=document.createElement('div');body.innerHTML='<p><strong>No es una plataforma: </strong><span>comprador</span><span> </span><span>y</span><span> </span><span>vendedor</span></p>';document.body.append(body);
    const paragraph=body.querySelector('p')!,span=body.querySelector('span'),before=body.textContent;
    const range=document.createRange();range.selectNodeContents(paragraph);range.collapse(false);
    expect(addListItems([body],range,'UL')).toBe(true);
    expect(body.textContent).toBe(before);expect(body.querySelector('span')).toBe(span);expect(body.querySelector('li strong')).not.toBeNull();
  });
  it('converts both halves of an automatically split paragraph into a single continued list item',()=>{
    const first=document.createElement('div'),second=document.createElement('div');
    first.innerHTML='<p data-word-flow="p">No es una plataforma para </p>';second.innerHTML='<p data-word-flow="p" data-word-continuation="p">comprador y vendedor.</p>';
    document.body.append(first,second);const range=document.createRange();range.selectNodeContents(first.querySelector('p')!);range.collapse(false);
    addListItems([first,second],range,'UL');
    const joined=document.createElement('div'),flow=new DocumentFlowService();
    flow.appendJoined(joined,first);flow.appendJoined(joined,second);
    expect(joined.querySelectorAll('ul')).toHaveLength(1);expect(joined.querySelectorAll('li')).toHaveLength(1);expect(joined.querySelectorAll('p')).toHaveLength(1);
    expect(joined.textContent).toBe('No es una plataforma para comprador y vendedor.');
  });
});
