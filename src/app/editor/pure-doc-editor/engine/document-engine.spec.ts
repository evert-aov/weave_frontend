import { describe, it, expect } from 'vitest';
import { DocumentCanvasEngine } from './document-engine';
import { DocumentPage } from '../models/word-document.model';

describe('DocumentCanvasEngine authoritative engine', () => {
  const geometry = { width: 600, height: 800, top: 40, right: 40, bottom: 40, left: 40 };

  it('synchronizes HTML pages into authoritative document model and layout display lists', () => {
    const engine = new DocumentCanvasEngine();
    const pages: DocumentPage[] = [
      { id: 'p1', html: '<h1>Título Documento</h1><p>Primer párrafo con texto.</p>' },
      { id: 'p2', html: '<p>Segundo párrafo en otra hoja.</p>', breakBefore: 'manual' },
    ];
    const displayLists = engine.syncPages(pages, geometry);
    expect(displayLists.length).toBeGreaterThanOrEqual(2);
    expect(displayLists[0].id).toBe('p1');
    expect(displayLists[1].id).toBe('p2');
    const textCommands = displayLists[0].commands.filter(c => c.kind === 'text');
    expect(textCommands.map(c => c.text).join('')).toContain('Título');
    expect(engine.getSections()).toHaveLength(2);
  });

  it('performs hit testing and pointer selection directly on laid out Canvas pages', () => {
    const engine = new DocumentCanvasEngine();
    const pages: DocumentPage[] = [{ id: 'p1', html: '<p>Palabra</p>' }];
    engine.syncPages(pages, geometry);
    const hit = engine.hitTest('p1', 45, 45);
    expect(hit).not.toBeNull();
    expect(hit?.nodeId).toBeTruthy();

    const selection = engine.selectByPointer('p1', { x: 40, y: 45 }, { x: 80, y: 45 });
    expect(selection).not.toBeNull();
    expect(selection?.anchor.nodeId).toBe(selection?.focus.nodeId);
    expect(selection?.focus.offset).toBeGreaterThan(selection!.anchor.offset);
  });

  it('searches and replaces text across the document model, updating display lists', () => {
    const engine = new DocumentCanvasEngine();
    const pages: DocumentPage[] = [
      { id: 'p1', html: '<p>El veloz murciélago hindú comía feliz cardillo.</p>' },
    ];
    engine.syncPages(pages, geometry);
    const matches = engine.findText('murciélago');
    expect(matches).toHaveLength(1);
    expect(matches[0].text).toBe('murciélago');

    const replaced = engine.replaceAll('murciélago', 'halcón', geometry);
    expect(replaced).toBe(1);
    const updatedMatches = engine.findText('halcón');
    expect(updatedMatches).toHaveLength(1);
    const displayLists = engine.getDisplayLists();
    const textCommands = displayLists[0].commands.filter(c => c.kind === 'text');
    expect(textCommands.map(c => c.text).join('')).toContain('halcón');
    expect(textCommands.map(c => c.text).join('')).not.toContain('murciélago');
  });

  it('supports undo and redo on logical section operations', () => {
    const engine = new DocumentCanvasEngine();
    const pages: DocumentPage[] = [{ id: 'p1', html: '<p>Original</p>' }];
    engine.syncPages(pages, geometry);
    const sec = engine.getSections()[0];
    const leaf = sec.model.state.roots[0].kind === 'element' && sec.model.state.roots[0].children[0].kind === 'text'
      ? sec.model.state.roots[0].children[0]
      : null;
    expect(leaf).not.toBeNull();

    engine.applyOperation(0, {
      type: 'replaceText',
      selection: {
        anchor: { nodeId: leaf!.id, offset: 0 },
        focus: { nodeId: leaf!.id, offset: leaf!.text.length },
      },
      text: 'Modificado',
    }, geometry);

    expect(engine.findText('Modificado')).toHaveLength(1);
    expect(engine.undo(0, geometry)).toBe(true);
    expect(engine.findText('Original')).toHaveLength(1);
    expect(engine.redo(0, geometry)).toBe(true);
    expect(engine.findText('Modificado')).toHaveLength(1);
  });
});
