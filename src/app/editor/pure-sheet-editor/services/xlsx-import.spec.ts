import { afterEach, expect, it, vi } from 'vitest';
import { importXlsxWorkbook } from './xlsx-import';

class ImportWorker {
  static latest: ImportWorker;
  onmessage?: (event: { data: unknown }) => void;
  onerror?: () => void;
  postMessage = vi.fn();
  terminate = vi.fn();
  constructor(..._args: unknown[]) { ImportWorker.latest = this; }
}
afterEach(() => vi.unstubAllGlobals());

it('transfers XLSX data to the worker and releases it after completion', async () => {
  vi.stubGlobal('Worker', ImportWorker);
  const buffer = new ArrayBuffer(4);
  const pending = importXlsxWorkbook(buffer, ['Existente']);
  const worker = ImportWorker.latest;
  expect(worker.postMessage).toHaveBeenCalledWith({ buffer, names: ['Existente'] }, [buffer]);
  const sheets = [{ id: 'a', name: 'Importada', type: 'grid', data: {} }];
  worker.onmessage!({ data: { sheets } });
  await expect(pending).resolves.toEqual(sheets);
  expect(worker.terminate).toHaveBeenCalledOnce();
});
it('releases the worker and reports corrupt workbook errors', async () => {
  vi.stubGlobal('Worker', ImportWorker);
  const pending = importXlsxWorkbook(new ArrayBuffer(0), []);
  ImportWorker.latest.onmessage!({ data: { error: 'Archivo inválido' } });
  await expect(pending).rejects.toThrow('Archivo inválido');
  expect(ImportWorker.latest.terminate).toHaveBeenCalledOnce();
});
