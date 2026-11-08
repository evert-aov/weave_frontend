/** Sparse axis geometry: far-away formatted cells must not allocate a million offsets. */
export class GridAxis {
  private readonly indices: number[];
  private readonly deltas: number[];
  constructor(readonly count: number, private readonly size: number, overrides: Record<number, number> = {}) {
    const entries = Object.entries(overrides).map(([index, value]) => [+index, Math.max(1, value)])
      .filter(([index]) => index >= 0 && index < count).sort((a, b) => a[0] - b[0]);
    this.indices = entries.map(([index]) => index);
    let delta = 0;
    this.deltas = entries.map(([, value]) => delta += value - size);
  }
  offset(index: number): number {
    let lo = 0, hi = this.indices.length;
    while (lo < hi) { const mid = (lo + hi) >>> 1; if (this.indices[mid] < index) lo = mid + 1; else hi = mid; }
    return index * this.size + (lo ? this.deltas[lo - 1] : 0);
  }
  indexAt(position: number): number {
    let lo = 0, hi = this.count;
    while (lo < hi) { const mid = (lo + hi) >>> 1; if (this.offset(mid + 1) <= position) lo = mid + 1; else hi = mid; }
    return Math.min(this.count - 1, lo);
  }
  window(position: number, length: number, overscan: number): { indices: number[]; before: number; after: number } {
    const start = Math.max(0, this.indexAt(Math.max(0, position)) - overscan);
    const end = Math.min(this.count, this.indexAt(Math.max(0, position) + length) + overscan + 1);
    return { indices: Array.from({ length: end - start }, (_, i) => start + i), before: this.offset(start), after: this.offset(this.count) - this.offset(end) };
  }
}
