import { Directive, ElementRef, HostListener, OnDestroy, inject } from '@angular/core';
import { ProofreadingService } from '../../core/services/proofreading.service';
import { completedWordCorrection, repeatedWord } from '../../core/utils/proofreading';

@Directive({ selector: '[appProofreading]', standalone: true, host: {
  '[attr.lang]': 'writing.language()', '[attr.spellcheck]': 'true', '[attr.autocorrect]': 'writing.enabled() ? "on" : "off"',
} })
export class ProofreadingDirective implements OnDestroy {
  readonly writing = inject(ProofreadingService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private replacing = false;
  @HostListener('focus') focus(): void { this.writing.dismiss(); }
  @HostListener('input', ['$event']) input(event: InputEvent): void {
    if (this.replacing || event.isComposing || event.inputType !== 'insertText' || !event.data || !/\s/.test(event.data)) return;
    const host = this.host;
    if (host instanceof HTMLTextAreaElement) {
      if (host.disabled || host.readOnly || host.selectionStart !== host.selectionEnd) return;
      const end = host.selectionStart;
      const text = host.value.slice(0, end);
      const correction = this.writing.enabled() ? completedWordCorrection(text, this.writing.language()) : null;
      if (correction) {
        const value = host.value;
        const next = value.slice(0, correction.start) + correction.after + value.slice(correction.start + correction.before.length);
        host.value = next; host.setSelectionRange(end + correction.after.length - correction.before.length, end + correction.after.length - correction.before.length);
        this.notify();
        this.writing.notice.set({ owner: this, kind: 'correction', ...correction, undo: () => {
          if (host.value !== next) return;
          host.value = value; host.focus({ preventScroll: true }); host.setSelectionRange(end, end); this.notify();
        } });
      } else this.warn(text);
      return;
    }
    const selection = window.getSelection();
    if (!selection?.isCollapsed || !selection.rangeCount || host.getAttribute('contenteditable') === 'false') return;
    const node = selection.anchorNode;
    if (!(node instanceof Text) || !host.contains(node) || node.parentElement?.closest('pre,code,kbd,a,[contenteditable=false]')) return;
    const end = selection.anchorOffset;
    const text = node.data.slice(0, end);
    const correction = this.writing.enabled() ? completedWordCorrection(text, this.writing.language()) : null;
    if (!correction) { this.warn(text); return; }
    node.replaceData(correction.start, correction.before.length, correction.after);
    selection.collapse(node, end + correction.after.length - correction.before.length); this.notify();
    const expected = node.data;
    this.writing.notice.set({ owner: this, kind: 'correction', ...correction, undo: () => {
      if (host.getAttribute('contenteditable') === 'false') return;
      const target = host.contains(node) ? node : this.findUnchangedText(expected);
      if (!target || target.data !== expected) return;
      target.replaceData(correction.start, correction.after.length, correction.before);
      host.focus({ preventScroll: true }); window.getSelection()?.collapse(target, end); this.notify();
    } });
  }
  private findUnchangedText(expected: string): Text | null {
    const walker = document.createTreeWalker(this.host, NodeFilter.SHOW_TEXT);
    let found: Text | null = null; let node: Node | null;
    while ((node = walker.nextNode())) {
      if (node.textContent !== expected) continue;
      if (found) return null;
      found = node as Text;
    }
    return found;
  }
  private warn(text: string): void {
    const word = repeatedWord(text);
    if (word) this.writing.notice.set({ owner: this, kind: 'repetition', before: word });
    else this.writing.dismiss(this);
  }
  private notify(): void {
    this.replacing = true;
    try { this.host.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertReplacementText' })); }
    finally { this.replacing = false; }
  }
  ngOnDestroy(): void { this.writing.dismiss(this); }
}
