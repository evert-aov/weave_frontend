/** Optional offline distribution: isolated dependency graph, one CM state/view instance. */
import { mkdtemp, readFile, writeFile, cp, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { build } from 'esbuild';
const root = fileURLToPath(new URL('../', import.meta.url));
const versions = JSON.parse(await readFile(new URL('./codemirror-versions.json', import.meta.url), 'utf8'));
const dir = await mkdtemp(join(tmpdir(), 'weave-codemirror-'));
try {
  await writeFile(join(dir, 'package.json'), JSON.stringify({ private: true, type: 'module', dependencies: versions, overrides: versions }));
  const install = spawnSync('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', '--fetch-retries=0', '--fetch-timeout=10000', '--cache', join(dir, 'cache')], { cwd: dir, stdio: 'inherit' });
  if (install.status !== 0) throw new Error('No se pudieron descargar las dependencias de CodeMirror.');
  await cp(resolve(root, 'public/vendor/codemirror/remote.mjs'), join(dir, 'local.mjs'));
  const outdir = resolve(root, 'public/vendor/codemirror/local');
  await build({ entryPoints: [join(dir, 'local.mjs')], outdir, bundle: true, splitting: true, format: 'esm', platform: 'browser', target: 'es2022', minify: true, legalComments: 'linked', chunkNames: '[name]-[hash]', outExtension: { '.js': '.mjs' } });
  await mkdir(join(outdir, 'licenses'), { recursive: true });
  for (const name of Object.keys(versions)) {
    for (const file of ['LICENSE', 'LICENSE.md', 'LICENSE.txt']) {
      try { await cp(join(dir, 'node_modules', name, file), join(outdir, 'licenses', name.replaceAll('/', '-') + '.txt')); break; } catch {}
    }
  }
  await cp(join(dir, 'package-lock.json'), join(outdir, 'dependencies-lock.json'));
  console.log('CodeMirror y Vim disponibles en public/vendor/codemirror/local. Reinicia ng serve.');
} finally { await rm(dir, { recursive: true, force: true }); }
