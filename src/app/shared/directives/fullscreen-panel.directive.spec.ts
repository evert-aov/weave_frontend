import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { FullscreenPanelDirective } from './fullscreen-panel.directive';
@Component({ standalone: true, imports: [FullscreenPanelDirective], template: '<section appFullscreenPanel #panel="fullscreenPanel"><button (click)="panel.toggle()">Pantalla</button><textarea>LaTeX</textarea></section>' })
class Host {}
describe('fullscreen editor panels', () => {
  it('preserves the editor node and content and exits with Escape when native fullscreen is unavailable', async () => {
    const fixture = TestBed.createComponent(Host); fixture.detectChanges();
    const panel = fixture.nativeElement.querySelector('section'); const editor = panel.querySelector('textarea');
    const button = panel.querySelector('button'); button.focus(); editor.value = 'contenido sin guardar';
    button.click(); await fixture.whenStable(); fixture.detectChanges();
    expect(panel.classList.contains('panel-fullscreen')).toBe(true);
    expect(panel.querySelector('textarea')).toBe(editor); expect(editor.value).toBe('contenido sin guardar');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); fixture.detectChanges();
    expect(panel.classList.contains('panel-fullscreen')).toBe(false);
    fixture.destroy();
  });
  it('falls back to window size when the browser rejects fullscreen', async () => {
    const fixture = TestBed.createComponent(Host); fixture.detectChanges();
    const panel = fixture.nativeElement.querySelector('section'); panel.requestFullscreen = vi.fn().mockRejectedValue(new Error('denied'));
    panel.querySelector('button').click(); await fixture.whenStable(); fixture.detectChanges();
    expect(panel.classList.contains('panel-fullscreen')).toBe(true);
    panel.querySelector('button').click(); await fixture.whenStable(); fixture.detectChanges();
    expect(panel.classList.contains('panel-fullscreen')).toBe(false); fixture.destroy();
  });
});
