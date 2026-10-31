import { Directive, ElementRef, HostListener, Input, OnDestroy, Renderer2, inject } from '@angular/core';
import { LatexCompletion, latexCompletionContext } from './latex-completions';

let nextId = 0;

/** Shared native-textarea completion. Does not load Monaco in a formula block. */
@Directive({ selector: 'textarea[appLatexAutocomplete]', standalone: true })
export class LatexAutocompleteDirective implements OnDestroy {
  @Input() latexDocument = false;
  private readonly element = inject<ElementRef<HTMLTextAreaElement>>(ElementRef);
  private readonly renderer = inject(Renderer2);
  private readonly id = `latex-completions-${++nextId}`;
  private menu?: HTMLElement;
  private items: LatexCompletion[] = [];
  private selected = 0;
  private start = 0;
  private unlisteners: (() => void)[] = [];
  private stops: number[] = [];
  private previousValue = '';

  @HostListener('input', ['$event']) onInput(event?: Event): void {
    if ((event as InputEvent | undefined)?.isComposing) { this.close(); return; }
    const area = this.element.nativeElement;
    // Keep argument tab stops in sync as the user types inside a snippet.
    if (this.stops.length) {
      let at = 0;
      while (at < this.previousValue.length && at < area.value.length && this.previousValue[at] === area.value[at]) at++;
      const delta = area.value.length - this.previousValue.length;
      if (delta < 0) this.stops = [];
      else this.stops = this.stops.map(stop => stop >= at ? stop + delta : stop);
    }
    this.previousValue = area.value;
    this.refresh();
  }
  @HostListener('click') onClick(): void { this.stops = []; this.refresh(); }
  @HostListener('scroll') onScroll(): void { this.close(); }
  @HostListener('window:resize') onResize(): void { this.close(); }
  @HostListener('blur') onBlur(): void { this.close(); this.stops = []; }
  close(): void {
    this.unlisteners.forEach(fn => fn()); this.unlisteners = [];
    this.menu?.remove(); this.menu = undefined; this.items = [];
    const area = this.element.nativeElement;
    area.removeAttribute('aria-controls'); area.removeAttribute('aria-activedescendant');
    area.removeAttribute('aria-expanded');
  }
  @HostListener('keydown', ['$event']) keydown(event: KeyboardEvent): void {
    if (event.isComposing || this.element.nativeElement.readOnly) return;
    if (event.key === 'Escape') { if (this.menu) { event.preventDefault(); event.stopPropagation(); this.close(); } this.stops = []; return; }
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (this.items.length && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
      event.preventDefault(); event.stopPropagation();
      this.selected = (this.selected + (event.key === 'ArrowDown' ? 1 : -1) + this.items.length) % this.items.length;
      this.highlight(); return;
    }
    if (event.key === 'Tab' && !event.shiftKey) {
      if (this.items.length) { event.preventDefault(); event.stopPropagation(); this.accept(this.selected); }
      else if (this.stops.length) {
        const area = this.element.nativeElement;
        this.stops = this.stops.filter(stop => stop > area.selectionStart);
        const next = this.stops.shift();
        if (next !== undefined) { event.preventDefault(); event.stopPropagation(); area.setSelectionRange(next, next); }
      }
    } else if (['ArrowLeft','ArrowRight','Home','End','PageUp','PageDown'].includes(event.key)) { this.close(); this.stops = []; }
  }
  private refresh(): void {
    this.close();
    const area = this.element.nativeElement;
    if (area.readOnly || area.disabled) return;
    const context = latexCompletionContext(area.value, area.selectionStart, area.selectionEnd, this.latexDocument);
    if (!context) return;
    this.start = context.start; this.items = context.items; this.selected = 0;
    const menu = this.renderer.createElement('div') as HTMLElement;
    menu.className = 'latex-completion-menu'; menu.id = this.id; menu.setAttribute('role','listbox');
    menu.setAttribute('aria-label','LaTeX · Tab para completar');
    this.items.forEach((item, index) => {
      const option = this.renderer.createElement('div') as HTMLElement;
      option.id = `${this.id}-${index}`; option.setAttribute('role','option');
      option.textContent = `${item.label} — ${item.description}`;
      this.unlisteners.push(this.renderer.listen(option, 'mousedown', (event: MouseEvent) => { event.preventDefault(); this.accept(index); }));
      menu.appendChild(option);
    });
    area.insertAdjacentElement('afterend', menu); this.menu = menu;
    this.positionMenu(menu);
    const scroll = (event: Event) => { if (!menu.contains(event.target as Node)) this.close(); };
    document.addEventListener('scroll', scroll, true);
    this.unlisteners.push(() => document.removeEventListener('scroll', scroll, true));
    area.setAttribute('aria-autocomplete','list'); area.setAttribute('aria-expanded','true'); area.setAttribute('aria-controls',this.id);
    this.highlight();
  }
  private positionMenu(menu: HTMLElement): void {
    const area = this.element.nativeElement;
    const style = getComputedStyle(area); const rect = area.getBoundingClientRect();
    const mirror = document.createElement('div');
    mirror.style.cssText = 'position:fixed;visibility:hidden;white-space:pre-wrap;overflow-wrap:break-word;box-sizing:border-box;left:0;top:0;';
    for (const property of ['font','line-height','letter-spacing','padding','border','tab-size']) mirror.style.setProperty(property, style.getPropertyValue(property));
    mirror.style.width = `${area.clientWidth}px`;
    mirror.textContent = area.value.slice(0, area.selectionStart);
    const caret = document.createElement('span'); caret.textContent = '|'; mirror.appendChild(caret);
    document.body.appendChild(mirror);
    const lineHeight = parseFloat(style.lineHeight) || 20;
    const top = rect.top + caret.offsetTop - area.scrollTop + lineHeight;
    const left = rect.left + caret.offsetLeft - area.scrollLeft;
    mirror.remove();
    const width = Math.min(440, window.innerWidth - 24);
    menu.style.cssText = `position:fixed;z-index:1000;width:${width}px;left:${Math.max(12, Math.min(left, window.innerWidth - width - 12))}px;top:${Math.max(8, Math.min(top, window.innerHeight - 240))}px;`;
  }
  private highlight(): void {
    this.menu?.querySelectorAll('[role=option]').forEach((option, index) => option.setAttribute('aria-selected', String(index === this.selected)));
    this.element.nativeElement.setAttribute('aria-activedescendant', `${this.id}-${this.selected}`);
    this.menu?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView?.({ block: 'nearest' });
  }
  private accept(index: number): void {
    const area = this.element.nativeElement; const item = this.items[index]; if (!item) return;
    if (area.readOnly || area.disabled) { this.close(); return; }
    const start = this.start;
    area.setRangeText(item.insert, start, area.selectionEnd, 'end');
    this.stops = []; // New snippet replaces any previous session.
    this.close();
    area.dispatchEvent(new Event('input', { bubbles: true }));
    this.close();
    this.stops = Array.from(item.insert.matchAll(/\{\}/g), match => start + match.index! + 1);
    this.stops.push(start + item.insert.length);
    const first = this.stops.shift()!;
    area.focus(); area.setSelectionRange(first, first); this.previousValue = area.value;
  }
  ngOnDestroy(): void { this.close(); }
}
