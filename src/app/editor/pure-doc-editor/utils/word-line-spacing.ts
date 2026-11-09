const naturalHeights = new Map<string, number>();
const BLOCKS='p,h1,h2,h3,h4,h5,h6,li,blockquote,.word-toc-entry,.word-toc-header';
export function clearNaturalLineHeightCache(): void { naturalHeights.clear(); }

/** Word multiplica la altura natural de línea, no solamente el tamaño nominal de la fuente. */
export function naturalLineHeight(element: HTMLElement): number {
  const style=getComputedStyle(element);
  const key=[style.fontFamily,style.fontSize,style.fontWeight,style.fontStyle,style.fontStretch].join('|');
  const cached=naturalHeights.get(key);if(cached)return cached;
  const probe=document.createElement('div');
  probe.style.cssText='position:fixed;left:-100000px;top:0;visibility:hidden;display:block;width:max-content;height:auto;margin:0;padding:0;border:0;white-space:pre;line-height:normal;';
  for(const property of ['font-family','font-size','font-weight','font-style','font-stretch']) probe.style.setProperty(property,style.getPropertyValue(property));
  probe.textContent='M\nM';document.body.append(probe);
  const height=probe.getBoundingClientRect().height/2;probe.remove();
  if(height>0){if(naturalHeights.size>256)naturalHeights.clear();naturalHeights.set(key,height);}
  return height;
}

/** El atributo guarda la intención nativa; los píxeles son solo la representación del navegador. */
export function materializeWordLineSpacing(root: HTMLElement): boolean {
  let changed=false;
  const updates: {element: HTMLElement; multiple: number; line: string | null; inCell: boolean}[] = [];
  // Read every computed font before changing any paragraph. Interleaving reads
  // and writes forces a full document layout for each block in a large file.
  for(const element of Array.from(root.querySelectorAll<HTMLElement>(BLOCKS))) {
    const explicit=Number(element.style.lineHeight);
    const marked=Number(element.dataset['wordLineSpacing']);
    const inCell=!!element.closest('td,th');
    if(inCell&&!marked)continue; // Las tablas mantienen su espaciado compacto salvo orden explícita.
    const multiple=explicit>0 ? explicit : marked>0 ? marked
      : !element.style.lineHeight && root.classList.contains('word-apa-body') ? 2 : 0;
    if(!multiple || multiple>10)continue;
    const normal=naturalLineHeight(element);
    updates.push({element,multiple,inCell,line:normal>0?`${Math.round(normal*multiple*1000)/1000}px`:null});
  }
  for (const {element,multiple,line,inCell} of updates) {
    if(element.dataset['wordLineSpacing']!==String(multiple)){element.dataset['wordLineSpacing']=String(multiple);changed=true;}
    if(line && element.style.lineHeight!==line){element.style.setProperty('line-height',line,inCell?'important':'');changed=true;}
  }
  return changed;
}
