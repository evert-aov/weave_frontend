import { academicObjectOptions } from '../../models/academic.model';
import { Component, Input, Output, EventEmitter, inject, OnChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { I18nService } from '../../../../core/services/i18n.service';
import type { AcademicSectionRequest } from '../../models/academic-sections.model';
import type { AcademicObject } from '../../models/academic.model';
import { wordCount } from '../../utils/academic-insertion';
@Component({ selector: 'app-word-academic-structure', standalone: true, imports: [FormsModule], templateUrl: './word-academic-structure.component.html',
  styles: [':host{display:block}label{display:flex;flex-direction:column;gap:4px;margin:10px 0}input,select,textarea{background:transparent;color:inherit;border:1px solid #94a3b8;border-radius:5px;padding:7px;width:100%}button{border:1px solid #2563eb;border-radius:6px;padding:8px 14px;background:#2563eb;color:white}button:disabled{opacity:.4}input[type=checkbox]{width:auto}.hint{font-size:12px;color:#64748b;margin:8px 0}.grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}'] })
export class WordAcademicStructureComponent implements OnChanges {
  private readonly i18n = inject(I18nService);
  @Input() objects: AcademicObject[] = [];
  objectOptions: { object: AcademicObject; ordinal: number }[] = [];
  ngOnChanges(): void { this.objectOptions = academicObjectOptions(this.objects); }
  @Output() insertSection = new EventEmitter<AcademicSectionRequest>();
  kind: 'cover' | 'abstract' | 'appendix' = 'cover'; professional = false;
  title = ''; authors = ''; affiliations = ''; course = ''; instructor = ''; date = ''; authorNote = '';
  language: 'es' | 'en' = 'es'; text = ''; keywords = ''; objectId = ''; singleTable = false;
  t(key: string): string { return this.i18n.t(`word.academic.${key}`); }
  count(): number { return wordCount(this.text); }
  submit(): void {
    if (this.kind === 'cover') this.insertSection.emit({ kind: 'cover', title: this.title, authors: this.authors, affiliations: this.affiliations, course: this.course, instructor: this.instructor, date: this.date, authorNote: this.authorNote, professional: this.professional });
    else if (this.kind === 'abstract') this.insertSection.emit({ kind: 'abstract', language: this.language, text: this.text, keywords: this.keywords });
    else this.insertSection.emit({ kind: 'appendix', title: this.title, text: this.text, objectId: this.objectId, singleTable: this.singleTable });
  }
}
