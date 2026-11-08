import type { Sheet } from '../models/excel.model';

/** Decode XLSX outside the UI thread; keep native support for runtimes without Worker. */
export async function importXlsxWorkbook(buffer: ArrayBuffer, names: string[]): Promise<Sheet[]> {
  if (typeof Worker === 'undefined') {
    const { readXlsx } = await import('./xlsx.service');
    return readXlsx(buffer, names);
  }
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./xlsx.worker', import.meta.url), { type: 'module' });
    worker.onmessage = ({ data }: MessageEvent<{ sheets?: Sheet[]; error?: string }>) => {
      worker.terminate();
      if (data.error) reject(new Error(data.error));
      else if (data.sheets?.length) resolve(data.sheets);
      else reject(new Error('El archivo no contiene hojas.'));
    };
    worker.onerror = () => { worker.terminate(); reject(new Error('No se pudo procesar el archivo Excel.')); };
    worker.postMessage({ buffer, names }, [buffer]);
  });
}
