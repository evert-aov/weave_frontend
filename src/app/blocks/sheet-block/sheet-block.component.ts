import {
  Component,
  Input,
  OnInit,
  OnDestroy,
  inject,
  signal,
  computed,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Block } from '../../core/models/block.model';
import { NotesService } from '../../core/services/notes.service';
import { ThemeService } from '../../core/services/theme.service';
import { I18nService } from '../../core/services/i18n.service';
import { AiDocumentService } from '../../core/services/ai-document.service';
import { sheetAiAdapter } from '../../shared/utils/ai-sheet-adapter';
import { IconComponent } from '../../shared/components/icon/icon.component';
import { CellData, SheetGrid } from '../../editor/pure-sheet-editor/models/excel.model';
import {
  colIndexToLetter,
  evaluateCellValueCached,
  getCellId,
} from '../../editor/pure-sheet-editor/services/formula-engine.service';

const INITIAL_ROWS = 12;
const INITIAL_COLS = 8;

@Component({
  selector: 'app-sheet-block',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './sheet-block.component.html',
  styleUrls: ['./sheet-block.component.scss'],
})
export class SheetBlockComponent implements OnInit, OnDestroy {
  @Input({ required: true }) block!: Block;

  readonly notesService = inject(NotesService);
  readonly themeService = inject(ThemeService);
  readonly i18n = inject(I18nService);
  private readonly aiDocuments = inject(AiDocumentService);

  readonly currentZoom = signal<number>(1.0);
  readonly readingHeight = signal<number>(200);
  readonly Math = Math;

  grid: SheetGrid = {};
  selectedCell: { col: number; row: number } = { col: 0, row: 0 };
  isEditing = false;
  editingValue = '';

  readonly totalRows = INITIAL_ROWS;
  readonly totalCols = INITIAL_COLS;
  readonly colLetters = Array.from({ length: INITIAL_COLS }, (_, i) => colIndexToLetter(i));
  readonly rowIndices = Array.from({ length: INITIAL_ROWS }, (_, i) => i);

  private saveTimeout: any = null;
  private unregisterAi?: () => void;

  ngOnInit(): void {
    this.loadData();
    this.registerAi();
  }

  ngOnDestroy(): void {
    if (this.saveTimeout) clearTimeout(this.saveTimeout);
    this.unregisterAi?.();
  }

  private loadData(): void {
    const raw = this.block.content?.['data'] || this.block.content?.['workbookData']?.data;
    if (raw && typeof raw === 'object') {
      this.grid = { ...raw };
    } else {
      // Default sample table in sheet block
      this.grid = {
        A1: { raw: 'Ítem', style: { bold: true } },
        B1: { raw: 'Cantidad', style: { bold: true, align: 'right' } },
        C1: { raw: 'Precio', style: { bold: true, align: 'right' } },
        D1: { raw: 'Total', style: { bold: true, align: 'right' } },

        A2: { raw: 'Artículo 1' },
        B2: { raw: '3', style: { align: 'right' } },
        C2: { raw: '15', style: { numberFormat: 'currency', align: 'right' } },
        D2: { raw: '=B2*C2', style: { bold: true, numberFormat: 'currency', align: 'right' } },

        A3: { raw: 'Artículo 2' },
        B3: { raw: '5', style: { align: 'right' } },
        C3: { raw: '20', style: { numberFormat: 'currency', align: 'right' } },
        D3: { raw: '=B3*C3', style: { bold: true, numberFormat: 'currency', align: 'right' } },

        A4: { raw: 'TOTAL', style: { bold: true } },
        D4: { raw: '=SUMA(D2:D3)', style: { bold: true, numberFormat: 'currency', align: 'right' } },
      };
    }
  }

  private registerAi(): void {
    this.unregisterAi?.();
    const ownerId = this.notesService.currentNote()?._id;
    this.unregisterAi = this.aiDocuments.register(
      sheetAiAdapter(
        () => ownerId,
        () => ({ data: this.grid }),
        (snapshot) => {
          if (snapshot.data) {
            this.grid = snapshot.data;
            this.scheduleSave();
          }
        },
        () => `block:${this.block.id}:`
      )
    );
  }

  scheduleSave(): void {
    if (this.saveTimeout) clearTimeout(this.saveTimeout);
    this.saveTimeout = setTimeout(() => {
      this.notesService.updateBlockContent(this.block.id, { data: this.grid });
    }, 400);
  }

  private calculationGrid?: SheetGrid;
  private calculationCache = new WeakMap();
  getCellDisplay(col: number, row: number): string {
    if (this.calculationGrid !== this.grid) { this.calculationGrid = this.grid; this.calculationCache = new WeakMap(); }
    const id = getCellId(col, row);
    const cell = this.grid[id];
    const val = evaluateCellValueCached(id, this.grid, this.calculationCache);
    if (val === '' || val === null || val === undefined) return '';

    const num = Number(val);
    if (!isNaN(num) && cell?.style?.numberFormat === 'currency') {
      return '$' + num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    return String(val);
  }

  getCellStyle(col: number, row: number): Record<string, string> {
    const id = getCellId(col, row);
    const s = this.grid[id]?.style;
    return {
      fontWeight: s?.bold ? 'bold' : 'normal',
      fontStyle: s?.italic ? 'italic' : 'normal',
      textAlign: s?.align || 'left',
      backgroundColor: s?.bgColor || '',
      color: s?.textColor || '',
    };
  }

  onCellClick(col: number, row: number): void {
    if (this.notesService.isReadingMode()) return;
    this.selectedCell = { col, row };
  }

  onCellDblClick(col: number, row: number): void {
    if (this.notesService.isReadingMode()) return;
    this.selectedCell = { col, row };
    const id = getCellId(col, row);
    this.editingValue = this.grid[id]?.raw || '';
    this.isEditing = true;
  }

  commitEdit(): void {
    if (!this.isEditing) return;
    this.isEditing = false;
    const id = getCellId(this.selectedCell.col, this.selectedCell.row);
    const val = this.editingValue.trim();

    if (val === '') {
      if (this.grid[id]) this.grid[id] = { ...this.grid[id], raw: '' };
    } else {
      this.grid[id] = {
        ...(this.grid[id] || {}),
        raw: val,
      };
    }
    this.scheduleSave();
  }

  zoomIn(): void {
    this.currentZoom.update((z) => Math.min(Math.round((z + 0.1) * 10) / 10, 2.0));
  }

  zoomOut(): void {
    this.currentZoom.update((z) => Math.max(Math.round((z - 0.1) * 10) / 10, 0.5));
  }

  resetZoom(): void {
    this.currentZoom.set(1.0);
  }
}
