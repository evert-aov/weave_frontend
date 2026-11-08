import type { AiEditorAdapter } from '../../core/services/ai-document.service';
import { cleanSheetCellText } from '../../core/utils/ai-edit-text';

/**
 * Adaptador de IA para la hoja de cálculo de Weave.
 * Lee y actualiza celdas del modelo de hojas dinámico sin depender de librerías externas.
 */
export function sheetAiAdapter(
  owner: () => string | undefined,
  workbook: () => any,
  persist: (snapshot: any) => void,
  prefix: () => string = () => ''
): AiEditorAdapter {
  const cells = () => {
    const book = workbook();
    if (!book) return [];

    // Compatibilidad con fachadas de hoja que expongan getSheets() y save()
    if (typeof book.getSheets === 'function') {
      const snapshot = typeof book.save === 'function' ? book.save() : {};
      const result: { id: string; text: string; sheet?: any; row: number; col: number; cellId?: string; sheetId?: string }[] = [];
      for (const sheet of book.getSheets()) {
        const sheetId = sheet.getSheetId ? sheet.getSheetId() : 's1';
        const data = snapshot.sheets?.[sheetId]?.cellData ?? {};
        const coordinates = new Set<string>();
        for (const row of Object.keys(data)) {
          for (const col of Object.keys(data[row])) {
            coordinates.add(`${row},${col}`);
          }
        }
        for (let row = 0; row < 12; row++) {
          for (let col = 0; col < 8; col++) {
            coordinates.add(`${row},${col}`);
          }
        }
        for (const coordinate of coordinates) {
          const [row, col] = coordinate.split(',').map(Number);
          const cell = data[row]?.[col];
          if (cell?.p) continue;
          const text = String(cell?.f ?? cell?.v ?? '');
          result.push({
            id: `${prefix()}cell:${sheetId}:${row + 1}:${col + 1}`,
            text,
            sheet,
            row,
            col,
          });
          if (result.length >= 250) return result;
        }
      }
      return result;
    }

    const result: { id: string; text: string; cellId: string; sheetId: string; col: number; row: number; sheet?: any }[] = [];

    // Formato de nuevo libro: { sheets: Sheet[], activeSheetId: string } o array de Sheet[]
    const sheetsList = Array.isArray(book)
      ? book
      : Array.isArray(book.sheets)
        ? book.sheets
        : book.data
          ? [{ id: 'sheet-1', name: 'Hoja 1', data: book.data }]
          : [];

    for (const sheet of sheetsList) {
      const data = sheet?.data ?? {};
      const sheetId = sheet?.id ?? 'sheet-1';

      // Incluye celdas existentes
      for (const [cellId, cell] of Object.entries(data as Record<string, any>)) {
        const text = String(cell?.raw ?? cell?.computed ?? '');
        result.push({
          id: `${prefix()}cell:${sheetId}:${cellId}`,
          text,
          cellId,
          sheetId,
          col: 0,
          row: 0,
        });
        if (result.length >= 250) return result;
      }

      // Si hay pocas celdas, ofrecer cuadrícula básica 10x6
      if (result.length < 30) {
        for (let r = 1; r <= 10; r++) {
          for (let c = 0; c < 6; c++) {
            const letter = String.fromCharCode(65 + c);
            const cellId = `${letter}${r}`;
            if (!data[cellId]) {
              result.push({
                id: `${prefix()}cell:${sheetId}:${cellId}`,
                text: '',
                cellId,
                sheetId,
                col: c,
                row: r - 1,
              });
            }
            if (result.length >= 250) return result;
          }
        }
      }
    }

    return result;
  };

  return {
    owner,
    fields: () => cells().map(({ id, text }) => ({ id, text })),
    apply: (values) => {
      const book = workbook();
      if (!book) return;

      const available = cells();

      if (typeof book.getSheets === 'function') {
        for (const cell of available) {
          if (values.has(cell.id) && cell.sheet) {
            const text = cleanSheetCellText(values.get(cell.id)!);
            const value = text.startsWith('=')
              ? { f: text, v: null, p: null }
              : { v: text === '' ? null : /^-?(?:\d+\.?\d*|\.\d+)$/.test(text) ? Number(text) : text, f: null, p: null };
            cell.sheet.getRange(cell.row, cell.col).setValue(value);
          }
        }
        if (typeof book.save === 'function') {
          persist(book.save());
        }
        return;
      }

      const updatedBook = JSON.parse(JSON.stringify(book));
      const sheetsList = Array.isArray(updatedBook)
        ? updatedBook
        : Array.isArray(updatedBook.sheets)
          ? updatedBook.sheets
          : updatedBook.data
            ? [{ id: 'sheet-1', name: 'Hoja 1', data: updatedBook.data }]
            : [];

      for (const cellItem of available) {
        if (values.has(cellItem.id) && cellItem.cellId) {
          const text = cleanSheetCellText(values.get(cellItem.id)!);
          const targetSheet = sheetsList.find((s: any) => (s?.id ?? 'sheet-1') === cellItem.sheetId);
          if (targetSheet) {
            if (!targetSheet.data) targetSheet.data = {};
            targetSheet.data[cellItem.cellId] = {
              ...(targetSheet.data[cellItem.cellId] || {}),
              raw: text,
            };
          }
        }
      }

      persist(updatedBook);
    },
  };
}
