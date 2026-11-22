import { describe, expect, it, vi } from 'vitest';
import type { Sheet } from '../models/excel.model';
import { FormulaRecalcClient } from './formula-recalc-client';
import {
  buildFormulaRecalcSnapshot,
  computeWorkbookFormulas,
  hasWorkbookFormulas,
} from './formula-recalc.engine';

function makeSheets(): Sheet[] {
  return [
    {
      id: 'sheet1',
      name: 'Ventas',
      type: 'grid',
      data: {
        A1: { raw: '100' },
        A2: { raw: '250' },
        A3: { raw: '=SUM(A1:A2)' },
      },
      artwork: [
        {
          id: 'img-1',
          kind: 'image',
          itemId: 'logo.png',
          imageDataUrl: 'data:image/png;base64,AAA',
          x: 10,
          y: 10,
          width: 100,
          height: 80,
        },
      ],
    },
    {
      id: 'sheet2',
      name: 'Resumen',
      type: 'grid',
      data: {
        B1: { raw: '=Ventas!A3*2' },
        B2: { raw: 'SoloTexto' },
      },
    },
  ];
}

describe('formula-recalc worker client & engine', () => {
  it('detects formulas and builds lightweight snapshots without heavy media payloads', () => {
    const sheets = makeSheets();
    expect(hasWorkbookFormulas(sheets)).toBe(true);
    expect(hasWorkbookFormulas([{ id: 's', name: 'S', type: 'grid', data: { A1: { raw: '42' } } }])).toBe(false);

    const snapshot = buildFormulaRecalcSnapshot(sheets);
    expect(snapshot[0]).not.toHaveProperty('artwork');
    expect(Object.keys(snapshot[0].data)).toEqual(['A1', 'A2', 'A3']);

    const result = computeWorkbookFormulas(snapshot, 7);
    expect(result.revision).toBe(7);
    expect(result.computedBySheet['sheet1']).toEqual([['A3', 350]]);
    expect(result.computedBySheet['sheet2']).toEqual([['B1', 700]]);
  });

  it('falls back cleanly via microtask when Worker is unavailable', async () => {
    const client = new FormulaRecalcClient();
    const sheets = makeSheets();
    const onResult = vi.fn();

    client.schedule(3, sheets, onResult);
    await Promise.resolve();
    await Promise.resolve();

    expect(onResult).toHaveBeenCalledTimes(1);
    expect(onResult.mock.calls[0][0].revision).toBe(3);
    expect(onResult.mock.calls[0][0].computedBySheet['sheet2']).toEqual([['B1', 700]]);
    client.terminate();
  });

  it('discards stale worker revisions and terminates cleanly', () => {
    const posted: unknown[] = [];
    const mockWorker = {
      onmessage: null as ((event: MessageEvent) => void) | null,
      onerror: null as ((event: ErrorEvent) => void) | null,
      postMessage: vi.fn((payload: unknown) => posted.push(payload)),
      terminate: vi.fn(),
    } as unknown as Worker;

    const client = new FormulaRecalcClient(() => mockWorker);
    const onResult = vi.fn();
    const sheets = makeSheets();

    client.schedule(1, sheets, onResult);
    client.schedule(2, sheets, onResult);
    expect(posted).toHaveLength(2);

    mockWorker.onmessage?.({
      data: { revision: 1, computedBySheet: { sheet1: [['A3', 999]] } },
    } as MessageEvent);
    expect(onResult).not.toHaveBeenCalled();

    mockWorker.onmessage?.({
      data: { revision: 2, computedBySheet: { sheet1: [['A3', 350]] } },
    } as MessageEvent);
    expect(onResult).toHaveBeenCalledTimes(1);
    expect(onResult.mock.calls[0][0].revision).toBe(2);

    client.terminate();
    expect(mockWorker.terminate).toHaveBeenCalledTimes(1);
    mockWorker.onmessage?.({
      data: { revision: 2, computedBySheet: { sheet1: [['A3', 123]] } },
    } as MessageEvent);
    expect(onResult).toHaveBeenCalledTimes(1);
  });
});
