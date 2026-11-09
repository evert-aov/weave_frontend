export type AcademicSection = 'sources' | 'objects' | 'pages' | 'structure' | 'notes' | 'review';
export interface CoverRequest { kind: 'cover'; title: string; authors: string; affiliations: string; course: string; instructor: string; date: string; authorNote: string; professional: boolean; }
export interface AbstractRequest { kind: 'abstract'; language: 'es' | 'en'; text: string; keywords: string; }
export interface AppendixRequest { kind: 'appendix'; title: string; text: string; objectId: string; singleTable: boolean; }
export type AcademicSectionRequest = CoverRequest | AbstractRequest | AppendixRequest;
export interface AcademicNoteRequest { id?: string; kind: 'footnote' | 'endnote'; text: string; }
export interface AcademicNote extends AcademicNoteRequest { id: string; number: number; }
export interface ApaIssue { page: number; message: string; }
