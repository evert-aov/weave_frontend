import { Component, EventEmitter, Output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

const MAX_ROWS = 8;
const MAX_COLS = 8;

@Component({
  selector: 'app-word-table-picker',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './word-table-picker.component.html',
  styleUrls: ['./word-table-picker.component.scss'],
})
export class WordTablePickerComponent {
  @Output() selectTable = new EventEmitter<{ rows: number; cols: number }>();
  @Output() close = new EventEmitter<void>();

  readonly rows = Array.from({ length: MAX_ROWS }, (_, rIdx) => rIdx + 1);
  readonly cols = Array.from({ length: MAX_COLS }, (_, cIdx) => cIdx + 1);

  readonly hoverRows = signal<number>(3);
  readonly hoverCols = signal<number>(4);
  readonly customRows = signal<number>(4);
  readonly customCols = signal<number>(4);

  isSelected(c: number, r: number): boolean {
    return r <= this.hoverRows() && c <= this.hoverCols();
  }

  setHover(r: number, c: number): void {
    this.hoverRows.set(r);
    this.hoverCols.set(c);
  }

  onMouseDown(event: MouseEvent): void {
    event.preventDefault();
  }

  onCustomRows(event: Event): void {
    this.customRows.set(Number((event.target as HTMLInputElement).value));
  }

  onCustomCols(event: Event): void {
    this.customCols.set(Number((event.target as HTMLInputElement).value));
  }

  handleCellClick(r: number, c: number): void {
    this.selectTable.emit({ rows: r, cols: c });
    this.close.emit();
  }

  handleCustomInsert(event: Event): void {
    event.preventDefault();
    const r = Math.max(1, Math.min(30, this.customRows()));
    const c = Math.max(1, Math.min(15, this.customCols()));
    this.selectTable.emit({ rows: r, cols: c });
    this.close.emit();
  }
}
