import { Directive, ElementRef, Provider, effect, inject, input } from '@angular/core';
import { injectNgIcons, provideIcons } from '@ng-icons/core';

function normalizeIconKey(name: string): string {
  return name.replace(/^lucide/i, '').replace(/[^a-z0-9]/gi, '').toLowerCase();
}

/**
 * Registra iconos SVG de `@ng-icons/lucide` en el contenedor de `@ng-icons/core`,
 * indexándolos de forma normalizada para aceptar nombres kebab-case y camelCase.
 */
export function provideLucideIcons(icons: Record<string, string>): Provider[] {
  const normalized: Record<string, string> = {};
  for (const [key, svg] of Object.entries(icons)) {
    normalized[key] = svg;
    normalized[normalizeIconKey(key)] = svg;
  }
  return provideIcons(normalized);
}

/**
 * Directiva ligera sobre `svg[lucideIcon]` respaldada por `@ng-icons/core` + `@ng-icons/lucide`.
 * Evita prebundlear los ~1 500 iconos de `@lucide/angular` en desarrollo.
 */
@Directive({
  selector: 'svg[lucideIcon]',
  standalone: true,
})
export class LucideDynamicIcon {
  readonly lucideIcon = input<string>('');
  readonly size = input<number | string>(24);
  readonly strokeWidth = input<number | string>(2);

  private readonly el = inject<ElementRef<SVGSVGElement>>(ElementRef);
  private readonly iconSets = injectNgIcons();

  constructor() {
    effect(() => {
      const svgEl = this.el.nativeElement;
      const iconName = this.lucideIcon();
      const dim = String(this.size());
      const stroke = String(this.strokeWidth());

      svgEl.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      svgEl.setAttribute('viewBox', '0 0 24 24');
      svgEl.setAttribute('width', dim);
      svgEl.setAttribute('height', dim);
      svgEl.setAttribute('fill', 'none');
      svgEl.setAttribute('stroke', 'currentColor');
      svgEl.setAttribute('stroke-width', stroke);
      svgEl.setAttribute('stroke-linecap', 'round');
      svgEl.setAttribute('stroke-linejoin', 'round');
      svgEl.setAttribute('aria-hidden', 'true');

      if (!iconName) {
        svgEl.innerHTML = '';
        return;
      }

      const rawSvg = this.lookup(iconName);
      if (!rawSvg) {
        svgEl.innerHTML = '';
        return;
      }

      const match = rawSvg.match(/<svg[^>]*>([\s\S]*?)<\/svg>/i);
      svgEl.innerHTML = match ? match[1] : rawSvg;
    });
  }

  private lookup(name: string): string | undefined {
    const normalized = normalizeIconKey(name);
    for (let i = this.iconSets.length - 1; i >= 0; i--) {
      const set = this.iconSets[i];
      if (set[name]) return set[name];
      if (set[normalized]) return set[normalized];
    }
    return undefined;
  }
}
