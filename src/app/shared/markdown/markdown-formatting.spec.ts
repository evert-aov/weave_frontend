import { describe, expect, it } from 'vitest';
import { formatMarkdown } from './markdown-formatting';
const apply = (source: string, edit: ReturnType<typeof formatMarkdown>) => source.slice(0, edit.from) + edit.insert + source.slice(edit.to);
describe('live preview toolbar edits', () => {
  it('formats the selection and toggles it off without changing adjacent text', () => {
    const source = 'Hola mundo final';
    const edit = formatMarkdown(source, {from:5,to:10}, 'bold');
    const result = apply(source, edit); expect(result).toBe('Hola **mundo** final');
    expect(result.slice(edit.anchor,edit.head)).toBe('mundo');
    expect(apply(result, formatMarkdown(result,{from:edit.anchor,to:edit.head},'bold'))).toBe(source);
  });
  it('inserts selected placeholder text at an empty caret', () => {
    const edit = formatMarkdown('',{from:0,to:0},'italic');
    expect(edit.insert).toBe('*texto*'); expect(edit.insert.slice(edit.anchor,edit.head)).toBe('texto');
  });
  it('changes a heading in place and restores normal paragraph', () => {
    const source = 'Above\n## Heading\nAfter';
    const edit = formatMarkdown(source,{from:12,to:12},'h3'); const result = apply(source, edit);
    expect(result).toBe('Above\n### Heading\nAfter'); expect(edit.anchor).toBe(13);
    expect(apply(result, formatMarkdown(result,{from:13,to:13},'h0'))).toBe('Above\nHeading\nAfter');
  });
  it('formats only selected lines and toggles lists and quotes', () => {
    const source = 'A\nB\nC';
    expect(apply(source,formatMarkdown(source,{from:0,to:4},'ordered'))).toBe('1. A\n2. B\nC');
    expect(apply('- A\n- B',formatMarkdown('- A\n- B',{from:0,to:7},'bullet'))).toBe('A\nB');
    expect(apply(source,formatMarkdown(source,{from:0,to:3},'quote'))).toBe('> A\n> B\nC');
  });
});
