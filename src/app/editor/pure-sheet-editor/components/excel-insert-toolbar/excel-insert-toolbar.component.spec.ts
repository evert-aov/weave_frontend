import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ExcelInsertToolbarComponent } from './excel-insert-toolbar.component';
import { ChartCategory, ChartSubType } from '../../models/excel.model';

describe('ExcelInsertToolbarComponent', () => {
  let component: ExcelInsertToolbarComponent;
  let fixture: ComponentFixture<ExcelInsertToolbarComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ExcelInsertToolbarComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(ExcelInsertToolbarComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
    expect(component.openDropdown).toBe('none');
  });

  it('should toggle dropdown menus', () => {
    component.toggleDropdown('column');
    expect(component.openDropdown).toBe('column');

    component.toggleDropdown('column');
    expect(component.openDropdown).toBe('none');

    component.toggleDropdown('pie');
    expect(component.openDropdown).toBe('pie');
  });

  it('should close dropdowns on closeMenus', () => {
    component.toggleDropdown('line');
    expect(component.openDropdown).toBe('line');

    component.closeMenus();
    expect(component.openDropdown).toBe('none');
  });

  it('should emit insertChart when a chart type is selected', () => {
    const emitSpy = vi.spyOn(component.insertChart, 'emit');
    component.handleInsert('column' as ChartCategory, 'clusteredColumn' as ChartSubType);

    expect(emitSpy).toHaveBeenCalledWith({
      category: 'column',
      subType: 'clusteredColumn',
    });
    expect(component.openDropdown).toBe('none');
  });

  it('should emit openAllChartsModal with category and tab', () => {
    const emitSpy = vi.spyOn(component.openAllChartsModal, 'emit');
    component.handleOpenModal('all', 'line' as ChartCategory);

    expect(emitSpy).toHaveBeenCalledWith({
      tab: 'all',
      category: 'line',
    });
    expect(component.openDropdown).toBe('none');
  });

  it('should close dropdown on outside document click', () => {
    component.openDropdown = 'column';
    const dummyElement = document.createElement('div');
    document.body.appendChild(dummyElement);

    const event = new MouseEvent('mousedown', { bubbles: true });
    dummyElement.dispatchEvent(event);

    component.onDocumentClick(event);
    expect(component.openDropdown).toBe('none');

    document.body.removeChild(dummyElement);
  });
});
