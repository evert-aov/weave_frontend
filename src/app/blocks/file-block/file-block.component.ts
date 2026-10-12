import {
  Component,
  Input,
  OnInit,
  inject,
  signal,
  computed,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { Block } from '../../core/models/block.model';
import { NotesService } from '../../core/services/notes.service';
import { I18nService } from '../../core/services/i18n.service';
import { IconComponent } from '../../shared/components/icon/icon.component';

/**
 * Bloque de Archivo Adjunto (PDF, Word, Excel, PowerPoint, etc.).
 * Permite subir documentos, ver detalles y previsualizar PDFs embebidos.
 */
@Component({
  selector: 'app-file-block',
  standalone: true,
  imports: [CommonModule, IconComponent],
  templateUrl: './file-block.component.html',
  styleUrls: ['./file-block.component.scss'],
})
export class FileBlockComponent implements OnInit {
  @Input({ required: true }) block!: Block;

  readonly notesService = inject(NotesService);
  readonly i18n = inject(I18nService);
  private readonly sanitizer = inject(DomSanitizer);

  readonly fileUrl = signal<string>('');
  readonly fileName = signal<string>('');
  readonly fileSize = signal<number>(0);
  readonly mimeType = signal<string>('');
  readonly fileExtension = signal<string>('');
  readonly isUploading = signal<boolean>(false);
  readonly isDragging = signal<boolean>(false);
  readonly showPdfViewer = signal<boolean>(true);

  readonly isPdf = computed(() => {
    const ext = this.fileExtension().toLowerCase();
    const mime = this.mimeType().toLowerCase();
    return ext === 'pdf' || mime.includes('pdf');
  });

  readonly safePdfUrl = computed<SafeResourceUrl>(() => {
    const url = this.fileUrl();
    if (!url) return '';
    return this.sanitizer.bypassSecurityTrustResourceUrl(url);
  });

  readonly fileBadgeClass = computed(() => {
    const ext = this.fileExtension().toLowerCase();
    switch (ext) {
      case 'pdf':
        return 'badge-pdf';
      case 'doc':
      case 'docx':
        return 'badge-word';
      case 'xls':
      case 'xlsx':
      case 'csv':
        return 'badge-excel';
      case 'ppt':
      case 'pptx':
        return 'badge-powerpoint';
      default:
        return 'badge-default';
    }
  });

  ngOnInit(): void {
    const content = this.block.content || {};
    this.fileUrl.set(content['url'] || '');
    this.fileName.set(content['name'] || '');
    this.fileSize.set(content['size'] || 0);
    this.mimeType.set(content['mimeType'] || '');

    let ext = content['extension'] || '';
    if (!ext && this.fileName()) {
      ext = this.extractExtension(this.fileName());
    }
    this.fileExtension.set(ext);
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files[0]) {
      this.uploadDocument(input.files[0]);
    }
  }

  onDragOver(e: DragEvent): void {
    e.preventDefault();
    this.isDragging.set(true);
  }

  onDragLeave(e: DragEvent): void {
    e.preventDefault();
    this.isDragging.set(false);
  }

  onDrop(e: DragEvent): void {
    e.preventDefault();
    this.isDragging.set(false);
    if (e.dataTransfer?.files && e.dataTransfer.files[0]) {
      this.uploadDocument(e.dataTransfer.files[0]);
    }
  }

  togglePdfPreview(): void {
    this.showPdfViewer.update((v) => !v);
  }

  formatFileSize(bytes: number): string {
    if (!bytes || bytes <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    let val = bytes;
    let unitIdx = 0;
    while (val >= 1024 && unitIdx < units.length - 1) {
      val /= 1024;
      unitIdx++;
    }
    return `${val.toFixed(unitIdx === 0 ? 0 : 1)} ${units[unitIdx]}`;
  }

  getFileTypeLabel(): string {
    const ext = this.fileExtension().toLowerCase();
    const isEs = this.i18n.currentLang() === 'es';
    switch (ext) {
      case 'pdf':
        return 'PDF Document';
      case 'doc':
      case 'docx':
        return isEs ? 'Documento Word' : 'Word Document';
      case 'xls':
      case 'xlsx':
      case 'csv':
        return isEs ? 'Hoja de Cálculo' : 'Spreadsheet';
      case 'ppt':
      case 'pptx':
        return isEs ? 'Presentación PowerPoint' : 'PowerPoint Presentation';
      default:
        return isEs ? 'Archivo Adjunto' : 'Attachment';
    }
  }

  private uploadDocument(file: File): void {
    this.isUploading.set(true);
    const ext = this.extractExtension(file.name);

    this.notesService.uploadAsset(file).subscribe({
      next: (res) => {
        this.fileUrl.set(res.url);
        this.fileName.set(res.originalName || file.name);
        this.fileSize.set(res.size || file.size);
        this.mimeType.set(res.mimeType || file.type);
        this.fileExtension.set(ext);
        this.isUploading.set(false);
        this.saveState();
      },
      error: () => {
        // En caso de modo offline o demo, crear data url local
        const reader = new FileReader();
        reader.onload = (e) => {
          this.fileUrl.set(e.target?.result as string);
          this.fileName.set(file.name);
          this.fileSize.set(file.size);
          this.mimeType.set(file.type);
          this.fileExtension.set(ext);
          this.isUploading.set(false);
          this.saveState();
        };
        reader.readAsDataURL(file);
      },
    });
  }

  private extractExtension(filename: string): string {
    const lastDot = filename.lastIndexOf('.');
    return lastDot !== -1 ? filename.substring(lastDot + 1).toLowerCase() : '';
  }

  private saveState(): void {
    this.notesService.updateBlockContent(this.block.id, {
      url: this.fileUrl(),
      name: this.fileName(),
      size: this.fileSize(),
      mimeType: this.mimeType(),
      extension: this.fileExtension(),
    });
  }
}
