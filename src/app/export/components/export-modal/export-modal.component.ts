import { Component, EventEmitter, Input, Output, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Note } from '../../../core/models/note.model';
import { IconComponent } from '../../../shared/components/icon/icon.component';
import { ExportService } from '../../services/export.service';
import { ExportFormat, ExportOptions, ExportStrategy } from '../../models/export.model';
import { I18nService } from '../../../core/services/i18n.service';

@Component({
  selector: 'app-export-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, IconComponent],
  template: `
    <div class="modal-backdrop" (click)="close.emit()">
      <div class="modal-card" (click)="$event.stopPropagation()">
        <!-- Encabezado del modal -->
        <div class="modal-header">
          <div class="modal-title-box">
            <span class="icon-wrap">
              <app-icon name="download" [size]="16"></app-icon>
            </span>
            <h3 class="modal-title">
              {{ i18n.currentLang() === 'es' ? 'Exportar Documento' : 'Export Document' }}
            </h3>
          </div>
          <button type="button" class="close-btn" (click)="close.emit()" title="Cerrar">
            <app-icon name="close" [size]="14"></app-icon>
          </button>
        </div>

        <!-- Cuerpo del modal -->
        <div class="modal-body">
          <p class="modal-note-title">
            <span class="label">{{ i18n.currentLang() === 'es' ? 'Documento:' : 'Document:' }}</span>
            <span class="name">{{ note.title || 'Untitled Note' }}</span>
          </p>

          <!-- Selector de Formato -->
          <label class="section-label">
            {{ i18n.currentLang() === 'es' ? 'Selecciona el formato:' : 'Select format:' }}
          </label>
          <div class="format-grid">
            @for (strat of strategies; track strat.format) {
              <div
                class="format-card"
                [class.selected]="selectedFormat() === strat.format"
                (click)="selectedFormat.set(strat.format)"
              >
                <div class="format-card-header">
                  <span class="format-badge">{{ strat.extension.toUpperCase() }}</span>
                  <span class="format-name">{{ strat.label }}</span>
                </div>
                <p class="format-desc">{{ strat.description }}</p>
              </div>
            }
          </div>

          <!-- Opciones adicionales si es PDF -->
          @if (selectedFormat() === 'pdf') {
            <div class="options-box">
              <label class="section-label">
                {{ i18n.currentLang() === 'es' ? 'Método de generación PDF:' : 'PDF method:' }}
              </label>
              <div class="segmented-control">
                <button
                  type="button"
                  [class.active]="pdfMethod() === 'download'"
                  (click)="pdfMethod.set('download')"
                >
                  📥 {{ i18n.currentLang() === 'es' ? 'Descargar .PDF' : 'Download .PDF' }}
                </button>
                <button
                  type="button"
                  [class.active]="pdfMethod() === 'print'"
                  (click)="pdfMethod.set('print')"
                >
                  🖨️ {{ i18n.currentLang() === 'es' ? 'Imprimir / PDF Vectorial' : 'Print / Vector PDF' }}
                </button>
              </div>

              <div class="settings-grid">
                <div class="setting-item">
                  <label class="setting-label">{{ i18n.currentLang() === 'es' ? 'Tamaño:' : 'Size:' }}</label>
                  <select [(ngModel)]="pageSize" class="setting-select">
                    <option value="A4">A4 (210 × 297 mm)</option>
                    <option value="letter">Carta / Letter</option>
                  </select>
                </div>
                <div class="setting-item">
                  <label class="setting-label">{{ i18n.currentLang() === 'es' ? 'Orientación:' : 'Orientation:' }}</label>
                  <select [(ngModel)]="orientation" class="setting-select">
                    <option value="portrait">{{ i18n.currentLang() === 'es' ? 'Vertical' : 'Portrait' }}</option>
                    <option value="landscape">{{ i18n.currentLang() === 'es' ? 'Horizontal' : 'Landscape' }}</option>
                  </select>
                </div>
              </div>
            </div>
          }

          <!-- Toggles generales -->
          <div class="toggles-box">
            <label class="checkbox-row">
              <input type="checkbox" [(ngModel)]="includeMetadata" />
              <span>{{ i18n.currentLang() === 'es' ? 'Incluir espacio y fecha de modificación' : 'Include space & update date' }}</span>
            </label>
            <label class="checkbox-row">
              <input type="checkbox" [(ngModel)]="includeTags" />
              <span>{{ i18n.currentLang() === 'es' ? 'Incluir etiquetas (#tags)' : 'Include tags' }}</span>
            </label>
          </div>
        </div>

        <!-- Acciones inferiores -->
        <div class="modal-footer">
          <button type="button" class="btn-cancel" (click)="close.emit()">
            {{ i18n.currentLang() === 'es' ? 'Cancelar' : 'Cancel' }}
          </button>
          <button
            type="button"
            class="btn-export"
            [disabled]="isExporting()"
            (click)="doExport()"
          >
            @if (isExporting()) {
              <span>{{ i18n.currentLang() === 'es' ? 'Generando...' : 'Exporting...' }}</span>
            } @else {
              <app-icon name="download" [size]="14"></app-icon>
              <span>{{ i18n.currentLang() === 'es' ? 'Exportar' : 'Export' }}</span>
            }
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      .modal-backdrop {
        position: fixed;
        inset: 0;
        z-index: 1000;
        background: rgba(0, 0, 0, 0.45);
        backdrop-filter: blur(4px);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 16px;
        animation: fadeIn 0.15s ease;
      }
      .modal-card {
        background: var(--bg);
        border: 1px solid var(--border);
        border-radius: 12px;
        width: 100%;
        max-width: 480px;
        box-shadow: 0 16px 40px rgba(0, 0, 0, 0.16);
        overflow: hidden;
        animation: scaleUp 0.18s ease;
      }
      .modal-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 14px 20px;
        border-bottom: 1px solid var(--border);
        background: var(--panel);
      }
      .modal-title-box {
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .icon-wrap {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 28px;
        height: 28px;
        border-radius: 6px;
        background: var(--accent-soft);
        color: var(--accent);
      }
      .modal-title {
        font-size: 15px;
        font-weight: 700;
        color: var(--text);
        margin: 0;
      }
      .close-btn {
        background: transparent;
        border: none;
        color: var(--muted);
        cursor: pointer;
        padding: 4px;
        border-radius: 4px;
        display: flex;
        align-items: center;
      }
      .close-btn:hover {
        color: var(--text);
        background: var(--soft);
      }
      .modal-body {
        padding: 18px 20px;
        max-height: 75vh;
        overflow-y: auto;
      }
      .modal-note-title {
        margin: 0 0 14px 0;
        font-size: 13px;
        display: flex;
        gap: 6px;
        align-items: center;
      }
      .modal-note-title .label {
        color: var(--muted);
      }
      .modal-note-title .name {
        font-weight: 600;
        color: var(--text);
      }
      .section-label {
        display: block;
        font-size: 11.5px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: var(--muted);
        margin-bottom: 8px;
      }
      .format-grid {
        display: flex;
        flex-direction: column;
        gap: 8px;
        margin-bottom: 16px;
      }
      .format-card {
        padding: 10px 14px;
        border-radius: 8px;
        border: 1px solid var(--border);
        background: var(--soft);
        cursor: pointer;
        transition: all 0.15s ease;
      }
      .format-card:hover {
        border-color: var(--border-strong);
        background: var(--panel);
      }
      .format-card.selected {
        border-color: var(--accent);
        background: var(--accent-soft);
      }
      .format-card-header {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 3px;
      }
      .format-badge {
        font-size: 10px;
        font-weight: 800;
        padding: 2px 6px;
        border-radius: 4px;
        background: var(--accent);
        color: #ffffff;
      }
      .format-name {
        font-size: 13px;
        font-weight: 600;
        color: var(--text);
      }
      .format-desc {
        font-size: 11px;
        color: var(--muted);
        margin: 0;
        line-height: 1.4;
      }
      .options-box {
        padding: 12px;
        background: var(--soft);
        border: 1px solid var(--border);
        border-radius: 8px;
        margin-bottom: 14px;
      }
      .segmented-control {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 4px;
        background: var(--bg);
        padding: 3px;
        border-radius: 6px;
        border: 1px solid var(--border);
        margin-bottom: 12px;
      }
      .segmented-control button {
        padding: 6px 10px;
        font-size: 11.5px;
        font-weight: 600;
        color: var(--muted);
        background: transparent;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        transition: all 0.1s ease;
      }
      .segmented-control button.active {
        background: var(--accent);
        color: #ffffff;
      }
      .settings-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 10px;
      }
      .setting-item {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .setting-label {
        font-size: 11px;
        color: var(--muted);
        font-weight: 500;
      }
      .setting-select {
        padding: 5px 8px;
        font-size: 11.5px;
        border-radius: 5px;
        border: 1px solid var(--border);
        background: var(--bg);
        color: var(--text);
      }
      .toggles-box {
        display: flex;
        flex-direction: column;
        gap: 8px;
        padding: 6px 0;
      }
      .checkbox-row {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 12px;
        color: var(--text);
        cursor: pointer;
      }
      .modal-footer {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: 8px;
        padding: 12px 20px;
        border-top: 1px solid var(--border);
        background: var(--panel);
      }
      .btn-cancel {
        padding: 6px 14px;
        font-size: 12px;
        font-weight: 500;
        color: var(--muted);
        background: transparent;
        border: 1px solid var(--border);
        border-radius: 6px;
        cursor: pointer;
      }
      .btn-cancel:hover {
        background: var(--soft);
        color: var(--text);
      }
      .btn-export {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 6px 18px;
        font-size: 12px;
        font-weight: 600;
        background: var(--accent);
        color: #ffffff;
        border: none;
        border-radius: 6px;
        cursor: pointer;
        transition: opacity 0.15s ease;
      }
      .btn-export:disabled {
        opacity: 0.6;
        cursor: not-allowed;
      }
      @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }
      @keyframes scaleUp {
        from { opacity: 0; transform: scale(0.96); }
        to { opacity: 1; transform: scale(1); }
      }
    `,
  ],
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
