import { afterEach, describe, expect, it, vi } from 'vitest';
import { paginateMeasuredToc } from './toc-pagination';
afterEach(()=>{document.body.replaceChildren();vi.restoreAllMocks();});
describe('measured TOC pagination',()=>{
  it('measures resolved Word double spacing for every row before packing pages',()=>{
    vi.spyOn(HTMLElement.prototype,'getBoundingClientRect').mockReturnValue({height:40} as DOMRect);
    const body=document.createElement('div');Object.defineProperty(body,'clientWidth',{value:624});Object.defineProperty(body,'clientHeight',{value:100});document.body.append(body);
    const html='<div class="word-toc-page-section">'+Array.from({length:6},(_,i)=>`<div class="word-toc-entry" style="line-height:2">Título ${i}</div>`).join('')+'</div>';
    const measure=(canvas:HTMLElement)=>Array.from(canvas.querySelectorAll<HTMLElement>('.word-toc-entry')).reduce((sum,row)=>sum+parseFloat(row.style.lineHeight),0);
    const pages=paginateMeasuredToc(html,body,100,measure)!;
    expect(pages).toHaveLength(3);
    for(const html of pages){
      const root=document.createElement('div');root.innerHTML=html;
      expect(root.querySelectorAll('.word-toc-entry')).toHaveLength(2);
      expect(measure(root)).toBeLessThanOrEqual(100);
      expect(root.querySelector<HTMLElement>('.word-toc-entry')!.dataset['wordLineSpacing']).toBe('2');
    }
  });
  it('fills the usable page, measuring the header once and variable-height rows without filler paragraphs',()=>{
    const body=document.createElement('div');Object.defineProperty(body,'clientWidth',{value:624});Object.defineProperty(body,'clientHeight',{value:101});document.body.append(body);
    const html='<div class="word-toc-page-section"><div class="word-toc-header">Índice</div>'+Array.from({length:10},(_,i)=>`<div class="word-toc-entry" data-height="${i===2?40:20}">${i}</div>`).join('')+'</div><p><br></p>';
    const measure=(canvas:HTMLElement)=>Number(!!canvas.querySelector('.word-toc-header'))*20+Array.from(canvas.querySelectorAll<HTMLElement>('.word-toc-entry')).reduce((sum,row)=>sum+Number(row.dataset['height']),0);
    const pages=paginateMeasuredToc(html,body,101,measure)!;
    expect(pages).toHaveLength(3);
    const roots=pages.map(html=>{const root=document.createElement('div');root.innerHTML=html;return root;});
    expect(roots.map(root=>root.querySelectorAll('.word-toc-entry').length)).toEqual([3,5,2]);
    expect(roots.map(measure)).toEqual([100,100,40]);
    expect(roots.flatMap(root=>Array.from(root.querySelectorAll('p')))).toHaveLength(0);
    expect(roots.reduce((count,root)=>count+root.querySelectorAll('.word-toc-header').length,0)).toBe(1);
    expect(document.querySelector('.word-flow-measure')).toBeNull();
  });
});
