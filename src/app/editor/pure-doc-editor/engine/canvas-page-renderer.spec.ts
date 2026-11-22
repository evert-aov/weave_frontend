import { describe,it,expect,vi } from 'vitest';
import { CanvasPageRenderer } from './canvas-page-renderer';
import { buildDomDisplayList } from './dom-page-display-list';
describe('hybrid Canvas backend',()=>{
  it('scales the backing buffer independently of page geometry and clips drawing',()=>{
    const context={setTransform:vi.fn(),fillRect:vi.fn(),save:vi.fn(),restore:vi.fn(),beginPath:vi.fn(),rect:vi.fn(),clip:vi.fn(),fillText:vi.fn()};
    const canvas=document.createElement('canvas');vi.spyOn(canvas,'getContext').mockReturnValue(context as unknown as CanvasRenderingContext2D);
    new CanvasPageRenderer().render(canvas,{id:'p',revision:1,width:600,height:800,commands:[{kind:'text',text:'áé Texto',x:20,y:40,font:'16px serif',color:'#000'}]},1,2);
    expect(canvas.width).toBe(1200);expect(canvas.height).toBe(1600);expect(canvas.style.width).toBe('600px');
    expect(context.setTransform).toHaveBeenCalledWith(2,0,0,2,0,0);
    expect(context.rect).toHaveBeenCalledWith(0,0,600,800);
    expect(context.fillText).toHaveBeenCalledWith('áé Texto',20,40);expect(context.restore).toHaveBeenCalled();
  });
  it('draws resolved image resources and rejects missing assets before painting',()=>{
    const context={setTransform:vi.fn(),fillRect:vi.fn(),save:vi.fn(),restore:vi.fn(),beginPath:vi.fn(),rect:vi.fn(),clip:vi.fn(),drawImage:vi.fn()};
    const canvas=document.createElement('canvas');vi.spyOn(canvas,'getContext').mockReturnValue(context as unknown as CanvasRenderingContext2D);
    const asset=document.createElement('canvas');
    const page={id:'p',revision:1,width:100,height:100,commands:[{kind:'image' as const,assetId:'photo',x:10,y:20,width:30,height:40}]};
    expect(()=>new CanvasPageRenderer().render(canvas,page)).toThrow('Missing image asset');expect(context.fillRect).not.toHaveBeenCalled();
    new CanvasPageRenderer().render(canvas,{...page,assets:new Map([['photo',asset]])});
    expect(context.drawImage).toHaveBeenCalledWith(asset,10,20,30,40);
  });
  it('rejects invalid geometry instead of allocating a broken buffer',()=>{
    expect(()=>new CanvasPageRenderer().render(document.createElement('canvas'),{id:'p',revision:0,width:NaN,height:800,commands:[]})).toThrow('Invalid page geometry');
  });
  it('keeps DOM fallback for unmeasurable pages',()=>{
    const body=document.createElement('div');body.innerHTML='<table><tr><td>Contenido</td></tr></table>';
    const before=body.innerHTML;expect(buildDomDisplayList(body,1)).toBeNull();expect(body.innerHTML).toBe(before);
  });
  it('draws native page decorations: watermark, borders, APA running head, and header/footer',()=>{
    const calls: string[] = [];
    const context={
      setTransform:vi.fn(),fillRect:vi.fn(),save:vi.fn(),restore:vi.fn(),beginPath:vi.fn(),
      rect:vi.fn(),clip:vi.fn(),translate:vi.fn(),rotate:vi.fn(),setLineDash:vi.fn(),
      moveTo:vi.fn(),lineTo:vi.fn(),stroke:vi.fn(),
      fillText:vi.fn((text:string)=>{calls.push(text);}),
    };
    const canvas=document.createElement('canvas');vi.spyOn(canvas,'getContext').mockReturnValue(context as unknown as CanvasRenderingContext2D);
    new CanvasPageRenderer().render(canvas,{
      id:'p1',revision:1,width:600,height:800,commands:[],
      decorations:{
        watermarkText:'borrador',
        border:{style:'solid',color:'#1e293b',widthPt:1,offsetPx:16,top:true,right:true,bottom:true,left:true},
        showLineNumbers:true,
        pageIndex:1,totalPages:3,
        geometry:{top:72,right:72,bottom:72,left:72},
        apa:{mode:'professional',runningHead:'TITULO CORTO',fontFamily:'Times New Roman',fontSizePt:12},
        showHeaderFooter:true,
        headerText:'Encabezado personalizado',
        footerText:'Pie personalizado',
        pageLabel:'Página',
        ofLabel:'de',
      },
    },1,1);
    expect(calls).toContain('BORRADOR');
    expect(calls).toContain('TITULO CORTO');
    expect(calls).toContain('2');
    expect(context.stroke).toHaveBeenCalled();

    calls.length = 0;
    new CanvasPageRenderer().render(canvas,{
      id:'p2',revision:1,width:600,height:800,commands:[],
      decorations:{
        pageIndex:0,totalPages:2,
        geometry:{top:72,right:72,bottom:72,left:72},
        showHeaderFooter:true,
        headerText:'Encabezado libre',
        footerText:'Pie libre',
        pageLabel:'Página',
        ofLabel:'de',
      },
    },1,1);
    expect(calls).toContain('Encabezado libre');
    expect(calls).toContain('Pie libre');
    expect(calls).toContain('Página 1 de 2');
  });
  it('draws textShadow and textStroke effects onto the 2D canvas context',()=>{
    const observed: { shadowColor?: string; shadowBlur?: number; strokeStyle?: string; lineWidth?: number } = {};
    const context = {
      setTransform: vi.fn(),
      fillRect: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      beginPath: vi.fn(),
      rect: vi.fn(),
      clip: vi.fn(),
      fillText: vi.fn(() => {
        observed.shadowColor = context.shadowColor;
        observed.shadowBlur = context.shadowBlur;
      }),
      strokeText: vi.fn(() => {
        observed.strokeStyle = context.strokeStyle;
        observed.lineWidth = context.lineWidth;
      }),
      shadowColor: 'transparent',
      shadowBlur: 0,
      shadowOffsetX: 0,
      shadowOffsetY: 0,
      strokeStyle: '#000',
      lineWidth: 1,
      lineJoin: 'miter',
    };
    const canvas = document.createElement('canvas');
    vi.spyOn(canvas, 'getContext').mockReturnValue(context as unknown as CanvasRenderingContext2D);
    new CanvasPageRenderer().render(canvas, {
      id: 'fx',
      revision: 1,
      width: 400,
      height: 300,
      commands: [{
        kind: 'text',
        text: 'Efecto',
        x: 30,
        y: 60,
        font: 'bold 18px sans-serif',
        color: '#1d4ed8',
        textShadow: { offsetX: 2, offsetY: 3, blur: 4, color: 'rgba(15,23,42,0.4)' },
        textStroke: { width: 1.5, color: '#0f172a' },
      }],
    }, 1, 1);
    expect(context.fillText).toHaveBeenCalledWith('Efecto', 30, 60);
    expect(context.strokeText).toHaveBeenCalledWith('Efecto', 30, 60);
    expect(observed.shadowColor).toBe('rgba(15,23,42,0.4)');
    expect(observed.shadowBlur).toBe(4);
    expect(observed.strokeStyle).toBe('#0f172a');
    expect(observed.lineWidth).toBe(1.5);
  });

  it('renders rich headerLines and footerLines with alignment, font weight/style, color, and underline', () => {
    const drawn: { text: string; x: number; font: string; fillStyle: string }[] = [];
    const context = {
      setTransform: vi.fn(),
      fillRect: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      beginPath: vi.fn(),
      rect: vi.fn(),
      clip: vi.fn(),
      font: '12px sans-serif',
      fillStyle: '#000',
      measureText: vi.fn((text: string) => ({ width: text.length * 7 })),
      fillText: vi.fn(function (this: { font: string; fillStyle: string }, text: string, x: number) {
        drawn.push({ text, x, font: this.font, fillStyle: this.fillStyle });
      }),
    };
    const canvas = document.createElement('canvas');
    vi.spyOn(canvas, 'getContext').mockReturnValue(context as unknown as CanvasRenderingContext2D);
    new CanvasPageRenderer().render(canvas, {
      id: 'rich-hf',
      revision: 1,
      width: 600,
      height: 800,
      commands: [],
      decorations: {
        pageIndex: 0,
        totalPages: 2,
        geometry: { top: 72, right: 72, bottom: 72, left: 72 },
        showHeaderFooter: true,
        headerLines: [{
          align: 'center',
          runs: [
            { text: 'Informe ', bold: true, color: '#1d4ed8' },
            { text: 'Anual', italic: true, underline: true },
          ],
        }],
        footerLines: [{
          align: 'left',
          runs: [{ text: 'Confidencial', bold: true }],
        }],
        pageLabel: 'Página',
        ofLabel: 'de',
      },
    }, 1, 1);

    const h1 = drawn.find(d => d.text === 'Informe ');
    const h2 = drawn.find(d => d.text === 'Anual');
    const footerRun = drawn.find(d => d.text === 'Confidencial');
    expect(h1?.font).toContain('bold');
    expect(h1?.fillStyle).toBe('#1d4ed8');
    expect(h2?.font).toContain('italic');
    expect(h2!.x).toBeGreaterThan(h1!.x);
    expect(h1!.x).toBeGreaterThan(72); // centered inside margins
    expect(footerRun?.font).toContain('bold');
    expect(context.fillRect.mock.calls.some(call => call[3] === 1)).toBe(true); // underline stroke
  });
});
