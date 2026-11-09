import type { PureDocEditorComponent } from '../pure-doc-editor.component';
import type { WordEditorHooks } from './word-editor-hooks';
import type { StyleTemplate } from '../models/word-document.model';
import type { AcademicSectionRequest } from '../models/academic-sections.model';
import { coverSection, abstractSection, putAcademicSection, sectionParagraph, styleApaSections } from '../utils/apa-sections';
import { academicObjects, applyApaObjects } from '../utils/apa-objects';
import { apaDocumentLayout } from '../utils/apa-layout';

type Host = Pick<PureDocEditorComponent, 'documentReady' | 'isReadMode' | 'pushUndoSnapshot' | 'activePageIndex' | 'layoutConfig'>;
type Hooks = Pick<WordEditorHooks, 'liveBodies' | 'getLivePagesSnapshot' | 'renderDocumentPages' | 'collectDocData' | 'scheduleAutoSave'>;
export class WordStructureController {
  constructor(private readonly editor: Host, private readonly hooks: Hooks, private readonly template: () => StyleTemplate) {}
  insert(request: AcademicSectionRequest): boolean {
    if (!this.editor.documentReady() || this.editor.isReadMode()) return false;
    const template = this.template();
    if (request.kind === 'cover' && !request.title.trim() || request.kind === 'abstract' && !request.text.trim() || request.kind === 'appendix' && !request.title.trim()) return false;
    this.editor.pushUndoSnapshot();
    this.editor.layoutConfig.update(layout => apaDocumentLayout(layout, template));
    let html: string, key: string, position: 'start' | 'abstract' | 'end';
    if (request.kind === 'cover') {
      html = coverSection(request, template); key = 'cover'; position = 'start';
      this.editor.layoutConfig.update(layout => ({ ...layout, apa: { ...layout.apa!, mode: request.professional ? 'professional' : 'student' } }));
    } else if (request.kind === 'abstract') { html = abstractSection(request, template); key = `abstract-${request.language}`; position = 'abstract'; }
    else {
      const root = document.createElement('div'); root.dataset['apaSection'] = 'appendix'; root.dataset['appendixId'] = crypto.randomUUID();
      root.append(sectionParagraph('Apéndice', 'appendix-label', template), sectionParagraph(request.title, 'appendix-title', template));
      request.text.split(/\n+/).filter(Boolean).forEach(text => root.append(sectionParagraph(text, 'appendix-body', template)));
      if (request.objectId) {
        const item = academicObjects(this.hooks.liveBodies()).find(item => item.object.id === request.objectId);
        if (item) {
          this.hooks.liveBodies().forEach(body => body.querySelectorAll<HTMLElement>('[data-apa-caption-for]').forEach(p => { if (p.dataset['apaCaptionFor'] === request.objectId) p.remove(); }));
          item.element.dataset['apaCaptioned'] = 'true'; item.element.dataset['apaTitle'] ||= request.title;
          root.append(item.element);
          if (item.object.kind === 'table' && request.singleTable && !request.text.trim()) root.dataset['appendixTableOnly'] = 'true';
        }
      }
      html = root.outerHTML; key = `appendix-${root.dataset['appendixId']}`; position = 'end';
    }
    const result = putAcademicSection(this.hooks.getLivePagesSnapshot(), html, key, position);
    const bodies = result.pages.map(page => { const body = document.createElement('div'); body.innerHTML = page.html; return body; });
    styleApaSections(bodies, template); applyApaObjects(bodies, template);
    result.pages = result.pages.map((page, index) => ({ ...page, html: bodies[index].innerHTML }));
    this.hooks.renderDocumentPages(result.pages, true); this.editor.activePageIndex.set(result.index);
    this.hooks.scheduleAutoSave(this.hooks.collectDocData()); return true;
  }
}
