import { htmlToDocumentState } from '../engine/document-model-dom';
import type { DocumentNode } from '../engine/document-model';
import type { TableStyleRule } from '../models/word-document.model';
import { styleModelTable } from './table-styling';

/** Adapter for legacy/header DOM surfaces; shared design rules live in the model. */
export function styleTableElement(table: HTMLTableElement, rule: TableStyleRule, binding: 'template' | 'fixed' = 'template'): void {
  const model = htmlToDocumentState(table.outerHTML).roots[0];
  if (model?.kind !== 'element') return;
  const patch = (element: Element, node: DocumentNode): void => {
    if (node.kind !== 'element') return;
    for (const attr of Array.from(element.attributes)) if (!(attr.name in node.attributes)) element.removeAttribute(attr.name);
    for (const [key, value] of Object.entries(node.attributes)) element.setAttribute(key, value);
    Array.from(element.childNodes).forEach((child, index) => { if (child instanceof Element && node.children[index]) patch(child, node.children[index]); });
  };
  patch(table, styleModelTable(model, rule, binding));
}
