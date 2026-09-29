import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

function compile(relative, mocks = {}) {
  const path = new URL(relative, import.meta.url);
  const code = ts.transpileModule(fs.readFileSync(path, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const compiled = { exports: {} };
  new Function('require', 'module', 'exports', code)((name) => {
    if (name in mocks) return mocks[name];
    if (name.startsWith('.')) return compile(new URL(`${name.replace(/\.ts$/, '')}.ts`, path), mocks);
    return require(name);
  }, compiled, compiled.exports);
  return compiled.exports;
}

const { deliveryComplianceRows } = compile('../app/lib/deliveryCompliance.ts');
const { parseRoutePerformanceRows } = compile('../app/lib/routePerformanceImport.ts');
const { getVisiblePortalModules } = compile('../app/components/portalModules.ts');
const headers = ['fecha_viaje2', 'PLACA', 'Viaje', 'PLAN_KM', 'EJE_KM', 'DIFERENCIAKM', 'ENTREGA RANGO', 'CONTRATISTA', 'ADH_KM'];
const rows = parseRoutePerformanceRows([headers,
  ['29/09/2026', 'ABC123', 1, 100, 110, 10, 0.9, '', 0.8],
  ['29/09/2026', 'XYZ456', 1, 200, 220, 20, 0.95, 'Surti Cervezas', 0.9],
  ['28/09/2026', 'HLH123', 1, 50, 55, 5, 0.85, 'HL Logistica', 0.75],
  ['29/09/2026', 'ZZZ999', 1, 75, 80, 5, 0.8, '', 0.7],
]);
const vehicle = (overrides = {}) => ({ vehiculo: 'ABC123', fechaDespacho: '2026-09-29', viaje: '1', transportista: 'HL Logisticos', transporte: '123', nombreResponsable: 'RR HL', nombreAuxiliar1: 'Conductor HL', ...overrides });

test('solo HL recibe el módulo, incluyendo su nombre histórico', () => {
  for (const contractor of ['HL Logisticos', 'HL Logistica']) {
    assert.equal(getVisiblePortalModules({ contractor }).filter(m => m.href === '/cumplimiento-entregas').length, 1);
  }
  for (const session of [{ contractor: 'Surti Cervezas' }, { contractor: 'Logisticos' }, { contractor: 'Logisticos Arenosa' }, { contractor: 'HL Logisticos', isAdmin: true }, { contractor: 'HL Logisticos', isPeople: true }, {}]) {
    assert.equal(getVisiblePortalModules(session).some(m => m.href === '/cumplimiento-entregas'), false);
  }
});

test('cruza HL, conserva sus viajes históricos y excluye otras empresas y viajes sin identificar', () => {
  const result = deliveryComplianceRows(rows, [vehicle(), vehicle({ vehiculo: 'XYZ456', transportista: 'Surti Cervezas', transporte: '456' })]);
  assert.deepEqual(result.map(r => r.fila), [2, 4]);
  assert.ok(result.every(r => r.contractor === 'HL Logisticos'));
  assert.equal(result[0].driver, 'Conductor HL');
  assert.equal(result[0].rangePercent, 90);
  assert.equal(result[1].match, 'missing');
  assert.equal(result.reduce((sum, row) => sum + row.plannedKm, 0), 150);
});

test('una placa compartida sin contratista no se atribuye falsamente a HL', () => {
  const result = deliveryComplianceRows(rows.slice(0, 1), [vehicle(), vehicle({ transportista: 'Logisticos', transporte: '999', nombreAuxiliar1: 'Privado otra empresa' })]);
  assert.deepEqual(result, []);
});

test('un viaje explícito de HL no incorpora nombres de otro contratista con la misma placa', () => {
  const explicit = [{ ...rows[0], excelContractor: 'HL Logisticos' }];
  const result = deliveryComplianceRows(explicit, [vehicle({ transportista: 'Logisticos', nombreAuxiliar1: 'Privado otra empresa' })]);
  assert.equal(result[0].driver, '');
  assert.equal(result[0].match, 'missing');
  assert.ok(!JSON.stringify(result).includes('Privado otra empresa'));
});

test('los duplicados históricos usan la versión más reciente del mismo DT y fecha', () => {
  const result = deliveryComplianceRows(rows.slice(0, 1), [vehicle(), vehicle({ transportista: 'HL Logistica', nombreAuxiliar1: 'Nombre anterior' })]);
  assert.equal(result[0].match, 'matched');
  assert.equal(result[0].driver, 'Conductor HL');
});

function api(session, onRead = () => {}) {
  return compile('../app/api/cumplimiento-entregas/route.ts', {
    'next/server': { NextResponse: { json: (body, init) => Response.json(body, init) } },
    '../../lib/authServer': { getAuthenticatedSession: async () => session },
    '../../lib/routePerformanceFile': { readRoutePerformanceFile: async () => { onRead(); return { rows, fileName: 'viajes.xlsx', uploadedAt: '2026-09-29' }; } },
    '../../lib/adminTvRows': { readAdminTvRows: async () => [vehicle(), vehicle({ vehiculo: 'XYZ456', contractor: 'Surti Cervezas', transporte: '456' })] },
    '../../lib/supabaseServer': { supabaseReadHeaders: () => ({}) },
  });
}

test('API rechaza anónimos y otras cuentas antes de leer archivos', async () => {
  for (const session of [null, { contractor: 'Surti Cervezas' }, { contractor: 'Admin', isAdmin: true }, { contractor: 'People', isPeople: true }]) {
    const response = await api(session, () => assert.fail('No debe consultar datos')).GET();
    assert.equal(response.status, session ? 403 : 401);
  }
});

test('API limita el contenido a HL aunque se envíe otro contratista en la URL', async () => {
  const response = await api({ contractor: 'HL Logisticos', accessToken: 'test' }).GET(new Request('http://localhost/api/cumplimiento-entregas?contractor=Surti%20Cervezas'));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.rows.length, 2);
  assert.ok(body.rows.every(row => row.contractor === 'HL Logisticos'));
  assert.ok(!JSON.stringify(body).includes('Surti Cervezas'));
  assert.ok(!('file_base64' in body));
});

// Ejecutar también las pruebas existentes de cálculos y visibilidad con Node 20.
compile('../app/components/portalModules.test.ts');
compile('../app/lib/routePerformanceImport.test.ts');
compile('../app/lib/routePerformanceOffenders.test.ts');
compile('../app/lib/routePerformanceTrend.test.ts');
