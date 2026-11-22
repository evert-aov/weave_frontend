import { ComponentFixture, TestBed } from '@angular/core/testing';
import { WordDesignToolbarComponent } from './word-design-toolbar.component';
import { BUILTIN_STYLE_TEMPLATES, DEFAULT_LAYOUT_CONFIG } from '../../constants/word-document.constants';
import { DocumentLayoutConfig } from '../../models/word-document.model';

describe('WordDesignToolbarComponent', () => {
  let fixture: ComponentFixture<WordDesignToolbarComponent>;
  let component: WordDesignToolbarComponent;

  const baseLayout: DocumentLayoutConfig = {
    ...DEFAULT_LAYOUT_CONFIG,
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [WordDesignToolbarComponent],
    }).compileComponents();
    fixture = TestBed.createComponent(WordDesignToolbarComponent);
    component = fixture.componentInstance;
    component.styleTemplates = BUILTIN_STYLE_TEMPLATES;
    component.activeTemplateId = BUILTIN_STYLE_TEMPLATES[0].id;
    component.layoutConfig = baseLayout;
    component.darkMode = true;
    fixture.detectChanges();
  });

  it('displays Plantillas instead of Efectos and adapts dark ink colors on dark mode miniature cards', () => {
    const text = (fixture.nativeElement as HTMLElement).textContent || '';
    expect(text).toContain('Plantillas');
    expect(text).not.toContain('Efectos');
    expect(component.resolveMiniColor('#000000')).toBe('#e4e4e7');
    expect(component.resolveMiniColor('#000000', true)).toBe('#3b82f6');
    expect(component.resolveMiniColor('#2563eb')).toBe('#2563eb');
  });
});
