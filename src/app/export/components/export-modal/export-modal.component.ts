import { Component, EventEmitter, Input, Output, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Note } from '../../../core/models/note.model';
import { IconComponent } from '../../../shared/components/icon/icon.component';
import { ExportService } from '../../services/export.service';
import { ExportFormat, ExportOptions } from '../../models/export.model';
import { I18nService } from '../../../core/services/i18n.service';

@Component({
  selector: 'app-export-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, IconComponent],
  templateUrl: './export-modal.component.html',
  styleUrl: './export-modal.component.scss',
})
export class ExportModalComponent {
  @Input({ required: true }) note!: Note;
  @Output() close = new EventEmitter<void>();

  private readonly exportService = inject(ExportService);
  readonly i18n = inject(I18nService);

  readonly strategies = this.exportService.getAvailableStrategies();
  readonly selectedFormat = signal<ExportFormat>('pdf');
  readonly pdfMethod = signal<'download' | 'print'>('download');
  readonly isExporting = signal<boolean>(false);

  pageSize: 'A4' | 'letter' = 'A4';
  orientation: 'portrait' | 'landscape' = 'portrait';
  includeMetadata = true;
  includeTags = true;

  async doExport(): Promise<void> {
    this.isExporting.set(true);
    try {
      const options: ExportOptions = {
        pageSize: this.pageSize,
        orientation: this.orientation,
        includeMetadata: this.includeMetadata,
        includeTags: this.includeTags,
        method: this.pdfMethod(),
      };
      await this.exportService.exportNote(this.note, this.selectedFormat(), options);
      this.close.emit();
    } catch (err) {
      console.error('[ExportModalComponent] Error during export:', err);
      alert('Ocurrió un error al exportar el documento.');
    } finally {
      this.isExporting.set(false);
    }
  }
}
