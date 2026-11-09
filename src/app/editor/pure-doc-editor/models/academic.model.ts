/** Bibliographic metadata belongs to the document, independently of rendered citations. */
export interface BibliographicAuthor { family: string; given: string; }
export const BIBLIOGRAPHIC_KINDS = ['book', 'article', 'web', 'report', 'thesis', 'chapter', 'newspaper', 'legal', 'interview', 'pdf', 'dictionary', 'conference', 'song', 'film', 'tv', 'app', 'podcast', 'podcast_episode', 'video', 'twitter', 'facebook', 'instagram', 'wiki', 'slides', 'religious', 'personal'] as const;
export type BibliographicKind = typeof BIBLIOGRAPHIC_KINDS[number];
export interface BibliographicSource {
  id: string;
  kind: BibliographicKind;
  authors: BibliographicAuthor[];
  organization: string;
  year: string;
  date: string;
  title: string;
  container: string;
  publisher: string;
  volume: string;
  issue: string;
  pages: string;
  edition: string;
  description: string;
  doi: string;
  url: string;
  accessed: string;
  editors: string;
  translators: string;
  originalYear: string;
  version: string;
  platform: string;
  role: string;
  number: string;
  location: string;
  abbreviation: string;
  handle: string;
}
export interface CitationRequest { sourceId: string; narrative: boolean; locator: string; additionalIds?: string[]; secondaryAuthor?: string; secondaryYear?: string; quoteText?: string; quoteEnding?: boolean; }
export interface AcademicObject { id: string; kind: 'table' | 'figure'; number: number; prefix?: string; appendixLabel?: string; title: string; note: string; sourceId: string; attribution: string; }
export interface CaptionRequest { id: string; title: string; note: string; sourceId: string; attribution: string; }
export function emptySource(): BibliographicSource {
  return { id: '', kind: 'book', authors: [], organization: '', year: '', date: '', title: '', container: '', publisher: '', volume: '', issue: '', pages: '', edition: '', description: '', doi: '', url: '', accessed: '', editors: '', translators: '', originalYear: '', version: '', platform: '', role: '', number: '', location: '', abbreviation: '', handle: '' };
}
export function normalizeSources(value: unknown): BibliographicSource[] {
  if (!Array.isArray(value)) return [];
  const ids = new Set<string>();
  return value.flatMap(item => {
    if (!item || typeof item !== 'object' || typeof item.id !== 'string' || !item.id || ids.has(item.id)) return [];
    const source = emptySource();
    for (const key of Object.keys(source) as (keyof BibliographicSource)[]) {
      if (key !== 'authors' && key !== 'kind' && typeof item[key] === 'string') (source[key] as string) = item[key];
    }
    source.kind = (BIBLIOGRAPHIC_KINDS as readonly string[]).includes(item.kind) ? item.kind : 'book';
    source.authors = Array.isArray(item.authors) ? item.authors.filter((a: BibliographicAuthor) => a && typeof a.family === 'string').map((a: BibliographicAuthor) => ({ family: a.family, given: typeof a.given === 'string' ? a.given : '' })) : [];
    ids.add(source.id); return source.title.trim() ? [source] : [];
  });
}
