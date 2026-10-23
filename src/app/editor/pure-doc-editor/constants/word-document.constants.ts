import {
  DocumentLayoutConfig,
  DocumentPage,
  PageMarginsConfig,
  PaperFormatId,
  PaperFormatPreset,
  StyleTemplate,
} from '../models/word-document.model';

export const PAPER_FORMAT_PRESETS: Record<PaperFormatId, PaperFormatPreset> = {
  letter: {
    id: 'letter',
    name: 'Carta (Letter)',
    badge: '21.59 × 27.94 cm',
    widthCm: 21.59,
    heightCm: 27.94,
    widthPx: 816,
    heightPx: 1056,
    widthTwips: 12240,
    heightTwips: 15840,
  },
  oficio: {
    id: 'oficio',
    name: 'Oficio (Folio / Latinoamérica)',
    badge: '21.59 × 33.02 cm',
    widthCm: 21.59,
    heightCm: 33.02,
    widthPx: 816,
    heightPx: 1248,
    widthTwips: 12240,
    heightTwips: 18720,
  },
  legal: {
    id: 'legal',
    name: 'Legal (US Legal)',
    badge: '21.59 × 35.56 cm',
    widthCm: 21.59,
    heightCm: 35.56,
    widthPx: 816,
    heightPx: 1344,
    widthTwips: 12240,
    heightTwips: 20160,
  },
  a4: {
    id: 'a4',
    name: 'A4 (ISO Estándar)',
    badge: '21.0 × 29.7 cm',
    widthCm: 21.0,
    heightCm: 29.7,
    widthPx: 794,
    heightPx: 1123,
    widthTwips: 11906,
    heightTwips: 16838,
  },
  executive: {
    id: 'executive',
    name: 'Ejecutivo (Executive)',
    badge: '18.42 × 26.67 cm',
    widthCm: 18.42,
    heightCm: 26.67,
    widthPx: 696,
    heightPx: 1008,
    widthTwips: 10440,
    heightTwips: 15120,
  },
  a5: {
    id: 'a5',
    name: 'A5 (Compacto)',
    badge: '14.8 × 21.0 cm',
    widthCm: 14.8,
    heightCm: 21.0,
    widthPx: 559,
    heightPx: 794,
    widthTwips: 8391,
    heightTwips: 11906,
  },
  b5: {
    id: 'b5',
    name: 'B5 (JIS)',
    badge: '18.2 × 25.7 cm',
    widthCm: 18.2,
    heightCm: 25.7,
    widthPx: 688,
    heightPx: 971,
    widthTwips: 10319,
    heightTwips: 14572,
  },
  a3: {
    id: 'a3',
    name: 'A3 (Póster / Tablas Grandes)',
    badge: '29.7 × 42.0 cm',
    widthCm: 29.7,
    heightCm: 42.0,
    widthPx: 1123,
    heightPx: 1587,
    widthTwips: 16838,
    heightTwips: 23811,
  },
  tabloid: {
    id: 'tabloid',
    name: 'Tabloide / Doble Carta',
    badge: '27.94 × 43.18 cm',
    widthCm: 27.94,
    heightCm: 43.18,
    widthPx: 1056,
    heightPx: 1632,
    widthTwips: 15840,
    heightTwips: 24480,
  },
  custom: {
    id: 'custom',
    name: 'Personalizado (.docx)',
    badge: 'Detectado del archivo',
    widthCm: 21.0,
    heightCm: 29.7,
    widthPx: 794,
    heightPx: 1123,
    widthTwips: 11906,
    heightTwips: 16838,
  },
};

export const MARGIN_PRESETS: Record<string, PageMarginsConfig> = {
  normal: {
    label: 'Normal (2.54 cm)',
    topPx: 72,
    rightPx: 72,
    bottomPx: 72,
    leftPx: 72,
  },
  narrow: {
    label: 'Estrecho (1.27 cm)',
    topPx: 40,
    rightPx: 40,
    bottomPx: 40,
    leftPx: 40,
  },
  moderate: {
    label: 'Moderado (2.54 / 1.91 cm)',
    topPx: 72,
    rightPx: 54,
    bottomPx: 72,
    leftPx: 54,
  },
  wide: {
    label: 'Ancho (2.54 / 5.08 cm)',
    topPx: 72,
    rightPx: 120,
    bottomPx: 72,
    leftPx: 120,
  },
};

export const DEFAULT_LAYOUT_CONFIG: DocumentLayoutConfig = {
  paperFormatId: 'letter',
  orientation: 'portrait',
  margins: MARGIN_PRESETS['normal'],
  pageBorder: {
    style: 'none',
    color: '#334155',
    widthPt: 1,
    offsetPx: 20,
    top: true,
    bottom: true,
    left: true,
    right: true,
  },
  headerHtml: '<div style="text-align: right; color: #64748b; font-size: 9.5pt;">Documento Corporativo · Confidencial</div>',
  footerHtml: '<div style="text-align: center; color: #64748b; font-size: 9.5pt;">Word Studio Pro — Compatible con Microsoft Word</div>',
  showHeaderFooter: true,
};

export const BUILTIN_STYLE_TEMPLATES: StyleTemplate[] = [
  {
    id: 'apa-times-12',
    name: 'Norma APA 7 / Tesis (Times New Roman 12pt)',
    description: 'Encabezado 1 en Times New Roman 12pt Negrita Centrado, H2 Izquierda, interlineado 2.0 y sangría en primera línea.',
    rules: {
      H1: {
        target: 'H1',
        label: 'Encabezado 1 (H1)',
        fontFamily: 'Times New Roman',
        fontSizePt: 12,
        align: 'center',
        bold: true,
        italic: false,
        underline: false,
        color: '#000000',
        lineHeight: 2.0,
        spaceBeforePt: 12,
        spaceAfterPt: 12,
        firstLineIndentPt: 0,
      },
      H2: {
        target: 'H2',
        label: 'Encabezado 2 (H2)',
        fontFamily: 'Times New Roman',
        fontSizePt: 12,
        align: 'left',
        bold: true,
        italic: false,
        underline: false,
        color: '#000000',
        lineHeight: 2.0,
        spaceBeforePt: 12,
        spaceAfterPt: 8,
        firstLineIndentPt: 0,
      },
      H3: {
        target: 'H3',
        label: 'Encabezado 3 (H3)',
        fontFamily: 'Times New Roman',
        fontSizePt: 12,
        align: 'left',
        bold: true,
        italic: true,
        underline: false,
        color: '#000000',
        lineHeight: 2.0,
        spaceBeforePt: 10,
        spaceAfterPt: 6,
        firstLineIndentPt: 0,
      },
      H4: {
        target: 'H4',
        label: 'Encabezado 4 (H4)',
        fontFamily: 'Times New Roman',
        fontSizePt: 12,
        align: 'left',
        bold: true,
        italic: false,
        underline: false,
        color: '#000000',
        lineHeight: 2.0,
        spaceBeforePt: 8,
        spaceAfterPt: 4,
        firstLineIndentPt: 36,
      },
      H5: {
        target: 'H5',
        label: 'Encabezado 5 (H5)',
        fontFamily: 'Times New Roman',
        fontSizePt: 12,
        align: 'left',
        bold: true,
        italic: true,
        underline: false,
        color: '#000000',
        lineHeight: 2.0,
        spaceBeforePt: 6,
        spaceAfterPt: 4,
        firstLineIndentPt: 36,
      },
      H6: {
        target: 'H6',
        label: 'Encabezado 6 (H6)',
        fontFamily: 'Times New Roman',
        fontSizePt: 11,
        align: 'left',
        bold: false,
        italic: true,
        underline: false,
        color: '#1e293b',
        lineHeight: 2.0,
        spaceBeforePt: 6,
        spaceAfterPt: 4,
        firstLineIndentPt: 36,
      },
      P: {
        target: 'P',
        label: 'Párrafo Normal (P)',
        fontFamily: 'Times New Roman',
        fontSizePt: 12,
        align: 'left',
        bold: false,
        italic: false,
        underline: false,
        color: '#000000',
        lineHeight: 2.0,
        spaceBeforePt: 0,
        spaceAfterPt: 8,
        firstLineIndentPt: 36,
      },
    },
  },
  {
    id: 'corporate-modern',
    name: 'Ejecutivo Corporativo (Calibri / Inter)',
    description: 'Estilo empresarial limpio con H1 azul oscuro 20pt, H2 15pt, interlineado 1.5 y texto justificado.',
    rules: {
      H1: {
        target: 'H1',
        label: 'Encabezado 1 (H1)',
        fontFamily: 'Calibri',
        fontSizePt: 20,
        align: 'left',
        bold: true,
        italic: false,
        underline: false,
        color: '#0f172a',
        lineHeight: 1.3,
        spaceBeforePt: 16,
        spaceAfterPt: 8,
        firstLineIndentPt: 0,
      },
      H2: {
        target: 'H2',
        label: 'Encabezado 2 (H2)',
        fontFamily: 'Calibri',
        fontSizePt: 15,
        align: 'left',
        bold: true,
        italic: false,
        underline: false,
        color: '#1d4ed8',
        lineHeight: 1.35,
        spaceBeforePt: 14,
        spaceAfterPt: 6,
        firstLineIndentPt: 0,
      },
      H3: {
        target: 'H3',
        label: 'Encabezado 3 (H3)',
        fontFamily: 'Calibri',
        fontSizePt: 13,
        align: 'left',
        bold: true,
        italic: false,
        underline: false,
        color: '#334155',
        lineHeight: 1.4,
        spaceBeforePt: 10,
        spaceAfterPt: 4,
        firstLineIndentPt: 0,
      },
      H4: {
        target: 'H4',
        label: 'Encabezado 4 (H4)',
        fontFamily: 'Calibri',
        fontSizePt: 11.5,
        align: 'left',
        bold: true,
        italic: true,
        underline: false,
        color: '#475569',
        lineHeight: 1.4,
        spaceBeforePt: 8,
        spaceAfterPt: 4,
        firstLineIndentPt: 0,
      },
      H5: {
        target: 'H5',
        label: 'Encabezado 5 (H5)',
        fontFamily: 'Calibri',
        fontSizePt: 11,
        align: 'left',
        bold: true,
        italic: false,
        underline: false,
        color: '#64748b',
        lineHeight: 1.4,
        spaceBeforePt: 6,
        spaceAfterPt: 2,
        firstLineIndentPt: 0,
      },
      H6: {
        target: 'H6',
        label: 'Encabezado 6 (H6)',
        fontFamily: 'Calibri',
        fontSizePt: 10,
        align: 'left',
        bold: true,
        italic: false,
        underline: false,
        color: '#64748b',
        lineHeight: 1.4,
        spaceBeforePt: 6,
        spaceAfterPt: 2,
        firstLineIndentPt: 0,
      },
      P: {
        target: 'P',
        label: 'Párrafo Normal (P)',
        fontFamily: 'Calibri',
        fontSizePt: 11,
        align: 'justify',
        bold: false,
        italic: false,
        underline: false,
        color: '#1e293b',
        lineHeight: 1.5,
        spaceBeforePt: 0,
        spaceAfterPt: 8,
        firstLineIndentPt: 0,
      },
    },
  },
  {
    id: 'legal-formal',
    name: 'Jurídico / Oficio Gubernamental (Arial 11pt)',
    description: 'Títulos H1 centrados en Arial 13pt, subtítulos subrayados y párrafos justificados con espaciado formal.',
    rules: {
      H1: {
        target: 'H1',
        label: 'Encabezado 1 (H1)',
        fontFamily: 'Arial',
        fontSizePt: 13,
        align: 'center',
        bold: true,
        italic: false,
        underline: true,
        color: '#000000',
        lineHeight: 1.5,
        spaceBeforePt: 14,
        spaceAfterPt: 10,
        firstLineIndentPt: 0,
      },
      H2: {
        target: 'H2',
        label: 'Encabezado 2 (H2)',
        fontFamily: 'Arial',
        fontSizePt: 12,
        align: 'left',
        bold: true,
        italic: false,
        underline: false,
        color: '#000000',
        lineHeight: 1.5,
        spaceBeforePt: 12,
        spaceAfterPt: 6,
        firstLineIndentPt: 0,
      },
      H3: {
        target: 'H3',
        label: 'Encabezado 3 (H3)',
        fontFamily: 'Arial',
        fontSizePt: 11,
        align: 'left',
        bold: true,
        italic: true,
        underline: false,
        color: '#1e293b',
        lineHeight: 1.5,
        spaceBeforePt: 10,
        spaceAfterPt: 4,
        firstLineIndentPt: 0,
      },
      H4: {
        target: 'H4',
        label: 'Encabezado 4 (H4)',
        fontFamily: 'Arial',
        fontSizePt: 11,
        align: 'left',
        bold: true,
        italic: false,
        underline: false,
        color: '#334155',
        lineHeight: 1.5,
        spaceBeforePt: 8,
        spaceAfterPt: 4,
        firstLineIndentPt: 0,
      },
      H5: {
        target: 'H5',
        label: 'Encabezado 5 (H5)',
        fontFamily: 'Arial',
        fontSizePt: 10.5,
        align: 'left',
        bold: true,
        italic: false,
        underline: false,
        color: '#475569',
        lineHeight: 1.5,
        spaceBeforePt: 6,
        spaceAfterPt: 2,
        firstLineIndentPt: 0,
      },
      H6: {
        target: 'H6',
        label: 'Encabezado 6 (H6)',
        fontFamily: 'Arial',
        fontSizePt: 10,
        align: 'left',
        bold: false,
        italic: true,
        underline: false,
        color: '#475569',
        lineHeight: 1.5,
        spaceBeforePt: 6,
        spaceAfterPt: 2,
        firstLineIndentPt: 0,
      },
      P: {
        target: 'P',
        label: 'Párrafo Normal (P)',
        fontFamily: 'Arial',
        fontSizePt: 11,
        align: 'justify',
        bold: false,
        italic: false,
        underline: false,
        color: '#000000',
        lineHeight: 1.5,
        spaceBeforePt: 0,
        spaceAfterPt: 10,
        firstLineIndentPt: 0,
      },
    },
  },
];

export const FONT_FAMILIES = [
  { label: 'Inter (Predeterminada)', value: 'Inter, sans-serif' },
  { label: 'Times New Roman', value: '"Times New Roman", Times, serif' },
  { label: 'Calibri', value: 'Calibri, Candara, Segoe, Optima, sans-serif' },
  { label: 'Aptos', value: 'Aptos, Calibri, Inter, sans-serif' },
  { label: 'Arial', value: 'Arial, Helvetica, sans-serif' },
  { label: 'Cambria', value: 'Cambria, Georgia, serif' },
  { label: 'Georgia', value: 'Georgia, serif' },
  { label: 'Merriweather', value: 'Merriweather, serif' },
  { label: 'Verdana', value: 'Verdana, Geneva, sans-serif' },
  { label: 'Tahoma', value: 'Tahoma, Geneva, sans-serif' },
  { label: 'Courier New', value: '"Courier New", Courier, monospace' },
  { label: 'Fira Code', value: '"Fira Code", monospace' }
];

export const FONT_SIZES = [
  { label: '8', pt: '8pt', cmd: '1' },
  { label: '9', pt: '9pt', cmd: '1' },
  { label: '10', pt: '10pt', cmd: '2' },
  { label: '11', pt: '11pt', cmd: '3' },
  { label: '12', pt: '12pt', cmd: '3' },
  { label: '14', pt: '14pt', cmd: '4' },
  { label: '16', pt: '16pt', cmd: '4' },
  { label: '18', pt: '18pt', cmd: '5' },
  { label: '20', pt: '20pt', cmd: '5' },
  { label: '24', pt: '24pt', cmd: '6' },
  { label: '36', pt: '36pt', cmd: '7' },
];

export const TEXT_COLORS = [
  '#000000', '#1e293b', '#475569', '#94a3b8',
  '#dc2626', '#ea580c', '#d97706', '#16a34a',
  '#0284c7', '#2563eb', '#7c3aed', '#db2777'
];

export const HIGHLIGHT_COLORS = [
  'transparent', '#fef08a', '#bbf7d0', '#bae6fd',
  '#e9d5ff', '#fbcfe8', '#fed7aa', '#e2e8f0'
];

export const CODE_LANGUAGES = [
  'JavaScript',
  'TypeScript',
  'Python',
  'HTML / CSS',
  'SQL',
  'JSON',
  'Bash'
];

export const INITIAL_DOCUMENT_PAGES: DocumentPage[] = [
  {
    id: 'page-1',
    html: `
<h1 id="heading-init-1">Propuesta Estratégica y Guía de Usuario 2025</h1>
<p>Bienvenido a <strong>Word Studio Pro Multipágina</strong>. Esta versión incluye <strong>Plantillas de Estilos Personalizables</strong> (como <em>H1 en Times New Roman 12pt Centrado</em>) e importación avanzada de <code>.docx</code> que conserva el tamaño exacto de cada encabezado, imágenes incrustadas, tabulaciones y espaciado de párrafos.</p>

<h2 id="heading-init-2">1. Importación Fiel de .DOCX (Imágenes, Títulos, Tabulados y Espaciado)</h2>
<p>Al cargar un archivo <strong>.docx</strong> desde tu equipo, el motor OpenXML analiza internamente todas las relaciones y estilos para aplicar automáticamente:</p>
<ul>
  <li><strong>Tamaño Exacto en Encabezados (H1–H6):</strong> Lee el tamaño en puntos (<code>w:sz</code>) tanto de <code>word/styles.xml</code> como de los fragmentos directos del título y los aplica sin perder su jerarquía en el Índice.</li>
  <li><strong>Imágenes Incrustadas (<code>word/media/*</code>):</strong> Extrae todas las imágenes dentro del paquete <code>.docx</code>, resuelve sus relaciones (<code>document.xml.rels</code>) y las inserta con sus dimensiones originales.</li>
  <li><strong>Tabulaciones, Sangrías y Espaciado:</strong> Respeta las tabulaciones (<code>w:tab</code> y tecla <code>Tab</code>), sangría izquierda/derecha, sangría de primera línea (<code>w:ind</code>), espaciado anterior/posterior e interlineado (<code>w:spacing</code>).</li>
</ul>

<h3 id="heading-init-3">1.1 Plantillas de Estilos (Ej. H1 Times New Roman 12pt Centrado)</h3>
<p>Abre la pestaña <strong>Plantillas de Estilos</strong> en la barra superior o pulsa el botón <em>"Diseñador de Estilos"</em> para configurar cómo debe lucir cada nivel (<code>H1..H6</code> y <code>P</code>) y aplicarlo a todo el documento con un clic.</p>
`
  },
  {
    id: 'page-2',
    html: `
<h2 id="heading-init-4">2. Resumen de Capacidades de Formato y Plantillas</h2>
<p>Esta es la <strong>Página 2</strong> del documento. En la tabla inferior se detallan las mejoras de fidelidad visual con Microsoft Word:</p>

<table>
  <thead>
    <tr>
      <th>Característica</th>
      <th>Soporte en Importación .DOCX</th>
      <th>Edición en Vivo</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td><strong>Tamaño y Fuente de H1–H6</strong></td>
      <td>Aplica <code>font-size</code>, <code>font-family</code>, color y alineación reales</td>
      <td>Sí (Barra + Plantillas)</td>
    </tr>
    <tr>
      <td><strong>Imágenes del Documento</strong></td>
      <td>Extrae binarios de <code>word/media/</code> como Base64</td>
      <td>Sí</td>
    </tr>
    <tr>
      <td><strong>Tabulado y Espaciado</strong></td>
      <td>Preserva <code>w:tab</code>, <code>w:ind</code> (sangrías) y <code>w:spacing</code></td>
      <td>Sí (Tecla Tab + Sangría)</td>
    </tr>
    <tr>
      <td><strong>Plantillas de Estilos</strong></td>
      <td>Incluye APA 7 (Times New Roman 12pt Centrado) y creador propio</td>
      <td>Sí (Aplicar a todo el doc)</td>
    </tr>
  </tbody>
</table>

<h3 id="heading-init-5">2.1 Prueba de Tabulado y Sangría</h3>
<p style="text-indent: 36pt; line-height: 1.8;">Este párrafo demuestra una <strong>sangría de primera línea de 36pt (1.27 cm)</strong> e interlineado extendido, tal como se utiliza en documentos académicos y jurídicos. También puedes presionar la tecla <code>Tab</code> en cualquier parte del documento para insertar un tabulado real.</p>
`
  }
];
