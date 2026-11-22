import { describe, expect, it, vi } from 'vitest';
import { DomSnapshotCache } from './dom-snapshot-cache';
describe('DOM snapshot cache', () => {
  it('serializes only changed pages and preserves immediate mutations and selection comments', async () => {
    const cache = new DomSnapshotCache();
    const pages = Array.from({length:140}, () => { const p=document.createElement('div');p.innerHTML='<p>Texto</p>';return p; });
    const reads=pages.map(p=>vi.spyOn(p,'innerHTML','get'));
    pages.forEach(p=>cache.read(p));
    for(let i=0;i<20;i++) pages.forEach(p=>cache.read(p));
    expect(reads.reduce((n,r)=>n+r.mock.calls.length,0)).toBe(140);
    pages[60].firstChild!.textContent='Editado';
    expect(cache.read(pages[60])).toContain('Editado');
    pages[60].append(document.createComment('weave-selection-start'));
    expect(cache.read(pages[60])).toContain('<!--weave-selection-start-->');
    pages[60].lastChild!.remove();
    await Promise.resolve();
    expect(cache.read(pages[60])).not.toContain('weave-selection');
    expect(reads[0]).toHaveBeenCalledTimes(1);
    cache.destroy();vi.restoreAllMocks();
  });
  it('releases removed pages and can observe them again',()=>{
    const cache=new DomSnapshotCache(), page=document.createElement('div');
    page.textContent='Antes';cache.read(page);cache.retain([]);
    page.textContent='Después';expect(cache.read(page)).toBe('Después');cache.destroy();
  });
  it('ignores Canvas host attributes but captures child formatting changes',async()=>{
    const cache=new DomSnapshotCache(),page=document.createElement('div');page.innerHTML='<p>Texto</p>';
    const read=vi.spyOn(page,'innerHTML','get');cache.read(page);
    page.classList.add('word-hybrid-source');cache.read(page);
    page.classList.remove('word-hybrid-source');await Promise.resolve();cache.read(page);
    expect(read).toHaveBeenCalledTimes(1);
    page.firstElementChild!.setAttribute('style','font-weight: bold');
    expect(cache.read(page)).toContain('font-weight: bold');expect(read).toHaveBeenCalledTimes(2);
    cache.destroy();vi.restoreAllMocks();
  });
});
