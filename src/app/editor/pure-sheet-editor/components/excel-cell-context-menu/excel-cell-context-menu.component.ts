import {AfterViewInit,Component,ElementRef,EventEmitter,HostListener,Input,Output,inject} from '@angular/core';
import {I18nService} from '../../../../core/services/i18n.service';
export type CellInsertAction='rowAbove'|'rowBelow'|'columnLeft'|'columnRight'|'commentEdit'|'commentDelete'|'hideRow'|'unhideRows'|'hideCol'|'unhideCols'|'hyperlinkEdit'|'hyperlinkOpen'|'hyperlinkRemove';
@Component({selector:'app-excel-cell-context-menu',standalone:true,
 template:`<div class="cell-menu-backdrop" (pointerdown)="dismiss.emit()" (contextmenu)="$event.preventDefault();dismiss.emit()"></div>
 <div class="cell-menu" role="menu" [class.dark]="dark" [style.left.px]="left" [style.top.px]="top" (keydown)="keyDown($event)">
 @for(item of items;track item.action){<button type="button" role="menuitem" (click)="choose(item.action)">{{i18n.t(item.key)}}</button>}
 <hr class="my-1 border-slate-200 dark:border-zinc-700" />
 <button type="button" role="menuitem" data-testid="ctx-hide-row" (click)="choose('hideRow')">{{ i18n.currentLang() === 'es' ? 'Ocultar fila' : 'Hide row' }}</button>
 <button type="button" role="menuitem" data-testid="ctx-hide-col" (click)="choose('hideCol')">{{ i18n.currentLang() === 'es' ? 'Ocultar columna' : 'Hide column' }}</button>
 @if(hasHiddenRows){<button type="button" role="menuitem" data-testid="ctx-unhide-rows" (click)="choose('unhideRows')">{{ i18n.currentLang() === 'es' ? 'Mostrar filas ocultas' : 'Unhide rows' }}</button>}
 @if(hasHiddenCols){<button type="button" role="menuitem" data-testid="ctx-unhide-cols" (click)="choose('unhideCols')">{{ i18n.currentLang() === 'es' ? 'Mostrar columnas ocultas' : 'Unhide columns' }}</button>}
 <hr class="my-1 border-slate-200 dark:border-zinc-700" />
 <button type="button" role="menuitem" data-testid="ctx-comment-edit" (click)="choose('commentEdit')">{{ hasComment ? (i18n.currentLang() === 'es' ? 'Editar nota' : 'Edit note') : (i18n.currentLang() === 'es' ? 'Insertar nota' : 'Insert note') }}</button>
 @if(hasComment){<button type="button" role="menuitem" data-testid="ctx-comment-delete" (click)="choose('commentDelete')">{{ i18n.currentLang() === 'es' ? 'Eliminar nota' : 'Delete note' }}</button>}
 <button type="button" role="menuitem" data-testid="ctx-hyperlink-edit" (click)="choose('hyperlinkEdit')">{{ hasHyperlink ? (i18n.currentLang() === 'es' ? 'Editar hipervínculo' : 'Edit hyperlink') : (i18n.currentLang() === 'es' ? 'Insertar hipervínculo' : 'Insert hyperlink') }}</button>
 @if(hasHyperlink){
   <button type="button" role="menuitem" data-testid="ctx-hyperlink-open" (click)="choose('hyperlinkOpen')">{{ i18n.currentLang() === 'es' ? 'Abrir hipervínculo' : 'Open hyperlink' }}</button>
   <button type="button" role="menuitem" data-testid="ctx-hyperlink-remove" (click)="choose('hyperlinkRemove')">{{ i18n.currentLang() === 'es' ? 'Quitar hipervínculo' : 'Remove hyperlink' }}</button>
 }
 </div>`,
 styles:[`.cell-menu-backdrop{position:fixed;inset:0;z-index:1000}.cell-menu{position:fixed;z-index:1001;min-width:220px;max-width:calc(100vw - 16px);padding:5px;border:1px solid #cbd5e1;border-radius:8px;background:#fff;color:#0f172a;box-shadow:0 8px 25px #0003}.cell-menu button{display:block;width:100%;padding:9px 12px;border:0;border-radius:4px;background:transparent;text-align:left;font-size:13px;cursor:pointer}.cell-menu button:hover,.cell-menu button:focus-visible{background:#dbeafe;outline:none}.cell-menu.dark{background:#18181b;color:#f4f4f5;border-color:#3f3f46}.cell-menu.dark button:hover,.cell-menu.dark button:focus-visible{background:#27272a}`]})
export class ExcelCellContextMenuComponent implements AfterViewInit {
 @Input() x=0;@Input() y=0;@Input() dark=false;@Input() hasComment=false;@Input() hasHyperlink=false;@Input() hasHiddenRows=false;@Input() hasHiddenCols=false;
 @Output() action=new EventEmitter<CellInsertAction>();@Output() dismiss=new EventEmitter<void>();
 readonly i18n=inject(I18nService);private element=inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
 readonly items:{action:CellInsertAction;key:string}[]=[{action:'rowAbove',key:'excel.context.row_above'},{action:'rowBelow',key:'excel.context.row_below'},{action:'columnLeft',key:'excel.context.column_left'},{action:'columnRight',key:'excel.context.column_right'}];
 get left():number{return Math.max(8,Math.min(this.x,window.innerWidth-240));}
 get top():number{return Math.max(8,Math.min(this.y,window.innerHeight-180));}
 ngAfterViewInit():void {this.element.querySelector('button')?.focus({preventScroll:true});}
 choose(action:CellInsertAction):void{this.action.emit(action);}
 @HostListener('window:resize') closeOnResize():void{this.dismiss.emit();}
 keyDown(event:KeyboardEvent):void{
  event.stopPropagation();if(event.key==='Escape'||event.key==='Tab'){if(event.key==='Escape')event.preventDefault();this.dismiss.emit();return;}
  const buttons=Array.from(this.element.querySelectorAll('button')),index=buttons.indexOf(document.activeElement as HTMLButtonElement);
  let next:number|undefined;
  if(event.key==='ArrowDown')next=(index+1)%buttons.length;if(event.key==='ArrowUp')next=(index+buttons.length-1)%buttons.length;
  if(event.key==='Home')next=0;if(event.key==='End')next=buttons.length-1;
  if(next!==undefined){event.preventDefault();buttons[next]?.focus();}
 }
}
