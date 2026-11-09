import type { AcademicSection, AcademicSectionRequest, AcademicNote, AcademicNoteRequest, ApaIssue } from '../../models/academic-sections.model';
import { WordAcademicStructureComponent } from '../word-academic-structure/word-academic-structure.component';
import type { ApaPageConfig } from '../../models/word-document.model';
import { Component, ElementRef, EventEmitter, Input, Output, ViewChild, inject, OnChanges, AfterViewInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { I18nService } from '../../../../core/services/i18n.service';
import { emptySource, BIBLIOGRAPHIC_KINDS, type BibliographicSource, type AcademicObject, type CaptionRequest, type CitationRequest } from '../../models/academic.model';
import { referenceHtml } from '../../utils/apa-references';

@Component({
  selector: 'app-word-academic-panel', standalone: true, imports: [FormsModule, WordAcademicStructureComponent],
  templateUrl: './word-academic-panel.component.html', styleUrl: './word-academic-panel.component.scss',
})
export class WordAcademicPanelComponent implements OnChanges, AfterViewInit {
  readonly i18n = inject(I18nService);
  @Input() sources: BibliographicSource[] = [];
  @Input() objects: AcademicObject[] = [];
  @Input() section: AcademicSection = 'sources';
  @Output() sectionChanged = new EventEmitter<AcademicSection>();
  switchSection(section: AcademicSection): void { this.section = section; this.sectionChanged.emit(section); }
  @Input() pageConfig?: ApaPageConfig;
  @Output() pageSettings = new EventEmitter<{ mode: 'student' | 'professional'; runningHead: string }>();
  pageMode: 'student' | 'professional' = 'student'; runningHead = '';
  @Input() notes: AcademicNote[] = [];
  @Input() issues: ApaIssue[] = [];
  @Output() insertSection = new EventEmitter<AcademicSectionRequest>();
  @Output() saveNote = new EventEmitter<AcademicNoteRequest>();
  @Output() removeNote = new EventEmitter<string>();
  @Output() objectReference = new EventEmitter<string>();
  @Input() error = '';
  @Input() darkMode = false;
  @Output() close = new EventEmitter<void>();
  @Output() saveSource = new EventEmitter<BibliographicSource>();
  @Output() removeSource = new EventEmitter<string>();
  @Output() cite = new EventEmitter<CitationRequest>();
  @Output() bibliography = new EventEmitter<void>();
  @Output() caption = new EventEmitter<CaptionRequest>();
  draft = emptySource(); authors = ''; selectedSource = ''; narrative = false; locator = '';
  objectId = ''; title = ''; note = ''; attribution = ''; objectSource = '';
  readonly kinds = BIBLIOGRAPHIC_KINDS;
  additionalIds: string[] = []; secondaryAuthor = ''; secondaryYear = ''; quoteText = ''; quoteEnding = true;
  noteId = ''; noteKind: 'footnote' | 'endnote' = 'footnote'; noteText = '';
  readonly fields = ['organization', 'year', 'date', 'title', 'container', 'publisher', 'volume', 'issue', 'pages', 'edition', 'description', 'doi', 'url', 'accessed', 'editors', 'translators', 'originalYear', 'version', 'platform', 'role', 'number', 'location', 'abbreviation', 'handle'] as const;
  @ViewChild('dialog') dialog?: ElementRef<HTMLElement>;
  ngAfterViewInit(): void {
    this.dialog?.nativeElement.querySelector<HTMLElement>('button')?.focus();
  }
  trapFocus(event: KeyboardEvent): void {
    if (event.key !== 'Tab') return;
    const fields = Array.from(this.dialog!.nativeElement.querySelectorAll<HTMLElement>('button:not(:disabled),input,textarea,select'));
    const first = fields[0], last = fields.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }
  t(key: string): string { return this.i18n.t(`word.academic.${key}`); }
  ngOnChanges(): void {
    this.pageMode = this.pageConfig?.mode || 'student'; this.runningHead = this.pageConfig?.runningHead || '';
    if (!this.objectId && this.objects.length) { this.objectId = this.objects[0].id; this.chooseObject(); }
    if (!this.sources.some(source => source.id === this.selectedSource)) this.selectedSource = this.sources[0]?.id || '';
  }
  edit(source?: BibliographicSource): void { this.draft = source ? { ...source, authors: source.authors.map(a => ({ ...a })) } : emptySource(); this.authors = this.draft.authors.map(a => `${a.family}${a.given ? `, ${a.given}` : ''}`).join('\n'); }
  save(): void {
    if (!this.draft.title.trim()) return;
    const authors = this.parseAuthors();
    const source = { ...this.draft, id: this.draft.id || crypto.randomUUID(), authors };
    this.saveSource.emit(source); this.draft = source; this.selectedSource = source.id;
  }
  private parseAuthors() {
    return this.authors.split('\n').map(line => {
      const [family, ...given] = line.trim().split(','); return { family: family.trim(), given: given.join(',').trim() };
    }).filter(a => a.family);
  }
  chooseNote(): void {
    const note = this.notes.find(note => note.id === this.noteId);
    this.noteKind = note?.kind || 'footnote'; this.noteText = note?.text || '';
  }
  insertCitation(): void { this.cite.emit({ sourceId: this.selectedSource, narrative: this.narrative, locator: this.locator, additionalIds: this.additionalIds, secondaryAuthor: this.secondaryAuthor, secondaryYear: this.secondaryYear, quoteText: this.quoteText, quoteEnding: this.quoteEnding }); }
  chooseObject(): void {
    const object = this.objects.find(o => o.id === this.objectId);
    this.title = object?.title || ''; this.note = object?.note || ''; this.attribution = object?.attribution || ''; this.objectSource = object?.sourceId || '';
  }
  preview(): string {
    const draft = { ...this.draft, authors: this.parseAuthors() };
    return draft.title.trim() ? referenceHtml(draft, [...this.sources.filter(s => s.id !== draft.id), draft]) : '';
  }
}
