import { TestBed } from '@angular/core/testing';
import { ExcelFormulasToolbarComponent } from './excel-formulas-toolbar.component';

describe('Excel formulas toolbar', () => {
  async function create() {
    await TestBed.configureTestingModule({ imports: [ExcelFormulasToolbarComponent] }).compileComponents();
    const fixture = TestBed.createComponent(ExcelFormulasToolbarComponent);
    fixture.detectChanges();
    return fixture;
  }

  it('inserts the same logical formula as React and routes library actions separately', async () => {
    const fixture = await create();
    const component = fixture.componentInstance;
    let formula = '';
    let libraryOpens = 0;
    component.insertFormula.subscribe(value => formula = value);
    component.openFunctions.subscribe(() => libraryOpens++);
    const buttons = fixture.nativeElement.querySelectorAll('.formula-group:first-child button') as NodeListOf<HTMLButtonElement>;
    buttons[4].click();
    expect(formula).toBe('=SI(D2>=3000, "Excelente", "Revisar")');
    expect(libraryOpens).toBe(0);
    buttons[2].click();
    expect(libraryOpens).toBe(1);
  });

  it('exposes the four React groups, formula visibility and calculation actions', async () => {
    const fixture = await create();
    const component = fixture.componentInstance;
    expect(fixture.nativeElement.querySelectorAll('.formula-group').length).toBe(4);
    expect(fixture.nativeElement.querySelectorAll('button:disabled').length).toBe(0);
    let toggles = 0;
    let recalculations = 0;
    component.toggleFormulas.subscribe(() => toggles++);
    component.recalculate.subscribe(() => recalculations++);
    const show = fixture.nativeElement.querySelector('[aria-pressed]') as HTMLButtonElement;
    show.click();
    expect(toggles).toBe(1);
    fixture.componentRef.setInput('showFormulas', true);
    fixture.detectChanges();
    expect(show.getAttribute('aria-pressed')).toBe('true');
    const buttons = fixture.nativeElement.querySelectorAll('.formula-group:last-child button') as NodeListOf<HTMLButtonElement>;
    buttons.forEach(button => button.click());
    expect(recalculations).toBe(3);
  });
  it('inserts PMT from the financial control', async () => {
    const fixture = await create();
    let formula = '';
    fixture.componentInstance.insertFormula.subscribe(value => formula = value);
    fixture.componentInstance.run(fixture.componentInstance.library.find(tool => tool.label === 'Financial')!);
    expect(formula).toBe('=PMT(8%/12, 10, 10000)');
  });

});
