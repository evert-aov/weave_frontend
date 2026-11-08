import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { analyzeStartup } from './check-startup-bundle.mjs';

test('permite motores diferidos y rechaza uno compartido por imports estáticos', () => {
  const stats = { outputs: {
    'main.js': { entryPoint: 'src/main.ts', bytes: 100, imports: [
      { path: 'core.js', kind: 'import-statement' },
      { path: 'heavy.js', kind: 'dynamic-import' },
    ] },
    'core.js': { bytes: 200, imports: [], inputs: { 'node_modules/@angular/core/core.mjs': {} } },
    'heavy.js': { bytes: 5000, inputs: { 'node_modules/@excalidraw/excalidraw/index.js': {} } },
  } };
  assert.equal(analyzeStartup(stats).bytes, 300);
  assert.deepEqual(analyzeStartup(stats).violations, []);
  stats.outputs['core.js'].imports.push({ path: 'heavy.js', kind: 'import-statement' });
  assert.deepEqual(analyzeStartup(stats).violations, ['node_modules/@excalidraw/excalidraw/index.js']);
});

test('resuelve chunks relativos y no confunde las hojas de estilo con motores JavaScript', () => {
  const stats = { outputs: {
    'browser/main.js': { entryPoint: 'src/main.ts', bytes: 100, imports: [{ path: './core.js', kind: 'import-statement' }] },
    'browser/core.js': { bytes: 200, inputs: { 'node_modules/@excalidraw/excalidraw/index.css': {} } },
  } };
  assert.equal(analyzeStartup(stats).bytes, 300);
  assert.deepEqual(analyzeStartup(stats).violations, []);
});

 test('mantiene ExcelJS fuera de los imports estáticos del arranque', () => {
  const stats = { outputs: {
    'main.js': { entryPoint: 'src/main.ts', bytes: 100, imports: [{ path: 'excel.js', kind: 'dynamic-import' }] },
    'excel.js': { bytes: 500, inputs: { 'node_modules/exceljs/dist/exceljs.min.js': {} } },
  } };
  assert.deepEqual(analyzeStartup(stats).violations, []);
  stats.outputs['main.js'].imports[0].kind = 'import-statement';
  assert.deepEqual(analyzeStartup(stats).violations, ['node_modules/exceljs/dist/exceljs.min.js']);
});
