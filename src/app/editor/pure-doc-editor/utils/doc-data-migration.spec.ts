import { describe, expect, it } from 'vitest';
import { DocumentCanvasEngine } from '../engine/document-engine';
import { htmlToDocumentState } from '../engine/document-model-dom';
import { mapModelSectionImages, normalizeLoadedDocData } from './doc-data-migration';

describe('doc-data migration and model serialization', () => {
  it('migrates legacy v2 payloads to v3 and validates v3 modelSections alignment', () => {
    const legacy = normalizeLoadedDocData({
      v: 2,
      docTitle: 'Legacy',
      pages: [{ id: 'p1', html: '<p>Hola</p>' }],
    });
    expect(legacy.v).toBe(3);
    expect(legacy.modelSections).toBeUndefined();

    const state = htmlToDocumentState('<p>Desde modelo</p>', 3, 'sec-0');
    const validV3 = normalizeLoadedDocData({
      v: 3,
      pages: [{ id: 'p1', html: '<p>Desde modelo</p>' }],
      modelSections: [{ id: 'p1', state, pageIds: ['p1'] }],
    });
    expect(validV3.modelSections?.length).toBe(1);

    const mismatchedV3 = normalizeLoadedDocData({
      v: 3,
      pages: [{ id: 'p1', html: '<p>A</p>' }, { id: 'p2', html: '<p>B</p>' }],
      modelSections: [{ id: 'p1', state, pageIds: ['p1'] }],
    });
    expect(mismatchedV3.modelSections).toBeUndefined();
  });

  it('transforms image srcs inside modelSections without mutating input trees and loads preloaded models directly', async () => {
    const state = htmlToDocumentState('<p><img src="/uploads/foto.png" width="100" height="80" /> Texto</p>', 2, 'sec-0');
    const sections = [{ id: 'p1', state, pageIds: ['p1'] }];
    const resolved = await mapModelSectionImages(sections, async src => `https://cdn.example${src}`);

    expect(resolved[0].state.roots).not.toBe(sections[0].state.roots);
    expect(JSON.stringify(resolved[0].state.roots)).toContain('https://cdn.example/uploads/foto.png');
    expect(JSON.stringify(sections[0].state.roots)).not.toContain('https://cdn.example');

    const engine = new DocumentCanvasEngine(t => ({ width: [...t].length * 6, ascent: 10, descent: 3 }));
    engine.syncPages(
      [{ id: 'p1', html: '<p><img src="https://cdn.example/uploads/foto.png" width="100" height="80" /> Texto</p>' }],
      { width: 600, height: 800, top: 40, right: 40, bottom: 40, left: 40 },
      resolved,
    );
    expect(engine.getSections()[0].model.state).toBe(resolved[0].state);
  });
});
