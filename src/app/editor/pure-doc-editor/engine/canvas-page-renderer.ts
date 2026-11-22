import type { DocumentPosition, DocumentState } from './document-model';
import type { ApaPageConfig, PageBorderConfig } from '../models/word-document.model';
import { resolvePageDynamicTokens } from '../utils/page-section-layout';

export interface RegionRichRun {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  color?: string;
}

export interface RegionRichLine {
  align?: 'left' | 'center' | 'right';
  runs: readonly RegionRichRun[];
}

export interface ActiveRegionEditDecoration {
  zone: 'header' | 'footer';
  lines: readonly RegionRichLine[];
  cursor: { lineIndex: number; charOffset: number };
  selectionAnchor?: { lineIndex: number; charOffset: number };
}

export interface PageDecoration {
  border?: PageBorderConfig;
  watermarkText?: string;
  showLineNumbers?: boolean;
  pageIndex: number;
  totalPages: number;
  geometry: { top: number; right: number; bottom: number; left: number };
  apa?: ApaPageConfig;
  showHeaderFooter?: boolean;
  suppressHeaderFooter?: boolean;
  formattedPageNumber?: string;
  formattedTotalPages?: string;
  headerText?: string;
  footerText?: string;
  headerLines?: readonly RegionRichLine[];
  footerLines?: readonly RegionRichLine[];
  activeRegionEdit?: ActiveRegionEditDecoration;
  pageLabel?: string;
  ofLabel?: string;
  darkSheet?: boolean;
  showTableGridlines?: boolean;
}
export interface TextShadowStyle {
  offsetX: number;
  offsetY: number;
  blur: number;
  color: string;
}

export interface TextStrokeStyle {
  width: number;
  color?: string;
}

/** Coordinate system: unzoomed CSS pixels. Layout and editing remain separate. */
export type PageDrawCommand =
  | {
      kind: 'text';
      text: string;
      x: number;
      y: number;
      font: string;
      color: string;
      textShadow?: TextShadowStyle;
      textStroke?: TextStrokeStyle;
      advanceWidth?: number;
      source?: { start: DocumentPosition; end: DocumentPosition; top: number; width: number; height: number };
    }
  | { kind: 'image'; nodeId?: string; assetId: string; x: number; y: number; width: number; height: number }
  | { kind: 'rect'; nodeId?: string; x: number; y: number; width: number; height: number; color: string };
export interface PageSelectionRect {
  x: number;
  top: number;
  width: number;
  height: number;
}

export interface CanvasTableColumnBorder {
  x: number;
  top: number;
  bottom: number;
  columnIndex: number;
}

export interface CanvasTableRowBorder {
  y: number;
  left: number;
  right: number;
  rowIndex: number;
  rowId?: string;
  rowHeight: number;
}

export interface CanvasTableLayout {
  tableId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  columns: readonly number[];
  columnWidthsPct: readonly number[];
  rowHeights: readonly number[];
  colBorders: readonly CanvasTableColumnBorder[];
  rowBorders: readonly CanvasTableRowBorder[];
}

export interface PdfInternalLinkRect {
  x: number;
  y: number;
  width: number;
  height: number;
  targetPageIndex: number;
  title?: string;
}

export interface PdfOutlineHeading {
  title: string;
  level: number;
  pageIndex: number;
}

export interface PageDisplayList {
  id: string;
  revision: number;
  width: number;
  height: number;
  commands: readonly PageDrawCommand[];
  document?: DocumentState;
  assets?: ReadonlyMap<string, CanvasImageSource>;
  caret?: { x: number; top: number; height: number; visible?: boolean };
  selections?: readonly PageSelectionRect[];
  searchHighlights?: readonly PageSelectionRect[];
  activeSearchHighlight?: PageSelectionRect;
  backgroundColor?: string;
  decorations?: PageDecoration;
  tables?: readonly CanvasTableLayout[];
  pdfLinks?: readonly PdfInternalLinkRect[];
  pdfHeadings?: readonly PdfOutlineHeading[];
}

/** Canvas backend for the hybrid engine. The caller supplies already laid out content. */
export class CanvasPageRenderer {
  render(canvas: HTMLCanvasElement, page: PageDisplayList, zoom = 1, pixelRatio = window.devicePixelRatio || 1): void {
    if (![page.width, page.height, zoom, pixelRatio].every(value => Number.isFinite(value) && value > 0)) {
      throw new Error('Invalid page geometry');
    }
    for (const command of page.commands) if (command.kind === 'image' && !page.assets?.has(command.assetId)) throw new Error(`Missing image asset: ${command.assetId}`);
    const context = canvas.getContext('2d');
    if (!context) return;
    const scale = zoom * pixelRatio;
    const width = Math.ceil(page.width * scale), height = Math.ceil(page.height * scale);
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    canvas.style.width = `${page.width * zoom}px`;
    canvas.style.height = `${page.height * zoom}px`;
    context.setTransform(scale, 0, 0, scale, 0, 0);
    context.fillStyle = page.backgroundColor || (page.decorations?.darkSheet ? '#18181b' : '#fff');
    context.fillRect(0, 0, page.width, page.height);
    context.save();
    context.beginPath(); context.rect(0, 0, page.width, page.height); context.clip();
    if (page.decorations) this.renderDecorations(context, page, page.decorations);
    const isBackgroundRect = (cmd: PageDrawCommand): boolean =>
      cmd.kind === 'rect' && cmd.width > 4 && cmd.height > 4;
    const isTransparentColor = (raw: string | undefined): boolean => {
      const c = raw?.trim().toLowerCase();
      return !c || ['transparent', 'none', 'inherit', 'initial', 'unset', 'revert', 'auto', 'window', 'rgba(0, 0, 0, 0)', 'rgba(0,0,0,0)'].includes(c);
    };
    // 1) Draw cell/paragraph background fills BEFORE selection & search highlights so highlights remain visible inside table cells
    for (const command of page.commands) {
      if (command.kind === 'rect' && isBackgroundRect(command) && !isTransparentColor(command.color)) {
        context.fillStyle = command.color;
        context.fillRect(command.x, command.y, command.width, command.height);
      }
    }
    if (page.decorations?.showTableGridlines && page.tables?.length) {
      this.renderTableGridlines(context, page.tables, Boolean(page.decorations.darkSheet), zoom);
    }
    if (page.searchHighlights?.length) {
      context.fillStyle = 'rgba(250, 204, 21, 0.38)';
      for (const rect of page.searchHighlights) {
        if (rect.width > 0 && rect.height > 0) context.fillRect(rect.x, rect.top, rect.width, rect.height);
      }
    }
    if (page.activeSearchHighlight && page.activeSearchHighlight.width > 0 && page.activeSearchHighlight.height > 0) {
      const a = page.activeSearchHighlight;
      context.fillStyle = 'rgba(249, 115, 22, 0.45)';
      context.fillRect(a.x, a.top, a.width, a.height);
      context.save();
      context.strokeStyle = '#ea580c';
      context.lineWidth = 1.5;
      context.strokeRect(a.x, a.top, a.width, a.height);
      context.restore();
    }
    if (page.selections?.length) {
      context.fillStyle = 'rgba(37, 99, 235, 0.22)';
      for (const rect of page.selections) {
        if (rect.width > 0 && rect.height > 0) context.fillRect(rect.x, rect.top, rect.width, rect.height);
      }
    }
    context.textBaseline = 'alphabetic';
    let lastFont = '';
    let lastFillStyle = '';
    for (const command of page.commands) {
      if (command.kind === 'rect' && isBackgroundRect(command)) continue;
      if (command.kind === 'image') {
        const asset = page.assets?.get(command.assetId);
        if (!asset) throw new Error(`Missing image asset: ${command.assetId}`);
        context.drawImage(asset, command.x, command.y, command.width, command.height);
        continue;
      }
      if (command.kind === 'text') {
        if (command.text) {
          const textToDraw =
            page.decorations && command.text.includes('{{')
              ? resolvePageDynamicTokens(
                  command.text,
                  page.decorations.formattedPageNumber || String(page.decorations.pageIndex + 1),
                  page.decorations.formattedTotalPages || String(page.decorations.totalPages),
                )
              : command.text;
          if (command.textShadow || command.textStroke) {
            context.save();
            context.font = command.font;
            context.fillStyle = command.color;
            if (command.textShadow) {
              context.shadowOffsetX = command.textShadow.offsetX;
              context.shadowOffsetY = command.textShadow.offsetY;
              context.shadowBlur = command.textShadow.blur;
              context.shadowColor = command.textShadow.color;
            }
            context.fillText(textToDraw, command.x, command.y);
            if (command.textStroke && command.textStroke.width > 0) {
              context.shadowColor = 'transparent';
              context.shadowBlur = 0;
              context.shadowOffsetX = 0;
              context.shadowOffsetY = 0;
              context.lineWidth = command.textStroke.width;
              context.strokeStyle = command.textStroke.color || command.color;
              context.strokeText(textToDraw, command.x, command.y);
            }
            context.restore();
            lastFont = '';
            lastFillStyle = '';
          } else {
            if (command.color !== lastFillStyle) {
              context.fillStyle = command.color;
              lastFillStyle = command.color;
            }
            if (command.font !== lastFont) {
              context.font = command.font;
              lastFont = command.font;
            }
            context.fillText(textToDraw, command.x, command.y);
          }
        }
      } else {
        const c = command.color?.trim().toLowerCase();
        if (c && !['transparent', 'none', 'inherit', 'initial', 'unset', 'revert', 'auto', 'window', 'rgba(0, 0, 0, 0)', 'rgba(0,0,0,0)'].includes(c)) {
          if (command.color !== lastFillStyle) {
            context.fillStyle = command.color;
            lastFillStyle = command.color;
          }
          context.fillRect(command.x, command.y, command.width, command.height);
        }
      }
    }
    if (page.caret && page.caret.visible !== false) {
      context.fillStyle = '#2563eb';
      context.fillRect(page.caret.x, page.caret.top, 1, page.caret.height);
    }
    context.restore();
  }

  private renderDecorations(context: CanvasRenderingContext2D, page: PageDisplayList, d: PageDecoration): void {
    const geom = d.geometry;
    // 1. Watermark (underneath body text)
    if (d.watermarkText) {
      context.save();
      context.translate(page.width / 2, page.height / 2);
      context.rotate(-Math.PI / 4);
      context.fillStyle = d.darkSheet ? 'rgba(148, 163, 184, 0.16)' : 'rgba(100, 116, 139, 0.16)';
      context.font = 'bold 58px sans-serif';
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText(d.watermarkText.toUpperCase(), 0, 0);
      context.restore();
    }

    // 2. Line numbers gutter
    if (d.showLineNumbers) {
      const gutterRight = Math.max(12, geom.left - 26) + 24;
      context.save();
      context.strokeStyle = d.darkSheet ? '#334155' : '#e2e8f0';
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(gutterRight, geom.top);
      context.lineTo(gutterRight, page.height - geom.bottom);
      context.stroke();
      context.fillStyle = d.darkSheet ? '#64748b' : '#cbd5e1';
      context.font = '9px monospace';
      context.textAlign = 'right';
      context.textBaseline = 'top';
      const lineStep = 18;
      for (let i = 0; i < 42; i++) {
        const y = geom.top + i * lineStep;
        if (y + lineStep > page.height - geom.bottom) break;
        context.fillText(String(d.pageIndex * 42 + i + 1), gutterRight - 6, y);
      }
      context.restore();
    }

    // 3. Page border
    if (d.border && d.border.style !== 'none') {
      const b = d.border;
      const offset = Math.max(0, b.offsetPx || 0);
      const baseW = Math.max(1, (b.widthPt || 1) * (96 / 72));
      const strokeW = b.style === 'thick' ? Math.max(3, baseW * 2) : baseW;
      const x1 = offset;
      const y1 = offset;
      const x2 = page.width - offset;
      const y2 = page.height - offset;
      context.save();
      context.strokeStyle = b.color || '#1e293b';
      context.lineWidth = strokeW;
      if (b.style === 'dashed' && typeof context.setLineDash === 'function') {
        context.setLineDash([8, 5]);
      } else if (b.style === 'dotted' && typeof context.setLineDash === 'function') {
        context.setLineDash([2, 3]);
      }
      const drawSides = (pad: number) => {
        context.beginPath();
        if (b.top) { context.moveTo(x1 + pad, y1 + pad); context.lineTo(x2 - pad, y1 + pad); }
        if (b.bottom) { context.moveTo(x1 + pad, y2 - pad); context.lineTo(x2 - pad, y2 - pad); }
        if (b.left) { context.moveTo(x1 + pad, y1 + pad); context.lineTo(x1 + pad, y2 - pad); }
        if (b.right) { context.moveTo(x2 - pad, y1 + pad); context.lineTo(x2 - pad, y2 - pad); }
        context.stroke();
      };
      drawSides(0);
      if (b.style === 'double') {
        context.lineWidth = Math.max(1, strokeW * 0.7);
        drawSides(Math.max(3, strokeW * 2));
      }
      context.restore();
    }

    // 4. APA running head + page number OR standard header/footer
    const formattedPage = d.formattedPageNumber || String(d.pageIndex + 1);
    const formattedTotal = d.formattedTotalPages || String(d.totalPages);
    const resolveLines = (lines?: readonly RegionRichLine[]): readonly RegionRichLine[] | undefined =>
      lines?.map(line => ({
        ...line,
        runs: line.runs.map(run =>
          run.text.includes('{{')
            ? { ...run, text: resolvePageDynamicTokens(run.text, formattedPage, formattedTotal) }
            : run,
        ),
      }));

    if (d.apa) {
      if (!d.suppressHeaderFooter) {
        const apa = d.apa;
        const fontPx = Math.round((apa.fontSizePt * 96 / 72) * 100) / 100;
        context.save();
        context.fillStyle = '#000000';
        context.font = `${fontPx}px "${apa.fontFamily || 'Times New Roman'}"`;
        context.textBaseline = 'top';
        if (apa.mode === 'professional' && apa.runningHead) {
          context.textAlign = 'left';
          context.fillText(apa.runningHead, geom.left, 48);
        }
        context.textAlign = 'right';
        context.fillText(formattedPage, page.width - geom.right, 48);
        context.restore();
      }
    } else if ((!d.suppressHeaderFooter && d.showHeaderFooter) || d.activeRegionEdit) {
      const muted = d.darkSheet ? '#94a3b8' : '#64748b';
      context.save();
      context.fillStyle = muted;
      context.font = '12px sans-serif';
      context.textBaseline = 'top';
      const headerY = Math.max(18, geom.top - 26);
      const rightEdge = page.width - geom.right;
      const activeEdit = d.activeRegionEdit;
      const resolvedHeaderLines = resolveLines(d.headerLines);
      const resolvedHeaderText = d.headerText ? resolvePageDynamicTokens(d.headerText, formattedPage, formattedTotal) : d.headerText;
      if (activeEdit?.zone === 'header') {
        this.drawActiveRegionEditor(
          context,
          activeEdit,
          geom.left,
          rightEdge,
          headerY,
          muted,
          'Escribir encabezado…',
        );
      } else if (resolvedHeaderLines?.length) {
        this.drawRegionLines(context, resolvedHeaderLines, geom.left, rightEdge, headerY, muted);
      } else if (resolvedHeaderText) {
        context.textAlign = 'left';
        context.fillText(resolvedHeaderText, geom.left, headerY);
      }
      const footerY = page.height - Math.max(24, geom.bottom - 14);
      const pageNumLabel = d.suppressHeaderFooter
        ? ''
        : `${d.pageLabel || 'Página'} ${formattedPage} ${d.ofLabel || 'de'} ${formattedTotal}`;
      context.font = '11px monospace';
      const pageNumWidth = pageNumLabel ? this.measureRegionWidth(context, pageNumLabel, 6.6) + 12 : 0;
      const resolvedFooterLines = resolveLines(d.footerLines);
      const resolvedFooterText = d.footerText ? resolvePageDynamicTokens(d.footerText, formattedPage, formattedTotal) : d.footerText;
      if (activeEdit?.zone === 'footer') {
        this.drawActiveRegionEditor(
          context,
          activeEdit,
          geom.left,
          rightEdge,
          footerY,
          muted,
          'Escribir pie de página…',
          pageNumWidth,
        );
      } else if (resolvedFooterLines?.length) {
        this.drawRegionLines(context, resolvedFooterLines, geom.left, rightEdge, footerY, muted, pageNumWidth);
      } else if (resolvedFooterText) {
        context.font = '12px sans-serif';
        context.fillStyle = muted;
        context.textAlign = 'left';
        context.fillText(resolvedFooterText, geom.left, footerY);
      }
      if (pageNumLabel) {
        context.textAlign = 'right';
        context.font = '11px monospace';
        context.fillStyle = d.darkSheet ? '#64748b' : '#94a3b8';
        context.fillText(pageNumLabel, rightEdge, footerY);
      }
      context.restore();
    }
  }

  private drawActiveRegionEditor(
    context: CanvasRenderingContext2D,
    edit: ActiveRegionEditDecoration,
    left: number,
    right: number,
    y: number,
    defaultColor: string,
    placeholder: string,
    reserveRightPx = 0,
  ): void {
    const maxLines = 2;
    const lineHeight = 14;
    const boxWidth = Math.max(80, right - left - reserveRightPx);
    const boxHeight = Math.max(22, Math.min(maxLines, edit.lines.length || 1) * lineHeight + 6);

    context.save();
    context.fillStyle = 'rgba(239, 246, 255, 0.35)';
    context.fillRect(left - 4, y - 3, boxWidth + 8, boxHeight);
    context.strokeStyle = '#3b82f6';
    context.lineWidth = 1;
    context.setLineDash([4, 3]);
    context.strokeRect(left - 4, y - 3, boxWidth + 8, boxHeight);
    context.setLineDash([]);

    const hasContent = edit.lines.some((l) => l.runs.some((r) => r.text.length > 0));
    if (!hasContent) {
      context.font = '12px sans-serif';
      context.fillStyle = '#94a3b8';
      context.textAlign = 'left';
      context.fillText(placeholder, left, y);
      context.fillStyle = '#2563eb';
      context.fillRect(left, y, 1.5, 13);
      context.restore();
      return;
    }

    const lineStartXs: number[] = [];
    const maxRight = Math.max(left + 40, right - reserveRightPx);
    const lineBoxWidth = Math.max(40, right - left);
    for (let i = 0; i < Math.min(edit.lines.length, maxLines); i++) {
      const line = edit.lines[i];
      const measuredW = line.runs.reduce((sum, run) => {
        context.font = `${run.italic ? 'italic ' : ''}${run.bold ? 'bold ' : ''}12px sans-serif`;
        return sum + this.measureRegionWidth(context, run.text);
      }, 0);
      let startX = left;
      if (line.align === 'center') {
        startX = Math.min(Math.max(left, left + (lineBoxWidth - measuredW) / 2), Math.max(left, maxRight - measuredW));
      } else if (line.align === 'right') {
        startX = Math.max(left, maxRight - measuredW);
      }
      lineStartXs.push(startX);
    }

    const measureCharX = (lineIdx: number, charOffset: number): number => {
      const line = edit.lines[lineIdx];
      let startX = lineStartXs[lineIdx] ?? left;
      if (!line) return startX;
      let remaining = charOffset;
      for (const run of line.runs) {
        if (remaining <= 0) break;
        const slice = run.text.slice(0, remaining);
        context.font = `${run.italic ? 'italic ' : ''}${run.bold ? 'bold ' : ''}12px sans-serif`;
        startX += this.measureRegionWidth(context, slice);
        remaining -= slice.length;
      }
      return startX;
    };

    if (edit.selectionAnchor) {
      const a = edit.selectionAnchor;
      const b = edit.cursor;
      const forward = a.lineIndex < b.lineIndex || (a.lineIndex === b.lineIndex && a.charOffset <= b.charOffset);
      const start = forward ? a : b;
      const end = forward ? b : a;
      if (start.lineIndex !== end.lineIndex || start.charOffset !== end.charOffset) {
        context.fillStyle = 'rgba(59, 130, 246, 0.25)';
        for (let li = start.lineIndex; li <= Math.min(end.lineIndex, maxLines - 1); li++) {
          const lineLen = edit.lines[li]?.runs.reduce((s, r) => s + r.text.length, 0) || 0;
          const x0 = measureCharX(li, li === start.lineIndex ? start.charOffset : 0);
          const x1 = measureCharX(li, li === end.lineIndex ? end.charOffset : lineLen);
          context.fillRect(x0, y + li * lineHeight, Math.max(2, x1 - x0), 13);
        }
      }
    }

    this.drawRegionLines(context, edit.lines, left, right, y, defaultColor, reserveRightPx);

    const cLine = Math.min(edit.cursor.lineIndex, maxLines - 1);
    const caretX = measureCharX(cLine, edit.cursor.charOffset);
    context.fillStyle = '#2563eb';
    context.fillRect(caretX, y + cLine * lineHeight, 1.5, 13);
    context.restore();
  }

  private measureRegionWidth(context: CanvasRenderingContext2D, text: string, fallbackCharWidth = 6.5): number {
    if (!text) return 0;
    return typeof context.measureText === 'function' ? context.measureText(text).width : text.length * fallbackCharWidth;
  }

  private drawRegionLines(
    context: CanvasRenderingContext2D,
    lines: readonly RegionRichLine[],
    left: number,
    right: number,
    y: number,
    defaultColor: string,
    reserveRightPx = 0,
  ): void {
    const maxLines = 2;
    const lineHeight = 14;
    const boxWidth = Math.max(40, right - left);
    const maxRight = Math.max(left + 40, right - reserveRightPx);
    for (let i = 0; i < Math.min(lines.length, maxLines); i++) {
      const line = lines[i];
      if (!line.runs.length) continue;
      const measured = line.runs.map(run => {
        const font = `${run.italic ? 'italic ' : ''}${run.bold ? 'bold ' : ''}12px sans-serif`;
        context.font = font;
        const width = this.measureRegionWidth(context, run.text);
        return { run, font, width };
      });
      const totalWidth = measured.reduce((sum, m) => sum + m.width, 0);
      let cursorX = left;
      if (line.align === 'center') {
        cursorX = Math.min(Math.max(left, left + (boxWidth - totalWidth) / 2), Math.max(left, maxRight - totalWidth));
      } else if (line.align === 'right') {
        cursorX = Math.max(left, maxRight - totalWidth);
      }
      const lineY = y + i * lineHeight;
      context.textAlign = 'left';
      for (const item of measured) {
        if (!item.run.text) continue;
        const color = item.run.color || defaultColor;
        context.font = item.font;
        context.fillStyle = color;
        context.fillText(item.run.text, cursorX, lineY);
        if (item.run.underline) {
          context.fillRect(cursorX, lineY + 12, item.width, 1);
        }
        cursorX += item.width;
      }
    }
  }

  private renderTableGridlines(
    context: CanvasRenderingContext2D,
    tables: readonly CanvasTableLayout[],
    darkSheet: boolean,
    zoom = 1,
  ): void {
    const safeZoom = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
    context.save();
    context.strokeStyle = darkSheet ? 'rgba(148, 163, 184, 0.36)' : 'rgba(100, 116, 139, 0.34)';
    context.lineWidth = Math.max(0.45, Math.min(0.9, 0.85 / safeZoom));
    context.setLineDash([3 / safeZoom, 2.5 / safeZoom]);
    for (const tbl of tables) {
      if (tbl.width <= 0 || tbl.height <= 0) continue;
      context.beginPath();
      context.rect(Math.round(tbl.x) + 0.5, Math.round(tbl.y) + 0.5, tbl.width, tbl.height);
      const rightEdge = tbl.x + tbl.width - 0.5;
      const bottomEdge = tbl.y + tbl.height - 0.5;
      for (const cb of tbl.colBorders) {
        if (cb.x < rightEdge && cb.bottom > cb.top) {
          const lineX = Math.round(cb.x) + 0.5;
          context.moveTo(lineX, cb.top);
          context.lineTo(lineX, cb.bottom);
        }
      }
      for (const rb of tbl.rowBorders) {
        if (rb.y < bottomEdge && rb.right > rb.left) {
          const lineY = Math.round(rb.y) + 0.5;
          context.moveTo(rb.left, lineY);
          context.lineTo(rb.right, lineY);
        }
      }
      context.stroke();
    }
    context.restore();
  }
}
