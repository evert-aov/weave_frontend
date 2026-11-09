import { signal } from '@angular/core';
import type { PureDocEditorComponent } from '../pure-doc-editor.component';
import type { WordEditorHooks } from './word-editor-hooks';

export interface ImageResizeBox { left: number; top: number; width: number; height: number; }
type Host = Pick<PureDocEditorComponent, 'zoom' | 'activePageIndex' | 'activeTableCell' | 'getPageBody' | 'isReadMode' | 'pushUndoSnapshot' | 'commitPageDomToState' | 'checkAndPaginateOverflow'>;
type Hooks = Pick<WordEditorHooks, 'cdr'>;

export class WordImagesController {
  readonly box = signal<ImageResizeBox | null>(null, { equal: (a, b) => a === b || !!a && !!b && a.left === b.left && a.top === b.top && a.width === b.width && a.height === b.height });
  private image: HTMLImageElement | null = null;
  private pageIndex = 0;
  private drag?: { x: number; y: number; width: number; height: number; scale: number; max: number };
  private abort?: AbortController;
  resizing = false;

  constructor(private readonly editor: Host, private readonly hooks: Hooks) {}

  select(event: PointerEvent, pageIndex: number): boolean {
    const image = event.target instanceof HTMLImageElement ? event.target : null;
    if (!image || this.editor.isReadMode() || event.button !== 0) return false;
    event.preventDefault(); event.stopPropagation();
    this.clear(); this.image = image; this.pageIndex = pageIndex;
    this.editor.activePageIndex.set(pageIndex); this.editor.activeTableCell.set(null);
    window.getSelection()?.removeAllRanges();
    this.refresh(); return true;
  }

  refresh(): void {
    if (!this.image?.isConnected) { this.clear(); return; }
    const r = this.image.getBoundingClientRect();
    this.box.set({ left: r.left, top: r.top, width: r.width, height: r.height });
  }

  start(event: PointerEvent): void {
    if (!this.image || this.editor.isReadMode() || event.button !== 0) return;
    event.preventDefault(); event.stopPropagation();
    const rect = this.image.getBoundingClientRect(), scale = this.editor.zoom() / 100;
    if (!rect.width || !rect.height) return;
    this.editor.pushUndoSnapshot();
    this.drag = { x: event.clientX, y: event.clientY, width: rect.width / scale, height: rect.height / scale, scale,
      max: this.image.parentElement?.clientWidth || rect.width / scale * 4 };
    this.resizing = true; this.abort = new AbortController();
    document.addEventListener('pointermove', this.move, { signal: this.abort.signal });
    document.addEventListener('pointerup', this.end, { once: true, signal: this.abort.signal });
    document.addEventListener('pointercancel', this.end, { once: true, signal: this.abort.signal });
  }

  private readonly move = (event: PointerEvent): void => {
    if (!this.drag || !this.image) return;
    event.preventDefault();
    const d = this.drag, ratio = d.width / d.height;
    const dx = (event.clientX - d.x) / d.scale, dy = (event.clientY - d.y) / d.scale * ratio;
    const width = Math.max(24, Math.min(d.max, d.width + (Math.abs(dx) >= Math.abs(dy) ? dx : dy)));
    this.image.style.width = `${width}px`; this.image.style.height = `${width / ratio}px`;
    this.image.style.maxWidth = '100%'; this.refresh(); this.hooks.cdr?.markForCheck();
  };

  private readonly end = (): void => {
    if (!this.resizing) return;
    this.resizing = false; this.drag = undefined; this.abort?.abort(); this.abort = undefined;
    this.editor.commitPageDomToState(this.pageIndex);
    this.editor.checkAndPaginateOverflow(this.pageIndex);
    this.refresh(); this.hooks.cdr?.markForCheck();
  };

  clear(): void {
    this.abort?.abort(); this.abort = undefined; this.resizing = false; this.drag = undefined;
    this.image = null; this.box.set(null);
  }
}
