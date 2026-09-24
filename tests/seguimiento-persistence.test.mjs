import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
function compile(source, mocks = {}) {
  const path = source instanceof URL ? source : new URL(source, import.meta.url);
  const code = ts.transpileModule(fs.readFileSync(path, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const compiled = { exports: {} };
  new Function('require', 'module', 'exports', code)((name) => {
    if (name in mocks) return mocks[name];
    if (name.startsWith('.')) return compile(new URL(`${name.replace(/\.ts$/, '')}.ts`, path), mocks);
    return require(name);
  }, compiled, compiled.exports);
  return compiled.exports;
}

const persistence = compile('../app/lib/seguimientoPersistence.ts');
const mocks = {
  'next/server': { NextResponse: { json: (body, init) => Response.json(body, init) } },
  '../../lib/authServer': { getAuthenticatedSession: async () => ({ contractor: 'HL Logisticos', accessToken: 'test', userId: 'hl', isAdmin: false }) },
  '../../lib/supabaseServer': {
    supabaseRest: (table, query = '') => `https://db.test/${table}${query}`,
    supabaseReadHeaders: () => ({}), supabaseUserHeaders: () => ({}), supabaseAdminHeaders: () => ({}),
    supabaseError: async () => 'Error de lectura',
  },
  '../../lib/serverCache': { clearServerCache: () => {}, cachedJsonFetch: async () => [] },
  '../../lib/auditLog': { writeAuditLog: async () => {} },
  '../../lib/scopedWrite': { scopedWrite: async () => null },
};
function vehicle(id, extra = {}) {
  return { recordId: id, transporte: '123', transportista: 'HL Logisticos', fechaDespacho: '2026-09-24', clientes: 10, visitados: 3, status: 'En ruta', horaSalida: '08:00', horaLlegada: 'Pendiente', ...extra };
}
function stored(record, version = '2026-09-24T12:00:00.123456+00:00') {
  return { record_id: record.recordId, contractor: 'HL Logisticos', data: record, updated_at: version };
}

async function withFetch(fetcher, work) {
  const original = globalThis.fetch;
  globalThis.fetch = (url, init) => String(url).startsWith('https://db.test/') && new URL(url).pathname !== '/seguimiento_vehiculos'
    ? Promise.resolve(Response.json([])) : fetcher(url, init);
  try { return await work(); } finally { globalThis.fetch = original; }
}

test('GET conserva IDs distintos del mismo DT, incluso después de mover otra ruta de fecha', async () => {
  const rows = [stored(vehicle('historia', { fechaDespacho: '2026-09-23' })), stored(vehicle('actual', { dispatchDateUpdatedAt: '2026-09-24T11:00:00Z' })), stored(vehicle('otro-viaje'))];
  await withFetch(async () => Response.json(rows), async () => {
    const response = await compile('../app/api/seguimiento/route.ts', mocks).GET(new Request('https://app.test/api/seguimiento'));
    assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).records.map(r => r.recordId), ['historia', 'actual', 'otro-viaje']);
  });
});

test('paginación por ID no pierde DT cuando cambia updated_at entre páginas', async () => {
  const rows = Array.from({ length: 1001 }, (_, index) => stored(vehicle(`id-${String(index).padStart(4, '0')}`, { transporte: String(index) })));
  const queries = [];
  await withFetch(async (url) => {
    const params = new URL(url).searchParams;
    queries.push(params);
    const after = params.get('record_id')?.slice(3);
    const page = rows.filter(row => !after || row.record_id > after).slice(0, 1000);
    rows[1000].updated_at = '2026-09-24T23:00:00Z';
    return Response.json(page);
  }, async () => {
    const response = await compile('../app/api/seguimiento/route.ts', mocks).GET(new Request('https://app.test/api/seguimiento'));
    assert.equal(response.status, 200);
    const { records } = await response.json();
    assert.equal(new Set(records.map(r => r.recordId)).size, 1001);
    assert.equal(queries.length, 2);
    assert.equal(queries[1].get('record_id'), 'gt.id-0999');
    assert.ok(queries.every(params => params.get('order') === 'record_id.asc' && !params.has('offset')));
  });
});

test('si falla una página, GET no entrega una lista parcial de DT', async () => {
  let reads = 0;
  const rows = Array.from({ length: 1000 }, (_, index) => stored(vehicle(`id-${index}`)));
  await withFetch(async () => ++reads === 1 ? Response.json(rows) : Response.json({}, { status: 503 }), async () => {
    const response = await compile('../app/api/seguimiento/route.ts', mocks).GET(new Request('https://app.test/api/seguimiento'));
    assert.equal(response.status, 500);
    assert.equal((await response.json()).records, undefined);
  });
});

test('un PATCH conserva liquidación y estado frente a un PUT antiguo y a otra lectura', async () => {
  let row = stored(vehicle('a', { status: 'Finalizado', horaLlegada: '17:00', visitados: 10, liquidado: true }));
  const route = compile('../app/api/seguimiento/route.ts', {
    ...mocks,
    '../../lib/scopedWrite': { scopedWrite: async (_table, _column, rows) => { row = rows[0]; return null; } },
  });
  await withFetch(async (_url, init) => {
    if (init.method === 'PATCH') row = { ...row, ...JSON.parse(init.body) };
    return Response.json([row]);
  }, async () => {
    const response = await route.PATCH(new Request('https://app.test/api/seguimiento', { method: 'PATCH', body: JSON.stringify({ recordId: 'a', changes: { status: 'En ruta', liquidado: false, tiempoPlaneado: '8' } }) }));
    assert.equal(response.status, 200);
    const saved = (await response.json()).record;
    assert.equal(saved.horaLlegada, 'Pendiente');
    assert.ok(saved.recordUpdatedAt);
    const imported = await route.PUT(new Request('https://app.test/api/seguimiento', { method: 'PUT', body: JSON.stringify({ records: [vehicle('a', { status: 'Finalizado', horaLlegada: '17:00', liquidado: true, tiempoPlaneado: '4' })] }) }));
    assert.equal(imported.status, 200);
    const read = await route.GET(new Request('https://app.test/api/seguimiento'));
    const [result] = (await read.json()).records;
    assert.equal(result.status, 'En ruta');
    assert.equal(result.horaLlegada, 'Pendiente');
    assert.equal(result.liquidado, false);
    assert.equal(result.tiempoPlaneado, '8');
  });
});

test('refrescos antiguos, aun después de cinco minutos, no reemplazan lo confirmado; cambios nuevos sí', async () => {
  const store = compile('../app/lib/remoteStore.ts', { './storageEvents': { notifyStorageChange: () => {} } });
  const initial = vehicle('a', { liquidado: false, recordUpdatedAt: '2026-09-24T10:00:00.123456Z' });
  const saved = { ...initial, liquidado: true, recordUpdatedAt: '2026-09-24T11:00:00.123456Z' };
  let incoming = [initial];
  const now = Date.now;
  await withFetch(async (_url, init) => Response.json(init.method ? { record: saved } : { records: incoming }), async () => {
    try {
      await store.refreshRemoteRecords('/api/seguimiento');
      await store.saveRemoteRecords('/api/seguimiento', [saved], { method: 'PATCH', mergeByKey: r => r.recordId, extraBody: { changes: { liquidado: true } } });
      await store.waitForRemoteSaves('/api/seguimiento');
      Date.now = () => now() + 300_000;
      await store.refreshRemoteRecords('/api/seguimiento', { force: true });
      assert.equal(store.readRemoteRecords('/api/seguimiento')[0].liquidado, true);
      incoming = [{ ...saved, liquidado: false, recordUpdatedAt: '2026-09-24T11:00:00.123457Z' }];
      await store.refreshRemoteRecords('/api/seguimiento', { force: true });
      assert.equal(store.readRemoteRecords('/api/seguimiento')[0].liquidado, false);
      incoming = [];
      await store.refreshRemoteRecords('/api/seguimiento', { force: true });
      assert.equal(store.readRemoteRecords('/api/seguimiento').length, 0, 'las eliminaciones reales siguen visibles');
    } finally { Date.now = now; }
  });
});

test('preparación e importación del navegador conservan dos rutas con igual DT y fecha', () => {
  const records = compile('../app/seguimiento/services/vehicleRecords.ts', {
    '../../lib/asistenciaStorage': {}, '../../lib/checkinStorage': {}, '../../lib/modulacionStorage': {}, '../../lib/seguimientoStorage': {},
  });
  const input = [vehicle('a', { vehiculo: 'AAA111' }), vehicle('b', { vehiculo: 'BBB222' })];
  assert.equal(records.removeDuplicateDtRecords(input).length, 2);
  const imported = records.mergeVehiclesByDt(input, [vehicle(undefined, { vehiculo: 'AAA111', cajas: 50 })]);
  assert.deepEqual(new Set(imported.map(r => r.recordId)), new Set(['a', 'b']));
});

test('la edición envía solo campos explícitos o derivados sin incluir otra fila ni metadatos', () => {
  const before = vehicle('a', { liquidado: false });
  assert.deepEqual(persistence.seguimientoChanges(before, { ...before, liquidado: true }, { liquidado: true }), { liquidado: true });
});

test('dos guardados fallidos en cola no convierten el primer borrador en datos guardados', async () => {
  const store = compile('../app/lib/remoteStore.ts', { './storageEvents': { notifyStorageChange: () => {} } });
  const record = vehicle('a', { liquidado: false });
  await withFetch(async (_url, init) => init.method
    ? Response.json({ error: 'Conflicto' }, { status: 409 }) : Response.json({ records: [record] }), async () => {
    await store.refreshRemoteRecords('/api/seguimiento');
    const options = { method: 'PATCH', mergeByKey: r => r.recordId, extraBody: {} };
    const results = await Promise.allSettled([
      store.saveRemoteRecords('/api/seguimiento', [{ ...record, liquidado: true }], options),
      store.saveRemoteRecords('/api/seguimiento', [{ ...record, visitados: 9 }], options),
    ]);
    assert.ok(results.every(result => result.status === 'rejected'));
    assert.deepEqual(store.readRemoteRecords('/api/seguimiento'), [record]);
  });
});

test('eliminar un ID autorizado no elimina otra ruta con igual DT y fecha', async () => {
  let rows = [stored(vehicle('a')), stored(vehicle('b'))];
  const route = compile('../app/api/seguimiento/route.ts', {
    ...mocks,
    '../../lib/authServer': { getAuthenticatedSession: async () => ({ contractor: 'Admin', email: 'saul808c@gmail.com', accessToken: 'test', isAdmin: true }) },
  });
  await withFetch(async (url, init) => {
    if (init.method === 'DELETE') {
      const id = new URL(url).searchParams.get('record_id').slice(3);
      const removed = rows.filter(row => row.record_id === id);
      rows = rows.filter(row => row.record_id !== id);
      return Response.json(removed);
    }
    return Response.json(rows);
  }, async () => {
    const response = await route.DELETE(new Request('https://app.test/api/seguimiento', {
      method: 'DELETE', body: JSON.stringify({ contractor: 'HL Logisticos', ids: ['a'], routes: [rows[0].data] }),
    }));
    assert.equal(response.status, 200);
    assert.deepEqual(rows.map(row => row.record_id), ['b']);
  });
});
