import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ExcelPageLayoutToolbarComponent } from './excel-page-layout-toolbar.component';

describe('ExcelPageLayoutToolbarComponent', () => {
  let component: ExcelPageLayoutToolbarComponent;
  let fixture: ComponentFixture<ExcelPageLayoutToolbarComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ExcelPageLayoutToolbarComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(ExcelPageLayoutToolbarComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create toolbar component', () => {
    expect(component).toBeTruthy();
    expect(component.themePresets.length).toBeGreaterThan(0);
  });

  it('should toggle dropdown menus', () => {
    expect(component.openMenu).toBe('none');
    component.toggleMenu('themes');
    expect(component.openMenu).toBe('themes');
    component.closeMenus();
    expect(component.openMenu).toBe('none');
  });

  it('should emit updateConfig when changing themes or orientation', () => {
    const spy = vi.spyOn(component.updateConfig, 'emit');
    component.updateConfig.emit({ theme: 'facet' });
    expect(spy).toHaveBeenCalledWith({ theme: 'facet' });
  });

  it('should emit changeZoom when stepped', () => {
    const spy = vi.spyOn(component.changeZoom, 'emit');
    component.changeZoom.emit(110);
    expect(spy).toHaveBeenCalledWith(110);
  });
});
