import {
  Component,
  Input,
  OnInit,
  OnDestroy,
  ElementRef,
  ViewChild,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Block } from '../../core/models/block.model';
import { NotesService } from '../../core/services/notes.service';
import { I18nService } from '../../core/services/i18n.service';
import { IconComponent } from '../../shared/components/icon/icon.component';

/**
 * Bloque de Imagen.
 * Soporta selección de archivos, arrastrar y soltar, captura directa de cámara y pie de foto.
 */
@Component({
  selector: 'app-image-block',
  standalone: true,
  imports: [CommonModule, FormsModule, IconComponent],
  templateUrl: './image-block.component.html',
  styleUrls: ['./image-block.component.scss'],
})
export class ImageBlockComponent implements OnInit, OnDestroy {
  @Input({ required: true }) block!: Block;
  @ViewChild('videoElement') videoElement?: ElementRef<HTMLVideoElement>;
  @ViewChild('canvasElement') canvasElement?: ElementRef<HTMLCanvasElement>;

  readonly notesService = inject(NotesService);
  readonly i18n = inject(I18nService);

  readonly imageUrl = signal<string>('');
  readonly isUploading = signal<boolean>(false);
  readonly isDragging = signal<boolean>(false);
  readonly isCapturingCamera = signal<boolean>(false);

  captionText = '';
  private stream?: MediaStream;

  ngOnInit(): void {
    this.imageUrl.set(this.block.content?.['url'] || '');
    this.captionText = this.block.content?.['caption'] || '';
  }

  ngOnDestroy(): void {
    this.stopCamera();
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files[0]) {
      this.uploadFile(input.files[0]);
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
      this.uploadFile(e.dataTransfer.files[0]);
    }
  }

  private uploadFile(file: File): void {
    this.isUploading.set(true);
    this.notesService.uploadImage(file).subscribe({
      next: (res) => {
        this.imageUrl.set(res.url);
        this.isUploading.set(false);
        this.saveState();
      },
      error: () => {
        // En caso de modo offline o demo, crear data url
        const reader = new FileReader();
        reader.onload = (e) => {
          this.imageUrl.set(e.target?.result as string);
          this.isUploading.set(false);
          this.saveState();
        };
        reader.readAsDataURL(file);
      },
    });
  }

  startCamera(): void {
    this.isCapturingCamera.set(true);
    setTimeout(() => {
      if (navigator.mediaDevices?.getUserMedia) {
        navigator.mediaDevices
          .getUserMedia({ video: { facingMode: 'environment' } })
          .then((s) => {
            this.stream = s;
            if (this.videoElement) {
              this.videoElement.nativeElement.srcObject = s;
            }
          })
          .catch((err) => {
            console.warn('Camera access error:', err);
            this.isCapturingCamera.set(false);
          });
      }
    }, 100);
  }

  capturePhoto(): void {
    if (!this.videoElement || !this.canvasElement) return;
    const video = this.videoElement.nativeElement;
    const canvas = this.canvasElement.nativeElement;
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;

    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
      this.imageUrl.set(dataUrl);
      this.stopCamera();
      this.saveState();
    }
  }

  stopCamera(): void {
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = undefined;
    }
    this.isCapturingCamera.set(false);
  }

  removeImage(): void {
    this.imageUrl.set('');
    this.captionText = '';
    this.saveState();
  }

  saveCaption(): void {
    this.saveState();
  }

  private saveState(): void {
    this.notesService.updateBlockContent(this.block.id, {
      url: this.imageUrl(),
      caption: this.captionText,
    });
  }
}
