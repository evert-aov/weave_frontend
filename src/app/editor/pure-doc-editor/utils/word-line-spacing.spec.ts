import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearNaturalLineHeightCache, materializeWordLineSpacing } from './word-line-spacing';
import { MARGIN_PRESETS } from '../constants/word-document.constants';
afterEach(()=>{vi.restoreAllMocks();document.body.replaceChildren();clearNaturalLineHeightCache();});
describe('native Word spacing',()=>{
  it('uses twice the natural line height, retains the logical multiplier and recalculates after font loading',()=>{
    const root=document.createElement('div');root.className='word-apa-body';root.innerHTML='<p style="font-size:16px;line-height:2">Texto</p>';document.body.append(root);
    const rect=vi.spyOn(HTMLElement.prototype,'getBoundingClientRect').mockReturnValue({height:37} as DOMRect);
    materializeWordLineSpacing(root);const paragraph=root.querySelector('p')!;
    expect(paragraph.dataset['wordLineSpacing']).toBe('2');expect(paragraph.style.lineHeight).toBe('37px');
    materializeWordLineSpacing(root);expect(paragraph.style.lineHeight).toBe('37px');
    clearNaturalLineHeightCache();rect.mockReturnValue({height:39} as DOMRect);
    materializeWordLineSpacing(root);expect(paragraph.style.lineHeight).toBe('39px');
  });
  it('reads all paragraph metrics before writing resolved spacing in a large document',()=>{
    const count=100;
    const root=document.createElement('div');root.innerHTML='<p style="line-height:2">Texto</p>'.repeat(count);document.body.append(root);
    vi.spyOn(HTMLElement.prototype,'getBoundingClientRect').mockReturnValue({height:38} as DOMRect);
    const read=getComputedStyle;
    let reads=0;
    vi.spyOn(window,'getComputedStyle').mockImplementation(element=>{
      if(element.parentElement===root){
        expect(root.querySelector('[data-word-line-spacing]')).toBeNull();
        reads++;
      }
      return read(element);
    });
    expect(materializeWordLineSpacing(root)).toBe(true);
    expect(reads).toBe(count);
    expect(root.querySelectorAll('[data-word-line-spacing="2"]')).toHaveLength(count);
  });
  it('retains explicit fixed spacing and compact table exceptions',()=>{
    const root=document.createElement('div');root.innerHTML='<p style="line-height:24pt">Exacto</p><table><tr><td><p style="line-height:1.1">Tabla</p></td></tr></table>';
    materializeWordLineSpacing(root);expect(root.querySelector('p')?.style.lineHeight).toBe('24pt');expect(root.querySelector('td p')?.getAttribute('data-word-line-spacing')).toBeNull();
  });
  it('stores the actual centimeter values advertised by the margin presets',()=>{
    expect(MARGIN_PRESETS['apa'].topPx).toBe(96);expect(MARGIN_PRESETS['normal'].leftPx).toBe(96);
    expect(MARGIN_PRESETS['narrow'].leftPx).toBe(48);expect(MARGIN_PRESETS['moderate'].leftPx).toBe(72);expect(MARGIN_PRESETS['wide'].leftPx).toBe(192);
  });
});
