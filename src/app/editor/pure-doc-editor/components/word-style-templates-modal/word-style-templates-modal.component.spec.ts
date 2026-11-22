import { ComponentFixture, TestBed } from '@angular/core/testing';
import { WordStyleTemplatesModalComponent } from './word-style-templates-modal.component';
import { BUILTIN_STYLE_TEMPLATES } from '../../constants/word-document.constants';
import { StyleTemplate } from '../../models/word-document.model';

describe('WordStyleTemplatesModalComponent', () => {
  let fixture: ComponentFixture<WordStyleTemplatesModalComponent>;
  let component: WordStyleTemplatesModalComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [WordStyleTemplatesModalComponent],
    }).compileComponents();
    fixture = TestBed.createComponent(WordStyleTemplatesModalComponent);
    component = fixture.componentInstance;
    component.isOpen = true;
    component.darkMode = true;
    component.templates = BUILTIN_STYLE_TEMPLATES;
    component.activeTemplateId = BUILTIN_STYLE_TEMPLATES[0].id;
    component.ngOnInit();
    fixture.detectChanges();
  });

  it('creates a brand new custom template from scratch alongside duplicate and saves rule changes', () => {
    const saved: StyleTemplate[] = [];
    component.saveCustomTemplate.subscribe((tpl) => saved.push(tpl));

    component.handleCreateBlankCustomTemplate();
    expect(saved.length).toBe(1);
    expect(saved[0].isCustom).toBe(true);
    expect(saved[0].id).toContain('custom-tpl-');
    expect(saved[0].academicStyle).toBeUndefined();
    expect(component.targetTags).toContain('H6');

    component.draftName.set('Tesis Ingeniería');
    component.updateCurrentRule({ fontFamily: 'Georgia', fontSizePt: 18, bold: true });
    component.handleSaveCustomOnly();

    expect(saved.length).toBe(2);
    expect(saved[1].name).toBe('Tesis Ingeniería');
    expect(saved[1].rules.H1.fontFamily).toBe('Georgia');
    expect(saved[1].rules.H1.fontSizePt).toBe(18);
    expect(component.previewStyle['color']).toBe('#f4f4f5');
    component.updateCurrentRule({ color: '#000000' });
    expect(component.previewStyle['color']).toBe('#f4f4f5');
    component.updateCurrentRule({ color: '#3b82f6' });
    expect(component.previewStyle['color']).toBe('#3b82f6');
  });

  it('edits and saves table rules independently of paragraph/APA rules through the designer', () => {
    const original = structuredClone(component.templates[0]);
    const saved: StyleTemplate[] = [];
    component.saveCustomTemplate.subscribe(t => saved.push(t));
    fixture.nativeElement.querySelector('[data-testid="table-style-tab"]').click();
    fixture.detectChanges();
    const mode: HTMLSelectElement = fixture.nativeElement.querySelector('[data-testid="table-style-mode"]');
    mode.value = 'custom'; mode.dispatchEvent(new Event('change')); fixture.detectChanges();
    const fontSelect: HTMLSelectElement = fixture.nativeElement.querySelector('[data-testid="table-style-fontFamily"]');
    const fontLabels = Array.from(fontSelect.options).map(o => o.textContent?.trim());
    expect(fontLabels).toContain('Arial');
    expect(fontLabels).toContain('Georgia');
    expect(fontLabels).not.toContain('[object Object]');
    fontSelect.value = 'Georgia'; fontSelect.dispatchEvent(new Event('change')); fixture.detectChanges();
    const input: HTMLInputElement = fixture.nativeElement.querySelector('[data-testid="table-style-fontSizePt"]');
    input.value = '10'; input.dispatchEvent(new Event('change')); fixture.detectChanges();
    const previewTable: HTMLTableElement = fixture.nativeElement.querySelector('[data-testid="table-style-preview"] table');
    expect(previewTable.style.fontSize).toBe('10pt');
    expect(previewTable.style.fontFamily).toContain('Georgia');
    component.handleSaveCustomOnly();
    expect(saved[0].tableStyle).toMatchObject({mode:'custom', fontFamily:'Georgia', fontSizePt:10});
    expect(saved[0].rules.P).toEqual(original.rules.P);
    expect(saved[0].academicStyle).toBe(original.academicStyle);
    expect(component.templates[0]).toEqual(original);
    component.handleCreateNewCustomTemplate();
    expect(saved[1].tableStyle).toEqual(saved[0].tableStyle);
    component.handleSelectTemplate(component.templates[1]);
    expect(component.draftTableStyle().mode).toBe('inherit');
  });

  it('applies a fixed design only to a selected table and prevents applying it without a table', () => {
    const applied: unknown[] = [];
    component.applyTableStyleToSelection.subscribe(value => applied.push(value));
    component.editingTables.set(true);
    component.draftTableStyle.update(rule => ({...rule, mode:'custom', headerBackgroundColor:'#166534'}));
    fixture.detectChanges();
    let button: HTMLButtonElement = fixture.nativeElement.querySelector('[data-testid="apply-table-style"]');
    expect(button.disabled).toBe(true);
    component.handleApplyTableOnly(); expect(applied).toHaveLength(0);
    fixture.componentRef.setInput('canApplyTableStyle', true); fixture.detectChanges();
    button = fixture.nativeElement.querySelector('[data-testid="apply-table-style"]');
    button.click();
    expect(applied).toEqual([{rule:component.draftTableStyle(),fixed:true}]);
    component.fixedTableStyle.set(false); component.handleApplyTableOnly();
    expect(applied[1]).toEqual({rule:component.draftTableStyle(),fixed:false});
  });
});
