export interface LatexCompletion { label: string; insert: string; description: string; document?: boolean }

const entry = (label: string, insert: string, description: string, document = false): LatexCompletion => ({ label: '\\' + label, insert: '\\' + insert, description, document });
export const LATEX_COMPLETIONS: LatexCompletion[] = [
  entry('frac', 'frac{}{}', 'Fracción'),
  entry('dfrac', 'dfrac{}{}', 'Fracción grande'),
  entry('sqrt', 'sqrt{}', 'Raíz cuadrada'),
  entry('sum', 'sum_{}^{}', 'Sumatoria'), entry('prod', 'prod_{}^{}', 'Producto'),
  entry('int', 'int_{}^{}', 'Integral'), entry('iint', 'iint_{}', 'Integral doble'),
  entry('oint', 'oint_{}', 'Integral cerrada'), entry('lim', 'lim_{}', 'Límite'),
  entry('vec', 'vec{}', 'Vector'), entry('hat', 'hat{}', 'Vector unitario'),
  entry('overline', 'overline{}', 'Barra superior'), entry('underline', 'underline{}', 'Subrayado'),
  entry('text', 'text{}', 'Texto en fórmula'), entry('mathrm', 'mathrm{}', 'Texto romano'),
  entry('mathbf', 'mathbf{}', 'Negrita matemática'), entry('mathbb', 'mathbb{}', 'Conjuntos'),
  entry('operatorname', 'operatorname{}', 'Operador'), entry('left', 'left( \\right)', 'Delimitadores'),
  entry('begin{aligned}', 'begin{aligned}\n &= \\\\\n &= \n\\end{aligned}', 'Ecuaciones alineadas'),
  entry('begin{cases}', 'begin{cases}\n & \\\\\n & \n\\end{cases}', 'Función por partes'),
  entry('begin{pmatrix}', 'begin{pmatrix}\n & \\\\\n & \n\\end{pmatrix}', 'Matriz'),
  entry('begin{equation}', 'begin{equation}\n\n\\end{equation}', 'Ecuación numerada', true),
  entry('begin{align}', 'begin{align}\n &= \\\\\n &= \n\\end{align}', 'Ecuaciones numeradas', true),
  entry('begin{multicols*}', 'begin{multicols*}{2}\n\n\\end{multicols*}', 'Dos columnas', true),
  entry('begin{itemize}', 'begin{itemize}\n\\item \n\\end{itemize}', 'Lista', true),
  entry('begin{enumerate}', 'begin{enumerate}\n\\item \n\\end{enumerate}', 'Lista numerada', true),
  entry('begin{tabular}', 'begin{tabular}{ll}\n\\toprule\n & \\\\\n\\midrule\n & \\\\\n\\bottomrule\n\\end{tabular}', 'Tabla booktabs', true),
  entry('begin{center}', 'begin{center}\n\n\\end{center}', 'Centrar', true),
  entry('begin{circuitikz}', 'begin{circuitikz}\n  \\draw (0,0) to[R, l={}] (3,0);\n\\end{circuitikz}', 'Circuito eléctrico (CircuiTikZ)', true),
  entry('begin{tikzpicture}', 'begin{tikzpicture}\n\n\\end{tikzpicture}', 'Diagrama TikZ', true),
  entry('documentclass', 'documentclass[10pt,a4paper]{article}', 'Clase de documento', true),
  entry('usepackage', 'usepackage{}', 'Paquete', true),
  entry('usepackage[siunitx]{circuitikz}', 'usepackage[siunitx]{circuitikz}', 'Circuitos eléctricos y unidades SI', true),
  entry('usetikzlibrary', 'usetikzlibrary{}', 'Librería TikZ (ej. babel)', true),
  entry('ctikzset', 'ctikzset{}', 'Ajustes de CircuiTikZ', true),
  entry('draw', 'draw (0,0) -- (2,0);', 'Trazo TikZ / rama de circuito', true),
  entry('SI', 'SI{}{}', 'Valor con unidad SI', true),
  entry('qty', 'qty{}{}', 'Magnitud con unidad SI', true),
  entry('unit', 'unit{}', 'Unidad SI', true),
  entry('num', 'num{}', 'Número con formato SI', true),
  entry('begin{document}', 'begin{document}\n\n\\end{document}', 'Cuerpo del documento', true),
  entry('section', 'section{}', 'Sección', true), entry('subsection', 'subsection{}', 'Subsección', true),
  entry('textbf', 'textbf{}', 'Negrita', true), entry('textit', 'textit{}', 'Cursiva', true),
  entry('geometry', 'geometry{margin=1.5cm}', 'Márgenes', true),
  entry('label', 'label{}', 'Etiqueta', true), entry('ref', 'ref{}', 'Referencia', true),
  entry('newcommand', 'newcommand{\\nombre}[1]{}', 'Macro', true),
  entry('vspace', 'vspace{}', 'Espacio vertical', true), entry('item', 'item ', 'Elemento', true),
  ...['volt','ampere','ohm','farad','henry','watt','hertz','coulomb','siemens','tesla','kilo','milli','micro','nano','pico','mega','giga'].map(unit => entry(unit, unit, `Unidad/prefijo SI (${unit})`, true)),
  ...['alpha','beta','gamma','delta','epsilon','varepsilon','theta','lambda','mu','rho','sigma','tau','phi','Phi','omega','pi','infty','partial','nabla','times','cdot','pm','le','ge','ne','approx','implies','to','in','forall','exists','sin','cos','ln','log','quad','qquad'].map(symbol => entry(symbol, symbol + ' ', symbol)),
];

/** Only a command at the caret; never complete escaped slashes, selections or comments. */
export function latexCompletionContext(value: string, start: number, end = start, document = false): { start: number; items: LatexCompletion[] } | null {
  if (start !== end) return null;
  const line = value.slice(value.lastIndexOf('\n', start - 1) + 1, start);
  if (/(^|[^\\])(?:\\\\)*%/.test(line)) return null;
  const match = /(^|[^\\])(?:\\\\)*(\\[a-zA-Z]+(?:\{[a-zA-Z*]*)?)$/.exec(line);
  if (!match) return null;
  const prefix = match[2];
  const items = LATEX_COMPLETIONS.filter(item => (document || !item.document) && item.label.startsWith(prefix)).slice(0, 10);
  return items.length ? { start: start - prefix.length, items } : null;
}
