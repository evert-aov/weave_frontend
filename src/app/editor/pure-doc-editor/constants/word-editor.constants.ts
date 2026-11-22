import { EditorActiveFormats } from '../models/word-document.model';

export const DEFAULT_FORMATS: EditorActiveFormats = {
  bold: false,
  italic: false,
  underline: false,
  strikeThrough: false,
  subscript: false,
  superscript: false,
  justifyLeft: true,
  justifyCenter: false,
  justifyRight: false,
  justifyFull: false,
  insertUnorderedList: false,
  insertOrderedList: false,
  heading: 'P',
  fontName: 'Times New Roman',
  fontSize: '11',
  indentLeftCm: 0,
  indentRightCm: 0,
  firstLineIndentPt: 0,
  spaceBeforePt: 0,
  spaceAfterPt: 4,
  lineHeight: '1.15',
};

export const DEFAULT_DOC_TITLE = 'Documento sin título';
