import { CodeMirrorRuntime } from './codemirror-runtime.service';
import { markdownParts, MarkdownPart } from './markdown-document';

/** Direct StateField decorations: block widgets affect layout and cannot use viewport plugins. */
export function livePreviewExtensions(cm: CodeMirrorRuntime, editRichHtml?: () => void) {
  const { StateField, StateEffect, EditorView, Decoration, WidgetType } = cm;
  const display = StateEffect.define();
  const focused = StateEffect.define();
  const mode = StateField.define({
    create: () => ({ live: true, focused: false, readonly: false }),
    update(value: any, tr: any) {
      for (const effect of tr.effects) {
        if (effect.is(display)) value = { ...value, ...effect.value };
        if (effect.is(focused)) value = { ...value, focused: effect.value };
      }
      return value;
    },
  });
  let cachedSource = '', parts: MarkdownPart[] = [];
  class PreviewWidget extends WidgetType {
    constructor(readonly source: string, readonly html: string, readonly from: number, readonly readOnly: boolean, readonly richHtml: boolean) { super(); }
    eq(other: PreviewWidget) { return this.source === other.source && this.html === other.html && this.from === other.from && this.readOnly === other.readOnly && this.richHtml === other.richHtml; }
    toDOM(view: any) {
      const element = document.createElement('div');
      element.className = 'weave-md-preview'; element.innerHTML = this.html;
      if (this.richHtml && !this.readOnly && editRichHtml) {
        const edit = document.createElement('button'); edit.type = 'button';
        edit.className = 'rich-html-edit'; edit.textContent = 'Editar contenido con formato';
        edit.addEventListener('mousedown', event => { event.preventDefault(); event.stopPropagation(); });
        edit.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); editRichHtml(); });
        element.append(edit);
      }
      element.addEventListener('mousedown', event => {
        if (this.readOnly || event.button !== 0 || (event.target as Element).closest('a')) return;
        if (this.richHtml) return;
        event.preventDefault();
        // Place the caret on the clicked text when available, then reveal that source paragraph.
        const range = document.caretRangeFromPoint?.(event.clientX, event.clientY);
        let offset = 0;
        if (range && element.contains(range.startContainer)) {
          const prefix = document.createRange(); prefix.selectNodeContents(element);
          prefix.setEnd(range.startContainer, range.startOffset);
          const text = prefix.toString();
          const lastWord = text.match(/\S+$/)?.[0];
          const found = lastWord ? this.source.indexOf(lastWord) : -1;
          if (found >= 0) offset = found + lastWord!.length;
        }
        view.dispatch({ selection: { anchor: Math.min(this.from + offset, view.state.doc.length) }, effects: focused.of(true), scrollIntoView: true });
        view.focus();
      });
      element.querySelectorAll('img').forEach(img => img.addEventListener('load', () => view.requestMeasure(), { once: true }));
      return element;
    }
    ignoreEvent() { return true; }
  }
  const build = (state: any) => {
    const settings = state.field(mode);
    if (!settings.live && !settings.readonly) return Decoration.none;
    const source = state.doc.toString();
    if (source !== cachedSource) { cachedSource = source; parts = markdownParts(source); }
    const ranges: any[] = [];
    for (const part of parts) {
      const active = !settings.readonly && settings.focused && state.selection.ranges.some((range: any) =>
        range.from <= part.to && range.to >= part.from);
      if (!active || part.type === 'html') ranges.push(Decoration.replace({ widget: new PreviewWidget(part.raw, part.html, part.from, settings.readonly, part.type === 'html'), block: true }).range(part.from, part.to));
      else {
        if (part.type === 'heading') ranges.push(Decoration.line({ class: `cm-md-heading cm-md-h${part.depth}` }).range(state.doc.lineAt(part.from).from));
        if (part.type !== 'code' && part.type !== 'html') {
          // Keep punctuation visible in the active paragraph while styling its text in place.
          for (const match of part.raw.matchAll(/\*\*(.+?)\*\*|__(.+?)__|`([^`]+)`|~~(.+?)~~/g)) {
            ranges.push(Decoration.mark({ class: match[3] ? 'cm-md-code' : match[4] ? 'cm-md-strike' : 'cm-md-bold' }).range(part.from + match.index!, part.from + match.index! + match[0].length));
          }
        }
      }
    }
    return Decoration.set(ranges, true);
  };
  const decorations = StateField.define({
    create: (state: any) => build(state),
    update(value: any, tr: any) {
      return tr.docChanged || tr.selection || tr.effects.some((effect: any) => effect.is(display) || effect.is(focused)) ? build(tr.state) : value;
    },
    provide: (field: any) => EditorView.decorations.from(field),
  });
  const focusHandlers = EditorView.domEventHandlers({
    focus: (_: Event, view: any) => { queueMicrotask(() => { if (view.dom.isConnected) view.dispatch({ effects: focused.of(true) }); }); return false; },
    blur: (_: Event, view: any) => { queueMicrotask(() => { if (view.dom.isConnected) view.dispatch({ effects: focused.of(false) }); }); return false; },
  });
  const atomicHtml = EditorView.atomicRanges.of((view: any) => view.state.field(decorations).update({
    filter: (_from: number, _to: number, value: any) => value.spec.widget?.richHtml === true,
  }));
  return { extensions: [mode, decorations, atomicHtml, focusHandlers], display };
}
