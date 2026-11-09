import { afterEach, describe, expect, it, vi } from 'vitest';
import { snapshotDocxPages } from './docx-live-snapshot';
afterEach(() => { vi.unstubAllGlobals(); document.body.replaceChildren(); });
describe('live DOCX styles', () => {
  it('captures effective cell paragraph styles rather than the overridden inline double spacing', () => {
    const body = document.createElement('div'); body.dataset['pageBodyId']='a'; body.innerHTML='<table><tbody><tr><td><p style="line-height:2">Texto</p></td></tr></tbody></table>'; document.body.append(body);
    const effective = document.createElement('div').style; effective.lineHeight='17.6px'; effective.marginBottom='0px'; effective.fontSize='16px';
    vi.stubGlobal('getComputedStyle', () => effective);
    const result=snapshotDocxPages([{id:'a',html:body.innerHTML}],[body]);
    expect(result[0].html).toContain('line-height: 17.6px');
    expect(body.innerHTML).toContain('line-height:2');
  });
});
