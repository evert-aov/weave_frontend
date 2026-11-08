import { readXlsx } from './xlsx.service';

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<{ buffer: ArrayBuffer; names: string[] }>) => void) | null;
  postMessage: (message: unknown) => void;
};
scope.onmessage = async ({ data }) => {
  try { scope.postMessage({ sheets: await readXlsx(data.buffer, data.names) }); }
  catch (error) { scope.postMessage({ error: error instanceof Error ? error.message : 'No se pudo leer el archivo XLSX.' }); }
};
