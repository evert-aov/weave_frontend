import type { AiEditorAdapter } from '../../core/services/ai-document.service';
import { cleanSheetCellText } from '../../core/utils/ai-edit-text';

/** Se conecta a la fachada del motor ya cargado, sin importar Univer desde el chat. */
export function sheetAiAdapter(owner: () => string | undefined, workbook: () => any, persist: (snapshot: any) => void, prefix: () => string = () => ''): AiEditorAdapter {
  const cells = () => {
    const book = workbook();
    if (!book) return [];
    const snapshot = book.save();
    const result: { id: string; text: string; sheet: any; row: number; col: number }[] = [];
    // Incluye celdas pobladas y espacio vacío para agregar datos en hojas nuevas.
    for (const sheet of book.getSheets()) {
      const data = snapshot.sheets?.[sheet.getSheetId()]?.cellData ?? {};
      const coordinates = new Set<string>();
      for (const row of Object.keys(data)) for (const col of Object.keys(data[row])) coordinates.add(`${row},${col}`);
      for (let row = 0; row < 12; row++) for (let col = 0; col < 8; col++) coordinates.add(`${row},${col}`);
      for (const coordinate of coordinates) {
        const [row, col] = coordinate.split(',').map(Number);
        const cell = data[row]?.[col];
        // No reemplazar silenciosamente contenido de celdas enriquecidas por su valor vacío.
        if (cell?.p) continue;
        const text = String(cell?.f ?? cell?.v ?? '');
        result.push({ id: `${prefix()}cell:${sheet.getSheetId()}:${row + 1}:${col + 1}`, text, sheet, row, col });
        if (result.length >= 201) return result;
      }
    }
    return result;
  };
  return {
    owner,
    fields: () => cells().map(({ id, text }) => ({ id, text })),
    apply: values => {
      const available = cells();
      for (const cell of available) if (values.has(cell.id)) {
        const text = cleanSheetCellText(values.get(cell.id)!);
        const value = text.startsWith('=') ? { f: text, v: null, p: null }
          : { v: text === '' ? null : /^-?(?:\d+\.?\d*|\.\d+)$/.test(text) ? Number(text) : text, f: null, p: null };
        cell.sheet.getRange(cell.row, cell.col).setValue(value);
      }
      persist(workbook().save());
    },
  };
}
