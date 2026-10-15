import {
  Component,
  Input,
  OnInit,
  OnChanges,
  OnDestroy,
  AfterViewInit,
  SimpleChanges,
  ElementRef,
  ViewChild,
  inject,
  signal,
  computed,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  PowerPointViewerComponent,
  vermilionDarkTheme,
  vermilionLightTheme,
  ViewerTheme,
  translationsEn,
} from 'pptx-angular-viewer';
import { TranslateService } from '@ngx-translate/core';

import { Note } from '../../core/models/note.model';
import { NotesService } from '../../core/services/notes.service';
import { I18nService } from '../../core/services/i18n.service';
import { ThemeService } from '../../core/services/theme.service';
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
export class PureSlideEditorComponent implements OnInit, OnChanges, AfterViewInit, OnDestroy {
  @Input({ required: true }) note!: Note;
  @ViewChild('slideWrapper', { static: false })
  slideWrapper?: ElementRef<HTMLDivElement>;
  @ViewChild('viewer') viewer?: PowerPointViewerComponent;

  readonly notesService = inject(NotesService);
  readonly i18n = inject(I18nService);
  readonly themeService = inject(ThemeService);
  private readonly translate = inject(TranslateService);

  readonly pptxBytes = signal<Uint8Array | null>(null);
  readonly isDarkTheme = computed<boolean>(() => this.themeService.isDark());
  readonly currentTheme = computed<ViewerTheme>(() =>
    this.isDarkTheme() ? vermilionDarkTheme : vermilionLightTheme
  );
  readonly themeKey = computed<'vermilionDark' | 'vermilionLight'>(() =>
    this.isDarkTheme() ? 'vermilionDark' : 'vermilionLight'
  );
  readonly isFullscreen = signal<boolean>(false);

  private saveTimeout: any = null;
  private autoSaveInterval: any = null;
  private pendingAutoSave = false;
  private lastSavedBytes: Uint8Array | null = null;
  private loadedNoteId: string | null = null;
  private readonly AUTO_SAVE_INTERVAL_MS = 10000;
  private fullscreenChangeHandler = () => this.handleFullscreenChange();
  private escapeCaptureHandler = (event: KeyboardEvent) => this.handleKeydownCapture(event);
  private nativeSaveCaptureHandler = (event: Event) => this.handleNativeSaveClick(event);

  ngOnInit(): void {
    this.setupTranslations();
    this.loadedNoteId = this.note._id;
    this.loadPptxData();
    document.addEventListener('fullscreenchange', this.fullscreenChangeHandler);
    window.addEventListener('keydown', this.escapeCaptureHandler, true);
    // Modo de guardado automático siempre activo: guardado con debounce tras el
    // primer cambio, más un sondeo periódico que persiste ediciones posteriores.
    this.autoSaveInterval = setInterval(() => {
      if (this.pendingAutoSave) {
        void this.persistCurrentContent();
      }
    }, this.AUTO_SAVE_INTERVAL_MS);
  }

  ngAfterViewInit(): void {
    // Interceptar el botón "Guardar" nativo del visor (que descarga el archivo)
    // para persistir la presentación en la base de datos del backend.
    const container =
      this.slideWrapper?.nativeElement?.closest('.pure-slide-workspace') ??
      this.slideWrapper?.nativeElement;
    container?.addEventListener('click', this.nativeSaveCaptureHandler, true);
  }

  private detachNativeSaveListener(): void {
    const container =
      this.slideWrapper?.nativeElement?.closest('.pure-slide-workspace') ??
      this.slideWrapper?.nativeElement;
    container?.removeEventListener('click', this.nativeSaveCaptureHandler, true);
  }

  ngOnChanges(changes: SimpleChanges): void {
    // Al cambiar de pestaña/nota, Angular reutiliza este componente. Recargar el
    // contenido de la nueva presentación para no seguir mostrando la anterior.
    if (changes['note'] && !changes['note'].firstChange) {
      const newId = this.note?._id;
      if (newId && newId !== this.loadedNoteId) {
        this.loadedNoteId = newId;
        this.resetViewerState();
        this.loadPptxData();
      }
    }
  }

  ngOnDestroy(): void {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }
    if (this.autoSaveInterval) {
      clearInterval(this.autoSaveInterval);
    }
    this.detachNativeSaveListener();
    document.removeEventListener('fullscreenchange', this.fullscreenChangeHandler);
    window.removeEventListener('keydown', this.escapeCaptureHandler, true);
    if ((navigator as any)?.keyboard?.unlock) {
      (navigator as any).keyboard.unlock();
    }
  }

  private resetViewerState(): void {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
      this.saveTimeout = null;
    }
    this.pendingAutoSave = false;
    this.lastSavedBytes = null;
    this.pptxBytes.set(null);
  }

  /**
   * Bloquea el guardado nativo (descarga) del visor cuando se pulsa el botón
   * "Guardar" de la barra de título, y en su lugar persiste en el backend.
   */
  private handleNativeSaveClick(event: Event): void {
    const target = event.target as HTMLElement | null;
    if (!target) return;
    const button = target.closest('button');
    if (!button) return;
    const isTitleBarSave =
      !!button.closest('[data-pptx-title-bar]') && !!button.querySelector('svg[lucideSave]');
    if (!isTitleBarSave) return;

    // Evitar que el visor lance el diálogo de descarga/guardado local
    event.preventDefault();
    event.stopImmediatePropagation();
    void this.savePptxToDb();
  }

  /** Serializa el contenido actual del visor y lo guarda en la base de datos (forzado). */
  async savePptxToDb(): Promise<void> {
    if (this.viewer) {
      try {
        const current = await this.viewer.getContent();
        if (current) {
          this.savePptxBytes(current);
        }
        return;
      } catch (err) {
        console.warn('[PureSlideEditor] Failed getting live content from viewer:', err);
      }
    }
    const current = this.pptxBytes();
    if (current) {
      this.savePptxBytes(current);
    }
  }

  /**
   * Autoguardado: serializa el contenido vivo del visor y lo persiste sólo si
   * cambió respecto al último guardado. Evita escrituras redundantes.
   */
  private async persistCurrentContent(): Promise<void> {
    if (!this.viewer) return;
    let bytes: Uint8Array;
    try {
      bytes = await this.viewer.getContent();
    } catch (err) {
      console.warn('[PureSlideEditor] Auto-save failed to serialise viewer content:', err);
      return;
    }
    if (!bytes) return;
    if (this.lastSavedBytes && this.bytesEqual(this.lastSavedBytes, bytes)) {
      return;
    }
    this.savePptxBytes(bytes);
  }

  private bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
    if (a.byteLength !== b.byteLength) return false;
    for (let i = 0; i < a.byteLength; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
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

  private handleKeydownCapture(event: KeyboardEvent): void {
    if (event.key === 'Escape' && this.isFullscreen()) {
      // Evitar que la tecla Esc salga automáticamente de pantalla completa
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    }
  }

  private handleFullscreenChange(): void {
    const el =
      (this.slideWrapper?.nativeElement?.closest('.pure-slide-workspace') as HTMLElement) ||
      this.slideWrapper?.nativeElement;
    const isFs = Boolean(document.fullscreenElement && el && (document.fullscreenElement === el || el.contains(document.fullscreenElement)));
    this.isFullscreen.set(isFs);

    if (isFs) {
      // Si el navegador soporta Keyboard Lock API (Chromium / Edge / Opera),
      // bloquear la captura nativa del navegador para 'Escape'
      if ((navigator as any)?.keyboard?.lock) {
        (navigator as any).keyboard.lock(['Escape']).catch(() => {});
      }
    } else {
      if ((navigator as any)?.keyboard?.unlock) {
        (navigator as any).keyboard.unlock();
      }
    }
  }

  async toggleFullscreen(): Promise<void> {
    const el =
      (this.slideWrapper?.nativeElement?.closest('.pure-slide-workspace') as HTMLElement) ||
      this.slideWrapper?.nativeElement;
    if (!this.isFullscreen()) {
      if (el?.requestFullscreen) {
        try {
          await el.requestFullscreen();
          if ((navigator as any)?.keyboard?.lock) {
            await (navigator as any).keyboard.lock(['Escape']).catch(() => {});
          }
        } catch {
          // ignorar error de permisos de fullscreen
        }
      }
    } else {
      if ((navigator as any)?.keyboard?.unlock) {
        (navigator as any).keyboard.unlock();
      }
      if (document.fullscreenElement && document.exitFullscreen) {
        try {
          await document.exitFullscreen();
        } catch {
          // ignorar error al salir
        }
      }
      this.isFullscreen.set(false);
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

  onDirtyChange(isDirty: boolean): void {
    if (!isDirty) return;
    // El deck quedó "sucio": activar el modo de guardado automático.
    this.pendingAutoSave = true;
    this.scheduleAutoSave();
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
        this.lastSavedBytes = bytes;
        this.pptxBytes.set(bytes);
        return;
      } catch (err) {
        console.warn('[PureSlideEditor] Failed decoding stored PPTX base64, falling back to docUrl:', err);
      }
    }

    // Fallback: cargar el archivo .pptx físico referenciado en la base de datos (docUrl)
    if (this.note.docUrl) {
      this.notesService.loadDocFile(this.note.docUrl).subscribe({
        next: (buffer) => {
          const bytes = new Uint8Array(buffer);
          this.lastSavedBytes = bytes;
          this.pptxBytes.set(bytes);
        },
        error: (err) => {
          console.warn('[PureSlideEditor] Failed loading PPTX from docUrl, falling back to default:', err);
          this.loadDefaultPptx();
        },
      });
      return;
    }

    // Sin datos ni referencia física: es una presentación nueva, cargar la
    // plantilla por defecto y persistirla de inmediato para que quede en la BD.
    this.loadDefaultPptx(true);
  }

  private loadDefaultPptx(persist = false): void {
    // Cargar plantilla por defecto
    try {
      const bin = atob(DEFAULT_BLANK_PPTX_BASE64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) {
        bytes[i] = bin.charCodeAt(i);
      }
      this.pptxBytes.set(bytes);
      if (persist) {
        this.savePptxBytes(bytes);
      }
    } catch (err) {
      console.error('[PureSlideEditor] Failed loading default blank PPTX:', err);
    }
  }

  private scheduleAutoSave(): void {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }
    this.saveTimeout = setTimeout(() => {
      void this.persistCurrentContent();
    }, 800);
  }

  private savePptxBytes(bytes: Uint8Array): void {
    let binary = '';
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const base64 = btoa(binary);
    this.lastSavedBytes = bytes;
    this.notesService.updateDocData({
      format: 'pptx',
      base64,
      updatedAt: new Date().toISOString(),
    });
  }
}
