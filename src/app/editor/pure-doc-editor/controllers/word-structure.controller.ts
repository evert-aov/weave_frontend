import type { PureDocEditorComponent } from '../pure-doc-editor.component';
import type { WordEditorHooks } from './word-editor-hooks';
import type { DocumentPage, StyleTemplate } from '../models/word-document.model';
import type { AcademicSectionRequest } from '../models/academic-sections.model';
import { coverSection, abstractSection, putAcademicSection, sectionParagraph, styleApaSections } from '../utils/apa-sections';
import { academicObjects, applyApaObjects } from '../utils/apa-objects';
import { apaDocumentLayout } from '../utils/apa-layout';

type Host = Pick<PureDocEditorComponent, 'documentReady' | 'isReadMode' | 'pushUndoSnapshot' | 'activePageIndex' | 'layoutConfig'>;
type Hooks = Pick<
  WordEditorHooks,
  | 'liveBodies'
  | 'getLivePagesSnapshot'
  | 'renderDocumentPages'
  | 'collectDocData'
  | 'scheduleAutoSave'
  | 'canvasMode'
  | 'canvasMeta'
  | 'canvasSession'
  | 'commitCanvasModelMutation'
>;

export class WordStructureController {
  constructor(private readonly editor: Host, private readonly hooks: Hooks, private readonly template: () => StyleTemplate) {}

  private buildResultPages(
    request: AcademicSectionRequest,
    template: StyleTemplate,
    bodies: HTMLElement[],
    basePages: DocumentPage[],
    doc: Document,
  ): { pages: DocumentPage[]; index: number } {
    this.editor.layoutConfig.update(layout => apaDocumentLayout(layout, template));
    let html: string;
    let key: string;
    let position: 'start' | 'abstract' | 'end';
    if (request.kind === 'cover') {
      html = coverSection(request, template);
      key = 'cover';
      position = 'start';
      this.editor.layoutConfig.update(layout => ({
        ...layout,
        apa: { ...layout.apa!, mode: request.professional ? 'professional' : 'student' },
      }));
    } else if (request.kind === 'abstract') {
      html = abstractSection(request, template);
      key = `abstract-${request.language}`;
      position = 'abstract';
    } else {
      const root = doc.createElement('div');
      root.dataset['apaSection'] = 'appendix';
      root.dataset['appendixId'] = crypto.randomUUID();
      root.append(
        sectionParagraph('Apéndice', 'appendix-label', template),
        sectionParagraph(request.title, 'appendix-title', template),
      );
      request.text.split(/\n+/).filter(Boolean).forEach(text => root.append(sectionParagraph(text, 'appendix-body', template)));
      if (request.objectId) {
        const item = academicObjects(bodies).find(entry => entry.object.id === request.objectId);
        if (item) {
          bodies.forEach(body => body.querySelectorAll<HTMLElement>('[data-apa-caption-for]').forEach(p => {
            if (p.dataset['apaCaptionFor'] === request.objectId) p.remove();
          }));
          item.element.dataset['apaCaptioned'] = 'true';
          item.element.dataset['apaTitle'] ||= request.title;
          root.append(item.element);
          if (item.object.kind === 'table' && request.singleTable && !request.text.trim()) {
            root.dataset['appendixTableOnly'] = 'true';
          }
        }
      }
      html = root.outerHTML;
      key = `appendix-${root.dataset['appendixId']}`;
      position = 'end';
    }
    const updatedSourcePages = bodies.map((body, idx) => ({
      ...(basePages[idx] || { id: body.dataset['pageBodyId'] || crypto.randomUUID() }),
      html: body.innerHTML,
    }));
    const result = putAcademicSection(updatedSourcePages, html, key, position);
    const styledBodies = result.pages.map(page => {
      const body = doc.createElement('div');
      body.innerHTML = page.html;
      return body;
    });
    styleApaSections(styledBodies, template);
    applyApaObjects(styledBodies, template);
    return {
      pages: result.pages.map((page, index) => ({ ...page, html: styledBodies[index].innerHTML })),
      index: result.index,
    };
  }

  insert(request: AcademicSectionRequest): boolean {
    if (!this.editor.documentReady() || this.editor.isReadMode()) return false;
    const template = this.template();
    if (
      (request.kind === 'cover' && !request.title.trim()) ||
      (request.kind === 'abstract' && !request.text.trim()) ||
      (request.kind === 'appendix' && !request.title.trim())
    ) {
      return false;
    }

    const session = this.hooks.canvasMode?.() ? this.hooks.canvasSession?.() : undefined;
    if (session) {
      const prevMeta = this.hooks.canvasMeta?.();
      this.editor.layoutConfig.update(layout => {
        const next = apaDocumentLayout(layout, template);
        return request.kind === 'cover'
          ? { ...next, apa: { ...next.apa!, mode: request.professional ? 'professional' : 'student' } }
          : next;
      });
      const res = session.insertAcademicSection(request, template, prevMeta);
      if (res.ok) {
        this.hooks.commitCanvasModelMutation?.({ activePageIndex: res.activePageIndex });
      }
      return res.ok;
    }

    this.editor.pushUndoSnapshot();
    const result = this.buildResultPages(request, template, this.hooks.liveBodies(), this.hooks.getLivePagesSnapshot(), document);
    this.hooks.renderDocumentPages(result.pages, true);
    this.editor.activePageIndex.set(result.index);
    this.hooks.scheduleAutoSave(this.hooks.collectDocData());
    return true;
  }
}
