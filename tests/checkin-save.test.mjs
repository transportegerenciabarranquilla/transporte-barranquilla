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
const checkinScope = compile('../app/lib/checkinScope.ts', { './contractors': contractors });
const hlScope = '(contractor.in.("HL Logisticos","HL Logistica","HL Logísticos"),and(contractor.is.null,data->>contratista.in.("HL Logisticos","HL Logistica","HL Logísticos")))';
const record = { id: 'checkin-hl', dt: '8008968859', totalCajas: 1, createdAt: '2026-09-22T12:00:00Z', updatedAt: '2026-09-22T12:00:00Z' };

function setup({ session = { contractor: contractors.contractorForEmail('hllogistica@gmail.com'), accessToken: 'user-token' }, existing = [], failure = false, unreadable = false, stale = false, nullContractor = false } = {}) {
  const calls = [];
  let stored = [];
  const route = compile('../app/api/checkins/route.ts', {
    '../../lib/adminScope': { allowedContractors: session => session.isAdmin ? contractors.CONTRACTORS : [session.contractor] },
    '../../lib/checkinScope': checkinScope,
    '../../lib/contractors': contractors,
    'next/server': { NextResponse: { json: (body, options) => ({ body, status: options?.status ?? 200 }) } },
    '../../lib/authServer': { getAuthenticatedSession: async () => session },
    '../../lib/auditLog': { writeAuditLog: async () => {} },
    '../../lib/serverCache': { clearServerCache() {}, cachedJsonFetch: async (_key, ttl, url) => {
      assert.equal(ttl, 0);
      assert.equal(new URL(url).searchParams.get('or'), hlScope);
      assert.equal(new URL(url).searchParams.has('contractor'), false);
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
      stored = JSON.parse(init.body).map(row => ({ ...row, contractor: nullContractor ? null : row.contractor }));
      return { ok: !failure, status: failure ? 403 : 201 };
    }
    if (new URL(url).searchParams.get('select') === 'checkin_id,data') {
      assert.equal(init.cache, 'no-store');
      assert.equal(new URL(url).searchParams.get('or'), hlScope);
      assert.equal(new URL(url).searchParams.has('contractor'), false);
      return { ok: true, json: async () => unreadable ? [] : stale ? stored.map(row => ({ ...row, data: { ...row.data, totalCajas: 99 } })) : stored };
    }
    return { ok: true, json: async () => existing };
  };
  return { route, calls, fetch };
}

for (const nullContractor of [false, true]) for (const totalCajas of [0, 1, 8]) test(`guarda ${totalCajas} cajas y las vuelve a leer bajo HL Logisticos, columna nula: ${nullContractor}`, async (t) => {
  const { route, calls, fetch } = setup({ nullContractor });
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

for (const existing of [
  [{ contractor: null, data: { contratista: 'Logisticos' } }],
  [{ contractor: 'Logisticos', data: { contratista: 'HL Logisticos' } }],
  [{ contractor: null, data: {} }],
]) test(`no permite apropiarse de un ID ajeno o sin dueño: ${JSON.stringify(existing)}`, async (t) => {
  const { route, calls, fetch } = setup({ existing });
  t.mock.method(globalThis, 'fetch', fetch);
  const result = await route.PUT(new Request('https://example.test', { method: 'PUT', body: JSON.stringify({ records: [record] }) }));
  assert.equal(result.status, 403);
  assert.equal(calls.some(call => call.method === 'POST'), false);
  assert.equal(calls[0].url.searchParams.has('contractor'), false);
});

test('permite actualizar el ID propio cuando contractor quedó nulo', async (t) => {
  const { route, fetch } = setup({ nullContractor: true, existing: [{ contractor: null, data: { contratista: 'HL Logisticos' } }] });
  t.mock.method(globalThis, 'fetch', fetch);
  const result = await route.PUT(new Request('https://example.test', { method: 'PUT', body: JSON.stringify({ records: [record] }) }));
  assert.equal(result.status, 200);
  assert.equal((await route.GET()).body.records[0].contratista, 'HL Logisticos');
});

for (const options of [{ unreadable: true }, { stale: true }]) test(`no confirma un checkin que no se recupera con el valor guardado: ${JSON.stringify(options)}`, async (t) => {
  const { route, fetch } = setup(options);
  t.mock.method(globalThis, 'fetch', fetch);
  const result = await route.PUT(new Request('https://example.test', { method: 'PUT', body: JSON.stringify({ records: [record] }) }));
  assert.equal(result.status, 502);
  assert.match(result.body.error, /confirmar el checkin/);
});

test('guardar sin deleteMissing no elimina checkins que faltan en la copia del navegador', async (t) => {
  const { route, calls, fetch } = setup({ existing: [{ checkin_id: 'otro-checkin', contractor: 'HL Logisticos' }] });
  t.mock.method(globalThis, 'fetch', fetch);
  const result = await route.PUT(new Request('https://example.test', { method: 'PUT', body: JSON.stringify({ records: [record] }) }));
  assert.equal(result.status, 200);
  assert.equal(calls.some(call => call.method === 'DELETE'), false);
});

test('muestra Guardado tras recargar desde Supabase, también con cero cajas', () => {
  const element = (type, props) => ({ type, props });
  const { CheckinTable } = compile('../app/seguimiento/checkin/_components/CheckinTable.tsx', {
    'react/jsx-runtime': { jsx: element, jsxs: element },
    'lucide-react': { BadgeCheck: 'icon', ClipboardCheck: 'icon' },
  });
  for (const totalCajas of [0, 1]) {
    const props = { rows: [{ checkin: { ...record, totalCajas }, key: record.dt, resumen: {}, vehicle: { transporte: record.dt } }], inputs: {}, savedDt: '', savingDt: '', dateLabel: '', onInputChange() {}, onSubmit() {} };
    assert.match(JSON.stringify(CheckinTable(props)), /"children":"Guardado"/);
    assert.doesNotMatch(JSON.stringify(CheckinTable({ ...props, inputs: { [record.dt]: '42' } })), /"children":"Guardado"/);
  }
});

test('pernocta y eliminación actúan solo sobre el DT seleccionado', (t) => {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', { value: {}, configurable: true });
  t.after(() => {
    if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow);
    else delete globalThis.window;
  });
  const writes = [], deletes = [];
  const records = [record, { ...record, id: 'otro-id', dt: '123' }];
  const storage = compile('../app/lib/checkinStorage.ts', {
    './modulacionStorage': { normalizeDt: value => String(value ?? '').replace(/\D/g, '') },
    './remoteStore': {
      readRemoteRecords: () => records,
      saveRemoteRecords: async (...args) => { writes.push(args); },
      deleteRemoteRecords: async (...args) => { deletes.push(args); },
    },
  });
  storage.moveCheckinByDt(record.dt, '2026-09-22', '2026-09-23');
  assert.equal(writes.length, 1);
  assert.equal(writes[0][1].length, 1);
  assert.equal(writes[0][1][0].id, record.id);
  assert.equal(writes[0][2].extraBody.deleteMissing, false);
  storage.removeCheckinByDt(record.dt);
  assert.deepEqual(deletes[0], ['/api/checkins', [record.id]]);
  assert.equal(writes.length, 1);
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
    '../../lib/visiblePolling': {},
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
