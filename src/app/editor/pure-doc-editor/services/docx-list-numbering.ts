const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

/** Per-export numbering definitions: no literal number/bullet text inside document runs. */
export class DocxListNumbering {
  private definitions: string[] = [];

  register(list: HTMLElement, start: number, left: number, hanging: number): number {
    const id = this.definitions.length + 1;
    const marker = list.style.listStyleType || (list.tagName === 'OL' ? 'decimal' : 'disc');
    const formats: Record<string, string> = { 'lower-alpha': 'lowerLetter', 'upper-alpha': 'upperLetter', 'lower-roman': 'lowerRoman', 'upper-roman': 'upperRoman' };
    const ordered = list.tagName === 'OL';
    const format = ordered ? formats[marker] || 'decimal' : 'bullet';
    const text = ordered ? '%1.' : marker === 'square' ? '▪' : marker === 'circle' ? '○' : '•';
    this.definitions.push(`<w:abstractNum w:abstractNumId="${id}"><w:multiLevelType w:val="singleLevel"/><w:lvl w:ilvl="0"><w:start w:val="${start}"/><w:numFmt w:val="${format}"/><w:lvlText w:val="${text}"/><w:lvlJc w:val="left"/><w:pPr><w:tabs><w:tab w:val="num" w:pos="${left}"/></w:tabs><w:ind w:left="${left}" w:hanging="${hanging}"/></w:pPr></w:lvl></w:abstractNum><w:num w:numId="${id}"><w:abstractNumId w:val="${id}"/></w:num>`);
    return id;
  }

  get xml(): string {
    return `<?xml version="1.0" encoding="UTF-8"?><w:numbering xmlns:w="${W}">${this.definitions.join('')}</w:numbering>`;
  }
}
