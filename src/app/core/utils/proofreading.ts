export type WritingLanguage = 'es' | 'en';

// Solo erratas frecuentes inequívocas. Palabras ambiguas (si/sí, esta/está) se dejan al usuario.
const CORRECTIONS: Record<WritingLanguage, Record<string, string>> = {
  es: {
    tambien: 'también', ademas: 'además', informacion: 'información', configuracion: 'configuración',
    numeracion: 'numeración', capitulo: 'capítulo', capitulos: 'capítulos', grafico: 'gráfico', graficos: 'gráficos',
    ortografia: 'ortografía', correccion: 'corrección', autocorreccion: 'autocorrección', ingles: 'inglés',
    espanol: 'español', funcion: 'función', seleccion: 'selección', importacion: 'importación',
    exportacion: 'exportación', modificacion: 'modificación', parrafo: 'párrafo', parrafos: 'párrafos',
    bibliografia: 'bibliografía', bibliograficas: 'bibliográficas', tipografia: 'tipografía',
    documentoos: 'documentos', nesecito: 'necesito', nesesito: 'necesito', exelente: 'excelente',
    redimencionar: 'redimensionar', convinacion: 'combinación', complatibles: 'compatibles',
  },
  en: {
    teh: 'the', recieve: 'receive', recieved: 'received', seperate: 'separate', seperated: 'separated',
    definately: 'definitely', occured: 'occurred', occuring: 'occurring', untill: 'until',
    wich: 'which', becuase: 'because', adress: 'address', enviroment: 'environment',
    goverment: 'government', acheive: 'achieve', acheived: 'achieved', begining: 'beginning',
    belive: 'believe', diferent: 'different', succesful: 'successful', sucess: 'success',
    writting: 'writing', langauge: 'language', documment: 'document', referance: 'reference',
  },
};
export interface WordCorrection { start: number; before: string; after: string; }
export function completedWordCorrection(text: string, language: WritingLanguage): WordCorrection | null {
  const match = /(\p{L}+)([.,!?;:]?\s)$/u.exec(text);
  if (!match || (match.index > 0 && !/\s/.test(text[match.index - 1]))) return null;
  const before = match[1];
  const key = before.toLocaleLowerCase(language);
  if (!Object.hasOwn(CORRECTIONS[language], key)) return null;
  const replacement = CORRECTIONS[language][key];
  const after = before === before.toLocaleUpperCase(language) ? replacement.toLocaleUpperCase(language)
    : /^\p{Lu}/u.test(before) ? replacement[0].toLocaleUpperCase(language) + replacement.slice(1) : replacement;
  return { start: match.index, before, after };
}
export function repeatedWord(text: string): string | null {
  return /(?:^|\s)(\p{L}{2,})\s+\1[.,!?;:]?\s$/iu.exec(text)?.[1] ?? null;
}
