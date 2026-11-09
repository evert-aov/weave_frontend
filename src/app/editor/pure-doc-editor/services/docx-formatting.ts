import { xml } from './docx-package';
export interface DocxRunStyle { font: string; size: number; bold: boolean; italic: boolean; underline: boolean; strike: boolean; color: string; script?: 'superscript' | 'subscript'; transform?: string; }
export function points(value: string): number {
  const n = parseFloat(value); if (!Number.isFinite(n)) return 0;
  return value.endsWith('px') ? n * .75 : value.endsWith('cm') ? n * 72 / 2.54 : value.endsWith('in') ? n * 72 : n;
}
export function runStyle(element: HTMLElement, inherited: DocxRunStyle): DocxRunStyle {
  const style = { ...inherited }, css = element.style;
  if (['B','STRONG'].includes(element.tagName) && css.fontWeight !== 'inherit') style.bold = true;
  if (['I','EM'].includes(element.tagName) && css.fontStyle !== 'inherit') style.italic = true;
  if (['U'].includes(element.tagName)) style.underline = true;
  if (['S','STRIKE','DEL'].includes(element.tagName)) style.strike = true;
  if (element.tagName === 'SUP' || css.verticalAlign === 'super') style.script = 'superscript';
  if (element.tagName === 'SUB' || css.verticalAlign === 'sub') style.script = 'subscript';
  const font = css.fontFamily.replace(/["']/g, '').split(',')[0].trim();
  if (font && !['inherit','initial','unset'].includes(font)) style.font = font;
  if (css.fontSize && !css.fontSize.endsWith('%') && points(css.fontSize)) style.size = points(css.fontSize);
  else if (css.fontSize.endsWith('%')) style.size *= parseFloat(css.fontSize) / 100;
  if (css.fontWeight && !['inherit','unset'].includes(css.fontWeight)) style.bold = css.fontWeight === 'bold' || Number(css.fontWeight) >= 600;
  if (css.fontStyle && !['inherit','unset'].includes(css.fontStyle)) style.italic = css.fontStyle === 'italic';
  if (css.textDecoration.includes('underline')) style.underline = true;
  if (css.textDecoration.includes('line-through')) style.strike = true;
  if (css.textDecoration === 'none') { style.underline = false; style.strike = false; }
  const rgb = css.color.match(/rgba?\(\s*(\d+)[, ]+\s*(\d+)[, ]+\s*(\d+)/i);
  if (rgb) style.color = rgb.slice(1,4).map(v => Number(v).toString(16).padStart(2,'0')).join('');
  else if (/^#[0-9a-f]{6}$/i.test(css.color)) style.color = css.color.slice(1);
  if (css.textTransform && css.textTransform !== 'inherit') style.transform = css.textTransform;
  return style;
}
export function runProperties(style: DocxRunStyle): string {
  return `<w:rFonts w:ascii="${xml(style.font)}" w:hAnsi="${xml(style.font)}"/><w:sz w:val="${Math.round(style.size * 2)}"/><w:color w:val="${style.color}"/><w:b w:val="${style.bold ? 1 : 0}"/><w:i w:val="${style.italic ? 1 : 0}"/>${style.underline ? '<w:u w:val="single"/>' : ''}${style.strike ? '<w:strike/>' : ''}${style.script ? `<w:vertAlign w:val="${style.script}"/>` : ''}`;
}
export function textRun(text: string, style: DocxRunStyle): string {
  if (!text) return '';
  if (style.transform === 'uppercase') text = text.toLocaleUpperCase();
  else if (style.transform === 'lowercase') text = text.toLocaleLowerCase();
  else if (style.transform === 'capitalize') text = text.replace(/(^|[\s\p{P}])(\p{L})/gu, (_, boundary: string, letter: string) => boundary + letter.toLocaleUpperCase());
  return text.split(/(\t|\n)/).map(part => part === '\t' ? '<w:r><w:tab/></w:r>' : part === '\n' ? '<w:r><w:br/></w:r>' : part ? `<w:r><w:rPr>${runProperties(style)}</w:rPr><w:t xml:space="preserve">${xml(part)}</w:t></w:r>` : '').join('');
}
