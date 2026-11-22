import { describe, expect, it } from 'vitest';
import { htmlToDocumentState, serializeDocumentNodes } from '../engine/document-model-dom';
import {
  applyRevisionDecisionToHtml,
  listRevisionsInPages,
  sanitizeHtmlForReviewExport,
  sanitizePagesForExport,
  stripCommentMarkersFromNodes,
} from './document-review';
import { normalizeLoadedDocData } from './doc-data-migration';

describe('document-review helpers (Fase 6)', () => {
  it('strips comment anchors and legacy badges when hideComments is true without altering text', () => {
    const rawHtml =
      '<p>Texto <span class="word-comment-anchor" data-word-comment-id="c-1" style="background-color:#fef3c7;">importante</span>' +
      ' con nota<span class="word-comment-badge" data-word-comment-id="c-2">[Comentario]</span> final.</p>';

    expect(sanitizeHtmlForReviewExport(rawHtml, { hideComments: false })).toBe(rawHtml);

    const cleaned = sanitizeHtmlForReviewExport(rawHtml, { hideComments: true });
    expect(cleaned).not.toContain('word-comment-anchor');
    expect(cleaned).not.toContain('data-word-comment-id');
    expect(cleaned).not.toContain('word-comment-badge');
    expect(cleaned).not.toContain('[Comentario]');
    expect(cleaned).toContain('Texto importante con nota final.');

    const pages = sanitizePagesForExport([{ id: 'p1', html: rawHtml }], { hideComments: true });
    expect(pages[0].html).toContain('Texto importante con nota final.');
  });

  it('unwraps anchored comments and removes comment badges in DocumentNode trees cleanly', () => {
    const state = htmlToDocumentState(
      '<p>Hola <span class="word-comment-anchor" data-word-comment-id="cmt-9">mundo</span><span class="word-comment-badge" data-word-comment-id="cmt-10">[C]</span>!</p>',
    );
    const cleaned = stripCommentMarkersFromNodes(state.roots);
    const html = serializeDocumentNodes(cleaned);
    expect(html).not.toContain('data-word-comment-id');
    expect(html).not.toContain('word-comment-badge');
    expect(html).toContain('Hola mundo!');
  });

  it('lists, accepts, and rejects tracked changes (<ins> and <del>) in DOM HTML pages', () => {
    const pages = [
      {
        id: 'p1',
        html:
          '<p>Texto <ins data-word-rev="ins" data-word-rev-id="r1" data-word-rev-author="Ana" data-word-rev-at="1700000000000">nuevo</ins> ' +
          '<del data-word-rev="del" data-word-rev-id="r2" data-word-rev-author="Ana" data-word-rev-at="1700000000001">viejo</del>.</p>',
      },
    ];
    const items = listRevisionsInPages(pages);
    expect(items.length).toBe(2);
    expect(items[0]).toMatchObject({ id: 'r1', kind: 'ins', text: 'nuevo', author: 'Ana', pageIndex: 0 });
    expect(items[1]).toMatchObject({ id: 'r2', kind: 'del', text: 'viejo', author: 'Ana', pageIndex: 0 });

    const acceptedAll = applyRevisionDecisionToHtml(pages[0].html, 'accept');
    expect(acceptedAll.changed).toBe(true);
    expect(acceptedAll.html).toContain('Texto nuevo .');
    expect(acceptedAll.html).not.toContain('viejo');
    expect(acceptedAll.html).not.toContain('data-word-rev');

    const rejectedAll = applyRevisionDecisionToHtml(pages[0].html, 'reject');
    expect(rejectedAll.changed).toBe(true);
    expect(rejectedAll.html).not.toContain('nuevo');
    expect(rejectedAll.html).toContain('viejo.');
    expect(rejectedAll.html).not.toContain('data-word-rev');
  });

  it('normalizes persisted comments, trackChangesEnabled, and hideCommentsOnExport in docData', () => {
    const normalized = normalizeLoadedDocData({
      v: 2,
      trackChangesEnabled: true,
      hideCommentsOnExport: true,
      comments: [
        {
          id: 'cmt-1',
          author: 'Evert',
          text: 'Revisar redacción',
          quote: 'redacción',
          createdAt: 1000,
          resolved: false,
          pageIndex: 0,
          replies: [{ id: 'r-1', author: 'Ana', text: 'Corregido', createdAt: 2000 }],
        },
        { bad: true },
      ],
    });
    expect(normalized.trackChangesEnabled).toBe(true);
    expect(normalized.hideCommentsOnExport).toBe(true);
    expect(normalized.comments?.length).toBe(1);
    expect(normalized.comments?.[0].replies[0].text).toBe('Corregido');
  });
});
