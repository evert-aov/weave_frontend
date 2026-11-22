/** Serializes only DOM roots changed since the last snapshot, including synchronous edits. */
export class DomSnapshotCache {
  private entries = new Map<HTMLElement, { observer: MutationObserver; dirty: boolean; html: string }>();

  read(element: HTMLElement): string {
    let entry = this.entries.get(element);
    if (!entry) {
      const observer = new MutationObserver(records => {
        if (entry && this.changesInnerHtml(records, element)) entry.dirty = true;
      });
      entry = { observer, dirty: true, html: '' };
      observer.observe(element, { subtree: true, childList: true, characterData: true, attributes: true });
      this.entries.set(element, entry);
    }
    if (this.changesInnerHtml(entry.observer.takeRecords(), element)) entry.dirty = true;
    if (entry.dirty) { entry.html = element.innerHTML; entry.dirty = false; }
    return entry.html;
  }

  private changesInnerHtml(records: MutationRecord[], root: HTMLElement): boolean {
    // Host classes (Canvas visibility, focus, etc.) are not serialized by innerHTML.
    return records.some(record => record.type !== 'attributes' || record.target !== root);
  }

  retain(elements: Iterable<HTMLElement>): void {
    const keep = new Set(elements);
    for (const [element, entry] of this.entries) if (!keep.has(element)) {
      entry.observer.disconnect(); this.entries.delete(element);
    }
  }

  destroy(): void { this.retain([]); }
}
