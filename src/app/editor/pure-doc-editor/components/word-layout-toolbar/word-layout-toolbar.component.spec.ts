import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { WordLayoutToolbarComponent } from './word-layout-toolbar.component';
import { DEFAULT_LAYOUT_CONFIG, PAPER_FORMAT_PRESETS } from '../../constants/word-document.constants';
describe('precise APA margin controls',()=>{
  it('shows and reapplies 2.54 cm without rounding it to 2.5',()=>{
    const fixture=TestBed.createComponent(WordLayoutToolbarComponent);
    fixture.componentRef.setInput('layoutConfig',{...DEFAULT_LAYOUT_CONFIG,margins:{topPx:96,rightPx:96,bottomPx:96,leftPx:96,label:'APA 7 · 2,54 cm'}});
    fixture.componentRef.setInput('formats', {});
    fixture.componentRef.setInput('activePaperPreset', PAPER_FORMAT_PRESETS.letter);
    fixture.detectChanges();const toolbar=fixture.componentInstance;
    expect(toolbar.customMarginTopCm()).toBe(2.54);expect(toolbar.customMarginLeftCm()).toBe(2.54);
    let left=0;const subscription=toolbar.updateLayout.subscribe(update=>left=update(DEFAULT_LAYOUT_CONFIG).margins.leftPx);
    toolbar.applyCustomMargins(new Event('submit'));expect(left).toBe(96);
    subscription.unsubscribe();fixture.destroy();TestBed.resetTestingModule();
  });
});
