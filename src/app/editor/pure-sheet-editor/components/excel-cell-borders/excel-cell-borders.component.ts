import { Component, Input, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CellBorders } from '../../models/excel.model';
import { ThemeService } from '../../../../core/services/theme.service';

@Component({
  selector: 'app-excel-cell-borders',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './excel-cell-borders.component.html',
  styleUrls: ['./excel-cell-borders.component.scss'],
})
export class ExcelCellBordersComponent {
  @Input() borders?: CellBorders;
  @Input() skipTop?: boolean = false;
  @Input() skipLeft?: boolean = false;

  readonly themeService = inject(ThemeService);

  get hasBorders(): boolean {
    if (!this.borders) return false;
    const { top, bottom, left, right } = this.borders;
    return Boolean((top && !this.skipTop) || bottom || (left && !this.skipLeft) || right);
  }

  getBorderStyle(edge: 'top' | 'bottom' | 'left' | 'right'): string {
    if (!this.borders) return 'none';
    if (edge === 'top' && this.skipTop) return 'none';
    if (edge === 'left' && this.skipLeft) return 'none';

    const b = this.borders[edge];
    if (!b) return 'none';

    const color = b.color || '#000000';
    const style = b.style || 'thin';

    switch (style) {
      case 'thick':
        return `3px solid ${color}`;
      case 'medium':
        return `2px solid ${color}`;
      case 'double':
        return `3px double ${color}`;
      case 'dashed':
        return `1px dashed ${color}`;
      case 'dotted':
        return `1px dotted ${color}`;
      case 'thin':
      default:
        return `1px solid ${color}`;
    }
  }
}
