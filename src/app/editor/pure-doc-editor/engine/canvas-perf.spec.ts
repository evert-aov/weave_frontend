import { describe, expect, it } from 'vitest';
import { CanvasPerfMonitor } from './canvas-perf';
import { DocumentCanvasEngine } from './document-engine';

describe('CanvasPerfMonitor', () => {
  it('summarizes phases and recommends keeping main thread when within frame budget', () => {
    const monitor = new CanvasPerfMonitor();
    monitor.record('layout', 4.2, 180, 2);
    monitor.record('layout', 6.8, 220, 2);
    monitor.record('render', 2.5, 220, 2);

    const report = monitor.getReport();
    expect(report.phases.layout.count).toBe(2);
    expect(report.phases.layout.avgMs).toBe(5.5);
    expect(report.phases.layout.longTasks).toBe(0);
    expect(report.lastNodeCount).toBe(220);
    expect(report.lastPageCount).toBe(2);
    expect(report.workerRecommendation.offloadToWorker).toBe(false);
  });

  it('recommends worker offload when long-task ratio or large-document p95 exceeds budget', () => {
    const monitor = new CanvasPerfMonitor();
    for (let i = 0; i < 10; i++) {
      monitor.record('layout', i < 4 ? 22 : 12, 3200, 20);
    }

    const report = monitor.getReport(16.6);
    expect(report.phases.layout.longTasks).toBe(4);
    expect(report.phases.layout.p95Ms).toBeGreaterThan(16.6);
    expect(report.workerRecommendation.offloadToWorker).toBe(true);
  });

  it('records layout and sync timings inside DocumentCanvasEngine', () => {
    const engine = new DocumentCanvasEngine(t => ({ width: [...t].length * 6, ascent: 10, descent: 3 }));
    engine.syncPages(
      [{ id: 'p1', html: '<p>Documento de prueba para métricas.</p>' }],
      { width: 500, height: 700, top: 40, right: 40, bottom: 40, left: 40 },
    );

    const report = engine.perf.getReport();
    expect(report.phases.sync.count).toBe(1);
    expect(report.phases.layout.count).toBe(1);
    expect(report.lastPageCount).toBe(1);
    expect(report.lastNodeCount).toBeGreaterThan(0);
  });
});
