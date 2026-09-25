import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

function compile(path, mocks = {}) {
  const code = ts.transpileModule(fs.readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const compiledModule = { exports: {} };
  new Function('require', 'module', 'exports', code)((name) => {
    if (name in mocks) return mocks[name];
    throw Error(`Import sin mock: ${name}`);
  }, compiledModule, compiledModule.exports);
  return compiledModule.exports;
}

const contractors = compile('../app/lib/contractors.ts');
const session = { contractor: 'HL Logisticos', accessToken: 'token', isAdmin: false };
const initial = { contractor: 'HL Logistica', updated_at: 'v1', data: {
  id: 'm1', dt: '123', totalCajas: '10', cajasGestionadas: '0', imagenVista: 'foto', comentario: 'original',
} };

async function run(changes, { auth = session, stored = initial, conflict = false, fail = false } = {}) {
  const calls = [];
  const route = compile('../app/api/modulaciones/route.ts', {
    'next/server': { NextResponse: { json: (body, init) => Response.json(body, init) } },
    '../../lib/authServer': { getAuthenticatedSession: async () => auth },
    '../../lib/contractors': contractors,
    '../../lib/adminScope': {}, '../../lib/scopedWrite': {},
    '../../lib/serverCache': { clearServerCache() {} },
    '../../lib/auditLog': { writeAuditLog: async () => {} },
    '../../lib/supabaseServer': {
      supabaseRest: (table, query) => `https://db.test/${table}${query}`,
      supabaseReadHeaders: () => ({}), supabaseAdminHeaders: () => ({}),
      supabaseError: async () => 'Error de conexión',
    },
  });
  const originalFetch = globalThis.fetch;
  let writes = 0;
  globalThis.fetch = async (url, init) => {
    calls.push({ params: new URL(url).searchParams, ...init });
    if (init.method === 'PATCH') {
      writes += 1;
      if (fail) return Response.json({ error: 'Error' }, { status: 503 });
      if (conflict && writes === 1) {
        stored = { ...stored, updated_at: 'v2', data: { ...stored.data, comentarioModulador: 'Otra pestaña' } };
        return Response.json([]);
      }
      stored = { ...stored, ...JSON.parse(init.body) };
      return Response.json([{ modulation_id: 'm1' }]);
    }
    return Response.json(stored ? [stored] : []);
  };
  try {
    const response = await route.PATCH(new Request('https://app.test/api/modulaciones', {
      method: 'PATCH', body: JSON.stringify({ id: 'm1', changes }),
    }));
    return { status: response.status, body: await response.json(), calls, stored };
  } finally { globalThis.fetch = originalFetch; }
}

test('guarda cajas y responsable juntos; conserva foto y otros campos con dos consultas', async () => {
  const result = await run({ cajasGestionadas: '10', origenReubicacion: 'Ventas' });
  assert.equal(result.status, 200);
  assert.equal(result.calls.length, 2);
  assert.equal(result.stored.data.imagenVista, 'foto');
  assert.equal(result.stored.data.comentario, 'original');
  assert.equal(result.body.record.cajasGestionadas, '10');
  assert.equal(result.body.record.origenReubicacion, 'Ventas');
  assert.ok(result.body.record.gestionCompletadaAt);
  assert.equal(result.body.record.imagenVista, '');
  assert.equal(result.calls[1].params.get('contractor'), 'eq.HL Logistica');
  assert.equal(result.calls[1].params.get('updated_at'), 'eq.v1');
});

test('un conflicto fusiona la versión nueva sin perder la nota de otra pestaña', async () => {
  const result = await run({ origenReubicacion: 'Logística' }, { conflict: true });
  assert.equal(result.status, 200);
  assert.equal(result.calls.length, 4);
  assert.equal(result.body.record.comentarioModulador, 'Otra pestaña');
  assert.equal(result.body.record.origenReubicacion, 'Logística');
  assert.equal(result.calls[3].params.get('updated_at'), 'eq.v2');
});

test('reabrir cajas limpia el cierre y cambiar responsable no altera la cantidad', async () => {
  const stored = { ...initial, data: { ...initial.data, cajasGestionadas: '10', gestionCompletadaAt: '2026-09-24T12:00:00Z' } };
  assert.equal((await run({ origenReubicacion: 'Ventas' }, { stored })).body.record.cajasGestionadas, '10');
  const result = await run({ cajasGestionadas: '3' }, { stored });
  assert.equal(result.body.record.gestionCompletadaAt, undefined);
  assert.equal(result.body.record.cajasGestionadas, '3');
});

test('rechaza sesiones y propietarios ajenos antes de escribir', async () => {
  for (const [auth, status] of [[null, 401], [{ ...session, isAdmin: true }, 403]]) {
    const result = await run({ cajasGestionadas: '1' }, { auth });
    assert.equal(result.status, status);
    assert.equal(result.calls.length, 0);
  }
  const result = await run({ cajasGestionadas: '1' }, { stored: { ...initial, contractor: 'Punto Corona' } });
  assert.equal(result.status, 403);
  assert.equal(result.calls.length, 1);
});

test('valida cambios y propaga fallos sin confirmar el guardado', async () => {
  for (const changes of [{}, { cajasGestionadas: '-1' }, { cajasGestionadas: null }, { origenReubicacion: 'Otro' }, { contratista: 'HL Logisticos' }]) {
    const result = await run(changes);
    assert.equal(result.status, 400);
    assert.equal(result.calls.length, 0);
  }
  assert.equal((await run({ cajasGestionadas: '1' }, { fail: true })).status, 503);
  assert.equal((await run({ cajasGestionadas: '1' }, { stored: null })).status, 404);
});

test('blur y clic se agrupan; el siguiente cambio en vuelo se guarda aparte', async () => {
  const { createBatchedRecordUpdater } = compile('../app/lib/batchedRecordUpdates.ts');
  const calls = [];
  let finish;
  const update = createBatchedRecordUpdater(async (id, changes) => {
    calls.push({ id, changes });
    if (calls.length === 1) await new Promise((resolve) => { finish = resolve; });
    return changes;
  }, 0);
  const first = update('m1', { cajasGestionadas: '4' });
  const second = update('m1', { origenReubicacion: 'Ventas' });
  assert.equal(first, second);
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.deepEqual(calls, [{ id: 'm1', changes: { cajasGestionadas: '4', origenReubicacion: 'Ventas' } }]);
  await update('m1', { cajasGestionadas: '5' });
  finish();
  await first;
  assert.equal(calls.length, 2);
});

test('la cola prepara el segundo cambio con los campos ya confirmados y restaura si falla', async () => {
  const store = compile('../app/lib/remoteStore.ts', {
    './storageEvents': { notifyStorageChange() {} }, './seguimientoPersistence': {},
  });
  const originalFetch = globalThis.fetch;
  let writes = 0;
  globalThis.fetch = async (_url, init) => {
    if (!init.method) return Response.json({ records: [initial.data] });
    writes += 1;
    if (writes === 1) return Response.json({ record: { ...initial.data, cajasGestionadas: '4' } });
    assert.equal(store.readRemoteRecords('/api/modulaciones')[0].cajasGestionadas, '4');
    return Response.json({ error: 'Falló el origen' }, { status: 503 });
  };
  try {
    await store.refreshRemoteRecords('/api/modulaciones');
    const options = { method: 'PATCH', mergeByKey: (record) => record.id, extraBody: {} };
    const first = store.saveRemoteRecords('/api/modulaciones', [{ ...initial.data, cajasGestionadas: '4' }], options);
    const second = store.saveRemoteRecords('/api/modulaciones', [], {
      ...options, prepareRecords: (current) => [{ ...current[0], origenReubicacion: 'Ventas' }],
    });
    const results = await Promise.allSettled([first, second]);
    assert.equal(results[0].status, 'fulfilled');
    assert.equal(results[1].status, 'rejected');
    assert.equal(store.readRemoteRecords('/api/modulaciones')[0].cajasGestionadas, '4');
    assert.equal(store.readRemoteRecords('/api/modulaciones')[0].origenReubicacion, undefined);
  } finally { globalThis.fetch = originalFetch; }
});

test('la pantalla conserva cajas y origen ante un fallo, permite reintentar y no desmarca el origen', async () => {
  const states = [];
  let cursor = 0;
  let records = [{ ...initial.data, createdAt: '2026-09-24T12:00:00Z', codigoCliente: '456', persona: 'Ana' }];
  const requests = [];
  const hook = (initialValue) => {
    const index = cursor++;
    if (!(index in states)) states[index] = typeof initialValue === 'function' ? initialValue() : initialValue;
    return [states[index], (value) => { states[index] = typeof value === 'function' ? value(states[index]) : value; }];
  };
  const element = (type, props) => ({ type, props });
  const page = compile('../app/modulacion/page.tsx', {
    'react/jsx-runtime': { jsx: element, jsxs: element },
    react: { useState: hook, useRef: (value) => hook({ current: value })[0], useEffect() {}, useMemo: (fn) => fn() },
    'next/navigation': { useRouter: () => ({}) },
    'lucide-react': new Proxy({}, { get: (_, name) => String(name) }),
    '../lib/modulacionStorage': {
      MODULACION_STORAGE_KEY: 'modulaciones', getLocalDateKey: () => '2026-09-24', normalizeDt: (dt) => dt,
      readModulacionRegistros: () => records,
      updateModulacionGestion: (id, changes) => new Promise((resolve, reject) => requests.push({ id, changes, resolve, reject })),
    },
    '../lib/seguimientoStorage': { SEGUIMIENTO_STORAGE_KEY: 'vehicles', readSeguimientoVehiculos: () => [] },
    '../lib/storageEvents': { useStorageSnapshot: (_keys, read) => read() },
    '../lib/remoteStore': {}, './utils': { getVehiculosSeguimiento: () => [] },
    '../lib/visiblePolling': {},
    './components/ModulacionHeader': { ModulacionHeader: 'header-mock' },
  });
  const render = () => { cursor = 0; return page.default(); };
  const all = (node) => {
    if (Array.isArray(node)) return node.flatMap(all);
    if (!node || typeof node !== 'object') return [];
    return [node, ...all(node.props?.children)];
  };
  const input = (tree) => all(tree).find((node) => node.props?.['aria-label'] === 'Cajas gestionadas del cliente 456');
  const origin = (tree) => all(tree).find((node) => node.props?.['aria-label'] === 'Asignar gestión a Ventas');
  const tick = () => new Promise((resolve) => setImmediate(resolve));
  input(render()).props.onChange({ target: { value: '4' } });
  const beforeBlur = render();
  input(beforeBlur).props.onBlur();
  origin(beforeBlur).props.onClick();
  assert.deepEqual(requests[1].changes, { cajasGestionadas: '4', origenReubicacion: 'Ventas' });
  assert.equal(input(render()).props.value, '4');
  assert.equal(origin(render()).props['aria-pressed'], true);
  requests[0].resolve();
  requests[1].reject(new Error('Sin conexión'));
  await tick();
  const failed = render();
  assert.equal(input(failed).props.value, '4');
  assert.equal(origin(failed).props['aria-pressed'], true);
  assert.match(JSON.stringify(failed), /Sin conexión/);
  all(failed).find((node) => node.type === 'button' && node.props.children === 'Reintentar').props.onClick();
  records = [{ ...records[0], ...requests[2].changes }];
  requests[2].resolve();
  await tick();
  const saved = render();
  assert.match(JSON.stringify(saved), /Guardado/);
  assert.equal(input(saved).props.value, '4');
  origin(saved).props.onClick();
  assert.equal(requests.length, 3);
});
