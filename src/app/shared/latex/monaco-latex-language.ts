import type * as Monaco from 'monaco-editor';
import { latexCompletionContext } from './latex-completions';

const registered = new WeakSet<object>();
export const LATEX_MATH_LANGUAGE = 'weave-latex-math';
export const LATEX_DOCUMENT_LANGUAGE = 'weave-latex-document';

export function latexSnippet(source: string): string {
  const parts = source.split('{}');
  return parts.map((part, index) => part.replace(/[\\$}]/g, '\\$&') + (index < parts.length-1 ? '{${'+(index+1)+'}\\}' : '')).join('') + '$0';
}

export function registerLatexLanguage(monaco: typeof Monaco): void {
  if (registered.has(monaco)) return;
  registered.add(monaco);
  for (const [id, documentMode] of [[LATEX_MATH_LANGUAGE, false], [LATEX_DOCUMENT_LANGUAGE, true]] as const) {
    monaco.languages.register({ id });
    monaco.languages.setMonarchTokensProvider(id, {
      tokenizer: { root: [
        [/\\[%$&#_{}]/, 'string.escape'], [/%.*$/, 'comment'],
        [/\\(?:begin|end)(?=\{)/, 'keyword'], [/\\[a-zA-Z@]+\*?/, 'keyword'],
        [/[{}\[\]()]/, '@brackets'], [/\$\$?/, 'delimiter'], [/[0-9]+(?:\.[0-9]+)?/, 'number'],
      ] },
    });
    monaco.languages.setLanguageConfiguration(id, {
      comments: { lineComment: '%' }, brackets: [['{','}'], ['[',']'], ['(',')']],
      autoClosingPairs: [{open:'{',close:'}'},{open:'[',close:']'},{open:'(',close:')'}],
    });
    monaco.languages.registerCompletionItemProvider(id, {
      triggerCharacters: ['\\', '{'],
      provideCompletionItems(model, position) {
        const line = model.getLineContent(position.lineNumber);
        const context = latexCompletionContext(line, position.column - 1, position.column - 1, documentMode);
        // Consume Monaco's auto-closed environment brace when replacing a partial \begin{...}.
        const closingBrace = context && line.slice(context.start, position.column-1).includes('{') && line[position.column-1] === '}';
        return { suggestions: context ? context.items.map(item => ({
          label: item.label, detail: item.description, kind: monaco.languages.CompletionItemKind.Snippet,
          insertText: latexSnippet(item.insert), insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          range: { startLineNumber:position.lineNumber, endLineNumber:position.lineNumber, startColumn:context.start+1, endColumn:position.column + (closingBrace ? 1 : 0) },
        })) : [] };
      },
    });
  }
}
