import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Input,
  OnDestroy,
  Output,
  EventEmitter,
  ViewChild,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';

const PX_PER_CM = 96 / 2.54;
const PX_PER_PT = 96 / 72;

export type RulerHandleKind = 'firstLine' | 'leftIndent' | 'rightIndent';

export interface RulerIndentPatch {
  indentLeftCm?: number;
  indentRightCm?: number;
  firstLineIndentPt?: number;
}

@Component({
  selector: 'app-word-interactive-ruler',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
  template: `
    <div
      #track
      class="relative mb-3 h-7 border rounded-xs shadow-2xs select-none shrink-0 no-print transition-colors flex items-end"
      [style.width.px]="scaledWidthPx()"
      [ngClass]="darkMode ? 'bg-[#202024]/95 border-[#323238] text-slate-400' : 'bg-white/95 border-slate-300 text-slate-500'"
      aria-label="Regla horizontal interactiva"
    >
      <!-- Left & Right margin bands -->
      <div
        class="absolute top-0 bottom-0 left-0 pointer-events-none"
        [style.width.px]="marginLeftPx * scale()"
        [ngClass]="darkMode ? 'bg-slate-800/45' : 'bg-slate-200/70'"
      ></div>
      <div
        class="absolute top-0 bottom-0 right-0 pointer-events-none"
        [style.width.px]="marginRightPx * scale()"
        [ngClass]="darkMode ? 'bg-slate-800/45' : 'bg-slate-200/70'"
      ></div>

      <!-- Centimeter scale ticks -->
      @for (cmIdx of rulerTicks; track cmIdx) {
        <div
          [ngClass]="darkMode ? 'border-[#323238]' : 'border-slate-300'"
          class="flex-1 border-l h-2.5 relative flex items-start justify-start pl-0.5 pointer-events-none"
        >
          @if (cmIdx > 0) {
            <span class="text-[8px] font-mono -mt-2.5" [ngClass]="darkMode ? 'text-slate-500' : 'text-slate-400'">{{ cmIdx }}</span>
          }
        </div>
      }

      <!-- Draggable markers (hidden when readOnly) -->
      @if (!readOnly) {
        <!-- First-line / hanging indent marker (top triangle) -->
        <button
          type="button"
          data-ruler-handle="first-line"
          (pointerdown)="startDrag('firstLine', $event)"
          (dblclick)="toggleApaHangingIndent()"
          [style.left.px]="firstLineMarkerPx() - 6"
          class="absolute top-0 w-3 h-3 flex items-start justify-center cursor-ew-resize z-20 p-0 border-0 bg-transparent"
          [title]="'Sangría de primera línea / francesa: ' + (dragPreviewPt() ?? firstLineIndentPt) + 'pt (Doble clic para 36pt APA)'"
          aria-label="Marcador de primera línea"
        >
          <svg class="w-2.5 h-2.5 text-blue-600 drop-shadow-xs" viewBox="0 0 10 10" fill="currentColor" aria-hidden="true">
            <polygon points="1,1 9,1 5,8" />
          </svg>
        </button>

        <!-- Left indent marker (bottom-left triangle + handle) -->
        <button
          type="button"
          data-ruler-handle="left-indent"
          (pointerdown)="startDrag('leftIndent', $event)"
          [style.left.px]="leftMarkerPx() - 6"
          class="absolute bottom-0 w-3 h-3.5 flex items-end justify-center cursor-ew-resize z-20 p-0 border-0 bg-transparent"
          [title]="'Sangría izquierda: ' + (dragPreviewLeftCm() ?? indentLeftCm) + ' cm'"
          aria-label="Marcador de sangría izquierda"
        >
          <svg class="w-2.5 h-3 text-blue-600 drop-shadow-xs" viewBox="0 0 10 12" fill="currentColor" aria-hidden="true">
            <polygon points="5,1 9,6 1,6" />
            <rect x="2" y="7" width="6" height="4" rx="0.5" />
          </svg>
        </button>

        <!-- Right indent marker (bottom-right triangle) -->
        <button
          type="button"
          data-ruler-handle="right-indent"
          (pointerdown)="startDrag('rightIndent', $event)"
          [style.left.px]="rightMarkerPx() - 6"
          class="absolute bottom-0 w-3 h-3 flex items-end justify-center cursor-ew-resize z-20 p-0 border-0 bg-transparent"
          [title]="'Sangría derecha: ' + (dragPreviewRightCm() ?? indentRightCm) + ' cm'"
          aria-label="Marcador de sangría derecha"
        >
          <svg class="w-2.5 h-2.5 text-emerald-600 drop-shadow-xs" viewBox="0 0 10 10" fill="currentColor" aria-hidden="true">
            <polygon points="5,2 9,9 1,9" />
          </svg>
        </button>

        <!-- Quick APA 36pt toggle pill -->
        <button
          type="button"
          data-ruler-apa-btn="true"
          (click)="toggleApaHangingIndent()"
          class="absolute right-1.5 top-1 px-1.5 py-0.5 rounded text-[9px] font-semibold border z-20 transition-colors"
          [ngClass]="firstLineIndentPt === -36 || firstLineIndentPt === 36
            ? 'bg-blue-600 border-blue-600 text-white'
            : (darkMode ? 'bg-[#18181b] border-[#3f3f46] text-slate-300 hover:bg-[#27272a]' : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-100')"
          title="Alternar sangría APA (36pt primera línea / 36pt francesa / 0pt)"
        >
          {{ firstLineIndentPt === -36 ? 'APA -36pt' : firstLineIndentPt === 36 ? 'APA +36pt' : '36pt' }}
        </button>
      }

      @if (draggingKind(); as activeDrag) {
        <div
          class="absolute -top-6 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded bg-slate-900 text-white text-[10px] font-mono shadow-sm pointer-events-none whitespace-nowrap z-30"
        >
          @if (activeDrag === 'firstLine') {
            Primera línea: {{ dragPreviewPt() }}pt
          } @else if (activeDrag === 'leftIndent') {
            Izq: {{ dragPreviewLeftCm() }} cm
          } @else {
            Der: {{ dragPreviewRightCm() }} cm
          }
        </div>
      }
    </div>
  `,
})
export class WordInteractiveRulerComponent implements OnDestroy {
  @Input() darkMode = false;
  @Input() readOnly = false;
  @Input() sheetWidthPx = 816;
  @Input() zoom = 100;
  @Input() marginLeftPx = 96;
  @Input() marginRightPx = 96;
  @Input() indentLeftCm = 0;
  @Input() indentRightCm = 0;
  @Input() firstLineIndentPt = 0;

  @Output() indentChange = new EventEmitter<RulerIndentPatch>();

  @ViewChild('track') trackRef?: ElementRef<HTMLDivElement>;

  readonly rulerTicks = Array.from({ length: 22 }, (_, i) => i);
  readonly draggingKind = signal<RulerHandleKind | null>(null);
  readonly dragPreviewLeftCm = signal<number | null>(null);
  readonly dragPreviewRightCm = signal<number | null>(null);
  readonly dragPreviewPt = signal<number | null>(null);

  private moveListener: ((ev: PointerEvent) => void) | null = null;
  private upListener: ((ev: PointerEvent) => void) | null = null;

  scale(): number {
    return Math.max(0.25, (this.zoom || 100) / 100);
  }

  scaledWidthPx(): number {
    return this.sheetWidthPx * this.scale();
  }

  leftMarkerPx(): number {
    const leftCm = this.dragPreviewLeftCm() ?? (this.indentLeftCm || 0);
    const x = (this.marginLeftPx + leftCm * PX_PER_CM) * this.scale();
    return Math.max(6, Math.min(this.scaledWidthPx() - 24, x));
  }

  firstLineMarkerPx(): number {
    const leftCm = this.dragPreviewLeftCm() ?? (this.indentLeftCm || 0);
    const firstPt = this.dragPreviewPt() ?? (this.firstLineIndentPt || 0);
    const x = (this.marginLeftPx + leftCm * PX_PER_CM + firstPt * PX_PER_PT) * this.scale();
    return Math.max(6, Math.min(this.scaledWidthPx() - 24, x));
  }

  rightMarkerPx(): number {
    const rightCm = this.dragPreviewRightCm() ?? (this.indentRightCm || 0);
    const x = (this.sheetWidthPx - this.marginRightPx - rightCm * PX_PER_CM) * this.scale();
    return Math.max(24, Math.min(this.scaledWidthPx() - 6, x));
  }

  toggleApaHangingIndent(): void {
    if (this.readOnly) return;
    if (this.firstLineIndentPt === 36) {
      // Switch from APA body (36pt) to APA References hanging (-36pt + 1.27cm left)
      this.indentChange.emit({ indentLeftCm: 1.27, firstLineIndentPt: -36 });
    } else if (this.firstLineIndentPt === -36) {
      // Reset to 0
      this.indentChange.emit({ indentLeftCm: 0, firstLineIndentPt: 0 });
    } else {
      // Set APA standard 36pt (0.5 in) first-line indent
      this.indentChange.emit({ indentLeftCm: 0, firstLineIndentPt: 36 });
    }
  }

  startDrag(kind: RulerHandleKind, event: PointerEvent): void {
    if (this.readOnly) return;
    event.preventDefault();
    event.stopPropagation();
    this.cleanupListeners();

    const startX = event.clientX;
    const startLeftCm = this.indentLeftCm || 0;
    const startRightCm = this.indentRightCm || 0;
    const startFirstPt = this.firstLineIndentPt || 0;
    const contentWidthCm = Math.max(2, (this.sheetWidthPx - this.marginLeftPx - this.marginRightPx) / PX_PER_CM - 2);
    const scale = this.scale();

    this.draggingKind.set(kind);
    this.dragPreviewLeftCm.set(startLeftCm);
    this.dragPreviewRightCm.set(startRightCm);
    this.dragPreviewPt.set(startFirstPt);

    const onMove = (ev: PointerEvent) => {
      const dxUnscaled = (ev.clientX - startX) / scale;
      if (kind === 'leftIndent') {
        const nextCm = Math.max(0, Math.min(contentWidthCm, Math.round((startLeftCm + dxUnscaled / PX_PER_CM) * 20) / 20));
        this.dragPreviewLeftCm.set(nextCm);
      } else if (kind === 'rightIndent') {
        const nextCm = Math.max(0, Math.min(contentWidthCm, Math.round((startRightCm - dxUnscaled / PX_PER_CM) * 20) / 20));
        this.dragPreviewRightCm.set(nextCm);
      } else {
        const nextPt = Math.max(-72, Math.min(144, Math.round((startFirstPt + dxUnscaled / PX_PER_PT) / 2) * 2));
        this.dragPreviewPt.set(nextPt);
      }
    };

    const onUp = () => {
      if (kind === 'leftIndent') {
        this.indentChange.emit({ indentLeftCm: this.dragPreviewLeftCm() ?? startLeftCm });
      } else if (kind === 'rightIndent') {
        this.indentChange.emit({ indentRightCm: this.dragPreviewRightCm() ?? startRightCm });
      } else {
        this.indentChange.emit({ firstLineIndentPt: this.dragPreviewPt() ?? startFirstPt });
      }
      this.cleanupListeners();
    };

    this.moveListener = onMove;
    this.upListener = onUp;
    if (typeof window !== 'undefined') {
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp, { once: true });
    }
  }

  private cleanupListeners(): void {
    this.draggingKind.set(null);
    this.dragPreviewLeftCm.set(null);
    this.dragPreviewRightCm.set(null);
    this.dragPreviewPt.set(null);
    if (typeof window !== 'undefined') {
      if (this.moveListener) window.removeEventListener('pointermove', this.moveListener);
      if (this.upListener) window.removeEventListener('pointerup', this.upListener);
    }
    this.moveListener = null;
    this.upListener = null;
  }

  ngOnDestroy(): void {
    this.cleanupListeners();
  }
}
