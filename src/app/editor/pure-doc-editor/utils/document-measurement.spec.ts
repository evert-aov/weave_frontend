import { afterEach, describe, expect, it } from 'vitest';
import { createDocumentMeasurement } from './document-measurement';
afterEach(()=>document.body.replaceChildren());
describe('document measurement context',()=>{
  it('keeps APA paragraph rules, language and spacing while removing fixed geometry and page-note positioning',()=>{
    const body=document.createElement('div');body.className='word-editor-canvas word-apa-body';body.lang='es';body.dataset['pageBodyId']='a';body.style.cssText='height:864px;font-family:serif;font-size:16px;line-height:2;letter-spacing:1px;white-space:normal';
    Object.defineProperty(body,'clientWidth',{value:624});document.body.append(body);
    const measure=createDocumentMeasurement(body);
    expect(measure.classList.contains('word-apa-body')).toBe(true);expect(measure.lang).toBe('es');
    expect(measure.style.width).toBe('624px');expect(measure.style.height).toBe('auto');expect(measure.style.letterSpacing).toBe('1px');
    expect(measure.hasAttribute('data-page-body-id')).toBe(false);expect(measure.style.transform).toBe('');
  });
});
