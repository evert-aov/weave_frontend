import {
  Component,
  Input,
  OnInit,
  ElementRef,
  ViewChild,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PowerPointViewerComponent, translationsEn } from 'pptx-angular-viewer';
import { TranslateService } from '@ngx-translate/core';

import { Note } from '../../core/models/note.model';
import { NotesService } from '../../core/services/notes.service';
import { I18nService } from '../../core/services/i18n.service';
import { IconComponent } from '../../shared/components/icon/icon.component';
import { DEFAULT_BLANK_PPTX_BASE64 } from './default-pptx.base64';

/**
 * Editor Especializado Puro: Presentaciones PowerPoint (.pptx).
 * Integra el motor nativo pptx-angular-viewer para renderizar, editar y exportar diapositivas
 * completas con cinta Ribbon oficial, animaciones, transiciones, SmartArt y herramientas de dibujo.
 */
@Component({
  selector: 'app-pure-slide-editor',
  standalone: true,
  imports: [CommonModule, FormsModule, IconComponent, PowerPointViewerComponent],
  templateUrl: './pure-slide-editor.component.html',
  styleUrls: ['./pure-slide-editor.component.scss'],
})
export class PureSlideEditorComponent implements OnInit {
  @Input({ required: true }) note!: Note;
  @ViewChild('slideWrapper', { static: false })
  slideWrapper?: ElementRef<HTMLDivElement>;
  @ViewChild('viewer') viewer?: PowerPointViewerComponent;

  readonly notesService = inject(NotesService);
  readonly i18n = inject(I18nService);
  private readonly translate = inject(TranslateService);

  readonly pptxBytes = signal<Uint8Array | null>(null);

  private saveTimeout: any = null;

  ngOnInit(): void {
    this.setupTranslations();
    this.loadPptxData();
  }

  private setupTranslations(): void {
    // 1. Cargar diccionario completo oficial en inglés (todas las 500+ claves pptx.*)
    this.translate.setTranslation('en', translationsEn, true);

    // 2. Cargar diccionario en español con claves amigables para la UI de PowerPoint
    // y fallback al diccionario base para no dejar ninguna clave técnica expuesta
    this.translate.setTranslation(
      'es',
      {
        ...translationsEn,
        // Cinta de opciones (Ribbon Tabs)
        'pptx.ribbon.tab.file': 'Archivo',
        'pptx.ribbon.tab.home': 'Inicio',
        'pptx.ribbon.tab.insert': 'Insertar',
        'pptx.ribbon.tab.draw': 'Dibujar',
        'pptx.ribbon.tab.design': 'Diseño',
        'pptx.ribbon.tab.transitions': 'Transiciones',
        'pptx.ribbon.tab.animations': 'Animaciones',
        'pptx.ribbon.tab.slideshow': 'Presentación',
        'pptx.ribbon.tab.record': 'Grabar',
        'pptx.ribbon.tab.review': 'Revisar',
        'pptx.ribbon.tab.view': 'Vista',
        'pptx.ribbon.tab.help': 'Ayuda',

        // Secciones de la cinta
        'pptx.ribbon.clipboard': 'Portapapeles',
        'pptx.ribbon.font': 'Fuente',
        'pptx.ribbon.paragraph': 'Párrafo',
        'pptx.ribbon.drawing': 'Dibujo',
        'pptx.ribbon.editing': 'Edición',
        'pptx.ribbon.show': 'Mostrar cinta',

        // Botones de Inicio
        'pptx.home.newSlide': 'Nueva Diapositiva',
        'pptx.home.slideTemplates': 'Plantillas',
        'pptx.master.layout': 'Diseño',
        'pptx.animations.reset': 'Restablecer',
        'pptx.sections.slides': 'Diapositivas',
        'pptx.sections.sectionButtonLabel': 'Sección',

        // Barra de estado (Status Bar)
        'pptx.statusBar.allSaved': 'Guardado',
        'pptx.statusBar.unsavedChanges': 'Cambios sin guardar',
        'pptx.statusBar.slideOf': 'Diapositiva {{current}} de {{total}}',
        'pptx.statusBar.noSlides': 'Sin diapositivas',
        'pptx.statusBar.language': 'Español',
        'pptx.statusBar.toggleNotes': 'Notas',
        'pptx.statusBar.normalView': 'Normal',
        'pptx.statusBar.slideSorter': 'Clasificador',
        'pptx.statusBar.slideShow': 'Presentación',
        'pptx.statusBar.zoomIn': 'Acercar',
        'pptx.statusBar.zoomOut': 'Alejar',
        'pptx.statusBar.zoomToFit': 'Ajustar a ventana',

        // Barra de herramientas superior
        'pptx.toolbar.present': 'Presentar',
        'pptx.toolbar.share': 'Compartir',
        'pptx.notes.title': 'Notas de la diapositiva',
        'pptx.titleBar.autoSave': 'Autoguardado',
        'pptx.titleBar.save': 'Guardar',
        'pptx.titleBar.undo': 'Deshacer',
        'pptx.titleBar.redo': 'Rehacer',

        // Tipografía
        'pptx.text.characterSpacingNormal': 'Normal',
        'pptx.font.role.body': 'Cuerpo',
        'pptx.font.role.heading': 'Título',
      },
      true
    );

    const lang = this.i18n.currentLang() === 'es' ? 'es' : 'en';
    this.translate.setFallbackLang('en');
    this.translate.use(lang);
  }

  formatSpacePath(space?: string): string {
    if (!space) return 'General';
    return space.split('/').join(' / ');
  }

  onTitleBlur(event: FocusEvent): void {
    const el = event.target as HTMLElement;
    const text = el.innerText.trim();
    if (text && text !== this.note.title) {
      this.note = { ...this.note, title: text };
      this.notesService.updateMeta({ title: text });
    }
  }

  onTitleEnter(event: Event): void {
    const el = event.target as HTMLElement;
    el.blur();
  }

  toggleFullscreen(): void {
    const el =
      (this.slideWrapper?.nativeElement?.closest('.pure-slide-workspace') as HTMLElement) ||
      this.slideWrapper?.nativeElement;
    if (!document.fullscreenElement) {
      if (el?.requestFullscreen) {
        el.requestFullscreen().catch(() => {});
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      }
    }
  }

  async onUploadPptx(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    try {
      const arrayBuffer = await file.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      this.pptxBytes.set(bytes);
      this.savePptxBytes(bytes);
    } catch (err) {
      console.error('[PureSlideEditor] Error loading uploaded .pptx:', err);
    }
  }

  async downloadPptx(): Promise<void> {
    let current = this.pptxBytes();
    if (this.viewer) {
      try {
        current = await this.viewer.getContent();
      } catch (err) {
        console.warn('[PureSlideEditor] Failed getting live content from viewer:', err);
      }
    }
    if (!current) return;
    const blob = new Blob([current as any], {
      type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${this.note.title || 'presentacion'}.pptx`;
    a.click();
    URL.revokeObjectURL(url);
  }

  onContentChange(bytes: Uint8Array): void {
    this.pptxBytes.set(bytes);
    this.scheduleAutoSave(bytes);
  }

  private loadPptxData(): void {
    const docData = this.note.docData;
    if (docData && typeof docData === 'object' && docData.base64) {
      try {
        const bin = atob(docData.base64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) {
          bytes[i] = bin.charCodeAt(i);
        }
        this.pptxBytes.set(bytes);
        return;
      } catch (err) {
        console.warn('[PureSlideEditor] Failed decoding stored PPTX base64, falling back to default:', err);
      }
    }

    // Cargar plantilla por defecto
    try {
      const bin = atob(DEFAULT_BLANK_PPTX_BASE64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) {
        bytes[i] = bin.charCodeAt(i);
      }
      this.pptxBytes.set(bytes);
    } catch (err) {
      console.error('[PureSlideEditor] Failed loading default blank PPTX:', err);
    }
  }

  private scheduleAutoSave(bytes: Uint8Array): void {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }
    this.saveTimeout = setTimeout(() => {
      this.savePptxBytes(bytes);
    }, 800);
  }

  private savePptxBytes(bytes: Uint8Array): void {
    let binary = '';
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const base64 = btoa(binary);
    this.notesService.updateDocData({
      format: 'pptx',
      base64,
      updatedAt: new Date().toISOString(),
    });
  }
}
