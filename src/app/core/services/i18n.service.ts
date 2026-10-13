import { Injectable, signal } from '@angular/core';

export type Language = 'es' | 'en';

const TRANSLATIONS: Record<Language, Record<string, string>> = {
  es: {
    // General & Navegación
    'app.name': 'Weave',
    'app.workspace': 'Laboratorio de investigación',
    'nav.search': 'Buscar',
    'nav.inbox': 'Bandeja',
    'nav.all_documents': 'Todos los documentos',
    'nav.archive': 'Archivo',
    'nav.templates': 'Plantillas',
    'nav.storage': 'Almacenamiento',
    'nav.spaces': 'Espacios',
    'nav.logout': 'Cerrar sesión',
    'theme.toggle': 'Cambiar tema',
    'lang.toggle': 'Idioma',

    // Espacios
    'space.research': 'Investigación',
    'space.product': 'Producto',
    'space.personal': 'Personal',

    // Barra superior y Documento
    'topbar.saved': 'Guardado',
    'topbar.saving': 'Guardando...',
    'topbar.unsaved': 'Sin guardar',
    'topbar.share': 'Compartir',
    'topbar.comments': 'Comentarios',
    'topbar.new_note': 'Nueva nota',
    'doc.updated': 'Actualizado hace un momento',
    'doc.category': 'NOTA DE INVESTIGACIÓN',
    'doc.title_placeholder': 'Título de la nota...',
    'doc.lead_placeholder': 'Escribe una breve introducción o resumen del documento...',
    'doc.add_tag': 'Añadir etiqueta',
    'doc.drop_here': 'Soltar bloque aquí',
    'doc.empty_note': 'Este documento aún no tiene bloques. Presiona "/" o el botón "+" para comenzar.',

    // Tipos de documentos especializados
    'doc_type.create_title': 'Crear documento especializado',
    'doc_type.block_title': 'Documento Estándar',
    'doc_type.block_desc': 'Bloques interactivos de texto, código, LaTeX y medios',
    'doc_type.sheet_title': 'Hoja de Cálculo (Excel)',
    'doc_type.sheet_desc': 'Libro completo Univer Sheets con fórmulas y hojas',
    'doc_type.doc_title': 'Documento de Texto (Word)',
    'doc_type.doc_desc': 'Procesador de texto formal Univer Docs enriquecido',
    'doc_type.canvas_title': 'Lienzo de Dibujo',
    'doc_type.canvas_desc': 'Pizarra vectorial infinita para bocetos y diagramas',
    'doc_type.slide_title': 'Diapositivas (PowerPoint)',
    'doc_type.slide_desc': 'Presentación Univer Slides con diapositivas, formas y texto',

    // Rail y Bloques
    'rail.add_block': 'Insertar bloque debajo',
    'rail.drag': 'Arrastrar para reordenar',
    'rail.delete': 'Eliminar bloque',
    'rail.move_up': 'Subir bloque',
    'rail.move_down': 'Bajar bloque',

    // Bloques específicos
    'block.text.placeholder': 'Escribe texto enriquecido aquí...',
    'block.code.copy': 'Copiar',
    'block.code.copied': '¡Copiado!',
    'block.code.language': 'Lenguaje',
    'block.latex.label': 'LATEX',
    'block.latex.edit': 'Editar fórmula',
    'block.latex.preview': 'Confirmar',
    'block.latex.placeholder': 'Escribe la fórmula LaTeX (ej. E = mc^2 o \\frac{a}{b})...',
    'block.image.upload': 'Subir imagen',
    'block.image.camera': 'Usar cámara',
    'block.image.drag_drop': 'o arrastra una imagen aquí',
    'block.image.caption_placeholder': 'Escribe un pie de foto...',
    'block.image.capturing': 'Capturando cámara...',
    'block.image.take_photo': 'Tomar foto',
    'block.image.close_camera': 'Cerrar cámara',
    'block.sheet.results': 'Resultados',
    'block.sheet.ablations': 'Ablaciones',
    'block.sheet.formula_placeholder': 'Fórmula (=SUM(A1:B1))',
    'block.mermaid.edit': 'Editar diagrama',
    'block.mermaid.preview': 'Ver diagrama',
    'block.mermaid.placeholder': 'graph TD\n  A[Inicio] --> B[Proceso]\n  B --> C[Fin]',

    // Menú Slash
    'slash.insert_title': 'Insertar bloque',
    'slash.navigate': 'Navegar',
    'slash.select': 'Seleccionar',
    'slash.text_title': 'Texto enriquecido',
    'slash.text_desc': 'Escribe párrafos con formato estilizado',
    'slash.code_title': 'Código',
    'slash.code_desc': 'Editor con resaltado de sintaxis y altura adaptable',
    'slash.sheet_title': 'Hoja de cálculo',
    'slash.sheet_desc': 'Tablas interactivas con fórmulas matemáticas en vivo',
    'slash.canvas_title': 'Lienzo de dibujo',
    'slash.canvas_desc': 'Lienzo infinito vectorial tldraw editable',
    'slash.latex_title': 'Fórmula LaTeX',
    'slash.latex_desc': 'Notación matemática renderizada con KaTeX',
    'slash.mermaid_title': 'Diagrama Mermaid',
    'slash.mermaid_desc': 'Flujos y mapas conceptuales en SVG interactivo',
    'slash.image_title': 'Imagen',
    'slash.image_desc': 'Subida de archivos o captura de cámara con pie de foto',
    'slash.file_title': 'Archivo o documento',
    'slash.file_desc': 'Adjunta PDFs, Word, Excel o PowerPoint con vista previa',

    // Autenticación
    'auth.login_title': 'Bienvenido a Weave',
    'auth.login_subtitle': 'Ingresa a tu espacio de trabajo inteligente',
    'auth.register_title': 'Crear cuenta en Weave',
    'auth.register_subtitle': 'Comienza a tomar notas con bloques interactivos',
    'auth.name': 'Nombre completo',
    'auth.email': 'Correo electrónico',
    'auth.password': 'Contraseña',
    'auth.login_button': 'Iniciar sesión',
    'auth.register_button': 'Registrarse',
    'auth.no_account': '¿No tienes una cuenta?',
    'auth.has_account': '¿Ya tienes una cuenta?',
    'auth.or': 'o',
  },
  en: {
    // General & Navigation
    'app.name': 'Weave',
    'app.workspace': 'Research lab',
    'nav.search': 'Search',
    'nav.inbox': 'Inbox',
    'nav.all_documents': 'All documents',
    'nav.archive': 'Archive',
    'nav.templates': 'Templates',
    'nav.storage': 'Storage',
    'nav.spaces': 'Spaces',
    'nav.logout': 'Sign out',
    'theme.toggle': 'Toggle theme',
    'lang.toggle': 'Language',

    // Spaces
    'space.research': 'Research',
    'space.product': 'Product',
    'space.personal': 'Personal',

    // Topbar & Document
    'topbar.saved': 'Saved',
    'topbar.saving': 'Saving...',
    'topbar.unsaved': 'Unsaved',
    'topbar.share': 'Share',
    'topbar.comments': 'Comments',
    'topbar.new_note': 'New note',
    'doc.updated': 'Updated just now',
    'doc.category': 'RESEARCH NOTE',
    'doc.title_placeholder': 'Note title...',
    'doc.lead_placeholder': 'Write a brief lead or summary of this note...',
    'doc.add_tag': 'Add tag',
    'doc.drop_here': 'Drop block here',
    'doc.empty_note': 'This document has no blocks yet. Type "/" or press "+" to start.',

    // Specialized document types
    'doc_type.create_title': 'Create specialized document',
    'doc_type.block_title': 'Standard Document',
    'doc_type.block_desc': 'Interactive blocks of text, code, LaTeX, and media',
    'doc_type.sheet_title': 'Spreadsheet (Excel)',
    'doc_type.sheet_desc': 'Full Univer Sheets workbook with formulas and sheets',
    'doc_type.doc_title': 'Word Document',
    'doc_type.doc_desc': 'Formal Univer Docs word processor with page layout',
    'doc_type.canvas_title': 'Vector Canvas',
    'doc_type.canvas_desc': 'Infinite vector whiteboard for diagrams and sketches',
    'doc_type.slide_title': 'Presentation (Slides)',
    'doc_type.slide_desc': 'Univer Slides presentation with slides, shapes, and text',

    // Rail & Blocks
    'rail.add_block': 'Add block below',
    'rail.drag': 'Drag to reorder',
    'rail.delete': 'Delete block',
    'rail.move_up': 'Move up',
    'rail.move_down': 'Move down',

    // Specific Blocks
    'block.text.placeholder': 'Write rich text here...',
    'block.code.copy': 'Copy',
    'block.code.copied': 'Copied!',
    'block.code.language': 'Language',
    'block.latex.label': 'LATEX',
    'block.latex.edit': 'Edit formula',
    'block.latex.preview': 'Confirm',
    'block.latex.placeholder': 'Enter LaTeX formula (e.g. E = mc^2 or \\frac{a}{b})...',
    'block.image.upload': 'Upload image',
    'block.image.camera': 'Use camera',
    'block.image.drag_drop': 'or drag an image here',
    'block.image.caption_placeholder': 'Add a caption...',
    'block.image.capturing': 'Capturing camera...',
    'block.image.take_photo': 'Take photo',
    'block.image.close_camera': 'Close camera',
    'block.sheet.results': 'Results',
    'block.sheet.ablations': 'Ablations',
    'block.sheet.formula_placeholder': 'Formula (=SUM(A1:B1))',
    'block.mermaid.edit': 'Edit diagram',
    'block.mermaid.preview': 'View diagram',
    'block.mermaid.placeholder': 'graph TD\n  A[Start] --> B[Process]\n  B --> C[End]',

    // Slash Menu
    'slash.insert_title': 'Insert block',
    'slash.navigate': 'Navigate',
    'slash.select': 'Select',
    'slash.text_title': 'Rich Text',
    'slash.text_desc': 'Write with rich text formatting',
    'slash.code_title': 'Code',
    'slash.code_desc': 'Code with syntax highlighting & auto-height',
    'slash.sheet_title': 'Spreadsheet',
    'slash.sheet_desc': 'Interactive sheets with live mathematical formulas',
    'slash.canvas_title': 'Canvas',
    'slash.canvas_desc': 'Infinite editable vector canvas with tldraw',
    'slash.latex_title': 'LaTeX',
    'slash.latex_desc': 'Mathematical notation rendered with KaTeX',
    'slash.mermaid_title': 'Mermaid',
    'slash.mermaid_desc': 'Create diagrams from text with interactive SVG',
    'slash.image_title': 'Image',
    'slash.image_desc': 'File upload or camera capture with caption',
    'slash.file_title': 'File or Document',
    'slash.file_desc': 'Attach PDF, Word, Excel, or PowerPoint with preview',

    // Auth
    'auth.login_title': 'Welcome to Weave',
    'auth.login_subtitle': 'Sign in to your intelligent workspace',
    'auth.register_title': 'Create your Weave account',
    'auth.register_subtitle': 'Start capturing thoughts with connected blocks',
    'auth.name': 'Full name',
    'auth.email': 'Email address',
    'auth.password': 'Password',
    'auth.login_button': 'Sign in',
    'auth.register_button': 'Create account',
    'auth.no_account': "Don't have an account?",
    'auth.has_account': 'Already have an account?',
    'auth.or': 'or',
  },
};

/**
 * Servicio de Internacionalización (i18n).
 * Permite alternar de forma reactiva entre Español e Inglés sin recargar la aplicación.
 */
@Injectable({
  providedIn: 'root',
})
export class I18nService {
  private readonly defaultLang: Language =
    (localStorage.getItem('weave_lang') as Language) || 'es';

  readonly currentLang = signal<Language>(this.defaultLang);

  /**
   * Obtiene la traducción para una clave dada.
   */
  t(key: string): string {
    const lang: Language = this.currentLang();
    const table = TRANSLATIONS[lang] || TRANSLATIONS.es;
    return table[key] ?? TRANSLATIONS.es[key] ?? key;
  }

  /**
   * Cambia el idioma activo y guarda la preferencia en localStorage.
   */
  setLanguage(lang: Language): void {
    this.currentLang.set(lang);
    localStorage.setItem('weave_lang', lang);
  }

  /**
   * Alterna entre Español e Inglés.
   */
  toggleLanguage(): void {
    const nextLang = this.currentLang() === 'es' ? 'en' : 'es';
    this.setLanguage(nextLang);
  }
}
