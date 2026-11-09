/** Mantiene fuente y ritmo del índice importado al reconstruir sus entradas desde H1–H6. */
export function preserveTocTypography(html: string, source: string): string {
  const previous=document.createElement('div');previous.innerHTML=source;
  const sample=previous.querySelector<HTMLElement>('.word-toc-entry');
  if (!sample) return html;
  const root=document.createElement('div');root.innerHTML=html;
  root.querySelectorAll<HTMLElement>('.word-toc-entry,.word-toc-header').forEach(element=>{
    for (const property of ['font-family','font-size','line-height']) {
      const value=sample.style.getPropertyValue(property);if(value)element.style.setProperty(property,value);
    }
    if (element.classList.contains('word-toc-header')) {
      element.textContent=previous.querySelector('.word-toc-header')?.textContent || 'Índice de contenido';
      element.style.textTransform='none';
    }
  });
  return root.innerHTML;
}

export function tocRowHeight(source: string): number {
  const root=document.createElement('div');root.innerHTML=source;
  const style=root.querySelector<HTMLElement>('.word-toc-entry')?.style;
  if (!style) return 30;
  const px=(value:string)=>{const number=parseFloat(value)||0;return value.endsWith('pt') ? number*96/72 : number;};
  const font=px(style.fontSize)||14.67;
  const line=Number(style.lineHeight)>0 ? Number(style.lineHeight)*font : px(style.lineHeight)||font*1.3;
  return Math.max(30,line+px(style.marginTop)+px(style.marginBottom)+2);
}
