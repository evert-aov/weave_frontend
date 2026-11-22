import type { Sheet } from '../models/excel.model';
import {
  buildFormulaRecalcSnapshot,
  computeWorkbookFormulas,
  FormulaRecalcResult,
} from './formula-recalc.engine';

/** Coordinates background workbook recalculation in a Web Worker with safe fallback. */
export class FormulaRecalcClient {
  private worker: Worker | null = null;
  private workerDisabled = false;
  private disposed = false;
  private latestRevision = 0;
  private pendingCallback: ((result: FormulaRecalcResult) => void) | null = null;

  constructor(private readonly workerFactory?: () => Worker) {}

  schedule(
    revision: number,
    sheets: readonly Sheet[],
    onResult: (result: FormulaRecalcResult) => void,
    sheetIds?: string[],
  ): void {
    if (this.disposed) return;
    this.latestRevision = revision;
    this.pendingCallback = onResult;
    const snapshot = buildFormulaRecalcSnapshot(sheets);
    const worker = this.ensureWorker();

    if (!worker) {
      queueMicrotask(() => {
        if (this.disposed || revision !== this.latestRevision) return;
        const result = computeWorkbookFormulas(snapshot, revision, sheetIds);
        if (!this.disposed && revision === this.latestRevision) {
          this.pendingCallback?.(result);
        }
      });
      return;
    }

    try {
      worker.postMessage({ revision, sheets: snapshot, sheetIds });
    } catch {
      this.disableWorker();
      queueMicrotask(() => {
        if (this.disposed || revision !== this.latestRevision) return;
        const result = computeWorkbookFormulas(snapshot, revision, sheetIds);
        if (!this.disposed && revision === this.latestRevision) {
          this.pendingCallback?.(result);
        }
      });
    }
  }

  terminate(): void {
    this.disposed = true;
    this.pendingCallback = null;
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
  }

  private ensureWorker(): Worker | null {
    if (this.disposed || this.workerDisabled) return null;
    if (this.worker) return this.worker;
    if (!this.workerFactory && typeof Worker === 'undefined') return null;

    try {
      const worker = this.workerFactory
        ? this.workerFactory()
        : new Worker(new URL('./formula-recalc.worker', import.meta.url), { type: 'module' });
      worker.onmessage = ({ data }: MessageEvent<FormulaRecalcResult>) => {
        if (this.disposed || !data || data.revision !== this.latestRevision || data.error) return;
        this.pendingCallback?.(data);
      };
      worker.onerror = () => {
        this.disableWorker();
      };
      this.worker = worker;
      return worker;
    } catch {
      this.workerDisabled = true;
      return null;
    }
  }

  private disableWorker(): void {
    this.workerDisabled = true;
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
  }
}
