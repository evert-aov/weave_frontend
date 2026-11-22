import type { DocumentLayoutConfig, DocumentViewMode, StyleTemplate } from '../../models/word-document.model';
import type { SerializedDocSectionModel } from '../../models/word-editor-state.model';
import {AfterViewInit,ChangeDetectionStrategy,ChangeDetectorRef,Component,ElementRef,OnDestroy,computed,effect,inject,input,linkedSignal,output,signal,untracked,viewChild} from '@angular/core';
import {CanvasAccessibleBlock,CanvasEditSession,CanvasImageHit,CanvasLatexFormulaHit,CanvasTableBorderHit,CanvasTocEntryHit} from '../../engine/canvas-edit-session';
import {CanvasPerfReport} from '../../engine/canvas-perf';
import {CanvasPageSurfaceDirective} from '../../engine/canvas-page-surface.directive';
import {PageDecoration,PageDisplayList,RegionRichLine} from '../../engine/canvas-page-renderer';
import {attachCanvasPdfNavigation} from '../../engine/canvas-pdf-links';
import {RegionEditState,applyRegionRunColor,createRegionEditState,deleteRegion,insertRegionText,moveRegionCaret,parseRegionHtmlToLines,regionLinesPlainText,selectAllRegion,serializeRegionLinesToHtml,setRegionAlignment,splitRegionLine,toggleRegionStyle} from '../../engine/canvas-region-model';
import {PageGeometry} from '../../engine/document-layout';
import {DocumentSelection} from '../../engine/document-model';
import {ResolvedLayoutStyle} from '../../engine/model-layout';
import {DocumentPage} from '../../models/word-document.model';
import {caretForPosition} from '../../engine/canvas-caret';
import {clipboardTableHtml} from '../../../../shared/utils/clipboard-table';
import {hasRichClipboardFormatting,sanitizeClipboardHtml} from '../../../../shared/utils/clipboard-rich-html';
import {ProofreadingService} from '../../../../core/services/proofreading.service';
import {resolveDocumentPageSections, type ResolvedPageSectionInfo} from '../../utils/page-section-layout';
import {stripCommentMarkersFromNodes} from '../../utils/document-review';
import {DocumentCanvasEngine} from '../../engine/document-engine';

@Component({selector:'app-word-canvas-editor',standalone:true,changeDetection:ChangeDetectionStrategy.OnPush,imports:[CanvasPageSurfaceDirective],
 template:`<div class="canvas-document-space" [style.height.px]="totalHeight()" [style.width.px]="spaceWidth()">
 @for (slot of visiblePages(); track slot.page.id) {
  <canvas class="word-page-sheet canvas-document-page" [class.canvas-continuous-sheet]="viewMode() === 'web' || viewMode() === 'draft'" [attr.data-canvas-page]="slot.page.id" [attr.data-canvas-index]="slot.index"
   [style.top.px]="slot.top" [style.left.px]="slot.left" [wordCanvasSurface]="slot.page" [canvasZoom]="scale()"
   (pointerdown)="pointerDown($event,slot.page)" (pointermove)="pointerMove($event,slot.page)" (pointerup)="pointerUp()"
   (contextmenu)="onCanvasContextMenu($event,slot.page)"
   (dragover)="onCanvasDragOver($event)" (drop)="onCanvasDrop($event,slot.index)"
   aria-hidden="true"></canvas>
  @if (pages().length > 1 && !readOnly()) {
   <div class="canvas-page-badge"
        [style.top.px]="slot.top + 8"
        [style.left.px]="slot.left + (slot.page.width * scale()) - 108">
    <span class="page-badge-text">{{ slot.badge }}</span>
    <button type="button" class="page-badge-del" (click)="deletePage.emit(slot.index)" [title]="'Eliminar página ' + (slot.index + 1)">
     <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/>
     </svg>
    </button>
   </div>
  }
 }
 @if (selectedImage(); as img) {
  <div class="canvas-image-selection-box"
       [style.top.px]="pageTopFor(img.pageIndex) + img.y * scale()"
       [style.left.px]="pageLeftFor(img.pageIndex) + img.x * scale()"
       [style.width.px]="img.width * scale()"
       [style.height.px]="img.height * scale()">
   @if (!readOnly()) {
    <div class="canvas-img-toolbar" role="toolbar" aria-label="Opciones de imagen">
     <button type="button" class="canvas-img-tool-btn" (pointerdown)="$event.stopPropagation()" (click)="alignSelectedImage('left')" title="Alinear a la izquierda">Izq</button>
     <button type="button" class="canvas-img-tool-btn" (pointerdown)="$event.stopPropagation()" (click)="alignSelectedImage('center')" title="Centrar imagen">Cen</button>
     <button type="button" class="canvas-img-tool-btn" (pointerdown)="$event.stopPropagation()" (click)="alignSelectedImage('right')" title="Alinear a la derecha">Der</button>
     <button type="button" class="canvas-img-tool-btn canvas-img-tool-accent" (pointerdown)="$event.stopPropagation()" (click)="addCaptionToSelectedImage()" title="Agregar pie de figura">+ Pie</button>
    </div>
    <button type="button" class="canvas-img-del-btn" (click)="deleteSelectedImage()" [title]="'Eliminar imagen'">
     <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
     </svg>
    </button>
    <div class="canvas-img-resize-handle" (pointerdown)="startImageResize($event, img)" [title]="'Arrastrar para cambiar tamaño'"></div>
   }
  </div>
 }
 @if (tableResizeGuide(); as guide) {
  <div class="canvas-table-resize-guide"
       [class.canvas-table-resize-guide-col]="guide.type === 'col'"
       [class.canvas-table-resize-guide-row]="guide.type === 'row'"
       [style.top.px]="guide.top"
       [style.left.px]="guide.left"
       [style.width.px]="guide.width"
       [style.height.px]="guide.height"></div>
 }
 @if (editingRegion(); as region) {
  <div #regionContainer class="canvas-region-editor canvas-region-toolbar-only"
       [style.top.px]="regionToolbarTopPx(region)"
       [style.left.px]="pageLeftFor(region.pageIndex) + effectiveGeometry().left * scale()">
   <div class="canvas-region-bar">
    <span class="canvas-region-label">{{ region.zone === 'header' ? 'Encabezado' : 'Pie de página' }}</span>
    <div class="canvas-region-tools" role="toolbar" aria-label="Formato de encabezado y pie">
     <button type="button" class="canvas-region-btn" [class.canvas-region-btn-active]="region.activeStyle.bold" title="Negrita" (mousedown)="$event.preventDefault()" (click)="formatRegion('bold')"><strong>B</strong></button>
     <button type="button" class="canvas-region-btn" [class.canvas-region-btn-active]="region.activeStyle.italic" title="Cursiva" (mousedown)="$event.preventDefault()" (click)="formatRegion('italic')"><em>I</em></button>
     <button type="button" class="canvas-region-btn" [class.canvas-region-btn-active]="region.activeStyle.underline" title="Subrayado" (mousedown)="$event.preventDefault()" (click)="formatRegion('underline')"><u>U</u></button>
     <span class="canvas-region-sep" aria-hidden="true"></span>
     <button type="button" class="canvas-region-btn" title="Alinear a la izquierda" (mousedown)="$event.preventDefault()" (click)="formatRegion('justifyLeft')">Izq</button>
     <button type="button" class="canvas-region-btn" title="Centrar" (mousedown)="$event.preventDefault()" (click)="formatRegion('justifyCenter')">Cen</button>
     <button type="button" class="canvas-region-btn" title="Alinear a la derecha" (mousedown)="$event.preventDefault()" (click)="formatRegion('justifyRight')">Der</button>
     <span class="canvas-region-sep" aria-hidden="true"></span>
     <button type="button" class="canvas-region-btn" title="Insertar número de página actual" (mousedown)="$event.preventDefault()" (click)="insertRegionField('page')"># Pág</button>
     <button type="button" class="canvas-region-btn" title="Insertar total de páginas" (mousedown)="$event.preventDefault()" (click)="insertRegionField('totalPages')">Total</button>
     <button type="button" class="canvas-region-btn" [class.canvas-region-btn-active]="isRegionFirstPageDifferent(region.pageIndex)" title="Primera página diferente en esta sección" (mousedown)="$event.preventDefault()" (click)="toggleRegionDifferentFirstPage(region.pageIndex)">1ª dif.</button>
     <input type="color" class="canvas-region-color" title="Color de texto" aria-label="Color de texto"
            [value]="region.activeStyle.color" (mousedown)="$event.stopPropagation()" (input)="applyRegionColor($any($event.target).value)" />
     <button type="button" class="canvas-region-btn canvas-region-done" title="Aplicar" (mousedown)="$event.preventDefault()" (click)="commitRegionEdit()">OK</button>
     <button type="button" class="canvas-region-btn" title="Cancelar" (mousedown)="$event.preventDefault()" (click)="cancelRegionEdit()">Esc</button>
    </div>
   </div>
  </div>
 }
 <div class="canvas-a11y-tree" role="document" [attr.aria-label]="inputLabel()" [attr.aria-readonly]="readOnly()">
  @for (blk of accessibleBlocks(); track blk.id) {
   @if (blk.level) {
    <div role="heading" [attr.aria-level]="blk.level" [id]="'canvas-a11y-' + blk.id">{{ blk.text }}</div>
   } @else if (blk.checked !== undefined) {
    <div role="checkbox" [attr.aria-checked]="blk.checked" [id]="'canvas-a11y-' + blk.id">{{ blk.text }}</div>
   } @else if (blk.tag === 'li') {
    <div role="listitem" [id]="'canvas-a11y-' + blk.id">{{ blk.text }}</div>
   } @else if (blk.tag === 'table') {
    <div role="table" [attr.aria-label]="blk.text" [id]="'canvas-a11y-' + blk.id">
     @for (row of blk.rows || []; track $index) {
      <div role="row">
       @for (cell of row.cells; track cell.id) {
        <div [attr.role]="cell.isHeader ? 'columnheader' : 'cell'" [id]="'canvas-a11y-' + cell.id">{{ cell.text }}</div>
       }
      </div>
     }
    </div>
   } @else {
    <p [id]="'canvas-a11y-' + blk.id">{{ blk.text }}</p>
   }
  }
 </div>
 <div class="canvas-a11y-tree" aria-live="polite" aria-atomic="true">{{ a11yAnnouncement() }}</div>
 <textarea #proxy class="canvas-input-proxy" [attr.aria-label]="inputLabel()" [attr.aria-multiline]="true" [attr.aria-readonly]="readOnly()" [attr.aria-activedescendant]="activeA11yBlockId()" [attr.lang]="writing.language() || language()" [attr.autocorrect]="writing.enabled() ? 'on' : 'off'" spellcheck="false"
  [readOnly]="readOnly()" [style.top.px]="proxyTop()" [style.left.px]="proxyLeft()"
  (focus)="onProxyFocus()"
  (beforeinput)="beforeInput($event)" (input)="proxyInput()" (keydown)="keyDown($event)"
  (compositionstart)="composing=true" (compositionend)="compositionEnd($event)"
  (copy)="copy($event,false)" (cut)="copy($event,true)" (paste)="paste($event)"></textarea>
 </div>`,
 styles:[`:host{display:block;flex-shrink:0;position:relative}.canvas-document-space{position:relative}.canvas-document-page{position:absolute;left:0;background:white;box-shadow:0 3px 10px #0002;touch-action:pan-y;cursor:text}.canvas-continuous-sheet{box-shadow:none;border-bottom:1px dashed #cbd5e1}.canvas-a11y-tree{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}.canvas-input-proxy{position:absolute;width:2px;height:20px;opacity:.01;border:0;padding:0;resize:none;overflow:hidden;z-index:2}.canvas-page-badge{position:absolute;z-index:3;display:inline-flex;align-items:center;gap:4px;padding:2px 6px;background:rgba(255,255,255,0.9);backdrop-filter:blur(4px);border:1px solid #cbd5e1;border-radius:4px;box-shadow:0 1px 3px rgba(0,0,0,0.08);opacity:0;transition:opacity .15s ease}.canvas-document-space:hover .canvas-page-badge,.canvas-page-badge:hover{opacity:1}.page-badge-text{font-size:10px;font-family:monospace;color:#64748b;user-select:none}.page-badge-del{display:inline-flex;align-items:center;justify-content:center;padding:2px;border:none;background:transparent;color:#94a3b8;border-radius:3px;cursor:pointer;transition:color .15s,background-color .15s}.page-badge-del:hover{color:#dc2626;background-color:#fee2e2}.canvas-image-selection-box{position:absolute;z-index:10;border:2px solid #2563eb;box-sizing:border-box;pointer-events:none}.canvas-img-toolbar{position:absolute;top:-26px;left:-2px;display:inline-flex;align-items:center;gap:2px;padding:2px 4px;background:rgba(255,255,255,0.97);border:1px solid #93c5fd;border-radius:4px;box-shadow:0 2px 6px rgba(15,23,42,0.14);pointer-events:auto;white-space:nowrap}.canvas-img-tool-btn{border:1px solid #cbd5e1;background:#fff;color:#334155;font-size:10px;line-height:1;padding:2px 5px;border-radius:3px;cursor:pointer}.canvas-img-tool-btn:hover{background:#eff6ff;border-color:#93c5fd;color:#1d4ed8}.canvas-img-tool-accent{color:#1d4ed8;border-color:#bfdbfe;background:#eff6ff}.canvas-img-del-btn{position:absolute;top:-12px;right:-12px;width:22px;height:22px;background:#fff;border:1px solid #93c5fd;color:#1e40af;border-radius:4px;display:flex;align-items:center;justify-content:center;cursor:pointer;pointer-events:auto;box-shadow:0 1px 3px rgba(0,0,0,0.15);transition:background-color .15s,color .15s}.canvas-img-del-btn:hover{background:#fee2e2;color:#dc2626;border-color:#fca5a5}.canvas-img-resize-handle{position:absolute;bottom:-6px;right:-6px;width:12px;height:12px;background:#fff;border:2px solid #2563eb;border-radius:2px;cursor:nwse-resize;pointer-events:auto;touch-action:none;box-shadow:0 1px 2px rgba(0,0,0,0.2)}.canvas-table-resize-guide{position:absolute;z-index:25;pointer-events:none;background:#2563eb}.canvas-table-resize-guide-col{box-shadow:0 0 4px rgba(37,99,235,0.6)}.canvas-table-resize-guide-row{box-shadow:0 0 4px rgba(37,99,235,0.6)}.canvas-region-editor{position:absolute;z-index:20;display:flex;flex-direction:column;gap:4px;background:rgba(255,255,255,0.97);border:1px solid #bfdbfe;border-radius:6px;padding:3px 6px;box-shadow:0 2px 8px rgba(15,23,42,0.14)}.canvas-region-bar{display:flex;align-items:center;justify-content:space-between;gap:6px;flex-wrap:wrap}.canvas-region-label{font-size:9px;font-weight:600;text-transform:uppercase;letter-spacing:0.04em;color:#2563eb}.canvas-region-tools{display:inline-flex;align-items:center;gap:2px}.canvas-region-btn{min-width:22px;height:20px;padding:0 5px;border:1px solid #cbd5e1;border-radius:3px;background:#fff;color:#334155;font-size:10px;line-height:1;cursor:pointer}.canvas-region-btn:hover{background:#eff6ff;border-color:#93c5fd;color:#1d4ed8}.canvas-region-btn-active{background:#dbeafe;border-color:#3b82f6;color:#1d4ed8}.canvas-region-done{background:#2563eb;border-color:#2563eb;color:#fff;font-weight:600}.canvas-region-done:hover{background:#1d4ed8;color:#fff}.canvas-region-sep{width:1px;height:14px;background:#e2e8f0;margin:0 2px}.canvas-region-color{width:20px;height:20px;padding:0;border:1px solid #cbd5e1;border-radius:3px;background:#fff;cursor:pointer}`]})
export class WordCanvasEditorComponent implements AfterViewInit,OnDestroy {
 readonly pages=input.required<DocumentPage[]>();
 readonly geometry=input.required<PageGeometry>();
 readonly defaults=input<Partial<ResolvedLayoutStyle>>({});
 readonly scale=input(1);
 readonly readOnly=input(false);
 readonly headingNumbering=input(false);
 readonly styleTemplate=input<StyleTemplate|undefined>(undefined);
 readonly enabled=input(true);
 readonly language=input('es');
 readonly inputLabel=input('Área de edición');
 readonly pageLabel=input('Página');
 readonly ofLabel=input('de');
 readonly layoutConfig=input<DocumentLayoutConfig|undefined>(undefined);
 readonly viewMode=input<DocumentViewMode>('print');
 readonly modelSections=input<SerializedDocSectionModel[]|undefined>(undefined);
 readonly darkSheet=input(false);
 readonly trackChangesEnabled=input(false);
 readonly hideComments=input(false);
 readonly changed=output<DocumentPage[]>();
 readonly checkpoint=output<void>();
 readonly history=output<boolean>();
 readonly activePage=output<number>();
 readonly selectionChange=output<void>();
 readonly tocNavigate=output<CanvasTocEntryHit>();
 readonly latexEdit=output<CanvasLatexFormulaHit>();
 readonly linkClick=output<string>();
 readonly deletePage=output<number>();
 readonly imageDrop=output<{file:File;pageIndex:number}>();
 readonly tableContextMenu=output<{clientX:number;clientY:number;pageIndex:number}>();
 readonly headerFooterChange=output<{headerHtml?:string;footerHtml?:string;differentFirstPage?:boolean;pageIndex?:number}>();
 readonly proxy=viewChild<ElementRef<HTMLTextAreaElement>>('proxy');
 readonly regionContainer=viewChild<ElementRef<HTMLElement>>('regionContainer');
 session?:CanvasEditSession;
 readonly visiblePages=signal<{page:PageDisplayList;index:number;top:number;left:number;badge:string}[]>([]);
 readonly accessibleBlocks=signal<CanvasAccessibleBlock[]>([]);
 readonly activeA11yBlockId=signal<string|null>(null);
 readonly a11yAnnouncement=signal('');
 readonly totalHeight=signal(0);
 readonly spaceWidth=signal(0);
 readonly proxyTop=signal(0);
 readonly proxyLeft=signal(0);
 dragging=false;composing=false;
 readonly selectedImage=signal<CanvasImageHit|null>(null);
 isResizingImage=false;
 isResizingTable=false;
 readonly tableResizeGuide=signal<{type:'col'|'row';top:number;left:number;width:number;height:number}|null>(null);
 readonly editingRegion=signal<RegionEditState|null>(null);
 protected readonly Math=Math;
 private readonly effectiveGeometry=linkedSignal(()=>this.geometry());
 private readonly effectiveDefaults=linkedSignal(()=>this.defaults());
 private readonly effectiveHeadingNumbering=linkedSignal(()=>this.headingNumbering());
 private readonly effectiveStyleTemplate=linkedSignal(()=>this.styleTemplate());
 readonly stride=computed(()=>this.effectiveGeometry().height*this.scale()+(this.viewMode()==='web'||this.viewMode()==='draft'?4:32));
 private host=inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
 readonly writing=inject(ProofreadingService);
 private cdr=inject(ChangeDetectorRef);
 private viewport?:HTMLElement;private observer?:ResizeObserver;
 private published?:DocumentPage[];private frame:number|null=null;private selectionEmitFrame:number|null=null;private publishTimer:ReturnType<typeof setTimeout>|null=null;private config='';
 private assets=new Map<string,HTMLImageElement>();private disposed=false;
 private lastA11ySelection:DocumentSelection|null|undefined=undefined;
 private lastA11ySection=-1;
 private regionParseCache=new Map<string,{lines:RegionRichLine[];text:string}>();
 private lastClickAt=0;private lastClickX=0;private lastClickY=0;private clickStreak=0;
 private dragCleanup:(() => void)|null=null;
 private readonly scroll=()=>{if(this.frame!==null)return;this.frame=requestAnimationFrame(()=>{this.frame=null;this.refresh();});};
 constructor() {
  effect(()=>{
   const pages=this.pages();
   const geometry=this.effectiveGeometry();
   const defaults=this.effectiveDefaults();
   this.enabled();
   this.headingNumbering();
   this.styleTemplate();
   this.scale();
   this.layoutConfig();
   this.viewMode();
   this.darkSheet();
   this.trackChangesEnabled();
   this.pageLabel();
   this.ofLabel();
   const modelSections=this.modelSections();
   if(!geometry||!pages.length)return;
   untracked(()=>{
    try {
     const config=JSON.stringify([geometry,defaults]);
     if(!this.session||pages!==this.published){
      const candidate=new CanvasEditSession(geometry,defaults);candidate.load(pages,modelSections);candidate.trackChangesEnabled=this.trackChangesEnabled();candidate.onCheckpoint=()=>this.checkpoint.emit();this.session=candidate;
      this.config=config;queueMicrotask(()=>{if(!this.disposed)this.publish();});
     } else {
      this.session.trackChangesEnabled=this.trackChangesEnabled();
      if(config!==this.config){this.session.engine.reconfigure(geometry,defaults);this.session.geometry=geometry;this.config=config;this.publish();}
     }
     this.refresh();
    } catch { /* Canvas remains primary surface */ }
   });
  });
 }
 ngAfterViewInit():void {
  this.viewport=this.host.closest('[data-document-scroll]') as HTMLElement;
  this.viewport?.addEventListener('scroll',this.scroll,{passive:true});
  if(typeof ResizeObserver!=='undefined'){this.observer=new ResizeObserver(this.scroll);this.observer.observe(this.viewport||this.host);}
  this.scroll();
 }
 publishNow(geometry?:PageGeometry,defaults?:Partial<ResolvedLayoutStyle>,styleTemplate?:StyleTemplate,headingNumbering?:boolean):void {
  if(geometry)this.effectiveGeometry.set(geometry);
  if(defaults)this.effectiveDefaults.set(defaults);
  if(styleTemplate!==undefined)this.effectiveStyleTemplate.set(styleTemplate);
  if(headingNumbering!==undefined)this.effectiveHeadingNumbering.set(headingNumbering);
  if(geometry&&defaults)this.config=JSON.stringify([geometry,defaults]);
  this.publish();this.selectionChange.emit();if(this.session?.selection)this.focus();this.cdr.detectChanges();
 }
 focus():void {
  this.proxy()?.nativeElement.focus({preventScroll:true});
 }
 private publish():void {if(this.publishTimer){clearTimeout(this.publishTimer);this.publishTimer=null;}if(!this.session)return;this.session.renumberHeadings(this.effectiveHeadingNumbering());this.session.normalizeApaChapterHeadings(this.effectiveStyleTemplate());this.published=this.session.pages;this.changed.emit(this.published);this.refresh();}
 private schedulePublish():void {
  const secPages=this.session?.engine.getSections()[this.session.section]?.displayLists.length??0;
  if(secPages<=3){this.publish();return;}
  if(this.publishTimer)clearTimeout(this.publishTimer);
  this.publishTimer=setTimeout(()=>{this.publishTimer=null;if(!this.disposed&&this.session){this.session.renumberHeadings(this.effectiveHeadingNumbering());this.session.normalizeApaChapterHeadings(this.effectiveStyleTemplate());this.published=this.session.pages;this.changed.emit(this.published);}},80);
 }
 private pageTops:number[]=[];
 private pageLefts:number[]=[];
 private pageHeights:number[]=[];
 private resolvedSectionsCache:ResolvedPageSectionInfo[]=[];
 pageTopFor(index:number):number { return this.pageTops[index] ?? index*this.stride(); }
 pageLeftFor(index:number):number { return this.pageLefts[index] ?? 0; }
 private computePageBoxes(pages:readonly PageDisplayList[]):{tops:number[];lefts:number[];heights:number[];maxWidth:number;totalHeight:number} {
  const scale=this.scale();
  const gap=this.viewMode()==='web'||this.viewMode()==='draft'?4:32;
  const maxWidth=pages.length
   ? Math.max(...pages.map(p=>p.width*scale))
   : this.effectiveGeometry().width*scale;
  const tops:number[]=[];
  const lefts:number[]=[];
  const heights:number[]=[];
  let y=0;
  for(const page of pages){
   const w=page.width*scale;
   const h=page.height*scale;
   tops.push(y);
   lefts.push(Math.max(0,(maxWidth-w)/2));
   heights.push(h);
   y+=h+gap;
  }
  return {tops,lefts,heights,maxWidth,totalHeight:y};
 }
 private resolveSectionInfo(pageIndex:number):ResolvedPageSectionInfo|undefined {
  const lc=this.layoutConfig();
  if(!lc)return undefined;
  const srcPages=this.session?.pages??this.pages();
  this.resolvedSectionsCache=resolveDocumentPageSections(srcPages,lc);
  return this.resolvedSectionsCache[pageIndex];
 }
 refresh():void {
  if(!this.session||!this.enabled()){this.visiblePages.set([]);this.accessibleBlocks.set([]);this.activeA11yBlockId.set(null);this.lastA11ySelection=undefined;this.lastA11ySection=-1;return;}
  const t0=this.session.engine.perf.now();
  this.session.renumberHeadings(this.effectiveHeadingNumbering());this.session.normalizeApaChapterHeadings(this.effectiveStyleTemplate());
  const pages=this.session.displayLists;
  const scale=this.scale();
  const boxes=this.computePageBoxes(pages);
  this.pageTops=boxes.tops;
  this.pageLefts=boxes.lefts;
  this.pageHeights=boxes.heights;
  const totalH=boxes.totalHeight;
  this.totalHeight.set(totalH);
  this.spaceWidth.set(boxes.maxWidth);
  const lc=this.layoutConfig();
  this.resolvedSectionsCache=lc?resolveDocumentPageSections(this.session.pages,lc):[];
  let start=0,end=pages.length;
  if(this.viewport&&pages.length>0){
   const vh=this.viewport.clientHeight||900;
   const maxScroll=Math.max(0,totalH-vh);
   const scrollTop=Math.min(this.viewport.scrollTop,maxScroll);
   if(this.viewport.scrollTop>maxScroll)this.viewport.scrollTop=scrollTop;
   const minY=scrollTop-600;
   const maxY=scrollTop+vh+600;
   start=0;
   while(start<pages.length&&(boxes.tops[start]+boxes.heights[start])<minY)start++;
   end=start;
   while(end<pages.length&&boxes.tops[end]<maxY)end++;
   if(start>=end){start=Math.max(0,pages.length-1);end=pages.length;}
  } else {
   start=0;end=Math.min(pages.length,5);
  }
  const nextVisible=pages.slice(start,end).map((page,offset)=>{
   const assets=new Map<string,CanvasImageSource>();
   const commands=page.commands.filter(command=>{
    if(command.kind!=='image')return true;
    let image=this.assets.get(command.assetId);
    if(!image){image=new Image();image.onload=()=>{if(!this.disposed)this.refresh();};image.onerror=()=>{};image.src=command.assetId;this.assets.set(command.assetId,image);}
    if(image.complete&&image.naturalWidth){assets.set(command.assetId,image);return true;}return false;
   });
   const pageIndex=start+offset;
   const info=this.resolvedSectionsCache[pageIndex];
   const formatted=info?.formattedPageNumber||String(pageIndex+1);
   const badge=formatted===String(pageIndex+1)?`${pageIndex+1} / ${pages.length}`:`${formatted} · ${pageIndex+1}/${pages.length}`;
   return {index:pageIndex,top:boxes.tops[pageIndex]??0,left:boxes.lefts[pageIndex]??0,badge,page:this.decoratePage({...this.session!.overlay(page),commands,assets},pageIndex,pages.length,false,this.resolvedSectionsCache)};
  });
  this.visiblePages.set(nextVisible);
  const a11yBlocks=this.session.getAccessibleBlocks();
  const blocksChanged=a11yBlocks!==this.accessibleBlocks();
  if(blocksChanged)this.accessibleBlocks.set(a11yBlocks);
  const selection=this.session.selection;
  const sectionIdx=this.session.section;
  if(blocksChanged||selection!==this.lastA11ySelection||sectionIdx!==this.lastA11ySection){
   this.lastA11ySelection=selection;
   this.lastA11ySection=sectionIdx;
   const activeBlockId=this.session.getActiveAccessibleBlockId();
   if(activeBlockId!==this.activeA11yBlockId()){
    this.activeA11yBlockId.set(activeBlockId);
    const matched=activeBlockId?this.findA11yMatch(a11yBlocks,activeBlockId):undefined;
    if(matched)this.a11yAnnouncement.set(`${this.pageLabel()} ${matched.pageIndex+1}: ${matched.text.slice(0,140)}`);
   }
  }
  if(this.editingRegion()){
   this.proxyTop.set(this.regionToolbarTopPx(this.editingRegion()!));
   this.proxyLeft.set(this.pageLeftFor(this.editingRegion()!.pageIndex)+this.effectiveGeometry().left*scale);
  } else if(selection){
   let foundCaret=false;
   for(const slot of nextVisible){
    if(slot.page.caret){this.proxyTop.set(slot.top+slot.page.caret.top*scale);this.proxyLeft.set(slot.left+slot.page.caret.x*scale);foundCaret=true;break;}
    const caret=caretForPosition(pages[slot.index],selection.focus);
    if(caret){this.proxyTop.set(slot.top+caret.top*scale);this.proxyLeft.set(slot.left+caret.x*scale);foundCaret=true;break;}
   }
   if(!foundCaret)for(let i=0;i<pages.length;i++){
    const caret=caretForPosition(pages[i],selection.focus);if(caret){this.proxyTop.set(this.pageTopFor(i)+caret.top*scale);this.proxyLeft.set(this.pageLeftFor(i)+caret.x*scale);break;}
   }
   const currentImg=this.selectedImage();
   if(currentImg&&!this.isResizingImage){
    const p=pages[currentImg.pageIndex];
    const cmd=p?.commands.find(c=>c.kind==='image'&&c.nodeId===currentImg.nodeId);
    if(cmd&&cmd.kind==='image'){this.selectedImage.set({...currentImg,x:cmd.x,y:cmd.y,width:cmd.width,height:cmd.height});}
   }
  }
  this.session.engine.perf.record('render',this.session.engine.perf.now()-t0,undefined,pages.length);
 }
 pointerDown(event:PointerEvent,page:PageDisplayList):void {
  if(event.button!==0||!this.session)return;
  if(this.editingRegion())this.commitRegionEdit();
  const rect=(event.currentTarget as HTMLElement).getBoundingClientRect();
  const scale=this.scale();
  const x=(event.clientX-rect.left)/scale,y=(event.clientY-rect.top)/scale;
  const geom=this.effectiveGeometry();
  const lc=this.layoutConfig();
  if(!this.readOnly()&&lc?.showHeaderFooter&&!lc?.apa){
   const pageIndex=this.session.displayLists.findIndex(p=>p.id===page.id);
   const pageH=page.height||geom.height;
   if(pageIndex>=0&&(y<Math.max(20,geom.top-6)||y>pageH-Math.max(20,geom.bottom-6))){
    event.preventDefault();
    this.activePage.emit(pageIndex);
    this.openHeaderFooterEditor(y<geom.top?'header':'footer',pageIndex);
    return;
   }
  }
  if(!event.shiftKey){
   const tableHit=!this.readOnly()?this.session.hitTableBorder(page.id,x,y):null;
   if(tableHit){
    this.startTableResize(event,tableHit,page,x,y);
    return;
   }
   const imageHit=this.session.hitImage(page.id,x,y);
   if(imageHit){
    event.preventDefault();
    this.selectedImage.set(imageHit);
    this.proxy()?.nativeElement.focus({preventScroll:true});
    this.activePage.emit(imageHit.pageIndex);
    return;
   }
   const tocHit=this.session.hitTocEntry(page.id,x,y);
   if(tocHit){event.preventDefault();this.tocNavigate.emit(tocHit);return;}
   const latexHit=this.session.hitLatexFormula(page.id,x,y);
   if(latexHit){event.preventDefault();this.latexEdit.emit(latexHit);return;}
  }
  if(!this.readOnly()&&!event.shiftKey){
   const checkboxId=this.session.hitCheckbox(page.id,x,y);
   if(checkboxId){
    event.preventDefault();
    this.selectedImage.set(null);
    this.writing.dismiss(this);
    this.activePage.emit(this.session.displayLists.findIndex(p=>p.id===page.id));
    this.edit(()=>this.session!.toggleCheckbox(checkboxId));
    return;
   }
  }
  if(event.ctrlKey||event.metaKey||this.readOnly()){
   const href=this.session.hitLink(page.id,x,y);
   if(href){event.preventDefault();this.linkClick.emit(href);return;}
  }
  this.selectedImage.set(null);
  this.writing.dismiss(this);
  const clickCount=!event.shiftKey?this.resolveClickCount(event):1;
  let ok=false;
  if(clickCount>=3)ok=this.session.selectParagraphAt(page.id,x,y);
  else if(clickCount===2)ok=this.session.selectWordAt(page.id,x,y);
  else ok=this.session.selectAt(page.id,x,y,event.shiftKey);
  if(!ok)return;
  event.preventDefault();
  if(clickCount===1){
   this.dragging=true;
   this.attachDragListeners();
  }else{
   this.dragging=false;
  }
  this.activePage.emit(this.session.displayLists.findIndex(p=>p.id===page.id));
  this.refresh();
  this.selectionChange.emit();
  this.proxy()?.nativeElement.focus({preventScroll:true});
 }
 onCanvasContextMenu(event:MouseEvent,page:PageDisplayList):void {
  if(this.readOnly()||!this.session)return;
  const rect=(event.currentTarget as HTMLElement).getBoundingClientRect();
  const scale=this.scale();
  const x=(event.clientX-rect.left)/scale,y=(event.clientY-rect.top)/scale;
  const sel=this.session.selection;
  const hasRangeSelection=Boolean(sel&&(sel.anchor.nodeId!==sel.focus.nodeId||sel.anchor.offset!==sel.focus.offset)&&this.session.getSelectionContext()?.table);
  if(!hasRangeSelection){
   this.session.selectAt(page.id,x,y,false);
  }
  this.refresh();
  const pageIndex=this.session.displayLists.findIndex(p=>p.id===page.id);
  if(pageIndex>=0)this.activePage.emit(pageIndex);
  this.selectionChange.emit();
  if(this.session.getSelectionContext()?.table){
   event.preventDefault();
   this.tableContextMenu.emit({clientX:event.clientX,clientY:event.clientY,pageIndex:Math.max(0,pageIndex)});
  }
 }
 private resolveClickCount(event:PointerEvent):number {
  const now=Date.now();
  const dx=Math.abs(event.clientX-this.lastClickX);
  const dy=Math.abs(event.clientY-this.lastClickY);
  const withinWindow=now-this.lastClickAt<=450&&dx<=6&&dy<=6;
  const count=event.detail>=2?event.detail:(withinWindow?this.clickStreak+1:1);
  this.clickStreak=count;
  this.lastClickAt=now;
  this.lastClickX=event.clientX;
  this.lastClickY=event.clientY;
  return count;
 }
 private attachDragListeners():void {
  this.dragCleanup?.();
  const stop=()=>this.pointerUp();
  window.addEventListener('pointerup',stop,{once:true});
  window.addEventListener('pointercancel',stop,{once:true});
  this.dragCleanup=()=>{
   window.removeEventListener('pointerup',stop);
   window.removeEventListener('pointercancel',stop);
  };
 }
 private emitSelectionChangeThrottled(): void {
  if (this.selectionEmitFrame !== null) return;
  this.selectionEmitFrame = requestAnimationFrame(() => {
   this.selectionEmitFrame = null;
   if (!this.disposed) this.selectionChange.emit();
  });
 }
 pointerUp(): void {
  this.dragging = false;
  this.dragCleanup?.();
  this.dragCleanup = null;
  if (this.selectionEmitFrame !== null) {
   cancelAnimationFrame(this.selectionEmitFrame);
   this.selectionEmitFrame = null;
   if (!this.disposed) this.selectionChange.emit();
  }
 }
 pointerMove(event:PointerEvent,page:PageDisplayList):void {
  if(!this.session||this.isResizingTable||this.isResizingImage)return;
  const target=event.currentTarget as HTMLElement;
  const rect=target.getBoundingClientRect();
  const scale=this.scale();
  const x=(event.clientX-rect.left)/scale,y=(event.clientY-rect.top)/scale;
  if(this.dragging&&!event.buttons){this.pointerUp();}
  if(!this.dragging){
   let cursor = 'text';
   if(
    this.session.hitImage(page.id,x,y)||
    this.session.hitTocEntry(page.id,x,y)||
    this.session.hitLatexFormula(page.id,x,y)||
    (!this.readOnly()&&this.session.hitCheckbox(page.id,x,y))||
    ((event.ctrlKey||event.metaKey||this.readOnly())&&this.session.hitLink(page.id,x,y))
   ){
    cursor = 'pointer';
   }else if(!this.readOnly()){
    const tableHit=this.session.hitTableBorder(page.id,x,y);
    cursor = tableHit?tableHit.type==='col'?'col-resize':'row-resize':'text';
   }
   if (target.style.cursor !== cursor) target.style.cursor = cursor;
   return;
  }
  const prev=this.session.selection;
  if(this.session.selectAt(page.id,x,y,true)){
   const next=this.session.selection;
   if(
    prev&&next&&
    prev.anchor.nodeId===next.anchor.nodeId&&prev.anchor.offset===next.anchor.offset&&
    prev.focus.nodeId===next.focus.nodeId&&prev.focus.offset===next.focus.offset
   )return;
   this.refresh();
   this.emitSelectionChangeThrottled();
  }
 }
 onProxyFocus():void {if(this.writing.notice()?.owner!==this)this.writing.dismiss();}
 beforeInput(event:Event):void {
  const input=event as InputEvent;if(this.readOnly()||this.composing||input.isComposing)return;
  input.preventDefault();
  const activeRegion=this.editingRegion();
  if(activeRegion){
   if(input.inputType==='insertText'||input.inputType==='insertReplacementText'){
    this.editingRegion.set(insertRegionText(activeRegion,input.data||''));
    this.refresh();
   } else if(input.inputType==='insertParagraph'||input.inputType==='insertLineBreak'){
    this.editingRegion.set(splitRegionLine(activeRegion));
    this.refresh();
   } else if(input.inputType==='deleteContentBackward'||input.inputType==='deleteContentForward'){
    this.editingRegion.set(deleteRegion(activeRegion,input.inputType==='deleteContentBackward'));
    this.refresh();
   }
   return;
  }
  const shouldProofread=input.inputType==='insertText'&&Boolean(input.data)&&/\s/.test(input.data!);
  this.edit(()=>{
   let ok=false;
   if(input.inputType==='insertText'||input.inputType==='insertReplacementText')ok=this.session!.insert(input.data||'');
   else if(input.inputType==='insertParagraph'||input.inputType==='insertLineBreak')ok=this.session!.enter();
   else if(input.inputType==='deleteContentBackward'||input.inputType==='deleteContentForward')ok=this.session!.delete(input.inputType==='deleteContentBackward');
   else if(input.inputType==='historyUndo'||input.inputType==='historyRedo'){this.history.emit(input.inputType==='historyRedo');return false;}
   if(!ok)return false;
   if(shouldProofread){
    const result=this.session!.applyProofreading(this.writing.language(),this.writing.enabled());
    if(result){
     const undoFn=result.undo;
     this.writing.notice.set({
      owner:this,
      kind:result.kind,
      before:result.before,
      after:result.after,
      ...(undoFn?{undo:()=>{if(!this.readOnly()&&this.session)this.edit(()=>undoFn());}}:{}),
     });
    }else{
     this.writing.dismiss(this);
    }
   }else{
    this.writing.dismiss(this);
   }
   return true;
  });
 }
 proxyInput():void {const proxy=this.proxy();if(!this.composing&&proxy)proxy.nativeElement.value='';}
 compositionEnd(event:CompositionEvent):void {
  this.composing=false;
  const activeRegion=this.editingRegion();
  if(activeRegion){
   if(event.data&&!this.readOnly()){this.editingRegion.set(insertRegionText(activeRegion,event.data));this.refresh();}
   this.proxyInput();
   return;
  }
  if(event.data&&!this.readOnly())this.edit(()=>this.session!.insert(event.data));
  this.proxyInput();
 }
 keyDown(event:KeyboardEvent):void {
  if(event.isComposing||!this.session)return;
  const activeRegion=this.editingRegion();
  if(activeRegion){
   const meta=event.ctrlKey||event.metaKey,key=event.key.toLowerCase();
   if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();this.commitRegionEdit();return;}
   if(event.key==='Enter'&&event.shiftKey){event.preventDefault();this.editingRegion.set(splitRegionLine(activeRegion));this.refresh();return;}
   if(event.key==='Escape'){event.preventDefault();this.cancelRegionEdit();return;}
   if(meta&&!event.altKey&&key==='b'){event.preventDefault();this.formatRegion('bold');return;}
   if(meta&&!event.altKey&&key==='i'){event.preventDefault();this.formatRegion('italic');return;}
   if(meta&&!event.altKey&&key==='u'){event.preventDefault();this.formatRegion('underline');return;}
   if(meta&&key==='a'){event.preventDefault();this.editingRegion.set(selectAllRegion(activeRegion));this.refresh();return;}
   if(event.key==='ArrowLeft'){event.preventDefault();this.editingRegion.set(moveRegionCaret(activeRegion,'left',event.shiftKey));this.refresh();return;}
   if(event.key==='ArrowRight'){event.preventDefault();this.editingRegion.set(moveRegionCaret(activeRegion,'right',event.shiftKey));this.refresh();return;}
   if(event.key==='ArrowUp'){event.preventDefault();this.editingRegion.set(moveRegionCaret(activeRegion,'up',event.shiftKey));this.refresh();return;}
   if(event.key==='ArrowDown'){event.preventDefault();this.editingRegion.set(moveRegionCaret(activeRegion,'down',event.shiftKey));this.refresh();return;}
   if(event.key==='Home'){event.preventDefault();this.editingRegion.set(moveRegionCaret(activeRegion,'home',event.shiftKey));this.refresh();return;}
   if(event.key==='End'){event.preventDefault();this.editingRegion.set(moveRegionCaret(activeRegion,'end',event.shiftKey));this.refresh();return;}
   return;
  }
  const selectedImg=this.selectedImage();
  if(selectedImg){
   if(event.key==='Backspace'||event.key==='Delete'){
    event.preventDefault();
    this.deleteSelectedImage();
    return;
   }
   if(event.key==='Escape'){
    event.preventDefault();
    this.selectedImage.set(null);
    return;
   }
  }
  const meta=event.ctrlKey||event.metaKey,key=event.key.toLowerCase();
  if((event.key==='Backspace'||event.key==='Delete')&&!meta&&!event.altKey&&!this.readOnly()){
   event.preventDefault();
   this.edit(()=>this.session!.delete(event.key==='Backspace'));
   return;
  }
  if(event.key==='Tab'&&!meta&&!event.altKey&&!this.readOnly()){
   event.preventDefault();
   const delta:1|-1=event.shiftKey?-1:1;
   this.edit(()=>{
    const ctx=this.session!.getSelectionContext();
    if(ctx?.table)return this.session!.navigateTableCell(delta);
    if(ctx?.formats.insertUnorderedList||ctx?.formats.insertOrderedList)return this.session!.indentListItem(delta);
    return this.session!.adjustBlockIndent(delta*24);
   });
   return;
  }
  if(meta&&!event.altKey&&!event.shiftKey&&(key==='b'||key==='i')){event.preventDefault();if(!this.readOnly()&&!selectedImg)this.edit(()=>this.session!.toggleInlineCommand(key==='b'?'bold':'italic'));return;}
  if(meta&&key==='a'){event.preventDefault();this.session.selectAll();this.refresh();this.selectionChange.emit();return;}
  if(meta&&(key==='z'||key==='y')){event.preventDefault();if(!this.readOnly())this.history.emit(key==='y'||event.shiftKey);return;}
  if(meta&&(key==='home'||key==='end')){event.preventDefault();this.session.moveDocumentBoundary(key==='end',event.shiftKey);this.refresh();this.selectionChange.emit();return;}
  if((event.key==='Home'||event.key==='End')&&!meta&&!event.altKey){event.preventDefault();this.session.moveLineBoundary(event.key==='End',event.shiftKey);this.refresh();this.selectionChange.emit();return;}
  if(event.key==='ArrowLeft'||event.key==='ArrowRight'){
   event.preventDefault();
   if(event.metaKey)this.session.moveLineBoundary(event.key==='ArrowRight',event.shiftKey);
   else if(event.ctrlKey||event.altKey)this.session.moveWord(event.key==='ArrowLeft'?-1:1,event.shiftKey);
   else this.session.moveHorizontal(event.key==='ArrowLeft'?-1:1,event.shiftKey);
   this.refresh();this.selectionChange.emit();return;
  }
  if(event.key==='ArrowUp'||event.key==='ArrowDown'){
   const selection=this.session.selection;if(!selection)return;event.preventDefault();
   const page=this.session.displayLists.find(p=>caretForPosition(p,selection.focus));if(!page)return;
   const next=this.session.engine.navigateVertically(page.id,selection.focus,event.key==='ArrowUp'?-1:1);
   if(next)this.session.setSelection(this.session.section,{anchor:event.shiftKey?selection.anchor:next.position,focus:next.position});this.refresh();this.selectionChange.emit();return;
  }
 }
 deleteSelectedImage():void {
  const img=this.selectedImage();
  if(!img||!this.session||this.readOnly())return;
  const nodeId=img.nodeId;
  this.selectedImage.set(null);
  if(this.session.deleteImage(nodeId)){
   this.publishNow();
   this.selectionChange.emit();
  }
 }
 alignSelectedImage(align:'left'|'center'|'right'):void {
  const img=this.selectedImage();
  if(!img||!this.session||this.readOnly())return;
  if(this.session.alignImage(img.nodeId,align)){
   this.publishNow();
   const page=this.session.displayLists[img.pageIndex]??this.session.displayLists.find(p=>p.commands.some(c=>c.kind==='image'&&c.nodeId===img.nodeId));
   const cmd=page?.commands.find(c=>c.kind==='image'&&c.nodeId===img.nodeId);
   const pageIndex=page?this.session.displayLists.indexOf(page):img.pageIndex;
   if(cmd&&cmd.kind==='image'&&page){
    this.selectedImage.set({...img,pageId:page.id,pageIndex,x:cmd.x,y:cmd.y,width:cmd.width,height:cmd.height});
   }
   this.selectionChange.emit();
  }
 }
 addCaptionToSelectedImage():void {
  const img=this.selectedImage();
  if(!img||!this.session||this.readOnly())return;
  if(this.session.insertImageCaption(img.nodeId)){
   this.selectedImage.set(null);
   this.publishNow();
   this.selectionChange.emit();
   this.focus();
  }
 }
 onCanvasDragOver(event:DragEvent):void {
  if(this.readOnly())return;
  if(event.dataTransfer?.types?.includes('Files')){
   event.preventDefault();
   event.dataTransfer.dropEffect='copy';
  }
 }
 onCanvasDrop(event:DragEvent,pageIndex:number):void {
  if(this.readOnly())return;
  const files=Array.from(event.dataTransfer?.files||[]).filter(file=>file.type.startsWith('image/'));
  if(!files.length)return;
  event.preventDefault();
  event.stopPropagation();
  this.activePage.emit(pageIndex);
  for(const file of files){
   this.imageDrop.emit({file,pageIndex});
  }
 }
 startImageResize(event:PointerEvent,img:CanvasImageHit):void {
  if(!this.session||this.readOnly()||event.button!==0)return;
  event.preventDefault();event.stopPropagation();
  const startX=event.clientX;
  const initialWidth=img.width;
  const ratio=initialWidth/img.height;
  const geom=this.effectiveGeometry();
  const scale=this.scale();
  const maxW=geom.width-geom.left-geom.right;
  this.isResizingImage=true;
  const onMove=(e:PointerEvent)=>{
   const dx=(e.clientX-startX)/scale;
   const nextW=Math.max(30,Math.min(maxW,Math.round(initialWidth+dx)));
   const nextH=Math.round(nextW/ratio);
   this.selectedImage.set({...img,width:nextW,height:nextH});
  };
  const onUp=()=>{
   window.removeEventListener('pointermove',onMove);
   window.removeEventListener('pointerup',onUp);
   window.removeEventListener('pointercancel',onUp);
   this.isResizingImage=false;
   const currentImg=this.selectedImage();
   if(currentImg&&this.session){
    this.session.resizeImage(img.nodeId,currentImg.width,currentImg.height);
    this.publishNow();
    const updated=this.session.hitImage(img.pageId,img.x+2,img.y+2);
    if(updated)this.selectedImage.set(updated);
    this.selectionChange.emit();
   }
  };
  window.addEventListener('pointermove',onMove);
  window.addEventListener('pointerup',onUp,{once:true});
  window.addEventListener('pointercancel',onUp,{once:true});
 }
 startTableResize(event:PointerEvent,hit:CanvasTableBorderHit,page:PageDisplayList,clickX?:number,clickY?:number):void {
  if(!this.session||this.readOnly()||event.button!==0)return;
  event.preventDefault();event.stopPropagation();
  this.isResizingTable=true;
  const startX=event.clientX,startY=event.clientY;
  const pageIndex=hit.pageIndex;
  const stride=this.stride();
  const scale=this.scale();
  const geom=this.effectiveGeometry();
  let hasMoved=false;
  const placeCaretFallback=()=>{
   if(!this.session||clickX===undefined||clickY===undefined)return;
   if(this.session.selectAt(page.id,clickX,clickY,false)){
    this.activePage.emit(this.session.displayLists.findIndex(p=>p.id===page.id));
    this.refresh();
    this.selectionChange.emit();
    this.proxy()?.nativeElement.focus({preventScroll:true});
   }
  };

  if(hit.type==='col'&&hit.colIndex!==undefined&&hit.colWidthsPct&&hit.tableWidth){
   const initialWidthsPct=[...hit.colWidthsPct];
   const count=initialWidthsPct.length;
   const colIdx=hit.colIndex;
   const neighbor=colIdx<count-1?colIdx+1:colIdx-1;
   const totalPairPct=initialWidthsPct[colIdx]+(neighbor>=0?initialWidthsPct[neighbor]:0);
   const minColPct=4;
   let finalWidthsPct=initialWidthsPct;

   const onMove=(e:PointerEvent)=>{
    if(!hasMoved&&Math.abs(e.clientX-startX)<2&&Math.abs(e.clientY-startY)<2)return;
    hasMoved=true;
    const dx=(e.clientX-startX)/scale;
    const deltaPct=(dx/hit.tableWidth!)*100;
    if(neighbor>=0){
     let nextW=initialWidthsPct[colIdx]+deltaPct;
     nextW=Math.max(minColPct,Math.min(totalPairPct-minColPct,nextW));
     const nextNeighborW=totalPairPct-nextW;
     finalWidthsPct=[...initialWidthsPct];
     finalWidthsPct[colIdx]=Math.round(nextW*100)/100;
     finalWidthsPct[neighbor]=Math.round(nextNeighborW*100)/100;
    }
    const currentColPctSum=finalWidthsPct.slice(0,colIdx+1).reduce((a,b)=>a+b,0);
    this.tableResizeGuide.set({
     type:'col',
     top:pageIndex*stride,
     left:(hit.tableLeft!+(hit.tableWidth!*(currentColPctSum/100)))*scale,
     width:2,
     height:geom.height*scale,
    });
   };

   const onUp=()=>{
    window.removeEventListener('pointermove',onMove);
    window.removeEventListener('pointerup',onUp);
    window.removeEventListener('pointercancel',onUp);
    this.isResizingTable=false;
    this.tableResizeGuide.set(null);
    if(!hasMoved){placeCaretFallback();return;}
    if(this.session){
     this.session.resizeTableColumn(hit.tableId,colIdx,finalWidthsPct);
     this.publishNow();
     this.selectionChange.emit();
    }
   };
   window.addEventListener('pointermove',onMove);
   window.addEventListener('pointerup',onUp,{once:true});
   window.addEventListener('pointercancel',onUp,{once:true});
  }else if(hit.type==='row'&&hit.rowIndex!==undefined&&hit.rowHeight!==undefined){
   const initialHeight=hit.rowHeight;
   let finalHeight=initialHeight;

   const onMove=(e:PointerEvent)=>{
    if(!hasMoved&&Math.abs(e.clientY-startY)<2&&Math.abs(e.clientX-startX)<2)return;
    hasMoved=true;
    const dy=(e.clientY-startY)/scale;
    finalHeight=Math.max(20,Math.round(initialHeight+dy));
    this.tableResizeGuide.set({
     type:'row',
     top:pageIndex*stride+((hit.rowTop??0)+finalHeight)*scale,
     left:0,
     width:geom.width*scale,
     height:2,
    });
   };

   const onUp=()=>{
    window.removeEventListener('pointermove',onMove);
    window.removeEventListener('pointerup',onUp);
    window.removeEventListener('pointercancel',onUp);
    this.isResizingTable=false;
    this.tableResizeGuide.set(null);
    if(!hasMoved){placeCaretFallback();return;}
    if(this.session){
     this.session.resizeTableRow(hit.tableId,hit.rowIndex!,finalHeight,hit.rowId);
     this.publishNow();
     this.selectionChange.emit();
    }
   };
   window.addEventListener('pointermove',onMove);
   window.addEventListener('pointerup',onUp,{once:true});
   window.addEventListener('pointercancel',onUp,{once:true});
  }
 }
 private edit(action:()=>boolean):void {
  if(!this.session||this.readOnly())return;
  try {if(action()){this.refresh();this.schedulePublish();this.selectionChange.emit();const el=this.proxy()?.nativeElement;el?.focus({preventScroll:true});el?.scrollIntoView({block:'nearest'});}}
  catch { /* Canvas remains primary surface */ }
 }
 copy(event:ClipboardEvent,cut:boolean):void {
  if(!event.clipboardData||!this.session)return;
  const activeRegion=this.editingRegion();
  if(activeRegion){
   event.preventDefault();
   event.clipboardData.setData('text/plain',regionLinesPlainText(activeRegion.lines));
   event.clipboardData.setData('text/html',serializeRegionLinesToHtml(activeRegion.lines));
   if(cut&&!this.readOnly()){
    this.editingRegion.set(deleteRegion(selectAllRegion(activeRegion),true));
    this.refresh();
   }
   return;
  }
  if(this.selectedImage()){
   const image=this.session.imageForClipboard(this.selectedImage()!.nodeId);if(!image)return;
   const element=document.createElement('img');element.src=image.src;element.width=Math.round(image.width);element.height=Math.round(image.height);element.alt=image.alt;
   event.clipboardData.setData('text/html',element.outerHTML);event.clipboardData.setData('text/plain',image.src);event.preventDefault();
   if(cut&&!this.readOnly())this.deleteSelectedImage();return;
  }
  if(!this.session.selection)return;event.preventDefault();
  event.clipboardData.setData('text/plain',this.session.selectedText());
  const selectedHtml=this.session.selectedHtml();
  if(selectedHtml)event.clipboardData.setData('text/html',selectedHtml);
  if(cut&&!this.readOnly())this.edit(()=>this.session!.insert(''));
 }
 async paste(event:ClipboardEvent):Promise<void> {
  if(this.readOnly()||!event.clipboardData||!this.session)return;event.preventDefault();
  const activeRegion=this.editingRegion();
  if(activeRegion){
   const pastedText=event.clipboardData.getData('text/plain');
   if(pastedText){
    this.editingRegion.set(insertRegionText(activeRegion,pastedText));
    this.refresh();
   }
   return;
  }
  const session=this.session,after=this.selectedImage()?.nodeId;
  const insert=(image:{src:string;width:number;height:number;alt?:string})=>{
   if(this.disposed||this.session!==session||this.readOnly())return;
   this.edit(()=>session.pasteImage(image,after));this.selectedImage.set(null);
  };
  const html=event.clipboardData.getData('text/html');
  const text=event.clipboardData.getData('text/plain');
  const hasMixedBlocks=Boolean(html&&/<(?:h[1-6]|ul|ol|blockquote)\b/i.test(html));
  const tableHtml=hasMixedBlocks?null:clipboardTableHtml(html,text);
  if(tableHtml){
   const isApa7=Boolean(this.effectiveDefaults()?.apaBorders);
   this.edit(()=>session.pasteTable(tableHtml,isApa7,0,this.effectiveStyleTemplate()?.tableStyle));
   this.selectedImage.set(null);
   return;
  }
  const files=Array.from(event.clipboardData.items||[]).filter(item=>item.kind==='file'&&item.type.startsWith('image/')).map(item=>item.getAsFile()).filter((file):file is File=>!!file);
  if(files.length){
   for(const file of files){
    const src=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(reader.error);reader.readAsDataURL(file);}).catch(()=>null);
    if(!src)continue;
    const image=new Image();image.src=src;
    await image.decode().catch(()=>{});
    insert({src,width:image.naturalWidth||320,height:image.naturalHeight||240,alt:file.name});
   }return;
  }
  if(html){
   const doc=new DOMParser().parseFromString(html,'text/html');const images=Array.from(doc.querySelectorAll('img'));
   if(images.length&&!(doc.body.textContent||'').trim()){
    for(const image of images){
     const src=image.getAttribute('src')||'';
     if(!/^(https?:\/\/|data:image\/(?:png|jpeg|jpg|gif|webp|bmp);|\/(?!\/))/i.test(src))continue;
     insert({src,width:Math.max(1,Math.min(10000,Number(image.getAttribute('width'))||320)),height:Math.max(1,Math.min(10000,Number(image.getAttribute('height'))||240)),alt:image.alt});
    }return;
   }
   if(hasRichClipboardFormatting(html)){
    const richHtml=sanitizeClipboardHtml(html);
    if(richHtml&&this.editAndCheck(()=>session.pasteHtml(richHtml))){
     this.selectedImage.set(null);
     return;
    }
   }
  }
  this.edit(()=>session.insert(text));
 }
 private editAndCheck(action:()=>boolean):boolean {
  if(!this.session||this.readOnly())return false;
  try {
   if(action()){this.refresh();this.schedulePublish();this.selectionChange.emit();const el=this.proxy()?.nativeElement;el?.focus({preventScroll:true});el?.scrollIntoView({block:'nearest'});return true;}
   return false;
  } catch { return false; }
 }
 markedPages():DocumentPage[]{if(this.publishTimer){clearTimeout(this.publishTimer);this.publishTimer=null;if(this.session){this.session.renumberHeadings(this.effectiveHeadingNumbering());this.session.normalizeApaChapterHeadings(this.effectiveStyleTemplate());this.published=this.session.pages;this.changed.emit(this.published);}}return this.session?.engine.getMarkedPages()||this.pages();}
 jump(index:number,offsetY=0):void {
  this.refresh();
  const base=this.host.getBoundingClientRect().top-(this.viewport?.getBoundingClientRect().top||0)+(this.viewport?.scrollTop||0);
  const extraY=offsetY>0?Math.max(0,offsetY*this.scale()-48):0;
  this.viewport?.scrollTo({top:base+this.pageTopFor(index)+extraY});
  this.scroll();
  this.selectionChange.emit();
 }
 private findA11yMatch(blocks:readonly CanvasAccessibleBlock[],activeId:string):{pageIndex:number;text:string}|undefined {
  for(const b of blocks){
   if(`canvas-a11y-${b.id}`===activeId)return {pageIndex:b.pageIndex,text:b.text};
   if(b.rows){
    for(const row of b.rows){
     for(const cell of row.cells){
      if(`canvas-a11y-${cell.id}`===activeId)return {pageIndex:b.pageIndex,text:cell.text||b.text};
     }
    }
   }
  }
  return undefined;
 }
 private getParsedRegion(html:string|undefined):{lines:RegionRichLine[];text:string} {
  const key=html||'';
  const cached=this.regionParseCache.get(key);
  if(cached)return cached;
  if(this.regionParseCache.size>16)this.regionParseCache.clear();
  const lines=parseRegionHtmlToLines(key);
  const text=regionLinesPlainText(lines);
  const entry={lines,text};
  this.regionParseCache.set(key,entry);
  return entry;
 }
 private decoratePage(list:PageDisplayList,pageIndex:number,totalPages:number,isExport=false,resolvedSections?:ResolvedPageSectionInfo[]):PageDisplayList {
  const lc=this.layoutConfig();
  const activeRegion=this.editingRegion();
  const isEditingThisPage=activeRegion?.pageIndex===pageIndex;
  const geom=this.effectiveGeometry();
  const secInfo=resolvedSections?.[pageIndex] ?? (lc ? resolveDocumentPageSections(this.session?.pages??this.pages(),lc)[pageIndex] : undefined);
  if(!lc&&!isEditingThisPage){
   if(isExport||!(list.tables?.length))return list;
   return {
    ...list,
    decorations:{
     pageIndex,
     totalPages,
     geometry:{top:geom.top,right:geom.right,bottom:geom.bottom,left:geom.left},
     showTableGridlines:true,
     darkSheet:this.darkSheet(),
    },
   };
  }
  const simplifiedView=this.viewMode()==='web'||this.viewMode()==='draft';
  const headerHtml=secInfo?.headerHtml??lc?.headerHtml;
  const footerHtml=secInfo?.footerHtml??lc?.footerHtml;
  const headerParsed=simplifiedView?{lines:[],text:''}:this.getParsedRegion(headerHtml);
  const footerParsed=simplifiedView?{lines:[],text:''}:this.getParsedRegion(footerHtml);
  return {
   ...list,
   backgroundColor:lc?.pageColor||list.backgroundColor,
   decorations:{
    border:simplifiedView?undefined:lc?.pageBorder,
    watermarkText:simplifiedView?undefined:lc?.watermarkText,
    showLineNumbers:simplifiedView?false:lc?.showLineNumbers,
    pageIndex,
    totalPages,
    geometry:{top:geom.top,right:geom.right,bottom:geom.bottom,left:geom.left},
    apa:simplifiedView?undefined:lc?.apa,
    showHeaderFooter:simplifiedView?false:Boolean(lc?.showHeaderFooter||isEditingThisPage),
    suppressHeaderFooter:simplifiedView?false:Boolean(secInfo?.suppressHeaderFooter),
    formattedPageNumber:secInfo?.formattedPageNumber||String(pageIndex+1),
    formattedTotalPages:secInfo?.formattedTotalPages||String(totalPages),
    headerText:headerParsed.text,
    footerText:footerParsed.text,
    headerLines:headerParsed.lines,
    footerLines:footerParsed.lines,
    ...(isEditingThisPage&&activeRegion?{
     activeRegionEdit:{
      zone:activeRegion.zone,
      lines:activeRegion.lines,
      cursor:activeRegion.cursor,
      selectionAnchor:activeRegion.anchor,
     },
    }:{}),
    pageLabel:this.pageLabel(),
    ofLabel:this.ofLabel(),
    darkSheet:this.darkSheet(),
    showTableGridlines:!isExport,
   },
  };
 }
 perfReport():CanvasPerfReport|null {
  return this.session?this.session.engine.perf.getReport():null;
 }
 exportDisplayLists(options?:{hideComments?:boolean}):PageDisplayList[] {
  if (!this.session) return [];
  this.session.syncTocPageNumbers?.();
  const lc=this.layoutConfig();
  const hideComments=options?.hideComments ?? this.hideComments();
  if (hideComments) {
   const snaps=this.session.engine.snapshot();
   const cleanSnaps=snaps.map(s=>({
    ...s,
    state:{...s.state,roots:stripCommentMarkersFromNodes(s.state.roots)},
   }));
   const cleanEngine=new DocumentCanvasEngine(undefined,this.effectiveDefaults());
   cleanEngine.restore(cleanSnaps,this.effectiveGeometry());
   const cleanSections=cleanEngine.getSections();
   const cleanLists=cleanSections.flatMap(s=>s.displayLists);
   const cleanPages=cleanEngine.getPages();
   const resolved=lc?resolveDocumentPageSections(cleanPages,lc):undefined;
   const decorated=cleanLists.map((list,idx)=>this.decoratePage(list,idx,cleanLists.length,true,resolved));
   return attachCanvasPdfNavigation(decorated,cleanSections);
  }
  const lists=this.session.displayLists||[];
  const resolved=lc?resolveDocumentPageSections(this.session.pages,lc):undefined;
  const decorated=lists.map((list,idx)=>this.decoratePage(list,idx,lists.length,true,resolved));
  return attachCanvasPdfNavigation(decorated,this.session.engine.getSections());
 }
 openHeaderFooterEditor(zone:'header'|'footer',pageIndex=0):void {
  if(this.readOnly())return;
  const lc=this.layoutConfig();
  const clamped=Math.max(0,Math.min(pageIndex,Math.max(0,(this.session?.displayLists.length||1)-1)));
  const info=this.resolveSectionInfo(clamped);
  const raw=zone==='header'?(info?.headerHtml??lc?.headerHtml):(info?.footerHtml??lc?.footerHtml);
  this.editingRegion.set(createRegionEditState(zone,clamped,raw,'#334155'));
  this.refresh();
  queueMicrotask(()=>{this.proxy()?.nativeElement.focus({preventScroll:true});});
 }
 regionToolbarTopPx(region:{zone:'header'|'footer';pageIndex:number}):number {
  const geom=this.effectiveGeometry();
  const scale=this.scale();
  const base=this.pageTopFor(region.pageIndex);
  const pageH=(this.session?.displayLists[region.pageIndex]?.height)||geom.height;
  return region.zone==='header'
   ? base+Math.max(4,(geom.top-56)*scale)
   : base+Math.max(12,(pageH-Math.max(58,geom.bottom+22))*scale);
 }
 isRegionFirstPageDifferent(pageIndex:number):boolean {
  const info=this.resolveSectionInfo(pageIndex);
  return info?.differentFirstPage ?? Boolean(this.layoutConfig()?.differentFirstPage);
 }
 insertRegionField(field:'page'|'totalPages'):void {
  const region=this.editingRegion();
  if(!region)return;
  const token=field==='page'?'{{page}}':'{{totalPages}}';
  this.editingRegion.set(insertRegionText(region,token));
  this.refresh();
  this.proxy()?.nativeElement.focus({preventScroll:true});
 }
 toggleRegionDifferentFirstPage(pageIndex:number):void {
  const next=!this.isRegionFirstPageDifferent(pageIndex);
  this.headerFooterChange.emit({differentFirstPage:next,pageIndex});
  this.refresh();
  this.proxy()?.nativeElement.focus({preventScroll:true});
 }
 formatRegion(command:'bold'|'italic'|'underline'|'justifyLeft'|'justifyCenter'|'justifyRight'):void {
  const region=this.editingRegion();
  if(!region)return;
  if(command==='bold'||command==='italic'||command==='underline'){
   this.editingRegion.set(toggleRegionStyle(region,command));
  } else {
   const align=command==='justifyCenter'?'center':command==='justifyRight'?'right':'left';
   this.editingRegion.set(setRegionAlignment(region,align));
  }
  this.refresh();
  this.proxy()?.nativeElement.focus({preventScroll:true});
 }
 applyRegionColor(color:string):void {
  const region=this.editingRegion();
  if(!region)return;
  this.editingRegion.set(applyRegionRunColor(region,color));
  this.refresh();
  this.proxy()?.nativeElement.focus({preventScroll:true});
 }
 commitRegionEdit():void {
  const region=this.editingRegion();
  if(!region)return;
  const html=serializeRegionLinesToHtml(region.lines);
  this.editingRegion.set(null);
  this.headerFooterChange.emit({...((region.zone==='header')?{headerHtml:html}:{footerHtml:html}),pageIndex:region.pageIndex});
  this.refresh();
  this.proxy()?.nativeElement.focus({preventScroll:true});
 }
 cancelRegionEdit():void {
  this.editingRegion.set(null);
  this.refresh();
  this.proxy()?.nativeElement.focus({preventScroll:true});
 }
 ngOnDestroy():void {
  this.disposed=true;this.dragCleanup?.();this.dragCleanup=null;this.writing.dismiss(this);if(this.publishTimer){clearTimeout(this.publishTimer);this.publishTimer=null;}this.viewport?.removeEventListener('scroll',this.scroll);this.observer?.disconnect();if(this.frame!==null)cancelAnimationFrame(this.frame);if(this.selectionEmitFrame!==null)cancelAnimationFrame(this.selectionEmitFrame);
  for(const image of this.assets.values()){image.onload=null;image.onerror=null;}this.assets.clear();this.visiblePages.set([]);
 }
}
