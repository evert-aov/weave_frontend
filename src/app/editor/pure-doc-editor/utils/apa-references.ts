import { formatReferenceWorkSegments } from './apa-reference-formats';
import type { BibliographicAuthor, BibliographicSource } from '../models/academic.model';

export type AcademicInlineSegment =
  | { kind: 'text'; text: string }
  | { kind: 'italic'; text: string }
  | { kind: 'link'; text: string; href: string };

export const escapeAcademicHtml = (value: string): string => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
const e = escapeAcademicHtml;

export function normalizeAcademicSegments(segments: readonly AcademicInlineSegment[]): AcademicInlineSegment[] {
  const out: AcademicInlineSegment[] = [];
  for (const seg of segments) {
    if (!seg.text) continue;
    const prev = out.at(-1);
    if (prev && prev.kind === seg.kind && (seg.kind !== 'link' || (prev.kind === 'link' && prev.href === seg.href))) {
      out[out.length - 1] = { ...prev, text: prev.text + seg.text } as AcademicInlineSegment;
    } else {
      out.push(seg);
    }
  }
  return out;
}

export function academicSegmentsToHtml(segments: readonly AcademicInlineSegment[]): string {
  return normalizeAcademicSegments(segments)
    .map(seg => {
      if (seg.kind === 'italic') return `<i>${e(seg.text)}</i>`;
      if (seg.kind === 'link') return `<a href="${e(seg.href)}" rel="noopener noreferrer">${e(seg.text)}</a>`;
      return e(seg.text);
    })
    .join('');
}

const period = (text: string) => /[.!?]$/.test(text) ? text : `${text}.`;
function initials(given: string): string {
  return given.trim().split(/\s+/).filter(Boolean).map(part => part.split('-').map(name => `${Array.from(name)[0]?.toLocaleUpperCase() || ''}.`).join('-')).join(' ');
}
function author(author: BibliographicAuthor): string { return `${author.family.trim()}${author.given.trim() ? `, ${initials(author.given)}` : ''}`; }
export function referenceAuthors(source: BibliographicSource): string {
  const authors = source.authors.map(author);
  if (!authors.length) return source.organization.trim();
  if (authors.length > 20) return `${authors.slice(0, 19).join(', ')}, … ${authors.at(-1)}`;
  return authors.length > 1 ? `${authors.slice(0, -1).join(', ')}, & ${authors.at(-1)}` : authors[0];
}
const sortKey = (s: BibliographicSource) => `${referenceAuthors(s) || s.title}`.toLocaleLowerCase();
export function sortedSources(sources: BibliographicSource[]): BibliographicSource[] {
  return [...sources].sort((a, b) => sortKey(a).localeCompare(sortKey(b), 'es') || a.year.localeCompare(b.year) || a.title.localeCompare(b.title, 'es'));
}
export function sourceYear(source: BibliographicSource, sources: BibliographicSource[]): string {
  const same = sortedSources(sources.filter(s => sortKey(s) === sortKey(source) && s.year === source.year));
  const index = same.findIndex(s => s.id === source.id);
  // Spreadsheet-like suffixes remain deterministic even for more than 26 works.
  let suffix = '', n = index + 1;
  if (same.length > 1 && index >= 0) while (n) { n--; suffix = String.fromCharCode(97 + n % 26) + suffix; n = Math.floor(n / 26); }
  return `${source.year.trim() || 's. f.'}${!source.year.trim() && suffix ? '-' : ''}${suffix}`;
}
export interface CitationOptions { firstInstitution?: boolean; secondaryAuthor?: string; secondaryYear?: string; }
export function citationText(source: BibliographicSource, sources: BibliographicSource[], narrative = false, locator = '', options: CitationOptions = {}): string {
  const names = source.authors.map(a => a.family.trim());
  const conjunction = narrative ? 'y' : '&';
  let who = names.length >= 3 ? `${names[0]} et al.` : names.length === 2 ? `${names[0]} ${conjunction} ${names[1]}` : names[0] || source.organization.trim();
  if (names.length >= 3) {
    const others = sources.filter(s => s.id !== source.id && s.year === source.year && s.authors.length >= 3 && s.authors[0].family === names[0]
      && s.authors.map(a => a.family).join('|') !== names.join('|'));
    let keep = 1;
    while (keep < names.length && others.some(s => names.slice(0, keep).every((name, index) => s.authors[index]?.family === name))) keep++;
    if (keep > 1) who = keep >= names.length - 1 ? `${names.slice(0, -1).join(', ')} ${conjunction} ${names.at(-1)}` : `${names.slice(0, keep).join(', ')}, et al.`;
  }
  const abbreviated = !names.length && source.organization && source.abbreviation;
  if (abbreviated) who = options.firstInstitution === false ? source.abbreviation : narrative ? source.organization : `${source.organization} [${source.abbreviation}]`;
  if (!who) who = ['article', 'web', 'chapter', 'newspaper', 'dictionary', 'wiki'].includes(source.kind) ? `“${source.title}”` : source.title;
  if (source.kind === 'personal') {
    const author = source.authors[0];
    const name = author ? `${initials(author.given)} ${author.family}`.trim() : who;
    const date = source.year && !source.date.includes(source.year) ? [source.date, source.year].filter(Boolean).join(' de ') : source.date || source.year;
    return narrative ? `${name} (comunicación personal${date ? `, ${date}` : ''})` : `(${name}, comunicación personal${date ? `, ${date}` : ''})`;
  }
  const year = sourceYear(source, sources), when = source.originalYear ? `${source.originalYear}/${year}` : year;
  const where = locator.trim() ? `, ${locator.trim()}` : '';
  const institution = abbreviated && options.firstInstitution !== false && narrative ? `${source.abbreviation}, ` : '';
  if (options.secondaryAuthor?.trim()) {
    const original = `${options.secondaryAuthor.trim()}${options.secondaryYear?.trim() ? `, ${options.secondaryYear.trim()}` : ''}`;
    return narrative ? `${options.secondaryAuthor.trim()} (${options.secondaryYear?.trim() ? options.secondaryYear.trim() + ', ' : ''}como se citó en ${who}, ${when}${where})` : `(${original}, como se citó en ${who}, ${when}${where})`;
  }
  return narrative ? `${who} (${institution}${when}${where})` : `(${who}, ${when}${where})`;
}
export function referenceEligible(source: BibliographicSource): boolean { return source.kind !== 'personal'; }
export function academicUrl(value: string): string {
  try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) ? url.href : ''; } catch { return ''; }
}
export function sourceLink(source: BibliographicSource): string {
  const doi = source.doi.trim().replace(/^(?:https?:\/\/(?:dx\.)?doi\.org\/|doi:\s*)/i, '');
  return doi && /^10\.\d{4,9}\/\S+$/i.test(doi) ? `https://doi.org/${doi}` : academicUrl(source.url.trim());
}
/** APA 7 common source types as typed inline segments. Titles retain the capitalization supplied by the author. */
export function referenceSegments(source: BibliographicSource, sources: BibliographicSource[]): AcademicInlineSegment[] {
  if (!referenceEligible(source)) return [];
  const formatted = formatReferenceWorkSegments(source);
  const by = referenceAuthors(source);
  const year = sourceYear(source, sources);
  const detailed = !['book', 'article', 'thesis', 'religious', 'chapter'].includes(source.kind);
  const date = detailed && source.date.trim() ? `${year}, ${source.date.trim()}` : year;
  const role = formatted.role ? ` (${formatted.role})` : '';
  const handle = source.handle ? ` [${source.handle}]` : '';
  const segments: AcademicInlineSegment[] = by
    ? [{ kind: 'text', text: `${by}${handle}${role}${/[.!?]$/.test(by) && !role && !handle ? '' : '.'} (${date}). ` }, ...formatted.work]
    : [...formatted.work, { kind: 'text', text: ` (${date}).` }];
  if (formatted.publication.length) {
    segments.push({ kind: 'text', text: ' ' }, ...formatted.publication);
  }
  const link = sourceLink(source);
  if (link) {
    if (source.accessed.trim()) segments.push({ kind: 'text', text: ` Recuperado el ${source.accessed.trim()}, de` });
    segments.push({ kind: 'text', text: ' ' }, { kind: 'link', text: link, href: link });
  }
  if (source.originalYear) {
    segments.push({ kind: 'text', text: ` (Trabajo original publicado en ${source.originalYear}).` });
  }
  return normalizeAcademicSegments(segments);
}

/** APA 7 common source types. Titles retain the capitalization supplied by the author. */
export function referenceHtml(source: BibliographicSource, sources: BibliographicSource[]): string {
  return academicSegmentsToHtml(referenceSegments(source, sources));
}

export function citationSegments(
  source: BibliographicSource,
  sources: BibliographicSource[],
  narrative = false,
  locator = '',
  options: CitationOptions = {},
): AcademicInlineSegment[] {
  const text = citationText(source, sources, narrative, locator, options);
  if (source.authors.length || source.organization || ['article', 'web', 'chapter', 'newspaper', 'dictionary', 'wiki', 'legal', 'personal'].includes(source.kind)) {
    return [{ kind: 'text', text }];
  }
  const titleIdx = source.title ? text.indexOf(source.title) : -1;
  if (titleIdx < 0) return [{ kind: 'text', text }];
  const out: AcademicInlineSegment[] = [];
  if (titleIdx > 0) out.push({ kind: 'text', text: text.slice(0, titleIdx) });
  out.push({ kind: 'italic', text: source.title });
  const after = text.slice(titleIdx + source.title.length);
  if (after) out.push({ kind: 'text', text: after });
  return normalizeAcademicSegments(out);
}

export function citationHtml(source: BibliographicSource, sources: BibliographicSource[], narrative = false, locator = '', options: CitationOptions = {}): string {
  return academicSegmentsToHtml(citationSegments(source, sources, narrative, locator, options));
}

export function parseCitationSourceIds(rawSourceIds?: string, singleSourceId?: string): string[] {
  try {
    const ids: unknown = JSON.parse(rawSourceIds || '[]');
    if (Array.isArray(ids)) return [...new Set(ids.filter((id): id is string => typeof id === 'string'))];
  } catch { /* Older single-source citation. */ }
  return singleSourceId ? [singleSourceId] : [];
}
export function citationSourceIds(element: HTMLElement): string[] {
  return parseCitationSourceIds(element.dataset['wordSourceIds'], element.dataset['wordSourceId']);
}

function stripOuterParensFromSegments(segs: readonly AcademicInlineSegment[]): AcademicInlineSegment[] {
  if (!segs.length) return [];
  const next = segs.map(s => ({ ...s }));
  if (next[0].text.startsWith('(')) next[0].text = next[0].text.slice(1);
  const last = next[next.length - 1];
  if (last.text.endsWith(')')) last.text = last.text.slice(0, -1);
  return normalizeAcademicSegments(next);
}

export function renderCitationGroupSegments(
  attrs: {
    sourceIds?: string;
    sourceId?: string;
    narrative?: string;
    locator?: string;
    secondaryAuthor?: string;
    secondaryYear?: string;
  },
  sources: BibliographicSource[],
  used: Set<string> = new Set(),
): AcademicInlineSegment[] {
  const ids = parseCitationSourceIds(attrs.sourceIds, attrs.sourceId);
  const group = sortedSources(sources.filter(s => ids.includes(s.id)));
  const options: CitationOptions = { secondaryAuthor: attrs.secondaryAuthor, secondaryYear: attrs.secondaryYear };
  const parts = group.map(source => {
    options.firstInstitution = !used.has(source.id); used.add(source.id);
    return citationSegments(source, sources, group.length === 1 && attrs.narrative === 'true', attrs.locator || '', options);
  });
  if (parts.length > 1) {
    const joined: AcademicInlineSegment[] = [{ kind: 'text', text: '(' }];
    parts.forEach((part, idx) => {
      if (idx > 0) joined.push({ kind: 'text', text: '; ' });
      joined.push(...stripOuterParensFromSegments(part));
    });
    joined.push({ kind: 'text', text: ')' });
    return normalizeAcademicSegments(joined);
  }
  return parts[0] || [{ kind: 'text', text: '[Fuente no disponible]' }];
}

export function renderCitationGroupData(
  attrs: {
    sourceIds?: string;
    sourceId?: string;
    narrative?: string;
    locator?: string;
    secondaryAuthor?: string;
    secondaryYear?: string;
  },
  sources: BibliographicSource[],
  used: Set<string> = new Set(),
): string {
  return academicSegmentsToHtml(renderCitationGroupSegments(attrs, sources, used));
}
export function renderCitationGroup(element: HTMLElement, sources: BibliographicSource[], used: Set<string> = new Set()): string {
  return renderCitationGroupData({
    sourceIds: element.dataset['wordSourceIds'],
    sourceId: element.dataset['wordSourceId'],
    narrative: element.dataset['narrative'],
    locator: element.dataset['locator'],
    secondaryAuthor: element.dataset['secondaryAuthor'],
    secondaryYear: element.dataset['secondaryYear'],
  }, sources, used);
}
