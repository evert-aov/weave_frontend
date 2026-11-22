/** Shared by the HTML adapter and the Canvas document model. */
export class HeadingOutlineCounter {
  private readonly counters = [0, 0, 0, 0, 0, 0];
  private chapter = 0;
  private chapterStart = false;

  startChapter(): void {
    this.chapter++;
    this.chapterStart = true;
    this.counters.fill(0);
    this.counters[0] = this.chapter - 1;
  }

  /** Old typed/imported outline labels must not override a chapter-based outline. */
  chapterPrefixLength(title: string): number {
    return this.chapter ? (title.match(/^\s*\d+(?:\.\d+)*(?:[.)]\s*|\s+)/)?.[0].length ?? 0) : 0;
  }

  next(level: number, title: string): string | null {
    if (this.chapterStart) {
      this.counters[0] = this.chapter - (level === 1 ? 1 : 0);
      this.chapterStart = false;
    }
    // Typed/imported numbers remain document content.
    const manual = title.trim().match(/^(\d+(?:\.\d+)*)(?:\.)?\s+/);
    if (!this.chapter && manual && manual[1].split('.').length === level) {
      manual[1].split('.').map(Number).forEach((value, index) => this.counters[index] = value);
      this.counters.fill(0, level);
      return null;
    }
    for (let index = 0; index < level - 1; index++) {
      if (!this.counters[index]) this.counters[index] = index === 0 && this.chapter ? this.chapter : 1;
    }
    this.counters[level - 1]++;
    this.counters.fill(0, level);
    return this.counters.slice(0, level).join('.') + (level === 1 ? '.' : '') + ' ';
  }
}
