import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ProofreadingDirective } from './proofreading.directive';
import { ProofreadingService } from '../../core/services/proofreading.service';
import { completedWordCorrection, repeatedWord } from '../../core/utils/proofreading';
@Component({ standalone: true, imports: [ProofreadingDirective], template: '<div appProofreading contenteditable="true"><p><b>Texto</b></p><pre>teh </pre></div>' })
class WritingHost {}

describe('Word proofreading', () => {
  beforeEach(() => { globalThis.localStorage?.removeItem('weave_autocorrect'); globalThis.localStorage?.removeItem('weave_writing_language'); });
  afterEach(() => { window.getSelection()?.removeAllRanges(); TestBed.resetTestingModule(); });
  it('corrects Spanish and English typos with capitalization while leaving ambiguous words and URLs alone', () => {
    expect(completedWordCorrection('Informacion ', 'es')?.after).toBe('Información');
    expect(completedWordCorrection('TEH ', 'en')?.after).toBe('THE');
    expect(completedWordCorrection('si ', 'es')).toBeNull();
    expect(completedWordCorrection('constructor ', 'en')).toBeNull();
    expect(completedWordCorrection('teh ', 'es')).toBeNull();
    expect(completedWordCorrection('https://teh ', 'en')).toBeNull();
    expect(repeatedWord('para para ')).toBe('para');
    expect(repeatedWord('para otro ')).toBeNull();
  });
  it('preserves inline formatting and caret, ignores composition/code/paste, and supports reverting after DOM refresh', () => {
    const fixture = TestBed.createComponent(WritingHost); fixture.detectChanges();
    const writing = TestBed.inject(ProofreadingService); writing.setLanguage('en');
    const host = fixture.nativeElement.querySelector('[contenteditable]') as HTMLElement;
    document.body.appendChild(fixture.nativeElement);
    const bold = host.querySelector('b')!;
    const type = (text: Text, options: InputEventInit = {}) => {
      window.getSelection()?.collapse(text, text.length);
      host.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: ' ', ...options }));
    };
    bold.textContent = 'teh '; type(bold.firstChild as Text, { isComposing: true }); expect(bold.textContent).toBe('teh ');
    type(bold.firstChild as Text, { inputType: 'insertFromPaste' }); expect(bold.textContent).toBe('teh ');
    type(bold.firstChild as Text); expect(bold.textContent).toBe('the '); expect(window.getSelection()?.anchorOffset).toBe(4);
    expect(writing.notice()?.kind).toBe('correction');
    host.innerHTML = host.innerHTML; writing.undo(); expect(host.querySelector('b')?.textContent).toBe('teh ');
    const pre = host.querySelector('pre')!; type(pre.firstChild as Text); expect(pre.textContent).toBe('teh ');
    fixture.destroy(); fixture.nativeElement.remove();
  });
  it('reports repeated words without deleting text and respects the autocorrect toggle', () => {
    const fixture = TestBed.createComponent(WritingHost); fixture.detectChanges();
    const writing = TestBed.inject(ProofreadingService); writing.setLanguage('es'); writing.enabled.set(false);
    document.body.appendChild(fixture.nativeElement);
    const host = fixture.nativeElement.querySelector('[contenteditable]') as HTMLElement;
    const bold = host.querySelector('b')!; bold.textContent = 'tambien ';
    window.getSelection()?.collapse(bold.firstChild, 8);
    host.dispatchEvent(new InputEvent('input', { inputType: 'insertText', data: ' ' }));
    expect(bold.textContent).toBe('tambien ');
    bold.textContent = 'para para '; window.getSelection()?.collapse(bold.firstChild, 10);
    host.dispatchEvent(new InputEvent('input', { inputType: 'insertText', data: ' ' }));
    expect(writing.notice()?.kind).toBe('repetition'); expect(bold.textContent).toBe('para para ');
    fixture.destroy(); fixture.nativeElement.remove();
  });
});
