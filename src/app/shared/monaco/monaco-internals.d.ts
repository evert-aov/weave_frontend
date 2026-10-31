declare module 'monaco-editor/editor/common/commands/shiftCommand.js' {
  export class ShiftCommand {
    constructor(range: unknown, options: Record<string, unknown>, languageService?: unknown);
  }
}
declare module 'monaco-editor/editor/contrib/snippet/browser/snippetParser.js' {
  export class SnippetParser {
    parse(source: string): { toString(): string; placeholders: { index: number }[] };
  }
}
