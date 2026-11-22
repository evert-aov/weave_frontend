import { auditApaDocument } from '../utils/apa-audit';
import { WordNotesController } from './word-notes.controller';
import { WordStructureController } from './word-structure.controller';
import type { AcademicSection, AcademicSectionRequest, AcademicNoteRequest, ApaIssue } from '../models/academic-sections.model';
import { styleApaSections } from '../utils/apa-sections';
import { insertAcademicBlock, wordCount } from '../utils/academic-insertion';
import { sectionParagraph } from '../utils/apa-sections';
import { apaDocumentLayout } from '../utils/apa-layout';
import { signal } from '@angular/core';
import type { PureDocEditorComponent } from '../pure-doc-editor.component';
import type { WordEditorHooks } from './word-editor-hooks';
import { normalizeSources, type BibliographicSource, type CitationRequest, type AcademicObject, type CaptionRequest } from '../models/academic.model';
import { academicObjects, academicObjectLabel, academicParagraph, applyApaObjects } from '../utils/apa-objects';
import { APA_STYLE_TEMPLATES } from '../constants/apa-style-templates';
import { citationSourceIds, renderCitationGroup, referenceEligible, referenceHtml, sortedSources } from '../utils/apa-references';
import { rebuildObjectIndexInDomPages } from '../utils/table-of-contents';

type Host = Pick<PureDocEditorComponent, 'bibliographicSources' | 'headingNumbering' | 'layoutConfig' | 'i18n' | 'activeTemplateId' | 'styleTemplates' | 'activePageIndex' | 'pages' | 'documentReady' | 'isReadMode' | 'pushUndoSnapshot'>;
type Hooks = Pick<
  WordEditorHooks,
  | 'liveBodies'
  | 'finishDocumentMutation'
  | 'saveSelection'
  | 'prepareRibbonSelection'
  | 'renderDocumentPages'
  | 'getLivePagesSnapshot'
  | 'collectDocData'
  | 'scheduleAutoSave'
  | 'showToast'
  | 'refreshApaToc'
  | 'canvasMode'
  | 'canvasMeta'
  | 'canvasSession'
  | 'commitCanvasModelMutation'
  | 'focusCanvas'
  | 'ensureCanvasObjectIds'
  | 'pushCanvasMetaHistory'
  | 'commitCanvasMetaLayout'
>;

/** Sources are document metadata; citations and the reference list are editable HTML. */
export class WordAcademicController {
  readonly open = signal(false);
  readonly objects = signal<AcademicObject[]>([]);
  readonly section = signal<AcademicSection>('sources');
  readonly error = signal('');
  readonly issues = signal<ApaIssue[]>([]);
  readonly notes: WordNotesController;
  readonly structures: WordStructureController;
  constructor(private readonly editor: Host, private readonly hooks: Hooks) {
    this.notes = new WordNotesController(editor, hooks, () => this.template());
    this.structures = new WordStructureController(editor, hooks, () => this.template());
  }

  private template() {
    const active = this.editor.styleTemplates().find(t => t.id === this.editor.activeTemplateId());
    return active?.academicStyle === 'apa7' ? active : APA_STYLE_TEMPLATES[0];
  }

  private isCanvas(): boolean {
    return Boolean(this.hooks.canvasMode?.() && this.hooks.canvasSession?.());
  }

  show(section: AcademicSection = 'sources'): void {
    if (!this.editor.documentReady() || this.editor.isReadMode()) return;
    if (!this.open() && !this.isCanvas()) this.hooks.saveSelection();
    this.section.set(section);
    this.error.set('');
    if (section === 'review') {
      this.issues.set(auditApaDocument(this.hooks.getLivePagesSnapshot(), this.editor.layoutConfig(), this.editor.headingNumbering(), this.editor.bibliographicSources()));
    }
    if (section === 'notes') this.notes.refresh();
    if (section === 'objects' || section === 'structure') {
      const session = this.isCanvas() ? this.hooks.canvasSession?.() : undefined;
      if (session && typeof session.getAcademicObjects === 'function') {
        session.assignMissingObjectIds?.();
        this.objects.set(session.getAcademicObjects());
      } else {
        if (this.isCanvas()) this.hooks.ensureCanvasObjectIds?.();
        this.objects.set(academicObjects(this.hooks.liveBodies()).map(item => item.object));
      }
    }
    this.open.set(true);
  }

  close(): void {
    const wasOpen = this.open();
    this.open.set(false);
    this.error.set('');
    if (!wasOpen) return;
    if (this.isCanvas()) this.hooks.focusCanvas?.();
    else this.hooks.prepareRibbonSelection();
  }

  insertSection(request: AcademicSectionRequest): void { if (this.structures.insert(request)) this.close(); }
  saveNote(request: AcademicNoteRequest): void { if (this.notes.save(request)) this.close(); }

  objectReference(id: string): void {
    if (this.isCanvas()) {
      const session = this.hooks.canvasSession?.();
      if (session?.insertObjectReference(id, this.template(), this.editor.activePageIndex(), this.hooks.canvasMeta?.())) {
        this.hooks.commitCanvasModelMutation?.();
        this.close();
      }
      return;
    }

    styleApaSections(this.hooks.liveBodies(), this.template());
    const object = academicObjects(this.hooks.liveBodies()).find(item => item.object.id === id)?.object;
    const range = this.hooks.prepareRibbonSelection();
    if (!object || !range) return;
    this.editor.pushUndoSnapshot();
    const span = document.createElement('span');
    span.dataset['wordObjectReference'] = id;
    span.textContent = academicObjectLabel(object);
    range.deleteContents();
    range.insertNode(span);
    range.setStartAfter(span);
    range.collapse(true);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(range);
    this.hooks.finishDocumentMutation();
    this.close();
  }

  pageSettings(request: { mode: 'student' | 'professional'; runningHead: string }): void {
    if (this.editor.isReadMode() || !this.editor.documentReady()) return;
    const applyLayout = () => {
      const layout = apaDocumentLayout(this.editor.layoutConfig(), this.template());
      layout.apa = {
        ...layout.apa!,
        mode: request.mode === 'professional' ? 'professional' : 'student',
        runningHead: request.runningHead.toLocaleUpperCase().slice(0, 50),
      };
      this.editor.layoutConfig.set(layout);
    };
    if (this.isCanvas()) {
      this.hooks.pushCanvasMetaHistory?.();
      applyLayout();
      this.hooks.commitCanvasMetaLayout?.();
      this.close();
      return;
    }
    this.editor.pushUndoSnapshot();
    applyLayout();
    this.hooks.finishDocumentMutation();
    this.close();
  }

  save(source: BibliographicSource): void {
    if (this.editor.isReadMode()) return;
    const normalized = normalizeSources([{ ...source, id: source.id || crypto.randomUUID() }])[0];
    if (!normalized) return;
    if (this.isCanvas()) {
      const session = this.hooks.canvasSession?.();
      const prevMeta = this.hooks.canvasMeta?.();
      this.editor.bibliographicSources.update(sources => [...sources.filter(s => s.id !== normalized.id), normalized]);
      if (session?.refreshAcademicBibliographyAndCitations(this.editor.bibliographicSources(), this.template(), prevMeta)) {
        this.hooks.commitCanvasModelMutation?.();
      } else {
        session?.pushMetaSnapshot(prevMeta);
        this.hooks.commitCanvasModelMutation?.();
      }
      this.error.set('');
      return;
    }
    this.editor.pushUndoSnapshot();
    this.editor.bibliographicSources.update(sources => [...sources.filter(s => s.id !== normalized.id), normalized]);
    this.refreshCitations();
    this.refreshBibliography();
    this.hooks.finishDocumentMutation();
    this.error.set('');
  }

  remove(id: string): void {
    if (this.editor.isReadMode()) return;
    if (this.isCanvas()) {
      const session = this.hooks.canvasSession?.();
      if (
        typeof session?.isBibliographicSourceCited === 'function'
          ? session.isBibliographicSourceCited(id)
          : this.hooks.liveBodies().some(body => Array.from(body.querySelectorAll<HTMLElement>('[data-word-source-id],[data-apa-source]')).some(el => citationSourceIds(el).includes(id) || el.dataset['wordSourceId'] === id || el.dataset['apaSource'] === id))
      ) {
        this.error.set(this.editor.i18n.t('word.academic.source_used'));
        return;
      }
      const prevMeta = this.hooks.canvasMeta?.();
      this.editor.bibliographicSources.update(sources => sources.filter(s => s.id !== id));
      if (session?.refreshAcademicBibliographyAndCitations(this.editor.bibliographicSources(), this.template(), prevMeta)) {
        this.hooks.commitCanvasModelMutation?.();
      } else {
        session?.pushMetaSnapshot(prevMeta);
        this.hooks.commitCanvasModelMutation?.();
      }
      this.error.set('');
      return;
    }
    const cited = this.hooks.liveBodies().some(body => Array.from(body.querySelectorAll<HTMLElement>('[data-word-source-id],[data-apa-source]')).some(el => citationSourceIds(el).includes(id) || el.dataset['wordSourceId'] === id || el.dataset['apaSource'] === id));
    if (cited) { this.error.set(this.editor.i18n.t('word.academic.source_used')); return; }
    this.editor.pushUndoSnapshot();
    this.editor.bibliographicSources.update(sources => sources.filter(s => s.id !== id));
    this.refreshCitations();
    this.refreshBibliography();
    this.hooks.finishDocumentMutation();
    this.error.set('');
  }

  private buildAndInsertCitation(
    request: CitationRequest,
    source: BibliographicSource,
    range: Range,
    doc: Document,
    onRangeUpdate: (nextRange: Range) => void,
  ): void {
    const span = doc.createElement('span');
    span.dataset['wordCitation'] = 'apa7';
    span.dataset['wordSourceId'] = source.id;
    span.dataset['narrative'] = String(request.quoteText?.trim() ? false : request.narrative);
    span.dataset['locator'] = request.locator;
    span.dataset['wordSourceIds'] = JSON.stringify(
      request.quoteText?.trim() || request.secondaryAuthor?.trim()
        ? [source.id]
        : [...new Set([source.id, ...(request.additionalIds || [])])],
    );
    span.dataset['secondaryAuthor'] = request.secondaryAuthor || '';
    span.dataset['secondaryYear'] = request.secondaryYear || '';
    span.innerHTML = renderCitationGroup(span, this.editor.bibliographicSources());
    const quoted = request.quoteText?.trim();
    if (quoted && wordCount(quoted) >= 40) {
      const block = doc.createElement('blockquote');
      block.dataset['apaQuote'] = 'block';
      Object.assign(block.style, {
        margin: '0pt 0pt 0pt 36pt',
        padding: '0',
        border: 'none',
        backgroundColor: 'transparent',
        fontStyle: 'normal',
        lineHeight: '2',
      });
      const parts = quoted.split(/\n+/).filter(Boolean);
      parts.forEach((text, index) => {
        const p = sectionParagraph(text, 'quote', this.template());
        p.style.textIndent = index ? '36pt' : '0pt';
        block.append(p);
      });
      const last = block.lastElementChild!;
      if (!/[.!?]$/.test(last.textContent || '')) last.append('.');
      last.append(' ', span);
      onRangeUpdate(insertAcademicBlock(range, block));
      return;
    }
    let inserted: HTMLElement = span;
    if (quoted) {
      inserted = doc.createElement('span');
      inserted.dataset['apaShortQuote'] = 'true';
      inserted.append(`“${quoted.endsWith('.') && !quoted.endsWith('...') ? quoted.slice(0, -1) : quoted}” `, span);
      if (request.quoteEnding) inserted.append('.');
    }
    range.deleteContents();
    range.insertNode(inserted);
    range.setStartAfter(inserted);
    range.collapse(true);
    onRangeUpdate(range);
  }

  cite(request: CitationRequest): void {
    if (this.editor.isReadMode()) return;
    const source = this.editor.bibliographicSources().find(s => s.id === request.sourceId);
    if (!source) return;
    if (request.quoteText?.trim() && !request.locator.trim() && source.kind !== 'personal') {
      this.error.set(this.editor.i18n.t('word.academic.locator_required'));
      return;
    }

    if (this.isCanvas()) {
      const session = this.hooks.canvasSession?.();
      if (
        session?.insertCitation(
          request,
          this.editor.bibliographicSources(),
          this.template(),
          this.editor.activePageIndex(),
          this.hooks.canvasMeta?.(),
        )
      ) {
        this.hooks.commitCanvasModelMutation?.();
        this.close();
      }
      return;
    }

    let range = this.hooks.prepareRibbonSelection();
    const bodies = this.hooks.liveBodies();
    if (!range) {
      const body = bodies[this.editor.activePageIndex()];
      if (!body) return;
      range = document.createRange();
      range.selectNodeContents(body);
      range.collapse(false);
    }
    // Replacing selections across pages would invalidate the page map.
    if (!bodies.some(body => body.contains(range!.startContainer) && body.contains(range!.endContainer))) return;
    this.editor.pushUndoSnapshot();
    this.buildAndInsertCitation(request, source, range, document, nextRange => { range = nextRange; });
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(range);
    this.refreshCitations();
    this.refreshBibliography();
    this.hooks.finishDocumentMutation();
    this.close();
  }

  private allCitedSourcesIn(bodies: HTMLElement[]): BibliographicSource[] {
    const ids = new Set(bodies.flatMap(body => Array.from(body.querySelectorAll<HTMLElement>('[data-word-citation],[data-apa-source]')).flatMap(el => el.dataset['apaSource'] ? [el.dataset['apaSource']!] : citationSourceIds(el))));
    return sortedSources(this.editor.bibliographicSources().filter(s => ids.has(s.id)));
  }
  private citedSourcesIn(bodies: HTMLElement[]): BibliographicSource[] { return this.allCitedSourcesIn(bodies).filter(referenceEligible); }
  private citedSources(): BibliographicSource[] { return this.citedSourcesIn(this.hooks.liveBodies()); }
  private referenceNodesIn(bodies: HTMLElement[]): HTMLElement[] {
    return bodies.flatMap(body => Array.from(body.querySelectorAll<HTMLElement>('[data-word-bibliography]')));
  }
  private referenceNodes(): HTMLElement[] { return this.referenceNodesIn(this.hooks.liveBodies()); }
  private bibliographyHtml(bodies: HTMLElement[] = this.hooks.liveBodies(), doc: Document = document): string {
    const holder = doc.createElement('div');
    const template = this.template();
    const cited = this.citedSourcesIn(bodies);
    const heading = doc.createElement('p');
    heading.dataset['wordBibliography'] = 'heading';
    heading.dataset['apaRole'] = 'heading';
    heading.textContent = 'Referencias';
    academicParagraph(heading, template, 'heading');
    holder.append(heading);
    for (const source of cited) {
      const p = doc.createElement('p');
      p.dataset['wordBibliography'] = 'entry';
      p.dataset['apaRole'] = 'reference';
      p.dataset['referenceSource'] = source.id;
      p.innerHTML = referenceHtml(source, cited);
      academicParagraph(p, template, 'reference');
      holder.append(p);
    }
    return holder.innerHTML;
  }
  private refreshBibliographyIn(bodies: HTMLElement[], doc: Document = document): void {
    const existing = this.referenceNodesIn(bodies);
    if (!existing.length) return;
    const fragment = doc.createRange().createContextualFragment(this.bibliographyHtml(bodies, doc));
    existing[0].before(fragment);
    existing.forEach(p => p.remove());
  }
  private refreshBibliography(): void { this.refreshBibliographyIn(this.hooks.liveBodies()); }
  private refreshCitationsIn(bodies: HTMLElement[]): void {
    const cited = this.allCitedSourcesIn(bodies);
    const used = new Set<string>();
    bodies.forEach(body => body.querySelectorAll<HTMLElement>('[data-word-citation]').forEach(span => {
      span.innerHTML = renderCitationGroup(span, cited, used);
    }));
  }
  private refreshCitations(): void { this.refreshCitationsIn(this.hooks.liveBodies()); }

  bibliography(): void {
    if (!this.editor.documentReady() || this.editor.isReadMode()) return;
    if (this.isCanvas()) {
      const session = this.hooks.canvasSession?.();
      if (!session) return;
      const res = session.insertOrRefreshBibliography(this.editor.bibliographicSources(), this.template(), this.hooks.canvasMeta?.());
      if (!res.ok) {
        this.error.set(this.editor.i18n.t('word.academic.no_citations'));
        return;
      }
      this.hooks.commitCanvasModelMutation?.(res.activePageIndex !== undefined ? { activePageIndex: res.activePageIndex } : undefined);
      this.close();
      return;
    }

    if (!this.citedSources().length) { this.error.set(this.editor.i18n.t('word.academic.no_citations')); return; }
    this.editor.pushUndoSnapshot();
    if (this.referenceNodes().length) { this.refreshBibliography(); this.hooks.finishDocumentMutation(); }
    else {
      const pages = this.hooks.getLivePagesSnapshot();
      const before = pages.findIndex(page => /data-apa-section="(?:endnotes|appendix)"/.test(page.html));
      const insertAt = before < 0 ? pages.length : before;
      pages.splice(insertAt, 0, { id: crypto.randomUUID(), html: this.bibliographyHtml(), breakBefore: 'manual' });
      this.hooks.renderDocumentPages(pages, true);
      this.editor.activePageIndex.set(insertAt);
      this.hooks.scheduleAutoSave(this.hooks.collectDocData());
    }
    this.close();
  }

  caption(request: CaptionRequest): void {
    if (this.editor.isReadMode() || !request.title.trim()) return;
    const template = this.template();
    if (this.isCanvas()) {
      const session = this.hooks.canvasSession?.();
      if (session?.applyAcademicCaption(request, this.editor.bibliographicSources(), template, this.hooks.canvasMeta?.())) {
        this.objects.set(session.getAcademicObjects());
        this.hooks.commitCanvasModelMutation?.();
      }
      this.close();
      return;
    }
    this.editor.pushUndoSnapshot();
    styleApaSections(this.hooks.liveBodies(), template);
    applyApaObjects(this.hooks.liveBodies(), template, request);
    this.refreshBibliography();
    this.hooks.finishDocumentMutation();
    this.refreshDomObjectIndexes();
    this.objects.set(academicObjects(this.hooks.liveBodies()).map(item => item.object));
    this.close();
  }

  private refreshDomObjectIndexes(): void {
    const pages = this.hooks.getLivePagesSnapshot();
    const hasTables = pages.some(p => p.html.includes('data-word-list-of="tables"'));
    const hasFigures = pages.some(p => p.html.includes('data-word-list-of="figures"'));
    if (!hasTables && !hasFigures) return;
    let next = pages;
    if (hasTables) next = rebuildObjectIndexInDomPages(next, 'table', this.editor.activePageIndex(), false).pages;
    if (hasFigures) next = rebuildObjectIndexInDomPages(next, 'figure', this.editor.activePageIndex(), false).pages;
    this.hooks.renderDocumentPages(next, false);
    this.hooks.scheduleAutoSave(this.hooks.collectDocData());
  }

  update(): void {
    if (!this.editor.documentReady() || this.editor.isReadMode()) return;
    const template = this.template();
    const active = this.editor.styleTemplates().find(t => t.id === this.editor.activeTemplateId());
    if (this.isCanvas()) {
      const session = this.hooks.canvasSession?.();
      if (!session) return;
      const prevMeta = this.hooks.canvasMeta?.();
      if (active?.academicStyle === 'apa7') {
        this.editor.layoutConfig.update(layout => apaDocumentLayout(layout, active));
      }
      session.updateAcademicDocument(this.editor.bibliographicSources(), template, prevMeta);
      this.objects.set(session.getAcademicObjects());
      this.hooks.commitCanvasModelMutation?.();
      this.notes.refresh();
      this.hooks.refreshApaToc();
      this.hooks.showToast(this.editor.i18n.t('word.academic.updated'));
      return;
    }

    this.editor.pushUndoSnapshot();
    this.refreshCitations();
    this.refreshBibliography();
    if (active?.academicStyle === 'apa7') this.editor.layoutConfig.update(layout => apaDocumentLayout(layout, active));
    styleApaSections(this.hooks.liveBodies(), template);
    applyApaObjects(this.hooks.liveBodies(), template);
    this.hooks.finishDocumentMutation();
    this.notes.syncEndnotes();
    this.refreshDomObjectIndexes();
    this.hooks.refreshApaToc();
    this.hooks.showToast(this.editor.i18n.t('word.academic.updated'));
  }
}
