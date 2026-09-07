import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const path = new URL('../admin/graficas/GraficasDashboard.tsx', import.meta.url);
const source = ts.createSourceFile(path.pathname, fs.readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const wanted = new Set(['onTimeContractorLabel', 'buildOnTimeByContractor']);
const functions = source.statements.filter(node => ts.isFunctionDeclaration(node) && wanted.has(node.name?.text)).map(node => node.getText(source)).join('\n');
const compiled = ts.transpileModule(functions, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
const normalize = value => String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
const build = new Function('normalizeContractorName', 'ratioPercentage', compiled + '\nreturn buildOnTimeByContractor;')(normalize, (value, total) => total ? value / total * 100 : 0);
test('graficas de Arenosa conservan sus nombres y no agregan Galapa', () => {
 const rows = build([{ transportista: 'Logisticos Arenosa', clasificacionOnTime: 'On Time' }, { transportista: 'Punto Corona Arenosa', clasificacionOnTime: 'No On Time' }]);
 assert.deepEqual(rows.map(row => row.contractor), ['Logisticos Arenosa', 'Punto Corona Arenosa']);
 assert.deepEqual(rows.map(row => row.percentage), [100, 0]);
 assert.deepEqual(build([]), []);
});
test('administrador global no mezcla ambas sedes', () => {
 const rows = build(['Logisticos', 'Logisticos Arenosa', 'Punto Corona', 'Punto Corona Arenosa', 'Surti Cervezas'].map(transportista => ({ transportista, clasificacionOnTime: 'On Time' })));
 assert.equal(rows.length, 5);
 assert.ok(rows.every(row => row.classified === 1));
});
