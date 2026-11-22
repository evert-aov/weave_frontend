import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  QueryList,
  SimpleChanges,
  ViewChildren,
} from '@angular/core';
import { BigOpCommand, VisualSlot } from '../../utils/visual-formula-builder';

const BIG_OP_GLYPH: Record<BigOpCommand, string> = {
  '\\sum': '∑',
  '\\prod': '∏',
  '\\int': '∫',
  '\\iint': '∬',
  '\\iiint': '∭',
  '\\oint': '∮',
  '\\lim': 'lim',
};

@Component({
  selector: 'app-visual-slot-editor',
  standalone: true,
  imports: [CommonModule, VisualSlotEditorComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span
      class="vf-slot"
      [class.vf-slot-active]="slot.id === activeSlotId"
      [class.vf-slot-compact]="compact"
      [class.dark-mode]="darkMode"
      (click)="$event.stopPropagation(); slotFocus.emit({ slotId: slot.id })"
    >
      @for (piece of slot.pieces; track piece.id) {
        @switch (piece.kind) {
          @case ('text') {
            <input
              #slotInput
              type="text"
              class="vf-text-input"
              [class.vf-text-compact]="compact"
              [attr.data-slot-id]="slot.id"
              [attr.aria-label]="slot.label"
              [value]="piece.value"
              [placeholder]="slot.pieces.length === 1 ? (slot.placeholder || '...') : ''"
              [style.width.ch]="computeInputWidthCh(piece.value, slot.pieces.length === 1 ? slot.placeholder : '')"
              (focus)="slotFocus.emit({ slotId: slot.id, pieceId: piece.id })"
              (input)="textChange.emit({ slotId: slot.id, pieceId: piece.id, value: $any($event.target).value })"
              (click)="$event.stopPropagation()"
            />
          }

          @case ('frac') {
            <span class="vf-block vf-frac" title="Fracción">
              <button
                type="button"
                class="vf-remove-btn"
                title="Quitar bloque"
                (click)="$event.stopPropagation(); removePiece.emit(piece.id)"
              >×</button>
              <span class="vf-frac-num">
                <app-visual-slot-editor
                  [slot]="piece.num"
                  [activeSlotId]="activeSlotId"
                  [focusRequestId]="focusRequestId"
                  [darkMode]="darkMode"
                  [compact]="true"
                  (slotFocus)="slotFocus.emit($event)"
                  (textChange)="textChange.emit($event)"
                  (removePiece)="removePiece.emit($event)"
                ></app-visual-slot-editor>
              </span>
              <span class="vf-frac-bar"></span>
              <span class="vf-frac-den">
                <app-visual-slot-editor
                  [slot]="piece.den"
                  [activeSlotId]="activeSlotId"
                  [focusRequestId]="focusRequestId"
                  [darkMode]="darkMode"
                  [compact]="true"
                  (slotFocus)="slotFocus.emit($event)"
                  (textChange)="textChange.emit($event)"
                  (removePiece)="removePiece.emit($event)"
                ></app-visual-slot-editor>
              </span>
            </span>
          }

          @case ('sqrt') {
            <span class="vf-block vf-sqrt" title="Raíz">
              <button
                type="button"
                class="vf-remove-btn"
                title="Quitar bloque"
                (click)="$event.stopPropagation(); removePiece.emit(piece.id)"
              >×</button>
              @if (piece.index) {
                <span class="vf-sqrt-index">
                  <app-visual-slot-editor
                    [slot]="piece.index"
                    [activeSlotId]="activeSlotId"
                    [focusRequestId]="focusRequestId"
                    [darkMode]="darkMode"
                    [compact]="true"
                    (slotFocus)="slotFocus.emit($event)"
                    (textChange)="textChange.emit($event)"
                    (removePiece)="removePiece.emit($event)"
                  ></app-visual-slot-editor>
                </span>
              }
              <span class="vf-sqrt-sign">√</span>
              <span class="vf-sqrt-body">
                <app-visual-slot-editor
                  [slot]="piece.body"
                  [activeSlotId]="activeSlotId"
                  [focusRequestId]="focusRequestId"
                  [darkMode]="darkMode"
                  [compact]="compact"
                  (slotFocus)="slotFocus.emit($event)"
                  (textChange)="textChange.emit($event)"
                  (removePiece)="removePiece.emit($event)"
                ></app-visual-slot-editor>
              </span>
            </span>
          }

          @case ('script') {
            <span class="vf-block vf-script" title="Subíndice / Superíndice">
              <button
                type="button"
                class="vf-remove-btn"
                title="Quitar bloque"
                (click)="$event.stopPropagation(); removePiece.emit(piece.id)"
              >×</button>
              <app-visual-slot-editor
                [slot]="piece.base"
                [activeSlotId]="activeSlotId"
                [focusRequestId]="focusRequestId"
                [darkMode]="darkMode"
                [compact]="compact"
                (slotFocus)="slotFocus.emit($event)"
                (textChange)="textChange.emit($event)"
                (removePiece)="removePiece.emit($event)"
              ></app-visual-slot-editor>
              <span class="vf-scripts-stack">
                @if (piece.sup) {
                  <span class="vf-sup">
                    <app-visual-slot-editor
                      [slot]="piece.sup"
                      [activeSlotId]="activeSlotId"
                      [focusRequestId]="focusRequestId"
                      [darkMode]="darkMode"
                      [compact]="true"
                      (slotFocus)="slotFocus.emit($event)"
                      (textChange)="textChange.emit($event)"
                      (removePiece)="removePiece.emit($event)"
                    ></app-visual-slot-editor>
                  </span>
                }
                @if (piece.sub) {
                  <span class="vf-sub">
                    <app-visual-slot-editor
                      [slot]="piece.sub"
                      [activeSlotId]="activeSlotId"
                      [focusRequestId]="focusRequestId"
                      [darkMode]="darkMode"
                      [compact]="true"
                      (slotFocus)="slotFocus.emit($event)"
                      (textChange)="textChange.emit($event)"
                      (removePiece)="removePiece.emit($event)"
                    ></app-visual-slot-editor>
                  </span>
                }
              </span>
            </span>
          }

          @case ('bigop') {
            <span class="vf-block vf-bigop" title="Operador matemático">
              <button
                type="button"
                class="vf-remove-btn"
                title="Quitar bloque"
                (click)="$event.stopPropagation(); removePiece.emit(piece.id)"
              >×</button>
              <span class="vf-bigop-core">
                @if (piece.upper) {
                  <span class="vf-bigop-bound">
                    <app-visual-slot-editor
                      [slot]="piece.upper"
                      [activeSlotId]="activeSlotId"
                      [focusRequestId]="focusRequestId"
                      [darkMode]="darkMode"
                      [compact]="true"
                      (slotFocus)="slotFocus.emit($event)"
                      (textChange)="textChange.emit($event)"
                      (removePiece)="removePiece.emit($event)"
                    ></app-visual-slot-editor>
                  </span>
                }
                <span class="vf-bigop-symbol" [class.vf-bigop-text]="isLimitOp(piece.op)">
                  {{ bigOpGlyph(piece.op) }}
                </span>
                @if (piece.lower) {
                  <span class="vf-bigop-bound">
                    <app-visual-slot-editor
                      [slot]="piece.lower"
                      [activeSlotId]="activeSlotId"
                      [focusRequestId]="focusRequestId"
                      [darkMode]="darkMode"
                      [compact]="true"
                      (slotFocus)="slotFocus.emit($event)"
                      (textChange)="textChange.emit($event)"
                      (removePiece)="removePiece.emit($event)"
                    ></app-visual-slot-editor>
                  </span>
                }
              </span>
              <app-visual-slot-editor
                [slot]="piece.body"
                [activeSlotId]="activeSlotId"
                [focusRequestId]="focusRequestId"
                [darkMode]="darkMode"
                [compact]="compact"
                (slotFocus)="slotFocus.emit($event)"
                (textChange)="textChange.emit($event)"
                (removePiece)="removePiece.emit($event)"
              ></app-visual-slot-editor>
            </span>
          }

          @case ('group') {
            <span class="vf-block vf-group" title="Agrupador">
              <button
                type="button"
                class="vf-remove-btn"
                title="Quitar bloque"
                (click)="$event.stopPropagation(); removePiece.emit(piece.id)"
              >×</button>
              <span class="vf-delim">{{ cleanDelim(piece.open) }}</span>
              <app-visual-slot-editor
                [slot]="piece.body"
                [activeSlotId]="activeSlotId"
                [focusRequestId]="focusRequestId"
                [darkMode]="darkMode"
                [compact]="compact"
                (slotFocus)="slotFocus.emit($event)"
                (textChange)="textChange.emit($event)"
                (removePiece)="removePiece.emit($event)"
              ></app-visual-slot-editor>
              <span class="vf-delim">{{ cleanDelim(piece.close) }}</span>
            </span>
          }

          @case ('matrix') {
            <span class="vf-block vf-matrix" title="Matriz / Sistema">
              <button
                type="button"
                class="vf-remove-btn"
                title="Quitar bloque"
                (click)="$event.stopPropagation(); removePiece.emit(piece.id)"
              >×</button>
              <span class="vf-matrix-delim">{{ matrixOpenDelim(piece.env) }}</span>
              <span class="vf-matrix-grid">
                @for (row of piece.rows; track $index) {
                  <span class="vf-matrix-row">
                    @for (cell of row; track cell.id) {
                      <span class="vf-matrix-cell">
                        <app-visual-slot-editor
                          [slot]="cell"
                          [activeSlotId]="activeSlotId"
                          [focusRequestId]="focusRequestId"
                          [darkMode]="darkMode"
                          [compact]="true"
                          (slotFocus)="slotFocus.emit($event)"
                          (textChange)="textChange.emit($event)"
                          (removePiece)="removePiece.emit($event)"
                        ></app-visual-slot-editor>
                      </span>
                    }
                  </span>
                }
              </span>
              @if (piece.env !== 'cases') {
                <span class="vf-matrix-delim">{{ matrixCloseDelim(piece.env) }}</span>
              }
            </span>
          }
        }
      }
    </span>
  `,
  styles: [`
    :host {
      display: inline-flex;
      align-items: center;
    }
    .vf-slot {
      display: inline-flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 3px;
      padding: 2px 4px;
      border-radius: 6px;
      border: 1px dashed transparent;
      min-height: 28px;
      transition: border-color 0.15s ease, background-color 0.15s ease;
    }
    .vf-slot-compact {
      min-height: 22px;
      padding: 1px 3px;
    }
    .vf-slot-active {
      border-color: #3b82f6;
      background: rgba(59, 130, 246, 0.08);
    }
    .vf-text-input {
      background: #f8fafc;
      border: 1px solid #cbd5e1;
      border-radius: 5px;
      padding: 2px 6px;
      font-family: 'Times New Roman', Cambria, Georgia, serif;
      font-size: 16px;
      color: #0f172a;
      min-width: 34px;
      max-width: 280px;
      outline: none;
      text-align: center;
      transition: border-color 0.12s ease, box-shadow 0.12s ease;
    }
    .vf-text-input:focus {
      border-color: #2563eb;
      box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.2);
    }
    .vf-text-compact {
      font-size: 13px;
      padding: 1px 4px;
      min-width: 26px;
    }
    .vf-block {
      position: relative;
      display: inline-flex;
      align-items: center;
      gap: 2px;
      padding: 4px 6px;
      border-radius: 8px;
      border: 1px solid #e2e8f0;
      background: rgba(248, 250, 252, 0.7);
    }
    .vf-remove-btn {
      position: absolute;
      top: -6px;
      right: -6px;
      width: 15px;
      height: 15px;
      border-radius: 9999px;
      border: none;
      background: #ef4444;
      color: #ffffff;
      font-size: 10px;
      line-height: 1;
      display: none;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      z-index: 2;
    }
    .vf-block:hover > .vf-remove-btn {
      display: inline-flex;
    }
    .vf-frac {
      flex-direction: column;
      align-items: center;
      gap: 3px;
    }
    .vf-frac-bar {
      width: 100%;
      min-width: 36px;
      height: 1.5px;
      background: #1e293b;
      border-radius: 1px;
    }
    .vf-sqrt {
      align-items: center;
      gap: 2px;
    }
    .vf-sqrt-index {
      align-self: flex-start;
      transform: translateY(-4px);
    }
    .vf-sqrt-sign {
      font-size: 20px;
      line-height: 1;
      font-family: serif;
      color: #1e293b;
    }
    .vf-sqrt-body {
      border-top: 1.5px solid #1e293b;
      padding-top: 2px;
    }
    .vf-script {
      align-items: center;
    }
    .vf-scripts-stack {
      display: inline-flex;
      flex-direction: column;
      justify-content: space-between;
      gap: 2px;
    }
    .vf-sup {
      transform: translateY(-6px);
    }
    .vf-sub {
      transform: translateY(6px);
    }
    .vf-bigop {
      align-items: center;
      gap: 6px;
    }
    .vf-bigop-core {
      display: inline-flex;
      flex-direction: column;
      align-items: center;
      gap: 2px;
    }
    .vf-bigop-symbol {
      font-size: 22px;
      line-height: 1;
      font-family: serif;
      color: #1e293b;
    }
    .vf-bigop-symbol.vf-bigop-text {
      font-size: 14px;
      font-weight: 600;
    }
    .vf-delim, .vf-matrix-delim {
      font-size: 22px;
      font-weight: 300;
      color: #475569;
      font-family: serif;
      line-height: 1;
    }
    .vf-matrix-grid {
      display: inline-flex;
      flex-direction: column;
      gap: 4px;
    }
    .vf-matrix-row {
      display: inline-flex;
      gap: 4px;
    }
    .vf-matrix-cell {
      display: inline-flex;
      padding: 1px;
      border-radius: 4px;
    }
    .vf-slot.dark-mode .vf-text-input {
      background: #141416;
      border-color: #3f3f46;
      color: #f4f4f5;
    }
    .vf-slot.dark-mode .vf-text-input:focus {
      border-color: #3b82f6;
      box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.25);
    }
    .vf-slot.dark-mode .vf-block {
      background: #202024;
      border-color: #323238;
    }
    .vf-slot.dark-mode .vf-frac-bar {
      background: #e4e4e7;
    }
    .vf-slot.dark-mode .vf-sqrt-sign,
    .vf-slot.dark-mode .vf-bigop-symbol {
      color: #f4f4f5;
    }
    .vf-slot.dark-mode .vf-sqrt-body {
      border-top-color: #e4e4e7;
    }
    .vf-slot.dark-mode .vf-delim,
    .vf-slot.dark-mode .vf-matrix-delim {
      color: #a1a1aa;
    }
  `],
})
export class VisualSlotEditorComponent implements OnChanges {
  @Input({ required: true }) slot!: VisualSlot;
  @Input() activeSlotId = '';
  @Input() focusRequestId: string | null = null;
  @Input() darkMode = false;
  @Input() compact = false;

  @Output() slotFocus = new EventEmitter<{ slotId: string; pieceId?: string }>();
  @Output() textChange = new EventEmitter<{ slotId: string; pieceId: string; value: string }>();
  @Output() removePiece = new EventEmitter<string>();

  @ViewChildren('slotInput') slotInputs?: QueryList<ElementRef<HTMLInputElement>>;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['focusRequestId'] && this.focusRequestId && this.focusRequestId === this.slot.id) {
      setTimeout(() => {
        const match = this.slotInputs?.find(
          (el) => el.nativeElement.getAttribute('data-slot-id') === this.slot.id
        );
        match?.nativeElement.focus();
      }, 15);
    }
  }

  computeInputWidthCh(val: string, placeholder?: string): number {
    const len = Math.max(val?.length || 0, placeholder?.length || 0);
    return Math.min(28, Math.max(4, len + 1.5));
  }

  bigOpGlyph(op: BigOpCommand): string {
    return BIG_OP_GLYPH[op] || op;
  }

  isLimitOp(op: BigOpCommand): boolean {
    return op === '\\lim';
  }

  cleanDelim(delim: string): string {
    return delim.replace('\\', '');
  }

  matrixOpenDelim(env: string): string {
    if (env === 'bmatrix') return '[';
    if (env === 'vmatrix') return '|';
    if (env === 'cases') return '{';
    return '(';
  }

  matrixCloseDelim(env: string): string {
    if (env === 'bmatrix') return ']';
    if (env === 'vmatrix') return '|';
    if (env === 'cases') return '';
    return ')';
  }
}
