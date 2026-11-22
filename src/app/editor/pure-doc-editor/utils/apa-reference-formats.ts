import type { BibliographicSource } from '../models/academic.model';
import { academicSegmentsToHtml, type AcademicInlineSegment } from './apa-references';

const txt = (text: string): AcademicInlineSegment => ({ kind: 'text', text });
const it = (text: string): AcademicInlineSegment => ({ kind: 'italic', text });
const dotSegs = (segs: AcademicInlineSegment[]): AcademicInlineSegment[] => {
  const nonEmpty = segs.filter(s => s.text.length > 0);
  const plain = nonEmpty.map(s => s.text).join('');
  if (plain && !/[.!?]$/.test(plain)) nonEmpty.push(txt('.'));
  return nonEmpty;
};
const people = (value: string) => value.split(/\n|;/).filter(Boolean).map(name => {
  const [family, given] = name.split(',').map(s => s.trim());
  return given ? `${given.split(/\s+/).map(n => `${Array.from(n)[0]}.`).join(' ')} ${family}` : family;
}).join(', ');
export interface FormattedWork { work: string; publication: string; role: string; }
export interface FormattedWorkSegments { work: AcademicInlineSegment[]; publication: AcademicInlineSegment[]; role: string; }

/** The source type determines title italics, medium, container and publication data as typed inline segments. */
export function formatReferenceWorkSegments(s: BibliographicSource): FormattedWorkSegments {
  let work: AcademicInlineSegment[] = [it(s.title)];
  let publication: AcademicInlineSegment[] = [];
  let role = '';
  const publisher = s.publisher;
  const container = s.container;
  const medium = (fallback: string): AcademicInlineSegment => txt(` [${s.description || fallback}]`);
  const numbered = s.number ? ` (${s.number})` : '';
  switch (s.kind) {
    case 'article':
      work = [txt(s.title)];
      if (container) publication.push(it(container));
      if (s.volume) {
        if (container) publication.push(txt(', '));
        publication.push(it(s.volume));
      }
      if (s.issue) publication.push(txt(`(${s.issue})`));
      if (s.pages) publication.push(txt(`, ${s.pages}`));
      break;
    case 'newspaper':
      work = [txt(s.title)];
      publication = [it(container), ...(s.pages ? [txt(`, pp. ${s.pages}`)] : [])];
      break;
    case 'chapter': {
      work = [txt(s.title)];
      const edLabel = s.editors.split(/\n|;/).filter(Boolean).length > 1 ? 'Eds.' : 'Ed.';
      publication = [
        txt('En '),
        ...(s.editors ? [txt(`${people(s.editors)} (${edLabel}), `)] : []),
        it(container),
        ...(s.pages || s.edition ? [txt(` (${[s.edition, s.pages ? `pp. ${s.pages}` : ''].filter(Boolean).join(', ')})`)] : []),
        txt('.'),
        ...(publisher ? [txt(` ${publisher}`)] : []),
      ];
      break;
    }
    case 'dictionary':
      work = [txt(s.title)];
      publication = [
        txt('En '),
        ...(s.editors ? [txt(`${people(s.editors)} (Ed.), `)] : []),
        it(container),
        ...(s.edition ? [txt(` (${s.edition})`)] : []),
        ...(publisher ? [txt(`. ${publisher}`)] : []),
      ];
      break;
    case 'thesis':
      work.push(txt(` [${s.description || 'Tesis'}${publisher ? `, ${publisher}` : ''}]`));
      publication = container ? [txt(container)] : [];
      break;
    case 'book':
    case 'religious':
      if (s.edition || s.translators || s.version) {
        work.push(txt(` (${[s.translators ? `${people(s.translators)}, Trad.` : '', s.edition, s.version].filter(Boolean).join('; ')})`));
      }
      publication = publisher ? [txt(publisher)] : [];
      break;
    case 'legal':
      work = [txt(s.title + numbered)];
      publication = [container, publisher].filter(Boolean).length ? [txt([container, publisher].filter(Boolean).join(', '))] : [];
      break;
    case 'conference':
      work.push(medium('Ponencia'));
      publication = [container, s.location].filter(Boolean).length ? [txt([container, s.location].filter(Boolean).join(', '))] : [];
      break;
    case 'song':
      work = [txt(s.title), medium('Canción')];
      if (container) publication.push(txt('En '), it(container), txt('.'));
      if (publisher) publication.push(txt(`${container ? ' ' : ''}${publisher}`));
      break;
    case 'film':
      role = s.role || 'Director';
      work.push(medium('Película'));
      publication = publisher ? [txt(publisher)] : [];
      break;
    case 'tv':
      role = s.role || 'Productor ejecutivo';
      work.push(medium('Serie de televisión'));
      publication = publisher ? [txt(publisher)] : [];
      break;
    case 'app':
      if (s.version) work.push(txt(` (${s.version})`));
      work.push(medium('Aplicación móvil'));
      publication = (s.platform || publisher) ? [txt(s.platform || publisher)] : [];
      break;
    case 'podcast':
      role = s.role || 'Presentador';
      work.push(medium('Pódcast de audio'));
      publication = publisher ? [txt(publisher)] : [];
      break;
    case 'podcast_episode':
      role = s.role || 'Presentador';
      work = [txt(s.title + numbered), medium('Episodio de pódcast de audio')];
      publication = [txt('En '), it(container), ...(publisher ? [txt(`. ${publisher}`)] : [])];
      break;
    case 'video':
      work.push(medium('Vídeo'));
      publication = [txt(s.platform || container || 'YouTube')];
      break;
    case 'twitter':
    case 'facebook':
    case 'instagram':
      work = [
        it(s.title.split(/\s+/).slice(0, 20).join(' ')),
        medium(s.kind === 'twitter' ? 'Publicación' : s.kind === 'instagram' ? 'Fotografía' : 'Actualización de estado'),
      ];
      publication = [txt(s.kind === 'twitter' ? 'Twitter' : s.kind === 'facebook' ? 'Facebook' : 'Instagram')];
      break;
    case 'wiki':
      work = [txt(s.title)];
      publication = [txt('En '), it(container || 'Wikipedia')];
      break;
    case 'slides':
      work.push(medium('Diapositivas de PowerPoint'));
      publication = (container || publisher) ? [txt(container || publisher)] : [];
      break;
    case 'interview':
      work.push(medium('Entrevista'));
      publication = (container || publisher) ? [txt(container || publisher)] : [];
      break;
    case 'pdf':
      work.push(medium('Archivo PDF'));
      publication = (publisher || container) ? [txt(publisher || container)] : [];
      break;
    case 'report':
      if (s.number || s.description) work.push(txt(` (${s.number || s.description})`));
      publication = (container || publisher) ? [txt(container || publisher)] : [];
      break;
    default:
      publication = (container || publisher) ? [txt(container || publisher)] : [];
  }
  const pubPlain = publication.map(seg => seg.text).join('');
  if (s.organization && !s.authors.length && pubPlain === s.organization) publication = [];
  return { work: dotSegs(work), publication: dotSegs(publication), role };
}

/** The source type determines title italics, medium, container and publication data. */
export function formatReferenceWork(s: BibliographicSource): FormattedWork {
  const segs = formatReferenceWorkSegments(s);
  return {
    work: academicSegmentsToHtml(segs.work),
    publication: academicSegmentsToHtml(segs.publication),
    role: segs.role,
  };
}
