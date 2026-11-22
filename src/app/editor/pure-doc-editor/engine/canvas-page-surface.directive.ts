import {Directive,ElementRef,Input,OnChanges,OnDestroy,inject,output} from '@angular/core';
import {CanvasPageRenderer,PageDisplayList} from './canvas-page-renderer';
/** A mounted viewport slot owns one buffer, disposed when the slot leaves the viewport. */
@Directive({selector:'canvas[wordCanvasSurface]',standalone:true})
export class CanvasPageSurfaceDirective implements OnChanges,OnDestroy {
 @Input({required:true}) wordCanvasSurface!:PageDisplayList;
 @Input() canvasZoom=1;
 readonly renderError=output<unknown>();
 private canvas=inject<ElementRef<HTMLCanvasElement>>(ElementRef).nativeElement;
 private renderer=new CanvasPageRenderer();
 ngOnChanges():void {
  if(!this.wordCanvasSurface)return;
  try {
    this.renderer.render(this.canvas,this.wordCanvasSurface,this.canvasZoom,Math.min(2,window.devicePixelRatio||1));
  } catch (error) {
    console.error('[CanvasPageSurfaceDirective] render failed:', error);
    this.renderError.emit(error);
  }
 }
 ngOnDestroy():void {this.canvas.width=0;this.canvas.height=0;}
}
