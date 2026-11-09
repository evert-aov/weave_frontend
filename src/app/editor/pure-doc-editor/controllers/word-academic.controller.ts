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

type Host = Pick<PureDocEditorComponent, 'bibliographicSources' | 'headingNumbering' | 'layoutConfig' | 'i18n' | 'activeTemplateId' | 'styleTemplates' | 'activePageIndex' | 'pages' | 'documentReady' | 'isReadMode' | 'pushUndoSnapshot'>;
type Hooks = Pick<WordEditorHooks, 'liveBodies' | 'finishDocumentMutation' | 'saveSelection' | 'prepareRibbonSelection' | 'renderDocumentPages' | 'getLivePagesSnapshot' | 'collectDocData' | 'scheduleAutoSave' | 'showToast' | 'refreshApaToc'>;

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
  show(section: AcademicSection = 'sources'): void {
    if (!this.editor.documentReady() || this.editor.isReadMode()) return;
    if (!this.open()) this.hooks.saveSelection();
    this.section.set(section); this.error.set('');
    if (section === 'review') this.issues.set(auditApaDocument(this.hooks.getLivePagesSnapshot(), this.editor.layoutConfig(), this.editor.headingNumbering(), this.editor.bibliographicSources()));
    this.notes.refresh();
    this.objects.set(academicObjects(this.hooks.liveBodies()).map(item => item.object)); this.open.set(true);
  }
  close(): void {
    const wasOpen = this.open();
    this.open.set(false); this.error.set('');
    if (wasOpen) this.hooks.prepareRibbonSelection();
  }
  insertSection(request: AcademicSectionRequest): void { if (this.structures.insert(request)) this.close(); }
  saveNote(request: AcademicNoteRequest): void { if (this.notes.save(request)) this.close(); }
  objectReference(id: string): void {
    styleApaSections(this.hooks.liveBodies(), this.template());
    const object = academicObjects(this.hooks.liveBodies()).find(item => item.object.id === id)?.object;
    const range = this.hooks.prepareRibbonSelection(); if (!object || !range) return;
    this.editor.pushUndoSnapshot();
    const span = document.createElement('span'); span.dataset['wordObjectReference'] = id;
    span.textContent = academicObjectLabel(object);
    range.deleteContents(); range.insertNode(span); range.setStartAfter(span); range.collapse(true);
    window.getSelection()?.removeAllRanges(); window.getSelection()?.addRange(range);
    this.hooks.finishDocumentMutation(); this.close();
  }
  pageSettings(request: { mode: 'student' | 'professional'; runningHead: string }): void {
    if (this.editor.isReadMode() || !this.editor.documentReady()) return;
    this.editor.pushUndoSnapshot();
    const layout = apaDocumentLayout(this.editor.layoutConfig(), this.template());
    layout.apa = { ...layout.apa!, mode: request.mode === 'professional' ? 'professional' : 'student', runningHead: request.runningHead.toLocaleUpperCase().slice(0, 50) };
    this.editor.layoutConfig.set(layout); this.hooks.finishDocumentMutation(); this.close();
  }
  save(source: BibliographicSource): void {
    if (this.editor.isReadMode()) return;
    const normalized = normalizeSources([{ ...source, id: source.id || crypto.randomUUID() }])[0];
    if (!normalized) return;
    this.editor.pushUndoSnapshot();
    this.editor.bibliographicSources.update(sources => [...sources.filter(s => s.id !== normalized.id), normalized]);
    this.refreshCitations(); this.refreshBibliography(); this.hooks.finishDocumentMutation(); this.error.set('');
  }
  remove(id: string): void {
    if (this.editor.isReadMode()) return;
    const cited = this.hooks.liveBodies().some(body => Array.from(body.querySelectorAll<HTMLElement>('[data-word-source-id],[data-apa-source]')).some(el => citationSourceIds(el).includes(id) || el.dataset['wordSourceId'] === id || el.dataset['apaSource'] === id));
    if (cited) { this.error.set(this.editor.i18n.t('word.academic.source_used')); return; }
    this.editor.pushUndoSnapshot();
    this.editor.bibliographicSources.update(sources => sources.filter(s => s.id !== id));
    this.refreshCitations(); this.refreshBibliography(); this.hooks.finishDocumentMutation(); this.error.set('');
  }
  cite(request: CitationRequest): void {
    if (this.editor.isReadMode()) return;
    const source = this.editor.bibliographicSources().find(s => s.id === request.sourceId);
    if (!source) return;
    let range = this.hooks.prepareRibbonSelection();
    const bodies = this.hooks.liveBodies();
    if (!range) {
      const body = bodies[this.editor.activePageIndex()]; if (!body) return;
      range = document.createRange(); range.selectNodeContents(body); range.collapse(false);
    }
    // Replacing selections across pages would invalidate the page map.
    if (!bodies.some(body => body.contains(range!.startContainer) && body.contains(range!.endContainer))) return;
    if (request.quoteText?.trim() && !request.locator.trim() && source.kind !== 'personal') { this.error.set(this.editor.i18n.t('word.academic.locator_required')); return; }
    this.editor.pushUndoSnapshot();
    const span = document.createElement('span'); span.dataset['wordCitation'] = 'apa7'; span.dataset['wordSourceId'] = source.id;
    span.dataset['narrative'] = String(request.quoteText?.trim() ? false : request.narrative); span.dataset['locator'] = request.locator;
    span.dataset['wordSourceIds'] = JSON.stringify(request.quoteText?.trim() || request.secondaryAuthor?.trim() ? [source.id] : [...new Set([source.id, ...(request.additionalIds || [])])]);
    span.dataset['secondaryAuthor'] = request.secondaryAuthor || ''; span.dataset['secondaryYear'] = request.secondaryYear || '';
    span.innerHTML = renderCitationGroup(span, this.editor.bibliographicSources());
    const quoted = request.quoteText?.trim();
    if (quoted && wordCount(quoted) >= 40) {
      const block = document.createElement('blockquote'); block.dataset['apaQuote'] = 'block';
      Object.assign(block.style, { margin: '0pt 0pt 0pt 36pt', padding: '0', border: 'none', backgroundColor: 'transparent', fontStyle: 'normal', lineHeight: '2' });
      const parts = quoted.split(/\n+/).filter(Boolean);
      parts.forEach((text, index) => { const p = sectionParagraph(text, 'quote', this.template()); p.style.textIndent = index ? '36pt' : '0pt'; block.append(p); });
      const last = block.lastElementChild!;
      if (!/[.!?]$/.test(last.textContent || '')) last.append('.'); last.append(' ', span);
      insertAcademicBlock(range, block);
      range = window.getSelection()?.getRangeAt(0).cloneRange() || range;
    } else {
      let inserted: HTMLElement = span;
      if (quoted) { inserted = document.createElement('span'); inserted.dataset['apaShortQuote'] = 'true'; inserted.append(`“${quoted.endsWith('.') && !quoted.endsWith('...') ? quoted.slice(0, -1) : quoted}” `, span); if (request.quoteEnding) inserted.append('.'); }
      range.deleteContents(); range.insertNode(inserted); range.setStartAfter(inserted); range.collapse(true);
    }
    window.getSelection()?.removeAllRanges(); window.getSelection()?.addRange(range);
    this.refreshCitations(); this.refreshBibliography(); this.hooks.finishDocumentMutation(); this.close();
  }
  private allCitedSources(): BibliographicSource[] {
    const ids = new Set(this.hooks.liveBodies().flatMap(body => Array.from(body.querySelectorAll<HTMLElement>('[data-word-citation],[data-apa-source]')).flatMap(el => el.dataset['apaSource'] ? [el.dataset['apaSource']!] : citationSourceIds(el))));
    return sortedSources(this.editor.bibliographicSources().filter(s => ids.has(s.id)));
  }
  private citedSources(): BibliographicSource[] { return this.allCitedSources().filter(referenceEligible); }
  private referenceNodes(): HTMLElement[] {
    return this.hooks.liveBodies().flatMap(body => Array.from(body.querySelectorAll<HTMLElement>('[data-word-bibliography]')));
  }
  private bibliographyHtml(): string {
    const holder = document.createElement('div'), template = this.template();
    const heading = document.createElement('p'); heading.dataset['wordBibliography'] = 'heading'; heading.dataset['apaRole'] = 'heading';
    heading.textContent = 'Referencias'; academicParagraph(heading, template, 'heading'); holder.append(heading);
    for (const source of this.citedSources()) {
      const p = document.createElement('p'); p.dataset['wordBibliography'] = 'entry'; p.dataset['apaRole'] = 'reference';
      p.dataset['referenceSource'] = source.id; p.innerHTML = referenceHtml(source, this.citedSources());
      academicParagraph(p, template, 'reference'); holder.append(p);
    }
    return holder.innerHTML;
  }
  private refreshBibliography(): void {
    const existing = this.referenceNodes(); if (!existing.length) return;
    const fragment = document.createRange().createContextualFragment(this.bibliographyHtml());
    existing[0].before(fragment); existing.forEach(p => p.remove());
  }
  private refreshCitations(): void {
    const cited = this.allCitedSources(), used = new Set<string>();
    this.hooks.liveBodies().forEach(body => body.querySelectorAll<HTMLElement>('[data-word-citation]').forEach(span => {
      span.innerHTML = renderCitationGroup(span, cited, used);
    }));
  }
  bibliography(): void {
    if (!this.editor.documentReady() || this.editor.isReadMode()) return;
    if (!this.citedSources().length) { this.error.set(this.editor.i18n.t('word.academic.no_citations')); return; }
    this.editor.pushUndoSnapshot();
    if (this.referenceNodes().length) { this.refreshBibliography(); this.hooks.finishDocumentMutation(); }
    else {
      const pages = this.hooks.getLivePagesSnapshot();
      const before = pages.findIndex(page => /data-apa-section="(?:endnotes|appendix)"/.test(page.html));
      pages.splice(before < 0 ? pages.length : before, 0, { id: crypto.randomUUID(), html: this.bibliographyHtml(), breakBefore: 'manual' });
      this.hooks.renderDocumentPages(pages, true); this.editor.activePageIndex.set(pages.length - 1);
      this.hooks.scheduleAutoSave(this.hooks.collectDocData());
    }
    this.close();
  }
  caption(request: CaptionRequest): void {
    if (this.editor.isReadMode() || !request.title.trim()) return;
    this.editor.pushUndoSnapshot();
    styleApaSections(this.hooks.liveBodies(), this.template());
    applyApaObjects(this.hooks.liveBodies(), this.template(), request);
    this.refreshBibliography(); this.hooks.finishDocumentMutation();
    this.objects.set(academicObjects(this.hooks.liveBodies()).map(item => item.object)); this.close();
  }
  update(): void {
    if (!this.editor.documentReady() || this.editor.isReadMode()) return;
    this.editor.pushUndoSnapshot(); this.refreshCitations(); this.refreshBibliography();
    const active = this.editor.styleTemplates().find(template => template.id === this.editor.activeTemplateId());
    if (active?.academicStyle === 'apa7') this.editor.layoutConfig.update(layout => apaDocumentLayout(layout, active));
    styleApaSections(this.hooks.liveBodies(), this.template());
    applyApaObjects(this.hooks.liveBodies(), this.template()); this.hooks.finishDocumentMutation();
    this.notes.syncEndnotes();
    this.hooks.refreshApaToc();
    this.hooks.showToast(this.editor.i18n.t('word.academic.updated'));
  }
}
