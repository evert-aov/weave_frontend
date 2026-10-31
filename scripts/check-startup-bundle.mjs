import { readFileSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path/posix';
import { pathToFileURL } from 'node:url';

const heavyPackages = /node_modules\/(?:@univerjs\/|@excalidraw\/|pptx-angular-viewer\/|pptx-viewer-core\/|@codemirror\/|@replit\/codemirror-vim\/|monaco-editor\/|mermaid\/|jspdf\/|html2canvas\/)/;

/** Recorre solo imports estáticos: los motores de edición deben quedar en chunks diferidos. */
export function analyzeStartup(stats) {
  const outputs = stats.outputs ?? {};
  const main = Object.keys(outputs).find(name => outputs[name].entryPoint?.endsWith('src/main.ts'));
  if (!main) throw new Error('No se encontró la entrada src/main.ts en stats.json.');
  const visited = new Set();
  const visit = name => {
    if (visited.has(name) || !outputs[name]) return;
    visited.add(name);
    for (const dependency of outputs[name].imports ?? []) {
      if (dependency.kind === 'dynamic-import' || dependency.external) continue;
      const target = outputs[dependency.path]
        ? dependency.path
        : normalize(join(dirname(name), dependency.path));
      visit(target);
    }
    if (outputs[name].cssBundle) visit(outputs[name].cssBundle);
  };
  visit(main);
  const inputs = [...visited].flatMap(name => Object.keys(outputs[name].inputs ?? {}));
  const violations = [...new Set(inputs.filter(name => /\.[cm]?[jt]sx?$/.test(name) && heavyPackages.test(name)))];
  const bytes = [...visited].reduce((total, name) => total + (outputs[name].bytes ?? 0), 0);
  return { chunks: [...visited], bytes, violations };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const statsPath = process.argv[2] ?? 'dist/frontend/browser-stats.json';
  try {
    const report = analyzeStartup(JSON.parse(readFileSync(statsPath, 'utf8')));
    console.log(`JavaScript inicial: ${(report.bytes / 1000).toFixed(1)} kB en ${report.chunks.length} chunks estáticos.`);
    if (report.violations.length) {
      console.error('Editores pesados cargados durante el arranque:\n' + report.violations.join('\n'));
      process.exitCode = 1;
    } else {
      console.log('Los motores de hojas, pizarra, diapositivas y PDF quedan fuera del arranque.');
    }
  } catch (error) {
    console.error(`No se pudo verificar el arranque: ${error.message}`);
    process.exitCode = 1;
  }
}
