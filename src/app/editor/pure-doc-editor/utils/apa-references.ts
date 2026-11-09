import { formatReferenceWork } from './apa-reference-formats';
import type { BibliographicAuthor, BibliographicSource } from '../models/academic.model';

export const escapeAcademicHtml = (value: string): string => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
const e = escapeAcademicHtml;
const italic = (text: string) => `<i>${e(text)}</i>`;
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
/** APA 7 common source types. Titles retain the capitalization supplied by the author. */
export function referenceHtml(source: BibliographicSource, sources: BibliographicSource[]): string {
  if (!referenceEligible(source)) return '';
  const formatted = formatReferenceWork(source), by = referenceAuthors(source), year = sourceYear(source, sources);
  const detailed = !['book', 'article', 'thesis', 'religious', 'chapter'].includes(source.kind);
  const date = detailed && source.date.trim() ? `${year}, ${source.date.trim()}` : year;
  const role = formatted.role ? ` (${e(formatted.role)})` : '';
  const handle = source.handle ? ` [${e(source.handle)}]` : '';
  let output = by ? `${e(by)}${handle}${role}${/[.!?]$/.test(by) && !role && !handle ? '' : '.'} (${e(date)}). ${formatted.work}` : `${formatted.work} (${e(date)}).`;
  if (formatted.publication) output += ` ${formatted.publication}`;
  const link = sourceLink(source);
  if (link) {
    if (source.accessed.trim()) output += ` Recuperado el ${e(source.accessed.trim())}, de`;
    output += ` <a href="${e(link)}" rel="noopener noreferrer">${e(link)}</a>`;
  }
  if (source.originalYear) output += ` (Trabajo original publicado en ${e(source.originalYear)}).`;
  return output;
}

export function citationHtml(source: BibliographicSource, sources: BibliographicSource[], narrative = false, locator = '', options: CitationOptions = {}): string {
  const text = citationText(source, sources, narrative, locator, options);
  if (source.authors.length || source.organization || ['article', 'web', 'chapter', 'newspaper', 'dictionary', 'wiki', 'legal', 'personal'].includes(source.kind)) return e(text);
  const title = e(source.title), escaped = e(text);
  return escaped.replace(title, `<i>${title}</i>`);
}

export function citationSourceIds(element: HTMLElement): string[] {
  try { const ids: unknown = JSON.parse(element.dataset['wordSourceIds'] || '[]'); if (Array.isArray(ids)) return [...new Set(ids.filter((id): id is string => typeof id === 'string'))]; } catch { /* Older single-source citation. */ }
  return element.dataset['wordSourceId'] ? [element.dataset['wordSourceId']] : [];
}
export function renderCitationGroup(element: HTMLElement, sources: BibliographicSource[], used: Set<string> = new Set()): string {
  const group = sortedSources(sources.filter(s => citationSourceIds(element).includes(s.id)));
  const options: CitationOptions = { secondaryAuthor: element.dataset['secondaryAuthor'], secondaryYear: element.dataset['secondaryYear'] };
  const parts = group.map(source => {
    options.firstInstitution = !used.has(source.id); used.add(source.id);
    return citationHtml(source, sources, group.length === 1 && element.dataset['narrative'] === 'true', element.dataset['locator'] || '', options);
  });
  return parts.length > 1 ? `(${parts.map(part => part.replace(/^\(|\)$/g, '')).join('; ')})` : parts[0] || '[Fuente no disponible]';
}
