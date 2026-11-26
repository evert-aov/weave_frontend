import { describe, expect, it, vi } from 'vitest';
import type { DocumentSectionState } from '../engine/document-engine';
import { textNodes } from '../engine/document-model';
import { BUILTIN_STYLE_TEMPLATES, DEFAULT_LAYOUT_CONFIG } from '../constants/word-document.constants';
import {
  WORD_CONTROL_TARGET,
  applyPureWordModelOperations,
  applyWordControlPayload,
  wordControlField,
  type WordControlHost,
} from './ai-word-control';

function makeParagraph(id: string, text: string, tag: 'p' | 'h1' | 'h2' = 'p') {
  return {
    id,
    kind: 'element' as const,
    tag,
    attributes: {},
    children: [{ id: `${id}-txt`, kind: 'text' as const, text }],
  };
}

function makeTable(id: string) {
  const row = (r: number, cols: string[], cellTag: 'th' | 'td' = 'td') => ({
    id: `${id}-r${r}`,
    kind: 'element' as const,
    tag: 'tr',
    attributes: {},
    children: cols.map((col, c) => ({
      id: `${id}-r${r}c${c}`,
      kind: 'element' as const,
      tag: cellTag,
      attributes: {},
      children: [makeParagraph(`${id}-p-${r}-${c}`, col)],
    })),
  });

  return {
    id,
    kind: 'element' as const,
    tag: 'table',
    attributes: {},
    children: [
      {
        id: `${id}-tbody`,
        kind: 'element' as const,
        tag: 'tbody',
        attributes: {},
        children: [
          row(0, ['Concepto', 'Valor'], 'th'),
          row(1, ['Ingresos', '100']),
          row(2, ['Total', '100']),
        ],
      },
    ],
  };
}

function makeSection(roots: any[]): DocumentSectionState {
  return {
    id: 'sec-1',
    model: {
      state: { revision: 1, roots },
    } as any,
    pages: [],
    displayLists: [],
    laidOutRevision: 1,
    geometryKey: 'g',
  };
}

function createHostSpy(): WordControlHost {
  return {
    renameDocument: vi.fn(),
    updateLayout: vi.fn(),
    applyTemplateById: vi.fn(() => true),
    setHeadingNumbering: vi.fn(),
    insertOrUpdateFormula: vi.fn(() => true),
    deleteFormula: vi.fn(() => true),
    updateToc: vi.fn(),
    addOrUpdateSource: vi.fn(),
    removeSource: vi.fn(),
    insertCitation: vi.fn(),
    insertBibliography: vi.fn(),
    updateAcademic: vi.fn(),
    applyCaption: vi.fn(),
    insertAcademicSection: vi.fn(),
    addAcademicNote: vi.fn(),
    addBlankPage: vi.fn(() => true),
    insertPageBreak: vi.fn(() => true),
  };
}

describe('ai-word-control', () => {
  it('summarizes document layout, media, tables, styles and academic state in wordControlField', () => {
    const sections = [
      makeSection([
        makeParagraph('h1-1', 'Introducción General', 'h1'),
        makeParagraph('p-1', 'Texto inicial con análisis.', 'p'),
        makeTable('tbl-1'),
      ]),
    ];

    const field = wordControlField({
      noteId: 'doc-1',
      title: 'Informe Anual',
      layoutConfig: { ...DEFAULT_LAYOUT_CONFIG, watermarkText: 'BORRADOR' },
      activeTemplateId: BUILTIN_STYLE_TEMPLATES[0].id,
      styleTemplates: BUILTIN_STYLE_TEMPLATES,
      headingNumbering: true,
      activePageIndex: 0,
      pageCount: 2,
      sections,
    });

    expect(field.id).toBe(WORD_CONTROL_TARGET);
    const parsed = JSON.parse(field.text);
    expect(parsed.title).toBe('Informe Anual');
    expect(parsed.layout.watermarkText).toBe('BORRADOR');
    expect(parsed.styles.headingNumbering).toBe(true);
    expect(parsed.metrics.headingsCount).toBe(1);
    expect(parsed.metrics.tablesCount).toBe(1);
    expect(parsed.media.tables[0].nodeId).toBe('tbl-1');
  });

  it('mutates formatting, find/replace, blocks, images and APA table top borders cleanly on DocumentNode', () => {
    const sections = [
      makeSection([
        makeParagraph('h1-1', 'resumen ejecutivo', 'h1'),
        makeParagraph('p-1', 'El proyecto Alfa mejora el rendimiento.', 'p'),
        makeTable('tbl-1'),
      ]),
    ];

    const { updatedBySection, hostOps } = applyPureWordModelOperations(sections, [
      { type: 'formatNodes', scope: 'headings', bold: true, color: '#1e3a8a', changeCase: 'upper' },
      { type: 'findReplace', query: 'alfa', replacement: 'Beta', matchCase: false },
      { type: 'insertBlock', kind: 'paragraph', text: 'Conclusión **final**.', afterNodeId: 'p-1' },
      { type: 'insertImage', src: 'https://example.com/chart.png', alt: 'Gráfico', widthPx: 320, align: 'center' },
      { type: 'toggleTableRowTopBorder', tableNodeId: 'tbl-1', rowIndex: 2, enabled: true },
      { type: 'tableAction', tableNodeId: 'tbl-1', action: 'addRow', cells: ['Neto', '100'] },
    ]);

    expect(hostOps).toEqual([]);
    const nextRoots = updatedBySection.get(0)!;
    expect(nextRoots).toBeDefined();

    const headingText = textNodes([nextRoots[0]]).map(t => t.text).join('');
    expect(headingText).toBe('RESUMEN EJECUTIVO');
    expect((nextRoots[0] as any).attributes['style']).toContain('#1e3a8a');

    const bodyText = textNodes([nextRoots[1]]).map(t => t.text).join('');
    expect(bodyText).toContain('Beta');

    const insertedParagraphText = textNodes([nextRoots[2]]).map(t => t.text).join('');
    expect(insertedParagraphText).toContain('Conclusión');

    const tableNode = nextRoots.find(n => n.kind === 'element' && n.tag === 'table') as any;
    const rows = tableNode.children[0].children;
    expect(rows).toHaveLength(4);
    expect(rows[2].children[0].attributes['data-word-top-border']).toBe('true');
    expect(rows[3].children[0].children[0].children[0].text).toBe('Neto');
  });

  it('dispatches host operations for layout, header/footer, templates, formulas, TOC and APA academic actions', () => {
    const sections = [makeSection([makeParagraph('p-1', 'Contenido')])];
    const commit = vi.fn();
    const host = createHostSpy();

    applyWordControlPayload(
      JSON.stringify({
        operations: [
          { type: 'renameDocument', title: 'Tesis APA 7' },
          { type: 'setLayout', paperFormatId: 'a4', marginPreset: 'apa', pageColor: '#ffffff', watermarkText: '' },
          { type: 'setHeaderFooter', headerText: 'ENCABEZADO', footerText: 'Pie', runningHead: 'Tesis', apaMode: 'professional' },
          { type: 'applyTemplate', templateId: BUILTIN_STYLE_TEMPLATES[0].id },
          { type: 'setHeadingNumbering', enabled: true },
          { type: 'insertOrUpdateFormula', latex: 'E=mc^2', pageIndex: 0 },
          { type: 'updateToc', insertIfMissing: true },
          { type: 'academic', action: 'addSource', source: { id: 'src-1', title: 'Obra', year: '2025' } },
          { type: 'academic', action: 'insertCitation', request: { sourceId: 'src-1', narrative: false, locator: 'p. 12' } },
          { type: 'academic', action: 'insertBibliography' },
          { type: 'academic', action: 'updateAcademic' },
        ],
      }),
      sections,
      commit,
      host,
    );

    expect(commit).not.toHaveBeenCalled();
    expect(host.renameDocument).toHaveBeenCalledWith('Tesis APA 7');
    expect(host.updateLayout).toHaveBeenCalledTimes(2);
    expect(host.applyTemplateById).toHaveBeenCalled();
    expect(host.setHeadingNumbering).toHaveBeenCalledWith(true);
    expect(host.insertOrUpdateFormula).toHaveBeenCalledWith('E=mc^2', undefined, undefined, 0);
    expect(host.updateToc).toHaveBeenCalledWith(true);
    expect(host.addOrUpdateSource).toHaveBeenCalled();
    expect(host.insertCitation).toHaveBeenCalled();
    expect(host.insertBibliography).toHaveBeenCalled();
    expect(host.updateAcademic).toHaveBeenCalled();
  });

  it('styles a specific table and preserves previous style properties on partial updates', () => {
    const sections = [makeSection([makeTable('tbl-1'), makeTable('tbl-2')])];

    const first = applyPureWordModelOperations(sections, [
      {
        type: 'styleTable',
        tableNodeId: 'tbl-1',
        style: {
          borders: 'horizontal',
          borderColor: '#1e3a8a',
          borderWidthPt: 1,
          headerBackgroundColor: '#1e3a8a',
          headerColor: '#ffffff',
          bandedRows: true,
          bandColor: '#f1f5f9',
          fontFamily: 'Georgia',
          fontSizePt: 10,
        },
      },
    ]);

    const roots1 = first.updatedBySection.get(0)!;
    const styledTbl1 = roots1[0] as any;
    const untouchedTbl2 = roots1[1] as any;
    expect(styledTbl1.attributes['data-word-table-style']).toBe('custom');
    expect(styledTbl1.attributes['data-word-table-binding']).toBe('fixed');
    expect(styledTbl1.attributes['style']).toContain('Georgia');
    expect(untouchedTbl2.attributes['data-word-table-style']).toBeUndefined();

    const headerCellStyle = styledTbl1.children[0].children[0].children[0].attributes['style'];
    expect(headerCellStyle).toContain('background-color: #1e3a8a');
    expect(headerCellStyle).toContain('color: #ffffff');

    // Partial follow-up update only changes borderColor while preserving previous rule fields
    const second = applyPureWordModelOperations(
      [makeSection(roots1 as any[])],
      [{ type: 'styleTable', tableNodeId: 'tbl-1', style: { borderColor: '#dc2626' } }],
    );
    const updatedTbl1 = second.updatedBySection.get(0)![0] as any;
    const savedRule = JSON.parse(updatedTbl1.attributes['data-word-table-rule']);
    expect(savedRule.borderColor).toBe('#dc2626');
    expect(savedRule.headerBackgroundColor).toBe('#1e3a8a');
    expect(savedRule.bandedRows).toBe(true);
    expect(savedRule.fontFamily).toBe('Georgia');

    // allTables: true styles every table across sections
    const allRes = applyPureWordModelOperations(sections, [
      { type: 'styleTable', allTables: true, style: { borders: 'none', backgroundColor: '#fafafa' } },
    ]);
    const allRoots = allRes.updatedBySection.get(0)! as any[];
    expect(allRoots[0].attributes['data-word-table-style']).toBe('custom');
    expect(allRoots[1].attributes['data-word-table-style']).toBe('custom');
  });

  it('rejects empty or unknown control operations', () => {
    const host = createHostSpy();
    expect(() => applyWordControlPayload(JSON.stringify({ operations: [] }), [], vi.fn(), host)).toThrow();
    expect(() =>
      applyWordControlPayload(JSON.stringify({ operations: [{ type: 'unknownOp' }] }), [], vi.fn(), host),
    ).toThrow();
  });
});
