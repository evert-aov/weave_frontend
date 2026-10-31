/** Enlaces portables: el ID identifica el documento aunque cambie su título o carpeta. */
export function isDocumentId(value: unknown): value is string {
  return typeof value === 'string' && /^[a-zA-Z0-9_-]{1,200}$/.test(value);
}

export function documentHref(id: string): string {
  if (!isDocumentId(id)) throw new Error('Invalid document ID');
  return `/?document=${encodeURIComponent(id)}`;
}

export function documentIdFromHref(href: string, origin: string): string | null {
  try {
    const base = new URL(origin);
    const url = new URL(href, base);
    const id = url.searchParams.get('document');
    return url.origin === base.origin && url.pathname === '/' && isDocumentId(id) ? id : null;
  } catch { return null; }
}
