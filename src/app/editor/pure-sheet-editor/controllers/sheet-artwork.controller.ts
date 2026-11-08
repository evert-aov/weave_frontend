import type { SheetEditorHooks } from './sheet-editor-hooks';
import { DrawToolId, InkStroke } from '../models/excel.model';
import { FloatingArtwork } from '../models/excel.model';
import { InkPenConfig } from '../models/excel.model';
import type { PureSheetEditorComponent } from '../pure-sheet-editor.component';

type SheetArtworkControllerHost = Pick<PureSheetEditorComponent,
  | 'activeDrawTool'
  | 'activeSheet'
  | 'iconsPickerOpen'
  | 'inkColor'
  | 'inkLayer'
  | 'inkPens'
  | 'inkToShape'
  | 'inkWidth'
  | 'isReplaying'
  | 'replayStrokeCount'
  | 'scheduleAutoSave'
  | 'selectedArtworkId'
  | 'selectedChartId'
  | 'shapesPickerOpen'>;
type SheetArtworkControllerHooks = Pick<SheetEditorHooks,
  | 'pushUndoSnapshot'>;

/** Artwork behavior scoped to one editor instance. */
export class SheetArtworkController {
  constructor(private readonly editor: SheetArtworkControllerHost, private readonly hooks: SheetArtworkControllerHooks) {}

  get currentInkPen(): InkPenConfig | undefined {
    const pen = this.editor.inkPens.find(pen => pen.id === this.editor.activeDrawTool);
    return pen ? { ...pen, color: this.editor.inkColor, strokeWidth: this.editor.inkWidth } : undefined;
  }

  addInkPen(pen: InkPenConfig): void { this.editor.inkPens = [...this.editor.inkPens, pen]; this.setDrawTool(pen.id); }

  commitInkStrokes(strokes: InkStroke[]): void {
    this.hooks.pushUndoSnapshot(); this.editor.activeSheet.inkStrokes = strokes; this.editor.scheduleAutoSave();
  }

  selectInk(): void { this.editor.selectedArtworkId = null; this.editor.selectedChartId = null; }

  private inkReplayTimer?: ReturnType<typeof setInterval>;

  get displayedInkStrokes(): InkStroke[] {
    const strokes = this.editor.activeSheet.inkStrokes || [];
    return this.editor.replayStrokeCount === null ? strokes : strokes.slice(0, this.editor.replayStrokeCount);
  }

  stopInkReplay(): void {
    if (this.inkReplayTimer) clearInterval(this.inkReplayTimer);
    this.inkReplayTimer = undefined; this.editor.replayStrokeCount = null; this.editor.isReplaying = false;
  }

  insertArtwork(kind: 'shape' | 'icon', itemId: string): void {
    this.hooks.pushUndoSnapshot();
    const item: FloatingArtwork = { id: `artwork-${crypto.randomUUID()}`, kind, itemId, x: 100, y: 80, width: kind === 'icon' ? 80 : 160, height: kind === 'icon' ? 80 : 100 };
    this.editor.activeSheet.artwork = [...(this.editor.activeSheet.artwork || []), item];
    this.editor.selectedArtworkId = item.id;
    this.editor.selectedChartId = null;
    this.editor.shapesPickerOpen = false; this.editor.iconsPickerOpen = false;
    this.editor.scheduleAutoSave();
  }

  beginArtworkChange(): void { this.hooks.pushUndoSnapshot(); }

  updateArtwork(item: FloatingArtwork, geometry: Pick<FloatingArtwork, 'x' | 'y' | 'width' | 'height'>): void { Object.assign(item, geometry); }

  finishArtworkChange(): void { this.editor.scheduleAutoSave(); }

  removeArtwork(id: string): void {
    this.hooks.pushUndoSnapshot();
    this.editor.activeSheet.artwork = this.editor.activeSheet.artwork?.filter(item => item.id !== id);
    this.editor.selectedArtworkId = null; this.editor.scheduleAutoSave();
  }

  handleToggleInkToShape(): void {
    this.editor.inkToShape = !this.editor.inkToShape;
  }

  handleReplayInk(): void {
    const count = this.editor.activeSheet.inkStrokes?.length || 0;
    if (!count || this.editor.isReplaying) return;
    this.editor.isReplaying = true; this.editor.replayStrokeCount = 0;
    this.inkReplayTimer = setInterval(() => {
      this.editor.replayStrokeCount = (this.editor.replayStrokeCount || 0) + 1;
      if (this.editor.replayStrokeCount >= count) this.stopInkReplay();
    }, 300);
  }

  handleDeleteStroke(strokeId: string): void {
    if (!this.editor.activeSheet.inkStrokes) return;
    this.hooks.pushUndoSnapshot();
    this.editor.activeSheet.inkStrokes = this.editor.activeSheet.inkStrokes.filter((s: InkStroke) => s.id !== strokeId);
    this.editor.scheduleAutoSave();
  }

  handleClearDrawings(): void {
    this.stopInkReplay();
    this.hooks.pushUndoSnapshot();
    this.editor.activeSheet.inkStrokes = [];
    this.editor.scheduleAutoSave();
  }

  setDrawTool(tool: DrawToolId): void {
    this.editor.activeDrawTool = tool;
    const pen = this.editor.inkPens.find(pen => pen.id === tool);
    if (pen) { this.editor.inkColor = pen.color; this.editor.inkWidth = pen.strokeWidth; }
    this.editor.inkLayer?.clearSelection();
  }

  setInkColor(color: string): void {
    this.editor.inkColor = color;
  }

  setInkWidth(width: number): void {
    this.editor.inkWidth = width;
  }
}
