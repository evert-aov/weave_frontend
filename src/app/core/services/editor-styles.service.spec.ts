import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EditorStylesService } from './editor-styles.service';

describe('on-demand editor styles', () => {
  let service: EditorStylesService;
  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(EditorStylesService);
  });
  afterEach(() => {
    document.head.querySelectorAll('link[href$="pptx-angular-viewer.css"]').forEach(link => link.remove());
  });

  it('does not add a stylesheet before opening a tool and deduplicates concurrent loads', async () => {
    expect(document.head.querySelectorAll('link[href$="pptx-angular-viewer.css"]').length).toBe(0);
    const first = service.load('pptx-angular-viewer.css');
    const second = service.load('pptx-angular-viewer.css');
    expect(first).toBe(second);
    const links = document.head.querySelectorAll('link[href$="pptx-angular-viewer.css"]');
    expect(links.length).toBe(1);
    links[0].dispatchEvent(new Event('load'));
    await expect(first).resolves.toBeUndefined();
  });

  it('allows retrying a failed stylesheet request', async () => {
    const first = service.load('pptx-angular-viewer.css');
    const rejected = expect(first).rejects.toThrow('Editor stylesheet');
    document.head.querySelector('link[href$="pptx-angular-viewer.css"]')!.dispatchEvent(new Event('error'));
    await rejected;
    const retry = service.load('pptx-angular-viewer.css');
    expect(retry).not.toBe(first);
    document.head.querySelector('link[href$="pptx-angular-viewer.css"]')!.dispatchEvent(new Event('load'));
    await retry;
  });
});
