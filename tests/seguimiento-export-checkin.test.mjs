import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const XLSX = require('xlsx');
function compile(source, mocks = {}) {
  const path = source instanceof URL ? source : new URL(source, import.meta.url);
  const code = ts.transpileModule(fs.readFileSync(path, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', code)((name) => {
    if (name in mocks) return mocks[name];
    if (name.endsWith('/supabaseServer')) return mocks.supabase;
    if (name.endsWith('/remoteStore')) return {};
    if (name.startsWith('.')) return compile(new URL(`${name.replace(/\.ts$/, '')}.ts`, path), mocks);
    return require(name);
  }, mod, mod.exports);
  return mod.exports;
}
const admin = { email: 'admin@bavaria-seguimiento.com', contractor: 'Admin', isAdmin: true, accessToken: 'test' };
const date = '2026-09-30';
function vehicle(dt, contractor = 'Surti Cervezas', fechaDespacho = date) {
  return { contractor, data: { transporte: dt, transportista: contractor, fechaDespacho, cajas: 100, cajasCheckin: 999, cajasRechazadas: 999, cajasGestionadas: 999, cajasRefusalFinal: 999, refusal: 999 } };
}
function modulation(dt, totalCajas = '30', cajasGestionadas = '10', contractor = 'Surti Cervezas', fechaDespacho = date) {
  return { contractor, data: { id: `${dt}:${fechaDespacho}`, dt, totalCajas, cajasGestionadas, fechaDespacho, createdAt: `${fechaDespacho}T10:00:00Z` } };
}
function checkin(dt, totalCajas, contractor = 'Surti Cervezas', createdAt = `${date}T10:00:00Z`, updatedAt = createdAt) {
  return { contractor, data: { id: `${dt}:${updatedAt}`, dt, totalCajas, createdAt, updatedAt } };
}
async function exportWorkbook({ routes = [], modulations = [], checkins = [], session = admin, query = '', failCheckin = false } = {}) {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const parsed = new URL(url);
    const table = parsed.pathname.slice(1);
    calls.push({ table, params: parsed.searchParams, init });
    if (failCheckin && table === 'checkins_cajas') return Response.json({}, { status: 503 });
    const items = { seguimiento_vehiculos: routes, modulaciones_ruta: modulations, checkins_cajas: checkins }[table];
    assert.ok(items, table);
    const contractorFilter = parsed.searchParams.get('contractor');
    const contractors = contractorFilter ? [contractorFilter.slice(3)] : [...parsed.searchParams.get('or').matchAll(/"([^"]+)"/g)].map((match) => match[1]);
    const offset = Number(parsed.searchParams.get('offset'));
    const page = items.filter((item) => contractors.includes(item.contractor || item.data.contratista)).slice(offset, offset + 1000);
    return Response.json(table === 'modulaciones_ruta' ? page.map((item) => ({ ...item.data, contractor: item.contractor })) : page);
  };
  try {
    const route = compile('../app/api/admin/seguimiento/export/route.ts', {
      'next/server': { NextResponse: { json: (body, init) => Response.json(body, init) } },
      '../../../../lib/authServer': { getAuthenticatedSession: async () => session },
      supabase: { supabaseRest: (table, query) => `https://db.test/${table}${query}`, supabaseAdminHeaders: () => ({}), supabaseUserHeaders: () => ({}), supabaseReadHeaders: () => ({}), supabaseError: async () => 'Check-in no disponible' },
    });
    const response = await route.GET(new Request(`https://app.test/api/admin/seguimiento/export?format=xlsx&period=history${query}`));
    if (response.status !== 200) return { status: response.status, body: await response.json(), calls };
    const workbook = XLSX.read(await response.arrayBuffer(), { type: 'array' });
    return { status: 200, workbook, rows: XLSX.utils.sheet_to_json(workbook.Sheets.Seguimiento, { defval: '' }), calls };
  } finally { globalThis.fetch = original; }
}

test('Excel usa check-in actualizado, respeta cero y recalcula refusal con la lógica de Seguimiento', async () => {
  const result = await exportWorkbook({
    routes: ['1', '2', '3', '4'].map((dt) => vehicle(dt)),
    modulations: ['1', '2', '3'].map((dt) => modulation(dt)),
    checkins: [checkin('1', 15), checkin('1', 7, 'Surti Cervezas', `${date}T10:00:00Z`, `${date}T12:00:00Z`), checkin('2', 0), checkin('4', 3)],
  });
  assert.equal(result.status, 200);
  const byDt = new Map(result.rows.map((row) => [row.DT, row]));
  for (const [dt, check, final] of [['1', 7, 7], ['2', 0, 0], ['3', '', 20], ['4', 3, 3]]) {
    const row = byDt.get(dt);
    assert.equal(row['Cajas de check-in'], check);
    assert.equal(row['Refusal final'], final);
    assert.equal(row['Refusal %'], final);
    assert.equal(row['Cajas rechazadas'], dt === '4' ? 0 : 30);
  }
  assert.ok(result.calls.every(({ init }) => init.cache === 'no-store'));
  const sheet = result.workbook.Sheets.Seguimiento;
  assert.equal(sheet['!autofilter'].ref, sheet['!ref']);
});

test('separa contratistas y fechas, normaliza DT y aplica filtros del Excel', async () => {
  const result = await exportWorkbook({
    routes: [vehicle('S123'), vehicle('123', 'Logisticos'), vehicle('S123', 'Surti Cervezas', '2026-09-29')],
    modulations: [modulation('123'), modulation('123', '12', '2', 'Surti Cervezas', '2026-09-29')],
    checkins: [checkin('123', 5), checkin('123', 88, 'Logisticos'), checkin('123', 9, 'Surti Cervezas', '2026-09-29T10:00:00Z')],
    query: '&contractor=Surti%20Cervezas',
  });
  assert.equal(result.rows.length, 2);
  assert.equal(result.rows.find((row) => row.Fecha === date)['Cajas de check-in'], 5);
  assert.equal(result.rows.find((row) => row.Fecha === '2026-09-29')['Cajas de check-in'], 9);
  assert.ok(result.calls.filter(({ table }) => table !== 'seguimiento_vehiculos').every(({ params }) => params.get('or').includes('contractor.in.("Surti Cervezas")')));
});

test('el check-in de otra fecha no sustituye el pendiente de la ruta', async () => {
  const result = await exportWorkbook({ routes: [vehicle('1')], modulations: [modulation('1')], checkins: [checkin('1', 99, 'Surti Cervezas', '2026-09-29T10:00:00Z')] });
  assert.equal(result.rows[0]['Cajas de check-in'], '');
  assert.equal(result.rows[0]['Refusal final'], 20);
});

test('pagina los check-ins y no genera un Excel engañoso si falla la consulta', async () => {
  const checks = Array.from({ length: 1000 }, (_, index) => checkin(String(10000 + index), 1));
  checks.push(checkin('1', 6));
  const result = await exportWorkbook({ routes: [vehicle('1')], checkins: checks, query: '&contractor=Surti%20Cervezas' });
  assert.equal(result.rows[0]['Cajas de check-in'], 6);
  assert.ok(result.calls.some(({ table, params }) => table === 'checkins_cajas' && params.get('offset') === '1000'));
  assert.equal((await exportWorkbook({ failCheckin: true })).status, 500);
});

test('mantiene autorización y alcance del administrador regional', async () => {
  const denied = await exportWorkbook({ session: { ...admin, isAdmin: false } });
  assert.equal(denied.status, 403);
  assert.equal(denied.calls.length, 0);
  const regional = await exportWorkbook({
    session: { ...admin, email: 'adminare@gmail.com' },
    routes: [vehicle('1'), vehicle('2', 'Logisticos Arenosa')],
    checkins: [checkin('2', 4, 'Logisticos Arenosa')],
  });
  assert.equal(regional.rows.length, 1);
  assert.equal(regional.rows[0].Contratista, 'Logisticos Arenosa');
  assert.equal(regional.rows[0]['Cajas de check-in'], 4);
});

test('incluye check-ins históricos de HL Logistica y con propietario en data', async () => {
  const legacy = checkin('1', 8, 'HL Logistica');
  const withoutOwner = checkin('2', 0, null);
  withoutOwner.data.contratista = 'HL Logisticos';
  const result = await exportWorkbook({
    routes: [vehicle('1', 'HL Logisticos'), vehicle('2', 'HL Logisticos')],
    checkins: [legacy, withoutOwner],
    query: '&contractor=HL%20Logisticos',
  });
  assert.equal(result.rows.find((row) => row.DT === '1')['Cajas de check-in'], 8);
  assert.equal(result.rows.find((row) => row.DT === '2')['Cajas de check-in'], 0);
});
