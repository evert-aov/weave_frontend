import { describe, it, expect } from 'vitest';
import type { Note } from '../models/note.model';
import {
  extractNoteTextContent,
  extractSheetNoteText,
  extractWordNoteText,
  extractBlockNoteText,
  noteToAiAttachment,
  getDocTypeLabel,
} from './ai-note-reader';

describe('ai-note-reader', () => {
  it('returns appropriate human-readable labels for document types', () => {
    expect(getDocTypeLabel('sheet')).toBe('Excel');
    expect(getDocTypeLabel('doc')).toBe('Word');
    expect(getDocTypeLabel('block')).toBe('Bloques');
    expect(getDocTypeLabel('latex')).toBe('LaTeX');
    expect(getDocTypeLabel('slide')).toBe('PowerPoint');
    expect(getDocTypeLabel('canvas')).toBe('Pizarra');
    expect(getDocTypeLabel(undefined)).toBe('Nota');
  });

  it('extracts structured content from Excel sheet notes including tables, charts and cell formulas', () => {
    const sheetNote: Note = {
      _id: 'sheet-123',
      userId: 'u1',
      title: 'Presupuesto 2026',
      space: 'Finanzas',
      docType: 'sheet',
      tags: [],
      blocks: [],
      docData: {
        sheets: [
          {
            id: 's1',
            name: 'Ingresos y Costos',
            tables: [
              { name: 'TablaVentas', range: { startCol: 0, startRow: 0, endCol: 2, endRow: 2 } }
            ],
            charts: [
              { title: 'Balance Anual', category: 'line', subType: 'line' }
            ],
            data: {
              A1: { raw: 'Concepto' },
              B1: { raw: 'Monto (Bs.)' },
              A2: { raw: 'Ventas brutas' },
              B2: { raw: 150000, computed: 150000 },
              A3: { raw: 'Impuestos' },
              B3: { raw: 19500, computed: 19500, formula: 'B2*0.13' },
            },
          },
          {
            id: 's2',
            name: 'Notas adicionales',
            data: {},
          }
        ],
      },
    };

    const text = extractSheetNoteText(sheetNote);
    expect(text).toContain('[Hoja de cálculo: "Presupuesto 2026"]');
    expect(text).toContain('--- Hoja: "Ingresos y Costos" ---');
    expect(text).toContain('TablaVentas');
    expect(text).toContain('Balance Anual');
    expect(text).toContain('Fila 1: A: Concepto | B: Monto (Bs.)');
    expect(text).toContain('Fila 2: A: Ventas brutas | B: 150000');
    expect(text).toContain('Fila 3: A: Impuestos | B: 19500 [fórmula: =B2*0.13]');
    expect(text).toContain('--- Hoja: "Notas adicionales" ---');
    expect(text).toContain('(Sin celdas registradas)');
  });

  it('extracts structured content from Word document notes with headings, paragraphs, and markdown tables', () => {
    const wordNote: Note = {
      _id: 'word-456',
      userId: 'u1',
      title: 'Informe Económico',
      space: 'Research',
      docType: 'doc',
      tags: [],
      blocks: [],
      docData: {
        pages: [
          {
            id: 'p1',
            html: `
              <h1>RESUMEN EJECUTIVO</h1>
              <p>Este informe detalla los objetivos del proyecto.</p>
              <h2>Indicadores Clave</h2>
              <table>
                <thead>
                  <tr><th>Indicador</th><th>Meta</th></tr>
                </thead>
                <tbody>
                  <tr><td>Crecimiento</td><td>15%</td></tr>
                  <tr><td>Margen Neto</td><td>22%</td></tr>
                </tbody>
              </table>
              <ul>
                <li>Primer punto importante</li>
                <li>Segundo punto relevante</li>
              </ul>
            `,
          },
        ],
      },
    };

    const text = extractWordNoteText(wordNote);
    expect(text).toContain('[Documento Word: "Informe Económico"]');
    expect(text).toContain('--- Página 1 ---');
    expect(text).toContain('# RESUMEN EJECUTIVO');
    expect(text).toContain('Este informe detalla los objetivos del proyecto.');
    expect(text).toContain('## Indicadores Clave');
    expect(text).toContain('| Indicador | Meta |');
    expect(text).toContain('| --- | --- |');
    expect(text).toContain('| Crecimiento | 15% |');
    expect(text).toContain('| Margen Neto | 22% |');
    expect(text).toContain('- Primer punto importante');
    expect(text).toContain('- Segundo punto relevante');
  });

  it('extracts block note content including code, latex, and mermaid', () => {
    const blockNote: Note = {
      _id: 'block-789',
      userId: 'u1',
      title: 'Apuntes de Algoritmos',
      space: 'Dev',
      docType: 'block',
      tags: [],
      blocks: [
        { id: 'b1', order: 0, type: 'text', content: { html: '<p>Introducción a grafos</p>' } },
        { id: 'b2', order: 1, type: 'code', content: { code: 'def dijkstra(): pass', language: 'python' } },
        { id: 'b3', order: 2, type: 'latex', content: { formula: 'E = mc^2' } },
        { id: 'b4', order: 3, type: 'mermaid', content: { chart: 'graph TD; A-->B;' } },
      ],
    };

    const text = extractBlockNoteText(blockNote);
    expect(text).toContain('[Documento de bloques: "Apuntes de Algoritmos"]');
    expect(text).toContain('Introducción a grafos');
    expect(text).toContain('```python\ndef dijkstra(): pass\n```');
    expect(text).toContain('$$E = mc^2$$');
    expect(text).toContain('```mermaid\ngraph TD; A-->B;\n```');
  });

  it('converts a note into a valid AiAttachment with type tag', () => {
    const note: Note = {
      _id: 'doc-999',
      userId: 'u1',
      title: 'Balance Trimestral',
      space: 'Finanzas',
      docType: 'sheet',
      tags: [],
      blocks: [],
      docData: {
        sheets: [
          { id: 's1', name: 'Resumen', data: { A1: { raw: 'Ingresos: 5000' } } }
        ]
      }
    };

    const attachment = noteToAiAttachment(note);
    expect(attachment.name).toBe('Balance Trimestral (Excel)');
    expect(attachment.mimeType).toBe('text/plain');
    expect(attachment.text).toContain('Fila 1: A: Ingresos: 5000');
  });

  it('truncates text safely if note exceeds 180,000 characters', () => {
    const largeText = 'A'.repeat(200000);
    const hugeNote: Note = {
      _id: 'huge-1',
      userId: 'u1',
      title: 'Nota Gigante',
      space: 'General',
      docType: 'latex',
      tags: [],
      blocks: [],
      docData: { source: largeText },
    };

    const text = extractNoteTextContent(hugeNote);
    expect(text.length).toBeLessThan(181000);
    expect(text).toContain('[... Contenido recortado por límite de tamaño de adjunto]');
  });
});
