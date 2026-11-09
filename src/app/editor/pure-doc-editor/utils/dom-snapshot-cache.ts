/** Serializes only DOM roots changed since the last snapshot, including synchronous edits. */
export class DomSnapshotCache {
  private entries = new Map<HTMLElement, { observer: MutationObserver; dirty: boolean; html: string }>();

  read(element: HTMLElement): string {
    let entry = this.entries.get(element);
    if (!entry) {
      const observer = new MutationObserver(() => { if (entry) entry.dirty = true; });
      entry = { observer, dirty: true, html: '' };
      observer.observe(element, { subtree: true, childList: true, characterData: true, attributes: true });
      this.entries.set(element, entry);
    }
    if (entry.observer.takeRecords().length) entry.dirty = true;
    if (entry.dirty) { entry.html = element.innerHTML; entry.dirty = false; }
    return entry.html;
  }

  retain(elements: Iterable<HTMLElement>): void {
    const keep = new Set(elements);
    for (const [element, entry] of this.entries) if (!keep.has(element)) {
      entry.observer.disconnect(); this.entries.delete(element);
    }
  }

  destroy(): void { this.retain([]); }
}
