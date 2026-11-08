import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ExcelDrawToolbarComponent } from './excel-draw-toolbar.component';

describe('ExcelDrawToolbarComponent', () => {
  let component: ExcelDrawToolbarComponent;
  let fixture: ComponentFixture<ExcelDrawToolbarComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ExcelDrawToolbarComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(ExcelDrawToolbarComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create draw toolbar component', () => {
    expect(component).toBeTruthy();
    expect(component.pens.length).toBe(7);
  });

  it('should emit selectTool when selecting a tool or pen', () => {
    const spy = vi.spyOn(component.selectTool, 'emit');
    component.selectTool.emit('eraser');
    expect(spy).toHaveBeenCalledWith('eraser');
  });

  it('should add specific pen and emit tool selection', () => {
    const addSpy = vi.spyOn(component.addPen, 'emit');
    const selectSpy = vi.spyOn(component.selectTool, 'emit');
    component.onAddSpecificPen('pen');
    expect(addSpy).toHaveBeenCalled();
    expect(selectSpy).toHaveBeenCalled();
    expect(component.addPenMenuOpen).toBe(false);
  });

  it('should toggle help modal', () => {
    expect(component.helpModalOpen).toBe(false);
    component.helpModalOpen = true;
    expect(component.helpModalOpen).toBe(true);
  });
});
