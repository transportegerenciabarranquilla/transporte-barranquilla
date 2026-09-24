import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

function compile(path, mocks = {}) {
  const code = ts.transpileModule(fs.readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const compiledModule = { exports: {} };
  new Function('require', 'module', 'exports', code)((name) => {
    if (name in mocks) return mocks[name];
    throw Error(`Import sin mock: ${name}`);
  }, compiledModule, compiledModule.exports);
  return compiledModule.exports;
}

const contractors = compile('../app/lib/contractors.ts');
const persistence = compile('../app/lib/seguimientoPersistence.ts', {
  './jornadaPersistence': compile('../app/lib/jornadaPersistence.ts'),
});
const session = { contractor: 'HL Logisticos', accessToken: 'user-token', isAdmin: false };

function route(auth = session) {
  return compile('../app/api/seguimiento/route.ts', {
    'next/server': { NextResponse: { json: (body, init) => Response.json(body, init) } },
    '../../lib/authServer': { getAuthenticatedSession: async () => auth },
    '../../lib/contractors': contractors,
    '../../lib/adminScope': {},
    '../../lib/scopedWrite': {},
    '../../seguimiento/utils': {},
    '../../lib/auditLog': {},
    '../../lib/seguimientoUpsert': {},
    '../../lib/jornadaPersistence': compile('../app/lib/jornadaPersistence.ts'),
    '../../lib/seguimientoPersistence': persistence,
    '../../lib/serverCache': { clearServerCache: () => {} },
    '../../lib/supabaseServer': {
      supabaseRest: (table, query) => `https://db.test/${table}${query}`,
      supabaseReadHeaders: () => ({ apikey: 'server-key' }),
      supabaseAdminHeaders: (extra) => ({ apikey: 'server-key', ...extra }),
      supabaseError: async () => 'Acceso denegado',
    },
  });
}

async function run(stored, { changes = { status: 'En ruta' }, saved, auth = session } = {}) {
  const calls = [];
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ params: new URL(url).searchParams, ...init });
    return Response.json(init.method === 'PATCH' ? saved ?? [{ record_id: 'dt-11' }] : stored ? [stored] : []);
  };
  try {
    const response = await route(auth).PATCH(new Request('https://app.test/api/seguimiento', {
      method: 'PATCH', body: JSON.stringify({ recordId: 'dt-11', changes }),
    }));
    return { response, calls, body: await response.json() };
  } finally { globalThis.fetch = oldFetch; }
}

test('segundo viaje histórico: guarda estado y placa con contractor NULL y propietario HL persistido', async () => {
  for (const changes of [{ status: 'En ruta' }, { vehiculo: 'ABC123', vehiculoAnterior: 'XYZ987', capacidad: 9000, validadorPeso: 'validado' }]) {
    const { response, calls, body } = await run({ contractor: null, data: { transportista: 'HL Logisticos', clientes: 2 } }, { changes });
    assert.equal(response.status, 200);
    assert.equal(calls[0].params.has('contractor'), false);
    assert.equal(calls[1].params.get('contractor'), 'is.null');
    assert.equal(calls[1].params.get('data->>transportista'), 'eq.HL Logisticos');
    assert.equal(calls[1].params.get('record_id'), 'eq.dt-11');
    assert.equal(calls[1].headers.Prefer, 'return=representation');
    assert.equal(body.record.clientes, 2);
    for (const [key, value] of Object.entries(changes)) assert.equal(body.record[key], value);
    assert.equal('contractor' in JSON.parse(calls[1].body), false);
  }
});

test('alias HL: actualiza usando el propietario exacto almacenado', async () => {
  for (const contractor of ['HL Logisticos', 'HL Logistica', 'HL Logísticos']) {
    const { response, calls } = await run({ contractor, data: { transportista: contractor } });
    assert.equal(response.status, 200);
    assert.equal(calls[1].params.get('contractor'), `eq.${contractor}`);
  }
});

test('rechaza propietario ajeno, ausente o contradictorio aunque el cliente envíe HL', async () => {
  for (const stored of [
    { contractor: 'Punto Corona', data: { transportista: 'HL Logisticos' } },
    { contractor: null, data: { transportista: 'Punto Corona' } },
    { contractor: null, data: {} },
  ]) {
    const { response, calls } = await run(stored, { changes: { status: 'En ruta', transportista: 'HL Logisticos' } });
    assert.equal(response.status, 403);
    assert.equal(calls.length, 1);
  }
});

test('no anuncia éxito si RLS o un cambio concurrente impiden actualizar', async () => {
  const { response } = await run({ contractor: 'HL Logisticos', data: {} }, { saved: [] });
  assert.equal(response.status, 409);
});

test('ruta ausente devuelve 404; sesión ausente no consulta Supabase', async () => {
  assert.equal((await run(null)).response.status, 404);
  const { response, calls } = await run(null, { auth: null });
  assert.equal(response.status, 401);
  assert.equal(calls.length, 0);
});

test('jornada guarda solo una ruta, conserva otros campos y condiciona la escritura a su versión', async () => {
  const version = '2026-09-24T12:00:00.123456+00:00';
  const { response, calls, body } = await run({
    contractor: 'HL Logisticos', updated_at: version,
    data: { clientes: 8, horaInicioRelevo: 'Pendiente', relevador: 'Ana', status: 'En ruta' },
  }, { changes: { horaInicioRelevo: '16:30', investigacionDesvio: 'Lluvia' } });
  assert.equal(response.status, 200);
  assert.equal(calls.length, 2);
  assert.equal(calls[1].params.get('updated_at'), `eq.${version}`);
  assert.equal(body.record.clientes, 8);
  assert.equal(body.record.relevador, 'Ana');
  assert.equal(body.record.horaInicioRelevo, '16:30');
  assert.ok(body.record.jornadaUpdatedAt);
});

test('jornada rechaza texto inválido antes de escribir', async () => {
  for (const value of [null, 10, 'x'.repeat(4001)]) {
    const { response, calls } = await run(null, { changes: { relevador: value } });
    assert.equal(response.status, 400);
    assert.equal(calls.length, 0);
  }
});

test('importación antigua conserva jornada y borrados intencionales ya confirmados', () => {
  const { preserveJornada } = compile('../app/lib/jornadaPersistence.ts');
  const saved = { horaInicioRelevo: 'Pendiente', relevador: '', investigacionDesvio: 'Lluvia', jornadaUpdatedAt: '2026-09-24T12:00:00Z' };
  const result = preserveJornada({ horaInicioRelevo: '14:00', relevador: 'Anterior', investigacionDesvio: '', clientes: 12 }, saved);
  assert.equal(result.horaInicioRelevo, 'Pendiente');
  assert.equal(result.relevador, '');
  assert.equal(result.investigacionDesvio, 'Lluvia');
  assert.equal(result.clientes, 12);
  assert.equal(preserveJornada({ relevador: '' }, { relevador: 'Histórico' }).relevador, 'Histórico');
});

test('PUT con versión obsoleta falla sin anunciar éxito ni sobrescribir cambios concurrentes', async () => {
  const { scopedWrite } = compile('../app/lib/scopedWrite.ts', {
    './contractors': contractors,
    './supabaseServer': { supabaseRest: (table, query = '') => `https://db.test/${table}${query}` },
  });
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url, ...init });
    return Response.json(init.method === 'PATCH' ? [] : [{ record_id: 'dt-11', contractor: 'HL Logisticos' }]);
  };
  try {
    const response = await scopedWrite('seguimiento_vehiculos', 'record_id', [{ record_id: 'dt-11', contractor: 'HL Logisticos', data: {} }], {}, {
      expectedVersions: new Map([['dt-11', '2026-09-24T12:00:00Z']]),
    });
    assert.equal(response.status, 409);
    assert.equal(new URL(calls[1].url).searchParams.get('updated_at'), 'eq.2026-09-24T12:00:00Z');
    assert.equal(new URL(calls[1].url).searchParams.get('contractor'), 'eq.HL Logisticos');
  } finally { globalThis.fetch = original; }
});

test('la cola conserva el primer PATCH confirmado cuando falla el segundo', async () => {
  const store = compile('../app/lib/remoteStore.ts', { './storageEvents': { notifyStorageChange: () => {} }, './seguimientoPersistence': persistence });
  const original = globalThis.fetch;
  let writes = 0;
  globalThis.fetch = async (_url, init) => {
    if (!init.method) return Response.json({ records: [{ recordId: 'a', relevador: 'Antes', investigacionDesvio: '' }] });
    writes += 1;
    return writes === 1
      ? Response.json({ record: { recordId: 'a', relevador: 'Confirmado', investigacionDesvio: '' } })
      : Response.json({ error: 'Conflicto' }, { status: 409 });
  };
  try {
    await store.refreshRemoteRecords('/api/seguimiento');
    const options = { method: 'PATCH', mergeByKey: (row) => row.recordId, extraBody: {} };
    const first = store.saveRemoteRecords('/api/seguimiento', [{ recordId: 'a', relevador: 'Confirmado' }], options);
    const second = store.saveRemoteRecords('/api/seguimiento', [{ recordId: 'a', relevador: 'Antes', investigacionDesvio: 'Borrador' }], options);
    const results = await Promise.allSettled([first, second]);
    assert.equal(results[0].status, 'fulfilled');
    assert.equal(results[1].status, 'rejected');
    assert.equal(store.readRemoteRecords('/api/seguimiento')[0].relevador, 'Confirmado');
    assert.equal(store.readRemoteRecords('/api/seguimiento')[0].investigacionDesvio, '');
  } finally { globalThis.fetch = original; }
});
