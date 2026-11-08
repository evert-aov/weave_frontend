import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ExcelViewToolbarComponent } from './excel-view-toolbar.component';

describe('ExcelViewToolbarComponent', () => {
  let component: ExcelViewToolbarComponent;
  let fixture: ComponentFixture<ExcelViewToolbarComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ExcelViewToolbarComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(ExcelViewToolbarComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create view toolbar component', () => {
    expect(component).toBeTruthy();
    expect(component.zoom).toBe(100);
  });

  it('should toggle freeze menu', () => {
    expect(component.freezeMenuOpen).toBe(false);
    component.toggleFreezeMenu();
    expect(component.freezeMenuOpen).toBe(true);
  });

  it('should emit freezeTopRow and freezeFirstColumn', () => {
    const spy = vi.spyOn(component.setFreezePanes, 'emit');
    component.freezeTopRow();
    expect(spy).toHaveBeenCalledWith({ rows: 1, cols: 0 });

    component.freezeFirstColumn();
    expect(spy).toHaveBeenCalledWith({ rows: 0, cols: 1 });
  });

  it('should emit unfreezePanes', () => {
    const spy = vi.spyOn(component.unfreezePanes, 'emit');
    component.handleUnfreeze();
    expect(spy).toHaveBeenCalled();
  });
});
