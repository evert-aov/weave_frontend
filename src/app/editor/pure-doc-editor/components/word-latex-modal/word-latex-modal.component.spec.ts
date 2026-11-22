import { ComponentFixture, TestBed } from '@angular/core/testing';
import { WordLatexModalComponent } from './word-latex-modal.component';

describe('WordLatexModalComponent', () => {
  let fixture: ComponentFixture<WordLatexModalComponent>;
  let component: WordLatexModalComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [WordLatexModalComponent],
    }).compileComponents();
    fixture = TestBed.createComponent(WordLatexModalComponent);
    component = fixture.componentInstance;
    component.isOpen = true;
    component.darkMode = true;
    component.ngOnChanges({ isOpen: { currentValue: true, previousValue: false, firstChange: true, isFirstChange: () => true } });
    fixture.detectChanges();
  });

  it('hides raw LaTeX code by default and builds formulas graphically through clickable blocks and symbols', () => {
    const hostEl = fixture.nativeElement as HTMLElement;
    expect(hostEl.querySelector('.latex-textarea')).toBeNull();
    expect(hostEl.querySelector('app-visual-slot-editor')).toBeTruthy();

    component.handleInsertVisualStructure('frac');
    fixture.detectChanges();

    expect(component.latexInput()).toContain('\\frac{a}{b}');
    component.handleInsertVisualSymbol('π');
    expect(component.latexInput()).toContain('\\pi');

    const emitted: string[] = [];
    component.insertFormula.subscribe((val) => emitted.push(val));
    component.handleConfirmInsert();
    expect(emitted[0]).toContain('\\frac');

    component.showRawLatex.set(true);
    fixture.detectChanges();
    expect(hostEl.querySelector('.latex-textarea')).toBeTruthy();
  });
});
