import { points } from './docx-formatting';
import type { DocumentPage } from '../models/word-document.model';

/** Resuelve estilos del editor antes de desconectar el HTML de su hoja CSS (incluye !important). */
export function snapshotDocxPages(pages: DocumentPage[], bodies: HTMLElement[]): DocumentPage[] {
  const byId = new Map(bodies.map(body => [body.dataset['pageBodyId'], body]));
  const properties = ['font-family','font-size','font-weight','font-style','color','background-color','text-align','line-height',
    'margin-top','margin-bottom','margin-left','margin-right','padding-top','padding-bottom','padding-left','padding-right',
    'text-indent','text-transform','vertical-align'] as const;
  return pages.map(page => {
    const body = byId.get(page.id);
    if (!body || !body.isConnected) return page;
    const root = document.createElement('div'); root.innerHTML = page.html;
    const source = Array.from(body.querySelectorAll<HTMLElement>('*'));
    const cloned = Array.from(root.querySelectorAll<HTMLElement>('*'));
    // Durante una renderización pendiente se conserva el snapshot coherente del editor.
    if (source.length !== cloned.length || source.some((element, i) => element.tagName !== cloned[i].tagName)) return page;
    source.forEach((element, index) => {
      const style = getComputedStyle(element), target = cloned[index];
      const authored=Number(element.dataset['wordLineSpacing']) || Number(element.style.lineHeight);
      if(element.matches('p,li,h1,h2,h3,h4,h5,h6,blockquote,.word-toc-entry,.word-toc-header')
        && authored>0 && (!element.closest('td,th') || element.hasAttribute('data-word-line-spacing'))) target.dataset['wordLineSpacing']=String(authored);
      properties.forEach(property => { const value = style.getPropertyValue(property); if (value) target.style.setProperty(property, value); });
      if (Number(style.lineHeight) > 0 && points(style.fontSize)) target.style.lineHeight = `${Number(style.lineHeight) * points(style.fontSize) * 96 / 72}px`;
    });
    return { ...page, html: root.innerHTML };
  });
}
