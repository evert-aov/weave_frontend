import type { Note } from '../models/note.model';
import type { AiAttachment } from '../models/ai.model';

const MAX_ATTACHMENT_CHARS = 800_000;

/**
 * Obtiene la etiqueta amigable del tipo de documento.
 */
export function getDocTypeLabel(docType?: string): string {
  switch (docType) {
    case 'sheet': return 'Excel';
    case 'doc': return 'Word';
    case 'block': return 'Bloques';
    case 'latex': return 'LaTeX';
    case 'slide': return 'PowerPoint';
    case 'canvas': return 'Pizarra';
    default: return 'Nota';
  }
}

/**
 * Extrae el contenido estructurado de una hoja de cálculo para la IA.
 */
export function extractSheetNoteText(note: Note): string {
  const docData = note.docData || {};
  const sheets: any[] = Array.isArray(docData)
    ? docData
    : Array.isArray(docData.sheets)
      ? docData.sheets
      : docData.data
        ? [{ id: 'sheet1', name: 'Hoja 1', data: docData.data, tables: docData.tables, charts: docData.charts }]
        : [];

  if (!sheets.length) return `[Hoja de cálculo: "${note.title || 'Sin título'}"]\n(Hoja vacía sin datos)`;

  const parts: string[] = [`[Hoja de cálculo: "${note.title || 'Sin título'}"]`];

  for (const sheet of sheets) {
    const sheetName = sheet.name || 'Hoja';
    parts.push(`\n--- Hoja: "${sheetName}" ---`);

    if (sheet.tables && sheet.tables.length > 0) {
      const tableInfos = sheet.tables.map((t: any) => {
        const rangeStr = t.range ? ` (Col ${t.range.startCol + 1}..${t.range.endCol + 1}, Fila ${t.range.startRow + 1}..${t.range.endRow + 1})` : '';
        return `${t.name || 'Tabla'}${rangeStr}`;
      });
      parts.push(`Tablas estructuradas: ${tableInfos.join('; ')}`);
    }

    if (sheet.charts && sheet.charts.length > 0) {
      const chartInfos = sheet.charts.map((c: any) => `${c.title || c.chartTitle || c.category || 'Gráfico'} [tipo: ${c.category || ''}/${c.subType || ''}]`);
      parts.push(`Gráficos: ${chartInfos.join('; ')}`);
    }

    const grid = sheet.data || {};
    const cellKeys = Object.keys(grid);
    if (!cellKeys.length) {
      parts.push('(Sin celdas registradas)');
      continue;
    }

    const rowsMap = new Map<number, { colLetter: string; colIndex: number; text: string }[]>();

    for (const cellId of cellKeys) {
      const cell = grid[cellId];
      if (!cell) continue;
      const val = cell.computed ?? cell.raw ?? cell.value ?? '';
      const formula = cell.formula ? ` [fórmula: =${cell.formula}]` : '';
      const cellText = `${val}${formula}`.trim();
      if (!cellText) continue;

      const match = cellId.match(/^([A-Z]+)([0-9]+)$/i);
      if (match) {
        const colLetter = match[1].toUpperCase();
        const rowNum = parseInt(match[2], 10);
        let colIdx = 0;
        for (let i = 0; i < colLetter.length; i++) {
          colIdx = colIdx * 26 + (colLetter.charCodeAt(i) - 64);
        }
        if (!rowsMap.has(rowNum)) rowsMap.set(rowNum, []);
        rowsMap.get(rowNum)!.push({ colLetter, colIndex: colIdx, text: cellText });
      } else {
        if (!rowsMap.has(1)) rowsMap.set(1, []);
        rowsMap.get(1)!.push({ colLetter: cellId, colIndex: 0, text: cellText });
      }
    }

    const sortedRowNums = Array.from(rowsMap.keys()).sort((a, b) => a - b);
    for (const rowNum of sortedRowNums) {
      const cells = rowsMap.get(rowNum)!.sort((a, b) => a.colIndex - b.colIndex);
      const rowStr = cells.map(c => `${c.colLetter}: ${c.text}`).join(' | ');
      parts.push(`Fila ${rowNum}: ${rowStr}`);
    }
  }

  return parts.join('\n');
}

/**
 * Extrae el contenido estructurado de un documento Word para la IA.
 */
export function extractWordNoteText(note: Note): string {
  const docData = note.docData || {};
  const pages: any[] = Array.isArray(docData.pages) ? docData.pages : [];
  const layout = docData.layoutConfig;
  const sourcesCount = Array.isArray(docData.bibliographicSources) ? docData.bibliographicSources.length : 0;
  const metaParts: string[] = [];
  if (pages.length) metaParts.push(`${pages.length} pág.`);
  if (docData.activeTemplateId) metaParts.push(`plantilla:${docData.activeTemplateId}`);
  if (layout?.paperFormatId) metaParts.push(`papel:${layout.paperFormatId}/${layout.orientation || 'portrait'}`);
  if (layout?.margins?.label) metaParts.push(`márgenes:${layout.margins.label}`);
  if (sourcesCount) metaParts.push(`fuentes APA:${sourcesCount}`);
  const parts: string[] = [`[Documento Word: "${note.title || 'Sin título'}"${metaParts.length ? ` (${metaParts.join(', ')})` : ''}]`];

  if (pages.length > 0) {
    for (let pIdx = 0; pIdx < pages.length; pIdx++) {
      const page = pages[pIdx];
      parts.push(`\n--- Página ${pIdx + 1} ---`);
      if (!page.html) continue;

      const doc = new DOMParser().parseFromString(page.html, 'text/html');
      const elements = doc.body.children;

      for (let i = 0; i < elements.length; i++) {
        const el = elements[i];
        const tag = el.tagName.toLowerCase();

        if (tag.match(/^h[1-6]$/)) {
          const level = parseInt(tag[1], 10);
          parts.push(`${'#'.repeat(level)} ${el.textContent?.trim() || ''}`);
        } else if (tag === 'table') {
          const rows = Array.from(el.querySelectorAll('tr'));
          for (let rIdx = 0; rIdx < rows.length; rIdx++) {
            const cells = Array.from(rows[rIdx].querySelectorAll('th, td')).map(c => c.textContent?.trim() || '');
            parts.push(`| ${cells.join(' | ')} |`);
            if (rIdx === 0) {
              parts.push(`| ${cells.map(() => '---').join(' | ')} |`);
            }
          }
        } else if (tag === 'ul' || tag === 'ol') {
          const items = Array.from(el.querySelectorAll('li'));
          for (const item of items) {
            parts.push(`- ${item.textContent?.trim() || ''}`);
          }
        } else {
          const text = el.textContent?.trim();
          if (text) parts.push(text);
        }
      }
    }
  } else if (note.blocks && note.blocks.length > 0) {
    for (const block of note.blocks) {
      const raw = block.content?.['html'] || block.content?.['markdown'] || block.content?.['text'] || '';
      if (typeof raw === 'string' && raw.trim()) {
        const doc = new DOMParser().parseFromString(raw, 'text/html');
        parts.push(doc.body.textContent?.trim() || raw);
      }
    }
  } else {
    parts.push('(Documento sin contenido)');
  }

  return parts.join('\n');
}

/**
 * Extrae el contenido de un documento de bloques para la IA.
 */
export function extractBlockNoteText(note: Note): string {
  const parts: string[] = [`[Documento de bloques: "${note.title || 'Sin título'}"]`];
  for (const block of note.blocks || []) {
    const content = block.content || {};
    if (block.type === 'code') {
      const code = typeof content['code'] === 'string' ? content['code'] : '';
      const lang = typeof content['language'] === 'string' ? content['language'] : '';
      parts.push(`\`\`\`${lang}\n${code}\n\`\`\``);
    } else if (block.type === 'latex') {
      const formula = typeof content['formula'] === 'string' ? content['formula'] : '';
      parts.push(`$$${formula}$$`);
    } else if (block.type === 'mermaid') {
      const chart = typeof content['chart'] === 'string' ? content['chart'] : '';
      parts.push(`\`\`\`mermaid\n${chart}\n\`\`\``);
    } else {
      const rawText = content['markdown'] || content['html'] || content['text'] || '';
      if (typeof rawText === 'string' && rawText.trim()) {
        const doc = new DOMParser().parseFromString(rawText, 'text/html');
        parts.push(doc.body.textContent?.trim() || rawText);
      }
    }
  }
  return parts.join('\n');
}

/**
 * Extrae texto legible de cualquier documento almacenado en la base de datos de Weave.
 */
export function extractNoteTextContent(note: Note): string {
  let text = '';
  switch (note.docType) {
    case 'sheet':
      text = extractSheetNoteText(note);
      break;
    case 'doc':
      text = extractWordNoteText(note);
      break;
    case 'block':
      text = extractBlockNoteText(note);
      break;
    case 'latex':
      text = `[Documento LaTeX: "${note.title || 'Sin título'}"]\n${note.docData?.source || note.docData?.content || ''}`;
      break;
    default:
      if (note.docData?.sheets) {
        text = extractSheetNoteText(note);
      } else if (note.docData?.pages) {
        text = extractWordNoteText(note);
      } else if (note.blocks?.length) {
        text = extractBlockNoteText(note);
      } else {
        text = `[Documento: "${note.title || 'Sin título'}"]\n${JSON.stringify(note.docData || {})}`;
      }
      break;
  }

  if (text.length > MAX_ATTACHMENT_CHARS) {
    text = text.slice(0, MAX_ATTACHMENT_CHARS - 64) + '\n[... Contenido recortado por límite de tamaño de adjunto]';
  }

  return text;
}

/**
 * Convierte una Nota de la base de datos en un adjunto válido para la IA.
 */
export function noteToAiAttachment(note: Note): AiAttachment {
  const label = getDocTypeLabel(note.docType);
  return {
    name: `${note.title || 'Documento'} (${label})`,
    mimeType: 'text/plain',
    text: extractNoteTextContent(note),
  };
}
