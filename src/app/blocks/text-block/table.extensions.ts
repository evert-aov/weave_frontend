import { Extension, Node } from '@tiptap/core';
import type { TagParseRule } from '@tiptap/pm/model';
import {
  addColumnAfter, addRowAfter, deleteColumn, deleteRow, deleteTable,
  goToNextCell, isInTable, mergeCells, splitCell, tableEditing, tableNodes, toggleHeaderRow,
} from '@tiptap/pm/tables';

export const tableActions = {
  addRow: addRowAfter, addColumn: addColumnAfter,
  deleteRow, deleteColumn, deleteTable, mergeCells, splitCell, toggleHeaderRow,
};
export type TableAction = keyof typeof tableActions;

// Adaptador pequeño del esquema oficial de ProseMirror, incluido en la versión instalada de Tiptap.
const specs = tableNodes({
  tableGroup: 'block', cellContent: 'block+',
  cellAttributes: {
    background: {
      default: null,
      getFromDOM: (dom) => dom.style.backgroundColor || null,
      setDOMAttr: (value, attrs) => { if (value) attrs['style'] = `background-color:${value};`; },
    },
    alignment: {
      default: null,
      getFromDOM: (dom) => dom.style.textAlign || null,
      setDOMAttr: (value, attrs) => { if (value) attrs['style'] = `${attrs['style'] ?? ''}text-align:${value};`; },
    },
  },
});

const tableSchema = Object.entries(specs).map(([name, spec]) => Node.create({
  name, content: spec.content, group: spec.group, isolating: spec.isolating,
  addAttributes() {
    return Object.fromEntries(Object.entries(spec.attrs ?? {}).map(([key, attr]) => [key, {
      default: attr.default,
      // Los parsers/toDOM oficiales conservan colspan, rowspan y data-colwidth.
      parseHTML: () => null, rendered: false,
    }]));
  },
  parseHTML: () => spec.parseDOM as TagParseRule[],
  renderHTML: ({ node }) => spec.toDOM!(node),
  extendNodeSchema: (extension) => extension.name === name ? { tableRole: spec['tableRole'] } : {},
}));

export const textTableExtensions = [
  ...tableSchema,
  Extension.create({
    name: 'weaveTableEditing',
    addProseMirrorPlugins: () => [tableEditing()],
    addKeyboardShortcuts() {
      return {
        Tab: () => {
          const { state, dispatch } = this.editor.view;
          if (goToNextCell(1)(state, dispatch)) return true;
          if (!isInTable(state)) return false;
          return this.editor.chain()
            .command(({ state, dispatch }) => addRowAfter(state, dispatch))
            .command(({ state, dispatch }) => goToNextCell(1)(state, dispatch)).run();
        },
        'Shift-Tab': () => goToNextCell(-1)(this.editor.state, this.editor.view.dispatch),
      };
    },
  }),
];
