import type { BibliographicSource } from '../models/academic.model';
import { escapeAcademicHtml as e } from './apa-references';
const i = (text: string) => `<i>${e(text)}</i>`;
const dot = (text: string) => text && !/[.!?]$/.test(text.replace(/<[^>]*>/g, '')) ? `${text}.` : text;
const people = (value: string) => value.split(/\n|;/).filter(Boolean).map(name => {
  const [family, given] = name.split(',').map(s => s.trim());
  return given ? `${given.split(/\s+/).map(n => `${Array.from(n)[0]}.`).join(' ')} ${family}` : family;
}).join(', ');
export interface FormattedWork { work: string; publication: string; role: string; }
/** The source type determines title italics, medium, container and publication data. */
export function formatReferenceWork(s: BibliographicSource): FormattedWork {
  let work = i(s.title), publication = '', role = '';
  const publisher = e(s.publisher), container = e(s.container);
  const medium = (fallback: string) => ` [${e(s.description || fallback)}]`;
  const numbered = s.number ? ` (${e(s.number)})` : '';
  switch (s.kind) {
    case 'article':
      work = e(s.title); publication = `${s.container ? i(s.container) : ''}${s.volume ? `${s.container ? ', ' : ''}${i(s.volume)}` : ''}${s.issue ? `(${e(s.issue)})` : ''}${s.pages ? `, ${e(s.pages)}` : ''}`; break;
    case 'newspaper':
      work = e(s.title); publication = `${i(s.container)}${s.pages ? `, pp. ${e(s.pages)}` : ''}`; break;
    case 'chapter':
      work = e(s.title); publication = `En ${s.editors ? `${e(people(s.editors))} (${s.editors.split(/\n|;/).filter(Boolean).length > 1 ? 'Eds.' : 'Ed.'}), ` : ''}${i(s.container)}${s.pages || s.edition ? ` (${[s.edition, s.pages ? `pp. ${s.pages}` : ''].filter(Boolean).map(e).join(', ')})` : ''}.${publisher ? ` ${publisher}` : ''}`; break;
    case 'dictionary':
      work = e(s.title); publication = `En ${s.editors ? `${e(people(s.editors))} (Ed.), ` : ''}${i(s.container)}${s.edition ? ` (${e(s.edition)})` : ''}${publisher ? `. ${publisher}` : ''}`; break;
    case 'thesis':
      work += ` [${e(s.description || 'Tesis')}${s.publisher ? `, ${publisher}` : ''}]`; publication = container; break;
    case 'book':
    case 'religious':
      if (s.edition || s.translators || s.version) work += ` (${[s.translators ? `${people(s.translators)}, Trad.` : '', s.edition, s.version].filter(Boolean).map(e).join('; ')})`;
      publication = publisher; break;
    case 'legal':
      work = e(s.title) + numbered; publication = [container, publisher].filter(Boolean).join(', '); break;
    case 'conference':
      work += medium('Ponencia'); publication = [container, e(s.location)].filter(Boolean).join(', '); break;
    case 'song':
      work = e(s.title) + medium('Canción'); publication = `${s.container ? `En ${i(s.container)}.` : ''}${publisher ? ` ${publisher}` : ''}`.trim(); break;
    case 'film': role = s.role || 'Director'; work += medium('Película'); publication = publisher; break;
    case 'tv': role = s.role || 'Productor ejecutivo'; work += medium('Serie de televisión'); publication = publisher; break;
    case 'app':
      if (s.version) work += ` (${e(s.version)})`; work += medium('Aplicación móvil'); publication = e(s.platform || s.publisher); break;
    case 'podcast': role = s.role || 'Presentador'; work += medium('Pódcast de audio'); publication = publisher; break;
    case 'podcast_episode':
      role = s.role || 'Presentador'; work = e(s.title) + numbered + medium('Episodio de pódcast de audio'); publication = `En ${i(s.container)}${publisher ? `. ${publisher}` : ''}`; break;
    case 'video': work += medium('Vídeo'); publication = e(s.platform || s.container || 'YouTube'); break;
    case 'twitter': case 'facebook': case 'instagram':
      work = i(s.title.split(/\s+/).slice(0, 20).join(' ')) + medium(s.kind === 'twitter' ? 'Publicación' : s.kind === 'instagram' ? 'Fotografía' : 'Actualización de estado');
      publication = s.kind === 'twitter' ? 'Twitter' : s.kind === 'facebook' ? 'Facebook' : 'Instagram'; break;
    case 'wiki': work = e(s.title); publication = `En ${i(s.container || 'Wikipedia')}`; break;
    case 'slides': work += medium('Diapositivas de PowerPoint'); publication = container || publisher; break;
    case 'interview': work += medium('Entrevista'); publication = container || publisher; break;
    case 'pdf': work += medium('Archivo PDF'); publication = publisher || container; break;
    case 'report': if (s.number || s.description) work += ` (${e(s.number || s.description)})`; publication = container || publisher; break;
    default: publication = container || publisher;
  }
  if (s.organization && !s.authors.length && publication === e(s.organization)) publication = '';
  return { work: dot(work), publication: dot(publication), role };
}
