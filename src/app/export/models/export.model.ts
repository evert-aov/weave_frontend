import { Note } from '../../core/models/note.model';

export type ExportFormat = 'pdf' | 'markdown' | 'html' | 'json';

export interface ExportOptions {
  includeTitle?: boolean;
  includeMetadata?: boolean;
  includeTags?: boolean;
  pageSize?: 'A4' | 'letter';
  orientation?: 'portrait' | 'landscape';
  method?: 'download' | 'print';
  filename?: string;
}

export interface ExportStrategy {
  readonly format: ExportFormat;
  readonly label: string;
  readonly description: string;
  readonly extension: string;
  readonly mimeType: string;
  readonly icon: string;
  export(note: Note, options?: ExportOptions): Promise<void>;
}
