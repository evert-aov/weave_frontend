/** Copia el contexto tipográfico real sin altura fija, zoom ni posicionamiento absoluto de notas. */
export function createDocumentMeasurement(body: HTMLElement): HTMLDivElement {
  const canvas=document.createElement('div');
  canvas.className=body.className;
  canvas.classList.remove('word-hybrid-source');
  canvas.classList.add('word-editor-canvas','word-flow-measure');
  if(body.lang)canvas.lang=body.lang;
  const style=getComputedStyle(body);
  canvas.style.cssText=`position:fixed;left:-100000px;top:0;width:${body.clientWidth}px;height:auto;min-height:0;display:flow-root;visibility:hidden;pointer-events:none;flex:none;box-sizing:border-box;`;
  for(const property of ['font','font-family','font-size','font-weight','font-style','font-variant','font-stretch',
    'line-height','letter-spacing','word-spacing','white-space','text-indent','text-align','direction','hyphens','overflow-wrap','word-break','tab-size',
    'padding-top','padding-right','padding-bottom','padding-left']) {
    const value=style.getPropertyValue(property);if(value)canvas.style.setProperty(property,value);
  }
  // No data-page-body-id: las notas se miden en flujo antes de ubicarlas al pie de la página real.
  return canvas;
}
