import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

function compile(path, mocks) {
  const source = ts.transpileModule(fs.readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const compiledModule = { exports: {} };
  new Function('require', 'module', 'exports', source)((name) => {
    if (name in mocks) return mocks[name];
    throw Error(name);
  }, compiledModule, compiledModule.exports);
  return compiledModule.exports;
}
const contractors = compile('../app/lib/contractors.ts', {});
const record = { id: 'checkin-hl', dt: '8008968859', totalCajas: 1, createdAt: '2026-09-22T12:00:00Z', updatedAt: '2026-09-22T12:00:00Z' };

function setup({ session = { contractor: contractors.contractorForEmail('hllogistica@gmail.com'), accessToken: 'user-token' }, existing = [], failure = false } = {}) {
  const calls = [];
  let stored = [];
  const route = compile('../app/api/checkins/route.ts', {
    '../../lib/adminScope': { scopeQuery() {} },
    '../../lib/contractors': contractors,
    'next/server': { NextResponse: { json: (body, options) => ({ body, status: options?.status ?? 200 }) } },
    '../../lib/authServer': { getAuthenticatedSession: async () => session },
    '../../lib/auditLog': { writeAuditLog: async () => {} },
    '../../lib/serverCache': { clearServerCache() {}, cachedJsonFetch: async (_key, ttl, url) => {
      assert.equal(ttl, 0);
      assert.equal(new URL(url).searchParams.get('contractor'), 'in.("HL Logisticos","HL Logistica","HL Logísticos")');
      return stored;
    } },
    '../../lib/supabaseServer': {
      supabaseRest: (table, query = '') => `https://example.test/${table}${query}`,
      supabaseAdminHeaders: () => ({ apikey: 'server-key' }),
      supabaseUserHeaders: () => ({ Authorization: 'Bearer user-token' }),
      supabaseReadHeaders: () => ({ apikey: 'server-key' }),
      supabaseError: async () => 'No se pudo guardar en Supabase',
    },
  });
  const fetch = async (url, init) => {
    calls.push({ url: new URL(url), ...init });
    if (init.method === 'POST') {
      stored = JSON.parse(init.body);
      return { ok: !failure, status: failure ? 403 : 201 };
    }
    return { ok: true, json: async () => existing };
  };
  return { route, calls, fetch };
}

for (const totalCajas of [0, 1]) test(`guarda ${totalCajas} cajas y las vuelve a leer bajo HL Logisticos`, async (t) => {
  const { route, calls, fetch } = setup();
  t.mock.method(globalThis, 'fetch', fetch);
  const result = await route.PUT(new Request('https://example.test/api/checkins', { method: 'PUT', body: JSON.stringify({ records: [{ ...record, totalCajas, contratista: 'Logisticos' }], deleteMissing: false }) }));
  assert.equal(result.status, 200);
  assert.equal(result.body.records[0].contratista, 'HL Logisticos');
  const write = calls.find((call) => call.method === 'POST');
  assert.equal(write.headers.apikey, 'server-key');
  assert.equal(JSON.parse(write.body)[0].contractor, 'HL Logisticos');
  assert.equal(calls.some((call) => call.method === 'DELETE'), false);
  const reload = await route.GET();
  assert.equal(reload.body.records[0].totalCajas, totalCajas);
  assert.equal(reload.body.records[0].contratista, 'HL Logisticos');
});

test('rechaza un ID perteneciente a otra contratista antes de escribir', async (t) => {
  const { route, calls, fetch } = setup({ existing: [{ contractor: 'Logisticos' }] });
  t.mock.method(globalThis, 'fetch', fetch);
  const result = await route.PUT(new Request('https://example.test', { method: 'PUT', body: JSON.stringify({ records: [record], deleteMissing: false }) }));
  assert.equal(result.status, 403);
  assert.equal(calls.length, 1);
});

test('conserva el error de Supabase sin confirmar el guardado', async (t) => {
  const { route, fetch } = setup({ failure: true });
  t.mock.method(globalThis, 'fetch', fetch);
  const result = await route.PUT(new Request('https://example.test', { method: 'PUT', body: JSON.stringify({ records: [record], deleteMissing: false }) }));
  assert.equal(result.status, 403);
  assert.match(result.body.error, /Supabase/);
});

for (const session of [null, { isAdmin: true }, { contractor: 'People' }]) test(`no permite escritura sin cuenta operativa: ${JSON.stringify(session)}`, async (t) => {
  const { route, calls, fetch } = setup({ session });
  t.mock.method(globalThis, 'fetch', fetch);
  const result = await route.PUT(new Request('https://example.test', { method: 'PUT', body: JSON.stringify({ records: [record] }) }));
  assert.equal(result.status, session ? 403 : 401);
  assert.equal(calls.length, 0);
});

for (const fails of [false, true]) test(`formulario guarda el cero visible y muestra errores: ${fails}`, async () => {
  const states = [];
  const saved = [];
  let cursor = 0;
  let tableProps;
  const element = (type, props) => {
    if (type === 'table-mock') tableProps = props;
    return { type, props };
  };
  const page = compile('../app/seguimiento/checkin/page.tsx', {
    'react/jsx-runtime': { jsx: element, jsxs: element },
    react: {
      useState: (initial) => {
        const index = cursor++;
        if (!(index in states)) states[index] = typeof initial === 'function' ? initial() : initial;
        return [states[index], (value) => { states[index] = typeof value === 'function' ? value(states[index]) : value; }];
      },
      useMemo: (fn) => fn(), useEffect() {},
    },
    'next/navigation': { useRouter: () => ({}) },
    '../../lib/checkinStorage': {
      CHECKIN_STORAGE_KEY: 'checkins', readCheckinCajasRegistros: () => [],
      getCheckinByDt: (records) => records[0],
      upsertCheckinCajas: (_records, dt, totalCajas) => [{ ...record, dt, totalCajas }],
      saveCheckinCajasRegistro: async (value) => {
        if (fails) throw new Error('Permiso denegado');
        saved.push(value);
      },
    },
    '../../lib/modulacionStorage': {
      MODULACION_STORAGE_KEY: 'modulaciones', getLocalDateKey: () => '2026-09-22',
      normalizeDt: (dt) => dt, getModulacionesByDt: () => [], getOperationalModulaciones: () => [],
      summarizeModulaciones: () => ({ cajasPendientes: 0 }), readModulacionRegistros: () => [],
    },
    '../../lib/remoteStore': {},
    '../../lib/seguimientoStorage': { SEGUIMIENTO_STORAGE_KEY: 'vehicles', readSeguimientoVehiculos: () => [{ transporte: record.dt }] },
    '../../lib/storageEvents': { useStorageSnapshot: (_keys, read) => read() },
    './_components/CheckinHeader': { CheckinHeader: 'header-mock' },
    './_components/CheckinMetrics': { CheckinMetrics: 'metrics-mock' },
    './_components/CheckinTable': { CheckinTable: 'table-mock' },
    './_lib/checkinPage': { calculateCheckinTotals: () => ({}), hasDeparture: () => true, isVehicleForDate: () => true },
  });
  page.default();
  await tableProps.onSubmit({ preventDefault() {} }, record.dt);
  cursor = 0;
  const result = page.default();
  assert.equal(tableProps.savingDt, '');
  if (fails) {
    assert.equal(tableProps.savedDt, '');
    assert.match(JSON.stringify(result), /Permiso denegado/);
  } else {
    assert.equal(saved[0].totalCajas, 0);
    assert.equal(tableProps.savedDt, record.dt);
  }
});
