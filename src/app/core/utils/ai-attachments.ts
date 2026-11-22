import type { AiAttachment, AiAttachmentMimeType } from '../models/ai.model';

const MAX_BYTES = 10 * 1024 * 1024;
const MAX_BINARY_BYTES = 4 * 1024 * 1024;
const MAX_ATTACHMENT_TEXT = 800_000;
const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif']);
const AUDIO_EXTENSIONS = new Set(['wav', 'mp3', 'mpeg', 'mpga', 'ogg', 'oga', 'aac', 'flac', 'webm', 'm4a']);

function ascii(bytes: Uint8Array, start: number, end: number): string {
  return new TextDecoder().decode(bytes.subarray(start, end));
}

function imageMime(bytes: Uint8Array): AiAttachmentMimeType | null {
  if ([137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte)) return 'image/png';
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg';
  const header = ascii(bytes, 0, 12);
  if (header.startsWith('GIF87a') || header.startsWith('GIF89a')) return 'image/gif';
  if (header.startsWith('RIFF') && header.slice(8, 12) === 'WEBP') return 'image/webp';
  return null;
}

function audioMime(bytes: Uint8Array, extension: string | undefined, mimeHint: string): AiAttachmentMimeType | null {
  const header = ascii(bytes, 0, 12);
  if (header.startsWith('RIFF') && header.slice(8, 12) === 'WAVE') return 'audio/wav';
  if (header.startsWith('OggS')) return 'audio/ogg';
  if (header.startsWith('fLaC')) return 'audio/flac';
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x1a &&
    bytes[1] === 0x45 &&
    bytes[2] === 0xdf &&
    bytes[3] === 0xa3 &&
    (extension === 'webm' || mimeHint === 'audio/webm' || mimeHint === 'video/webm')
  ) {
    return 'audio/webm';
  }
  if (
    bytes.length >= 12 &&
    header.slice(4, 8) === 'ftyp' &&
    (extension === 'm4a' || extension === 'mp4' || mimeHint === 'audio/mp4' || mimeHint === 'audio/x-m4a' || mimeHint === 'audio/m4a')
  ) {
    return 'audio/mp4';
  }
  const hasAacSync = header.startsWith('ADIF') || (bytes.length >= 2 && bytes[0] === 0xff && (bytes[1] & 0xf6) === 0xf0);
  if (hasAacSync && (extension === 'aac' || mimeHint === 'audio/aac')) return 'audio/aac';
  const hasMp3Sync = header.startsWith('ID3') || (bytes.length >= 2 && bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0);
  if (hasMp3Sync && (extension === 'mp3' || extension === 'mpeg' || extension === 'mpga' || mimeHint === 'audio/mp3' || mimeHint === 'audio/mpeg' || !extension)) {
    return mimeHint === 'audio/mpeg' ? 'audio/mpeg' : 'audio/mp3';
  }
  return null;
}

function base64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 32768) binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
  return btoa(binary);
}

export async function readAiAttachment(file: File): Promise<AiAttachment> {
  if (!file.size || file.size > MAX_BYTES) throw Error('Cada adjunto debe tener contenido y pesar como máximo 10 MB.');
  const extension = file.name.split('.').at(-1)?.toLowerCase();
  const mimeHint = (file.type || '').split(';')[0].trim().toLowerCase();
  const isImageHint = mimeHint.startsWith('image/') || IMAGE_EXTENSIONS.has(extension || '');
  const isAudioHint = mimeHint.startsWith('audio/') || AUDIO_EXTENSIONS.has(extension || '');
  const isPdfHint = extension === 'pdf' || mimeHint === 'application/pdf';
  if ((isImageHint || isAudioHint || isPdfHint) && file.size > MAX_BINARY_BYTES) {
    throw Error('Cada imagen, PDF o audio puede pesar como máximo 4 MB.');
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const detectedImage = imageMime(bytes);
  if (detectedImage) return { name: (file.name || 'imagen').slice(0, 255), mimeType: detectedImage, data: base64(bytes) };
  if (isImageHint) throw Error('La imagen no es válida. Usa PNG, JPG, WebP o GIF.');

  const detectedAudio = audioMime(bytes, extension, mimeHint);
  if (detectedAudio) return { name: (file.name || 'audio').slice(0, 255), mimeType: detectedAudio, data: base64(bytes) };
  if (isAudioHint) throw Error('El audio no es válido. Usa WAV, MP3, OGG, AAC, FLAC, WebM o M4A.');

  if (extension === 'pdf') {
    if (ascii(bytes, 0, 5) !== '%PDF-') throw Error('El archivo no es un PDF válido.');
    return { name: file.name, mimeType: 'application/pdf', data: base64(bytes) };
  }
  let text = '';
  if (extension === 'docx') {
    const { unzipSync, strFromU8 } = await import('fflate');
    const zip = unzipSync(bytes, { filter: (entry) => entry.name === 'word/document.xml' && entry.originalSize <= 8 * 1024 * 1024 });
    if (!zip['word/document.xml']) throw Error('El DOCX no contiene un documento válido o es demasiado grande.');
    const doc = new DOMParser().parseFromString(strFromU8(zip['word/document.xml']), 'application/xml');
    if (doc.querySelector('parsererror')) throw Error('No se pudo leer el documento Word.');
    text = Array.from(doc.getElementsByTagName('w:p')).map((p) => Array.from(p.getElementsByTagName('w:t')).map((n) => n.textContent).join('')).join('\n');
  } else if (extension === 'xlsx') {
    const { unzipSync } = await import('fflate');
    let expanded = 0;
    unzipSync(bytes, { filter: (entry) => { expanded += entry.originalSize; if (expanded > 32 * 1024 * 1024) throw Error('El libro es demasiado grande para adjuntarlo.'); return false; } });
    const ExcelJS = (await import('exceljs')).default;
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(bytes.buffer as ArrayBuffer);
    for (const sheet of book.worksheets) {
      text += `\n[Hoja: ${sheet.name}]\n`;
      sheet.eachRow((row, index) => {
        if (text.length > MAX_ATTACHMENT_TEXT) return;
        const cells: string[] = [];
        row.eachCell((cell, col) => { cells.push(`${col}:${cell.formula ? '=' + cell.formula : cell.text}`); });
        text += `${index}\t${cells.join('\t')}\n`;
      });
    }
  } else if (['txt', 'md', 'csv', 'json', 'tsv'].includes(extension || '')) {
    text = new TextDecoder().decode(bytes);
  } else {
    throw Error('Formato no admitido. Usa imágenes PNG, JPG, WebP o GIF, audios WAV, MP3, OGG, AAC, FLAC, WebM o M4A, PDF, DOCX, XLSX, TXT, Markdown, CSV, TSV o JSON.');
  }
  if (!text.trim()) throw Error('No se encontró contenido legible en el adjunto.');
  if (text.length > MAX_ATTACHMENT_TEXT) throw Error(`El contenido del adjunto supera ${MAX_ATTACHMENT_TEXT.toLocaleString('es-ES')} caracteres. Divide el documento.`);
  return { name: file.name, mimeType: 'text/plain', text };
}
