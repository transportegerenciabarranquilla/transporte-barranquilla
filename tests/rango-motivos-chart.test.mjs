import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
function compile(source) {
  const path = source instanceof URL ? source : new URL(source, import.meta.url);
  const code = ts.transpileModule(fs.readFileSync(path, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', code)((name) => name.startsWith('.') ? compile(new URL(`${name}.ts${name.endsWith('Chart') ? 'x' : ''}`, path)) : require(name), mod, mod.exports);
  return mod.exports;
}
const { summarizeRangeReasons } = compile('../app/lib/rangeReasonSummary.ts');
const Charts = compile('../app/admin/rango/RangoCharts.tsx').default;
const row = (id, reason, extra = {}) => ({ id, pocExternalId: id, dt: '123', driverName: 'RR', status: 'CONCLUDED', withinRadius: false, manualOutOfRadiusReason: reason, contractor: 'Surti Cervezas', ...extra });

test('cuenta los cuatro motivos, prioriza el manual y separa sin clasificar', () => {
  const groups = summarizeRangeReasons([
    row('1', 'Apoyo de ingreso'), row('2', 'Reubicacion'), row('3', 'Cambio de Coordenadas'), row('4', 'Reconstrucción'),
    row('5', '', { outOfRadiusReason: 'apoyo ingreso' }), row('6', '', { outOfRadiusReason: 'Posición incorrecta' }),
    row('7', 'Reubicación', { withinRadius: true }), row('8', 'Reubicación', { status: 'NOT_STARTED' }),
    row('9', 'Reconstrucción', { contractor: 'HL Logistica', outOfRadiusReason: 'Reubicación' }),
  ]);
  assert.deepEqual(groups.find((group) => group.contractor === 'Surti Cervezas'), { contractor: 'Surti Cervezas', counts: [2, 1, 1, 1], total: 6, unclassified: 1 });
  assert.deepEqual(groups.find((group) => group.contractor === 'HL Logisticos').counts, [0, 0, 0, 1]);
});

test('gráfica bajo Resumen por RR respeta filtros y no duplica clientes', () => {
  const reports = [
    { contractor: 'Surti Cervezas', operationalDate: '2026-09-30', rows: [row('1', 'Reubicación'), row('1', 'Reubicación'), row('2', 'Reconstrucción', { dt: '456' })] },
    { contractor: 'Surti Cervezas', operationalDate: '2026-09-29', rows: [row('3', 'Reubicación')] },
    { contractor: 'Logisticos', operationalDate: '2026-09-30', rows: [row('4', 'Reubicación')] },
  ];
  const html = renderToStaticMarkup(React.createElement(Charts, { reports, contractor: 'Surti Cervezas', from: '2026-09-30', to: '2026-09-30', dt: '123' }));
  assert.ok(html.indexOf('Resumen por RR') < html.indexOf('Fuera de rango por contratista'));
  assert.ok(html.includes('Surti Cervezas, Reubicación: 1 visitas'));
  assert.ok(html.includes('Surti Cervezas, Reconstrucción: 0 visitas'));
  assert.ok(!html.includes('Logisticos, Reubicación:'));
});

test('sin datos no inventa barras ni motivos', () => {
  const html = renderToStaticMarkup(React.createElement(Charts, { reports: [], contractor: 'Todas', from: '', to: '', dt: '' }));
  assert.ok(html.includes('No hay visitas fuera de rango para los filtros seleccionados.'));
  assert.deepEqual(summarizeRangeReasons([]), []);
});
