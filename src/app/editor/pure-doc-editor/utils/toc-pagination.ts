import { materializeWordLineSpacing } from './word-line-spacing';
import { createDocumentMeasurement } from './document-measurement';
/** Distribuye filas según su altura real, sin el zoom del viewport ni reservas duplicadas. */
export function paginateMeasuredToc(html: string, body: HTMLElement | undefined, maxHeight: number,
  measure?: (canvas: HTMLElement) => number): string[] | null {
  if (!body || body.clientWidth < 200) return null;
  const root=document.createElement('div');root.innerHTML=html;
  const original=root.querySelector<HTMLElement>('.word-toc-page-section');
  if (!original) return null;
  const rows=Array.from(original.querySelectorAll<HTMLElement>(':scope > .word-toc-entry'));
  if (!rows.length) return [original.outerHTML];
  const canvas=createDocumentMeasurement(body);
  document.body.append(canvas);
  const limit=maxHeight+0.5;
  const height=measure || ((element:HTMLElement)=>Math.max(element.scrollHeight,element.getBoundingClientRect().height));
  const pages:string[]=[];
  let section=original.cloneNode(false) as HTMLElement;
  const header=original.querySelector(':scope > .word-toc-header');if(header)section.append(header.cloneNode(true));
  canvas.append(section);
  // Resolve the same physical double spacing used by the live page before
  // measuring any row. Resolving only the header underestimates every entry.
  section.append(...rows);
  materializeWordLineSpacing(canvas);
  rows.forEach(row => row.remove());
  try {
    for(const row of rows) {
      section.append(row);
      // Una fila indivisible que supera la página no debe crear páginas vacías ni bucles.
      if(height(canvas)>limit && section.querySelectorAll(':scope > .word-toc-entry').length>1) {
        row.remove();pages.push(section.outerHTML);
        section=original.cloneNode(false) as HTMLElement;canvas.replaceChildren(section);section.append(row);
      }
    }
    pages.push(section.outerHTML);return pages;
  } finally {canvas.remove();}
}
