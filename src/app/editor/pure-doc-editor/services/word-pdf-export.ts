/** Snapshot the laid out sheets without changing the editor's DOM or scroll position. */
export function snapshotWordSheets(sheets: HTMLElement[]): HTMLElement[] {
  return sheets.map(sheet => {
    const clone = sheet.cloneNode(true) as HTMLElement;
    const sourceNodes = [sheet, ...sheet.querySelectorAll('*')];
    const clonedNodes = [clone, ...clone.querySelectorAll('*')];
    sourceNodes.forEach((source, index) => {
      const target = clonedNodes[index] as HTMLElement | SVGElement;
      const computed = getComputedStyle(source);
      for (const property of Array.from(computed)) {
        target.style.setProperty(property, computed.getPropertyValue(property), 'important');
      }
      target.removeAttribute('id');
      target.removeAttribute('contenteditable');
      if (source instanceof HTMLImageElement) (target as HTMLImageElement).src = source.currentSrc || source.src;
    });
    clone.querySelectorAll('.no-print').forEach(element => element.remove());
    for (const [name, value] of Object.entries({ transform: 'none', zoom: '1', margin: '0', position: 'relative', top: '0', left: '0', boxShadow: 'none', outline: 'none', borderColor: 'transparent' })) {
      const property = name.replace(/[A-Z]/g, letter => '-' + letter.toLowerCase());
      clone.style.setProperty(property, value, 'important');
    }
    return clone;
  });
}

/** Every async resource has a deadline; export must never leave the UI pending forever. */
export async function pdfDeadline<T>(task: Promise<T>, label: string, milliseconds = 20000): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  try {
    return await Promise.race([task, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`Tiempo agotado: ${label}. Intenta exportar nuevamente.`)), milliseconds);
    })]);
  } finally { clearTimeout(timer!); }
}

async function embedImages(sheet: HTMLElement): Promise<void> {
  await Promise.all(Array.from(sheet.querySelectorAll('img')).map(async image => {
    image.removeAttribute('srcset');
    image.removeAttribute('sizes');
    image.removeAttribute('loading');
    if (image.src.startsWith('data:')) return;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(image.src, { signal: controller.signal });
      if (!response.ok) throw new Error('No se pudo cargar una imagen del documento.');
      const blob = await response.blob();
      image.src = await pdfDeadline(new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
      }), 'preparación de imagen');
    } finally { clearTimeout(timer); }
  }));
}

/** Render the styled XHTML directly, without another document clone or stylesheet reload. */
export async function rasterizeWordSheet(sheet: HTMLElement, width: number, height: number): Promise<HTMLCanvasElement> {
  const markup = new XMLSerializer().serializeToString(sheet);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width * 2}" height="${height * 2}" viewBox="0 0 ${width} ${height}"><foreignObject x="0" y="0" width="${width}" height="${height}">${markup}</foreignObject></svg>`;
  const image = new Image();
  try {
    await pdfDeadline(new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('El navegador no pudo dibujar la hoja para PDF.'));
      image.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    }), 'renderizado de la hoja');
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(width * 2);
    canvas.height = Math.ceil(height * 2);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('El navegador no pudo crear la imagen del PDF.');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas;
  } finally {
    image.onload = image.onerror = null;
    image.src = '';
  }
}

export async function renderWordPdf(sheets: HTMLElement[], progress: (message: string) => void = () => {}): Promise<Blob> {
  if (!sheets.length) throw new Error('No hay hojas listas para exportar.');
  progress('Preparando el generador PDF…');
  const { jsPDF } = await pdfDeadline(import('jspdf'), 'carga del generador PDF');
  const pdf = new jsPDF({ unit: 'pt', format: [1, 1], compress: true });
  for (let index = 0; index < sheets.length; index++) {
    const sheet = sheets[index];
    const width = parseFloat(sheet.style.width), height = parseFloat(sheet.style.height);
    if (!(width > 0 && height > 0)) throw new Error('La hoja no tiene dimensiones válidas para PDF.');
    progress(`Exportando página ${index + 1} de ${sheets.length}…`);
    await embedImages(sheet);
    const canvas = await rasterizeWordSheet(sheet, width, height);
    try {
      const widthPt = width * 0.75, heightPt = height * 0.75;
      pdf.addPage([widthPt, heightPt], width > height ? 'landscape' : 'portrait');
      pdf.addImage(canvas, 'PNG', 0, 0, widthPt, heightPt, undefined, 'FAST');
    } finally { canvas.width = canvas.height = 0; }
    // Timers also advance when the tab is in the background, unlike animation frames.
    await new Promise<void>(resolve => setTimeout(resolve, 0));
  }
  progress('Preparando la descarga…');
  pdf.deletePage(1);
  return pdf.output('blob');
}
