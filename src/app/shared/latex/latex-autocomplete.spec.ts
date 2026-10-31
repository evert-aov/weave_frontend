import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LatexAutocompleteDirective } from './latex-autocomplete.directive';
import { latexCompletionContext } from './latex-completions';

@Component({ standalone: true, imports: [FormsModule, LatexAutocompleteDirective], template: `
  <textarea appLatexAutocomplete [latexDocument]="advanced" [(ngModel)]="value" [readOnly]="readonly"></textarea>
` })
class Host { value = ''; advanced = false; readonly = false; }

describe('shared LaTeX autocomplete', () => {
  let fixture: ComponentFixture<Host>; let area: HTMLTextAreaElement;
  beforeEach(() => { TestBed.configureTestingModule({}); fixture = TestBed.createComponent(Host); fixture.detectChanges(); area = fixture.nativeElement.querySelector('textarea'); });
  afterEach(() => fixture.destroy());
  function input(value: string, position = value.length): void { area.value = value; area.setSelectionRange(position, position); area.dispatchEvent(new Event('input', { bubbles: true })); fixture.detectChanges(); }
  function key(value: string, options = {}): KeyboardEvent { const event = new KeyboardEvent('keydown', { key:value, bubbles:true, cancelable:true, ...options }); area.dispatchEvent(event); fixture.detectChanges(); return event; }
  it('completes \\fr with Tab without losing the surrounding text, then advances through arguments', () => {
    input('a + \\fr + z', 7);
    expect(fixture.nativeElement.querySelector('[role=option]').textContent).toContain('\\frac');
    expect(key('Tab').defaultPrevented).toBe(true);
    expect(fixture.componentInstance.value).toBe('a + \\frac{}{} + z');
    expect(area.selectionStart).toBe(10);
    area.setRangeText('numerator', area.selectionStart, area.selectionEnd, 'end'); area.dispatchEvent(new Event('input',{bubbles:true}));
    key('Tab'); expect(area.selectionStart).toBe(21);
    area.setRangeText('b', area.selectionStart, area.selectionEnd, 'end'); area.dispatchEvent(new Event('input',{bubbles:true}));
    key('Tab'); expect(area.selectionStart).toBe(23);
    expect(key('Tab').defaultPrevented).toBe(false);
  });
  it('uses arrows to choose an environment and supports document-only suggestions', () => {
    fixture.componentInstance.advanced = true; fixture.detectChanges(); input('\\begin{');
    key('ArrowDown'); key('Tab');
    expect(area.value).toContain('\\begin{cases}'); expect(area.value).toContain('\\end{cases}');
    input('\\doc'); expect(fixture.nativeElement.querySelector('[role=listbox]')).toBeTruthy();
    key('Tab'); expect(area.value).toBe('\\documentclass[10pt,a4paper]{article}');
    input('\\begin{cir'); key('Tab');
    expect(area.value).toContain('\\begin{circuitikz}'); expect(area.value).toContain('\\end{circuitikz}');
  });
  it('leaves ordinary Tab, Shift+Tab and composition alone; Escape dismisses suggestions', () => {
    input('plain'); expect(key('Tab').defaultPrevented).toBe(false);
    input('\\fr'); expect(key('Tab', { shiftKey:true }).defaultPrevented).toBe(false);
    expect(key('Tab', { isComposing:true }).defaultPrevented).toBe(false);
    key('Escape'); expect(fixture.nativeElement.querySelector('[role=listbox]')).toBeNull();
    expect(key('Tab').defaultPrevented).toBe(false);
  });
  it('does not suggest in comments, escaped slashes, selections or reading mode', () => {
    expect(latexCompletionContext('% \\fr', 5)).toBeNull();
    expect(latexCompletionContext('\\\\fr', 4)).toBeNull();
    expect(latexCompletionContext('\\fr', 0, 3)).toBeNull();
    expect(latexCompletionContext('\\doc', 4)).toBeNull();
    fixture.componentInstance.readonly = true; fixture.detectChanges(); input('\\fr');
    expect(fixture.nativeElement.querySelector('[role=listbox]')).toBeNull();
  });
  it('removes the popup on blur and destruction', () => {
    input('\\fr'); area.dispatchEvent(new FocusEvent('blur'));
    expect(area.getAttribute('aria-controls')).toBeNull();
    input('\\sq'); fixture.destroy(); expect(document.querySelector('.latex-completion-menu')).toBeNull();
  });
});
