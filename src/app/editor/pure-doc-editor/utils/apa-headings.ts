import type { StyleTemplate } from '../models/word-document.model';
import { applyStyleRule } from './document-formatting';

export const APA_HEADING_SELECTOR = 'h1,h2,h3,h4,h5,h6,[data-apa-heading-level]';
export function headingLevel(element: HTMLElement): number { return element.hasAttribute('data-word-chapter')?0:Number(element.dataset['apaHeadingLevel'] || element.tagName.slice(1)); }
export function clearRunInHeading(block: HTMLElement): void {
  block.removeAttribute('data-apa-run-in');
  block.querySelectorAll<HTMLElement>('[data-apa-heading-level]').forEach(span => span.replaceWith(...Array.from(span.childNodes)));
}
export function runInHeading(block: HTMLElement, level: 4 | 5, template: StyleTemplate): HTMLElement {
  let paragraph = block, heading = block.querySelector<HTMLElement>(':scope > [data-apa-heading-level]');
  if (!heading) {
    paragraph = document.createElement('p');
    heading = document.createElement('span');
    heading.id = block.id || `heading-${crypto.randomUUID()}`;
    while (block.firstChild) heading.append(block.firstChild);
    paragraph.append(heading); block.replaceWith(paragraph);
    const following = paragraph.nextElementSibling as HTMLElement | null;
    if (following?.tagName === 'P' && !following.dataset['apaRole'] && !following.dataset['apaRunIn']
      && !following.querySelector('img,svg,[data-word-bibliography],[data-word-note-list]')) {
      if (following.textContent?.length) paragraph.append(' ');
      paragraph.append(...Array.from(following.childNodes)); following.remove();
    }
  }
  paragraph.dataset['apaRunIn'] = String(level);
  const shell = document.createElement('p'); applyStyleRule(shell, template.rules.P);
  paragraph.style.cssText = shell.style.cssText;
  heading.dataset['apaHeadingLevel'] = String(level);
  const text = heading.textContent?.trim() || '';
  if (text && !/[.!?]$/.test(text)) heading.append('.');
  Object.assign(heading.style, { fontWeight: 'bold', fontStyle: level === 5 ? 'italic' : 'normal', textTransform: 'capitalize' });
  heading.querySelectorAll<HTMLElement>('*').forEach(run => { run.style.fontWeight = 'inherit'; run.style.fontStyle = 'inherit'; });
  return paragraph;
}
export function normalizeApaHeadings(bodies: HTMLElement[], template: StyleTemplate): void {
  const hasChapters = bodies.some(body => Array.from(body.querySelectorAll<HTMLElement>('[data-word-chapter]')).some(heading => heading.textContent?.replace(/[\u200b-\u200d\ufeff]/g, '').trim()));
  bodies.forEach(body => {
    body.querySelectorAll<HTMLElement>('h1').forEach(heading => {
      const chapter = heading.hasAttribute('data-word-chapter');
      if (!hasChapters && !heading.hasAttribute('data-word-apa-chapter-style')) return;
      applyStyleRule(heading, hasChapters && !chapter ? template.rules.H2 : template.rules.H1);
      if (hasChapters) heading.setAttribute('data-word-apa-chapter-style', 'true');
      else heading.removeAttribute('data-word-apa-chapter-style');
    });
    body.querySelectorAll<HTMLElement>('h4,h5,h6,p[data-apa-run-in]').forEach(block => {
      if (!block.isConnected && body.isConnected) return;
      if (block.tagName === 'P' && !block.querySelector('[data-apa-heading-level]')) { block.removeAttribute('data-apa-run-in'); return; }
      const level = Math.min(5, Number(block.dataset['apaRunIn'] || block.tagName.slice(1))) as 4 | 5;
      runInHeading(block, level, template);
    });
    body.querySelectorAll<HTMLElement>('h1,h2,h3').forEach(heading => heading.style.textTransform = 'capitalize');
    const nextBody = bodies[bodies.indexOf(body) + 1];
    const last = body.lastElementChild as HTMLElement | null;
    const following = nextBody?.firstElementChild as HTMLElement | null;
    if (last?.dataset['apaRunIn'] && nextBody?.dataset['breakBefore'] !== 'manual' && following?.tagName === 'P'
      && !following.dataset['apaRole'] && !following.dataset['apaRunIn'] && !following.querySelector('img,svg')
      && last.textContent?.trim() === last.querySelector('[data-apa-heading-level]')?.textContent?.trim()) {
      last.append(' ', ...Array.from(following.childNodes)); following.remove();
    }
  });
}
