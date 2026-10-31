import { describe, expect, it } from 'vitest';
import { documentHref, documentIdFromHref, isDocumentId } from './document-link';

describe('internal document URLs', () => {
  it('round-trips a portable reference with a stable ID', () => {
    const id = '507f1f77bcf86cd799439011';
    expect(documentHref(id)).toBe(`/?document=${id}`);
    expect(documentIdFromHref(documentHref(id), 'https://weave.test')).toBe(id);
    expect(documentIdFromHref(`https://weave.test/?document=${id}`, 'https://weave.test')).toBe(id);
  });
  it.each(['https://evil.test/?document=a', '//evil.test/?document=a', 'javascript:alert(1)', '/login?document=a', '/?document=../a', '/?document=', '#heading', 'https://weave.test:444/?document=a'])('does not intercept external or malformed links: %s', (href) => {
    expect(documentIdFromHref(href, 'https://weave.test')).toBeNull();
  });
  it.each(['', '../a', '<img>', 'a b', 'a'.repeat(201), null])('rejects invalid IDs: %s', (id) => {
    expect(isDocumentId(id)).toBe(false);
  });
});
