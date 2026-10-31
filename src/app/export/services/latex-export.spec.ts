import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { HtmlExportStrategy } from './html-export.strategy';
import { PdfExportStrategy } from './pdf-export.strategy';
import { Block } from '../../core/models/block.model';
import { normalizeLatexFontSize, formatMultiLineLatex } from '../../shared/utils/latex';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ExportService } from './export.service';
import { Note } from '../../core/models/note.model';

interface BlockRenderer { renderBlockToHtml(block: Block): string; }

describe('LaTeX visual export sizing', () => {
  beforeEach(() => TestBed.configureTestingModule({providers:[provideHttpClient(),provideHttpClientTesting()]}));
  it.each([['HTML',()=>TestBed.inject(HtmlExportStrategy),'.latex-box'],['PDF',()=>TestBed.inject(PdfExportStrategy),'.pdf-latex-inner']] as const)(
    'keeps the saved formula size in %s output', (_label,strategy,selector) => {
      const exporter = strategy() as unknown as BlockRenderer;
      const holder = document.createElement('div');
      holder.innerHTML = exporter.renderBlockToHtml({id:'math',type:'latex',order:0,content:{formula:'x^2',fontSizePx:28}});
      expect(holder.querySelector<HTMLElement>(selector)!.style.fontSize).toBe('28px');
      expect(holder.querySelector('.katex')).toBeTruthy();
      holder.innerHTML = exporter.renderBlockToHtml({id:'empty',type:'latex',order:0,content:{formula:''}});
      expect(holder.textContent!.trim()).toBe('');
    },
  );
  it.each([undefined,null,{},'20px; color:red',NaN,Infinity])('uses the compatible default for malformed size %s', value => {
    expect(normalizeLatexFontSize(value)).toBe(11.5);
  });
  it('preserves multiline formatting and leaves empty formulas empty', () => {
    expect(formatMultiLineLatex('')).toBe('');
    expect(formatMultiLineLatex('x=1\ny=2')).toBe('\\begin{gathered}\nx=1 \\\\\ny=2\n\\end{gathered}');
  });

  it.each(['left','center','right','invalid'])( 'exports safe formula alignment %s to HTML and PDF', alignment => {
    for (const strategy of [TestBed.inject(HtmlExportStrategy),TestBed.inject(PdfExportStrategy)]) {
      const exporter = strategy as unknown as BlockRenderer;
      const holder = document.createElement('div');
      holder.innerHTML = exporter.renderBlockToHtml({id:'aligned',type:'latex',order:0,content:{formula:'x^2',alignment}});
      const surface=holder.querySelector<HTMLElement>('.latex-box,.pdf-latex-inner')!;
      expect(surface.style.textAlign).toBe(alignment === 'invalid' ? 'center' : alignment);
      expect(surface.querySelector('.katex')).toBeTruthy();
    }
  });

  it('preserves individual row alignment in HTML and PDF', () => {
    for (const exporter of [TestBed.inject(HtmlExportStrategy), TestBed.inject(PdfExportStrategy)] as unknown as BlockRenderer[]) {
      const holder = document.createElement('div');
      holder.innerHTML = exporter.renderBlockToHtml({id:'rows',type:'latex',order:0,content:{formula:'a=1\nb=2\nc=3',alignByLine:true,alignment:'right',lineAlignments:['left','center',null]}});
      expect(Array.from(holder.querySelectorAll<HTMLElement>('.latex-equation-row')).map(row=>row.style.textAlign)).toEqual(['left','center','right']);
    }
  });

  it('preserves advanced environments and macro definitions instead of inserting artificial line breaks', () => {
    for (const source of ['\\begin{align*}\nx&=1\\\\\ny&=2\n\\end{align*}', '\\newcommand{\\sq}[1]{#1^2}\n\\sq{x}']) {
      expect(formatMultiLineLatex(source)).toBe(source);
    }
  });

  it('preserves advanced block source in HTML without passing document commands to KaTeX', () => {
    const source = '\\documentclass{article}\n<script>alert(1)</script>';
    const exporter = TestBed.inject(HtmlExportStrategy) as unknown as BlockRenderer;
    const holder = document.createElement('div');
    holder.innerHTML = exporter.renderBlockToHtml({id:'document',type:'latex',order:0,content:{formula:source,mode:'document'}});
    expect(holder.querySelector('code')!.textContent).toBe(source);
    expect(holder.querySelector('script')).toBeNull(); expect(holder.querySelector('.katex')).toBeNull();
  });

  it('offers compiled PDF and original source for pure LaTeX and avoids incomplete mixed-document PDFs', async () => {
    const service = TestBed.inject(ExportService);
    expect(service.getAvailableStrategies('latex').map(strategy=>strategy.format)).toEqual(['pdf','tex']);
    const note: Note = {_id:'note',userId:'user',title:'Nota',space:'Research',tags:[],docType:'block',blocks:[{id:'advanced',order:0,type:'latex',content:{mode:'document',formula:'text'}}]};
    await expect(service.exportNote(note,'pdf')).rejects.toThrow('Descarga el PDF de cada bloque');
  });
});
