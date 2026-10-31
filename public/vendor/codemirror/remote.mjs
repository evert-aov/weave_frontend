// One module graph for core and Vim. Generated local builds use this same entry.
export { EditorState, StateField, StateEffect, Compartment } from '@codemirror/state';
export { EditorView, Decoration, WidgetType, keymap, drawSelection, highlightActiveLine } from '@codemirror/view';
export { history, historyKeymap, defaultKeymap, indentWithTab } from '@codemirror/commands';
export { searchKeymap } from '@codemirror/search';
export function loadVim() { return import('@replit/codemirror-vim'); }
