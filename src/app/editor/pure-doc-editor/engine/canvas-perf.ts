export type CanvasPerfPhase = 'layout' | 'render' | 'sync' | 'ai';

export interface CanvasPerfSample {
  phase: CanvasPerfPhase;
  durationMs: number;
  nodes?: number;
  pages?: number;
}

export interface PhaseStats {
  count: number;
  avgMs: number;
  p95Ms: number;
  maxMs: number;
  longTasks: number;
}

export interface CanvasPerfReport {
  phases: Record<CanvasPerfPhase, PhaseStats>;
  lastNodeCount: number;
  lastPageCount: number;
  usedJSHeapBytes?: number;
  workerRecommendation: {
    offloadToWorker: boolean;
    reason: string;
  };
}

const MAX_SAMPLES_PER_PHASE = 120;
const PHASES: readonly CanvasPerfPhase[] = ['layout', 'render', 'sync', 'ai'];

function summarize(samples: readonly CanvasPerfSample[], thresholdMs: number): PhaseStats {
  if (!samples.length) {
    return { count: 0, avgMs: 0, p95Ms: 0, maxMs: 0, longTasks: 0 };
  }
  const durations = samples.map(s => s.durationMs).sort((a, b) => a - b);
  const sum = durations.reduce((acc, v) => acc + v, 0);
  const p95Idx = Math.min(durations.length - 1, Math.floor(durations.length * 0.95));
  const longTasks = durations.filter(d => d > thresholdMs).length;
  return {
    count: durations.length,
    avgMs: Math.round((sum / durations.length) * 100) / 100,
    p95Ms: Math.round(durations[p95Idx] * 100) / 100,
    maxMs: Math.round(durations[durations.length - 1] * 100) / 100,
    longTasks,
  };
}

export class CanvasPerfMonitor {
  private readonly samples: Record<CanvasPerfPhase, CanvasPerfSample[]> = {
    layout: [],
    render: [],
    sync: [],
    ai: [],
  };
  private lastNodeCount = 0;
  private lastPageCount = 0;

  now(): number {
    return typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? performance.now()
      : Date.now();
  }

  record(phase: CanvasPerfPhase, durationMs: number, nodes?: number, pages?: number): void {
    const safeMs = Math.max(0, Number.isFinite(durationMs) ? durationMs : 0);
    const bucket = this.samples[phase];
    bucket.push({ phase, durationMs: safeMs, nodes, pages });
    if (bucket.length > MAX_SAMPLES_PER_PHASE) bucket.shift();
    if (typeof nodes === 'number') this.lastNodeCount = nodes;
    if (typeof pages === 'number') this.lastPageCount = pages;
  }

  reset(): void {
    for (const phase of PHASES) this.samples[phase].length = 0;
    this.lastNodeCount = 0;
    this.lastPageCount = 0;
  }

  getReport(longTaskThresholdMs = 16.6): CanvasPerfReport {
    const phases = {
      layout: summarize(this.samples.layout, longTaskThresholdMs),
      render: summarize(this.samples.render, longTaskThresholdMs),
      sync: summarize(this.samples.sync, longTaskThresholdMs),
      ai: summarize(this.samples.ai, longTaskThresholdMs),
    };
    const perfMemory = typeof performance !== 'undefined'
      ? (performance as Performance & { memory?: { usedJSHeapSize?: number } }).memory
      : undefined;
    const usedJSHeapBytes = typeof perfMemory?.usedJSHeapSize === 'number' ? perfMemory.usedJSHeapSize : undefined;

    const layoutLongRatio = phases.layout.count ? phases.layout.longTasks / phases.layout.count : 0;
    const renderLongRatio = phases.render.count ? phases.render.longTasks / phases.render.count : 0;
    const offloadToWorker =
      (phases.layout.p95Ms > longTaskThresholdMs && this.lastNodeCount > 2500) ||
      layoutLongRatio > 0.25 ||
      (phases.render.p95Ms > longTaskThresholdMs && renderLongRatio > 0.25);

    const reason = offloadToWorker
      ? `Umbral de presupuesto de cuadro (${longTaskThresholdMs} ms) superado con p95 layout=${phases.layout.p95Ms} ms / render=${phases.render.p95Ms} ms y ${this.lastNodeCount} nodos.`
      : phases.layout.count || phases.render.count
        ? `Dentro de presupuesto en hilo principal (p95 layout=${phases.layout.p95Ms} ms, p95 render=${phases.render.p95Ms} ms); sin costo de serialización entre hilos.`
        : 'Sin muestras registradas aún; ejecutar en hilo principal por defecto.';

    return {
      phases,
      lastNodeCount: this.lastNodeCount,
      lastPageCount: this.lastPageCount,
      ...(usedJSHeapBytes !== undefined ? { usedJSHeapBytes } : {}),
      workerRecommendation: { offloadToWorker, reason },
    };
  }
}
