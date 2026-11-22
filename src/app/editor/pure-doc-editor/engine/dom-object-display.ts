import {PageDrawCommand} from './canvas-page-renderer';
const transparent=(color:string)=>!color||color==='transparent'||color==='rgba(0, 0, 0, 0)';
/** Transitional object adapter: preserves current table grid and merged-cell geometry. */
export function domObjectDisplay(body:HTMLElement,scale:number):{commands:PageDrawCommand[];assets:Map<string,CanvasImageSource>}|null {
  const origin=body.getBoundingClientRect(),commands:PageDrawCommand[]=[],borders:PageDrawCommand[]=[],assets=new Map<string,CanvasImageSource>();
  // Collapsed borders share an edge: painting both inside the cells doubles their width.
  // Mixed border conflict rules remain native until the Canvas adapter implements them.
  for(const table of Array.from(body.querySelectorAll('table'))) {
    if(getComputedStyle(table).borderCollapse!=='collapse')continue;
    const signatures=new Set<string>();
    for(const cell of Array.from(table.querySelectorAll('td,th'))) {
      if(cell.closest('table')!==table)continue;
      const style=getComputedStyle(cell);
      for(const side of ['Top','Right','Bottom','Left'] as const) {
        if(parseFloat(style[`border${side}Width`])>0&&style[`border${side}Style`]!=='none')signatures.add(`${style[`border${side}Width`]}:${style[`border${side}Style`]}:${style[`border${side}Color`]}`);
      }
    }
    if(signatures.size>1)return null;
  }
  for(const element of Array.from(body.querySelectorAll<HTMLElement>('*'))) {
    const style=getComputedStyle(element),rect=element.getBoundingClientRect();
    if(style.display==='none'||style.visibility==='hidden')continue;
    if(style.backgroundImage&&style.backgroundImage!=='none'||parseFloat(style.borderRadius)>0||style.filter&&style.filter!=='none')return null;
    if(style.opacity&&style.opacity!=='1'||style.transform&&style.transform!=='none'||style.boxShadow&&style.boxShadow!=='none')return null;
    const x=(rect.left-origin.left)/scale,y=(rect.top-origin.top)/scale,width=rect.width/scale,height=rect.height/scale;
    if(!transparent(style.backgroundColor))commands.push({kind:'rect',x,y,width,height,color:style.backgroundColor});
    for(const side of ['Top','Right','Bottom','Left'] as const) {
      const thickness=parseFloat(style[`border${side}Width`])||0;
      const borderStyle=style[`border${side}Style`];
      if(!thickness||borderStyle==='none'||borderStyle==='hidden')continue;
      if(borderStyle!=='solid')return null;
      const color=style[`border${side}Color`];
      const collapsed=['TD','TH'].includes(element.tagName)&&style.borderCollapse==='collapse';
      const inset=collapsed?thickness/2:thickness;
      borders.push({kind:'rect',x:x+(side==='Right'?width-inset:side==='Left'&&collapsed?-inset:0),y:y+(side==='Bottom'?height-inset:side==='Top'&&collapsed?-inset:0),
        width:side==='Left'||side==='Right'?thickness:width,height:side==='Top'||side==='Bottom'?thickness:height,color});
    }
    if(element instanceof HTMLImageElement) {
      if(!element.complete||!element.naturalWidth||!element.naturalHeight)return null;
      if(style.objectFit&&!['fill','contain'].includes(style.objectFit))return null;
      if(style.objectPosition&&style.objectPosition!=='50% 50%')return null;
      const left=(parseFloat(style.paddingLeft)||0)+(parseFloat(style.borderLeftWidth)||0);
      const top=(parseFloat(style.paddingTop)||0)+(parseFloat(style.borderTopWidth)||0);
      let w=width-left-(parseFloat(style.paddingRight)||0)-(parseFloat(style.borderRightWidth)||0);
      let h=height-top-(parseFloat(style.paddingBottom)||0)-(parseFloat(style.borderBottomWidth)||0);
      let dx=x+left,dy=y+top;
      if(style.objectFit==='contain') {
        const ratio=Math.min(w/element.naturalWidth,h/element.naturalHeight);
        const nw=element.naturalWidth*ratio,nh=element.naturalHeight*ratio;dx+=(w-nw)/2;dy+=(h-nh)/2;w=nw;h=nh;
      }
      const assetId=element.currentSrc||element.src;assets.set(assetId,element);
      if(w>0&&h>0)commands.push({kind:'image',assetId,x:dx,y:dy,width:w,height:h});
    }
  }
  return {commands:[...commands,...borders],assets};
}
