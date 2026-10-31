import { mkdir, writeFile, rename, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

// Optional offline distribution. Pin the same release used by MonacoRuntimeService.
const base = 'https://cdn.jsdelivr.net/npm/monaco-vim@0.4.2/';
const target = new URL('../public/vendor/monaco-vim/', import.meta.url);
const files = [['dist/monaco-vim.js','monaco-vim.js'],['LICENSE','LICENSE'],['LICENSE.codemirror.txt','LICENSE.codemirror.txt']];
try {
  const downloads = await Promise.all(files.map(async ([source, name]) => {
    const response = await fetch(base + source, { signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error(`${source}: HTTP ${response.status}`);
    const content = await response.text();
    if (name.endsWith('.js') && (!content.includes('initVimMode') || /^\s*</.test(content))) throw new Error('La distribución de Vim no es válida.');
    return { name, content };
  }));
  await mkdir(target, { recursive:true });
  for (const {name,content} of downloads) {
    const temporary = new URL(name + '.tmp', target);
    await writeFile(temporary, content); await rename(temporary, new URL(name,target));
  }
  console.log(`monaco-vim 0.4.2 guardado en ${fileURLToPath(target)}. Reinicia el frontend o vuelve a compilar.`);
} catch (error) {
  await Promise.all(files.map(([,name]) => rm(new URL(name+'.tmp',target),{force:true}).catch(()=>{})));
  console.error('No se pudo descargar monaco-vim:', error.message);
  process.exitCode = 1;
}
