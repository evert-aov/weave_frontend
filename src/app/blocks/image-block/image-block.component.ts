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
  template: `
    <div class="image-block-wrap">
      @if (!imageUrl()) {
        <!-- Zona de carga y selección de imagen -->
        <div
          class="dropzone"
          [class.dragover]="isDragging()"
          (dragover)="onDragOver($event)"
          (dragleave)="onDragLeave($event)"
          (drop)="onDrop($event)"
        >
          @if (isCapturingCamera()) {
            <!-- Modal de captura en vivo con WebRTC -->
            <div class="camera-stream-box">
              <video #videoElement autoplay playsinline class="camera-video"></video>
              <canvas #canvasElement style="display:none;"></canvas>
              <div class="camera-actions">
                <button type="button" class="btn-primary" (click)="capturePhoto()">
                  <app-icon name="camera" [size]="15"></app-icon>
                  {{ i18n.t('block.image.take_photo') }}
                </button>
                <button type="button" class="btn-cancel" (click)="stopCamera()">
                  {{ i18n.t('block.image.close_camera') }}
                </button>
              </div>
            </div>
          } @else {
            <div class="dropzone-content">
              <div class="icon-circle">
                <app-icon name="image" [size]="24"></app-icon>
              </div>
              <p class="drop-text">{{ i18n.t('block.image.drag_drop') }}</p>
              <div class="drop-buttons">
                <label class="btn-primary upload-label">
                  <app-icon name="plus" [size]="14"></app-icon>
                  {{ i18n.t('block.image.upload') }}
                  <input
                    type="file"
                    accept="image/*"
                    (change)="onFileSelected($event)"
                    style="display: none"
                  />
                </label>
                <button type="button" class="btn-secondary" (click)="startCamera()">
                  <app-icon name="camera" [size]="14"></app-icon>
                  {{ i18n.t('block.image.camera') }}
                </button>
              </div>
              @if (isUploading()) {
                <span class="uploading-indicator">{{ i18n.t('topbar.saving') }}</span>
              }
            </div>
          }
        </div>
      } @else {
        <!-- Vista previa de imagen con pie de foto -->
        <div class="image-preview-card">
          <div class="image-container">
            <img [src]="imageUrl()" [alt]="captionText" loading="lazy" />
            <button
              type="button"
              class="replace-btn"
              (click)="removeImage()"
              title="Change image"
            >
              <app-icon name="trash" [size]="14"></app-icon>
            </button>
          </div>
          <div class="caption-wrapper">
            <input
              type="text"
              [(ngModel)]="captionText"
              (blur)="saveCaption()"
              (keydown.enter)="saveCaption()"
              [placeholder]="i18n.t('block.image.caption_placeholder')"
              class="caption-input"
            />
          </div>
        </div>
      }
    </div>
  `,
  styles: [
    `
      .image-block-wrap {
        width: 100%;
        margin: 6px 0;
      }
      .dropzone {
        border: 2px dashed var(--border-strong);
        border-radius: 9px;
        background: var(--panel);
        padding: 36px 20px;
        text-align: center;
        transition: all 0.2s ease;
      }
      .dropzone.dragover {
        border-color: var(--accent);
        background: var(--accent-soft);
      }
      .dropzone-content {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 12px;
      }
      .icon-circle {
        width: 48px;
        height: 48px;
        border-radius: 50%;
        background: var(--soft);
        color: var(--muted);
        display: grid;
        place-items: center;
      }
      .drop-text {
        font-size: 13px;
        color: var(--muted);
        margin: 0;
      }
      .drop-buttons {
        display: flex;
        gap: 10px;
        align-items: center;
      }
      .btn-primary {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        height: 32px;
        padding: 0 14px;
        background: var(--accent);
        color: #ffffff;
        border-radius: 6px;
        font-size: 11px;
        font-weight: 600;
        cursor: pointer;
      }
      .btn-secondary {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        height: 32px;
        padding: 0 14px;
        background: var(--bg);
        border: 1px solid var(--border);
        color: var(--text);
        border-radius: 6px;
        font-size: 11px;
        font-weight: 600;
        cursor: pointer;
      }
      .btn-cancel {
        height: 32px;
        padding: 0 14px;
        background: var(--soft);
        color: var(--muted);
        border-radius: 6px;
        font-size: 11px;
      }
      .camera-stream-box {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 12px;
      }
      .camera-video {
        width: 100%;
        max-width: 520px;
        border-radius: 8px;
        background: #000;
      }
      .camera-actions {
        display: flex;
        gap: 10px;
      }
      .image-preview-card {
        border: 1px solid var(--border);
        border-radius: 9px;
        overflow: hidden;
        background: var(--panel);
      }
      .image-container {
        position: relative;
        width: 100%;
        max-height: 480px;
        overflow: hidden;
        display: flex;
        justify-content: center;
        background: var(--canvas);
      }
      .image-container img {
        width: 100%;
        max-height: 480px;
        object-fit: contain;
      }
      .replace-btn {
        position: absolute;
        top: 10px;
        right: 10px;
        background: rgba(0, 0, 0, 0.6);
        color: #ffffff;
        border-radius: 6px;
        width: 30px;
        height: 30px;
        display: grid;
        place-items: center;
      }
      .replace-btn:hover {
        background: rgba(239, 68, 68, 0.9);
      }
      .caption-wrapper {
        padding: 8px 14px;
        border-top: 1px solid var(--border);
      }
      .caption-input {
        width: 100%;
        border: none;
        background: transparent;
        font-size: 11px;
        color: var(--muted);
        text-align: center;
        font-style: italic;
        outline: none;
      }
      .caption-input:focus {
        color: var(--text);
      }
      .uploading-indicator {
        font-size: 11px;
        color: var(--accent);
      }
    `,
  ],
})
export class ImageBlockComponent implements OnInit, OnDestroy {
  @Input({ required: true }) block!: Block;
  @ViewChild('videoElement') videoElement?: ElementRef<HTMLVideoElement>;
  @ViewChild('canvasElement') canvasElement?: ElementRef<HTMLCanvasElement>;

  private readonly notesService = inject(NotesService);
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
