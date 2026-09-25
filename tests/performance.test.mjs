import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

function compile(path, mocks = {}) {
  const code = ts.transpileModule(fs.readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const compiled = { exports: {} };
  new Function('require', 'module', 'exports', code)((name) => {
    if (name in mocks) return mocks[name];
    throw Error(name);
  }, compiled, compiled.exports);
  return compiled.exports;
}

test('lecturas iguales conservan la referencia; cambios anidados y eliminaciones se notifican', async (t) => {
  let notifications = 0;
  let records = [{ id: 'a', nested: { count: 1 } }];
  const store = compile('../app/lib/remoteStore.ts', {
    './storageEvents': { notifyStorageChange: () => notifications++ },
    './seguimientoPersistence': {},
  });
  t.mock.method(globalThis, 'fetch', async () => Response.json({ records }));
  await store.refreshRemoteRecords('/api/checkins');
  const first = store.readRemoteRecords('/api/checkins');
  await store.refreshRemoteRecords('/api/checkins', { force: true });
  assert.equal(store.readRemoteRecords('/api/checkins'), first);
  assert.equal(notifications, 1);
  records = [{ nested: { count: 2 }, id: 'a' }];
  await store.refreshRemoteRecords('/api/checkins', { force: true });
  assert.equal(store.readRemoteRecords('/api/checkins')[0].nested.count, 2);
  assert.equal(notifications, 2);
  records = [];
  await store.refreshRemoteRecords('/api/checkins', { force: true });
  assert.deepEqual(store.readRemoteRecords('/api/checkins'), []);
  assert.equal(notifications, 3);
});

test('oculta finalizados con llegada solo en el rango; los recupera sin fechas o con filtro explícito', () => {
  const { matchesRouteStatusFilter } = compile('../app/seguimiento/utils.ts');
  const closed = Object.freeze({ status: 'Finalizado', horaLlegada: '17:30', clientes: 10, visitados: 10 });
  const pendingArrival = { ...closed, horaLlegada: 'Pendiente' };
  const onRoute = { ...closed, status: 'En ruta', horaLlegada: 'Pendiente', visitados: 8 };
  assert.equal(matchesRouteStatusFilter(closed, ['Activos'], true), false);
  assert.equal(matchesRouteStatusFilter(closed, ['Activos'], false), true);
  assert.equal(matchesRouteStatusFilter(closed, ['Finalizado'], true), true);
  assert.equal(matchesRouteStatusFilter(pendingArrival, ['Activos'], true), true);
  assert.equal(matchesRouteStatusFilter(onRoute, ['Activos'], true), true);
  assert.equal(matchesRouteStatusFilter(onRoute, ['Finalizado'], true), false);
  assert.equal(matchesRouteStatusFilter(closed, ['En ruta'], false), false);
  assert.equal(matchesRouteStatusFilter(closed, [], true), true);
  for (const status of ['Cargando', 'Pernoctado', 'Retornando', 'Pendiente por salir', 'Cambio de fecha']) {
    assert.equal(matchesRouteStatusFilter({ ...onRoute, status }, ['Activos'], true), true);
  }
  assert.equal(closed.horaLlegada, '17:30');
});

test('pestaña oculta pausa consultas, al volver actualiza sin solapar una petición lenta', async (t) => {
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  let cleanup = () => {};
  const document = new EventTarget();
  document.visibilityState = 'visible';
  Object.defineProperty(globalThis, 'document', { configurable: true, value: document });
  t.after(() => {
    cleanup();
    if (previousDocument) Object.defineProperty(globalThis, 'document', previousDocument);
    else delete globalThis.document;
  });
  const timers = new Map();
  let timerId = 0;
  t.mock.method(globalThis, 'setTimeout', (callback) => { timers.set(++timerId, callback); return timerId; });
  t.mock.method(globalThis, 'clearTimeout', (id) => timers.delete(id));
  const { startVisiblePolling } = compile('../app/lib/visiblePolling.ts');
  let calls = 0;
  let finish;
  const stop = startVisiblePolling(() => {
    calls++;
    return new Promise((resolve) => { finish = resolve; });
  }, 30000);
  cleanup = stop;
  assert.equal(calls, 1);
  document.visibilityState = 'hidden';
  document.dispatchEvent(new Event('visibilitychange'));
  document.visibilityState = 'visible';
  document.dispatchEvent(new Event('visibilitychange'));
  assert.equal(calls, 1);
  finish();
  await Promise.resolve();
  assert.equal(timers.size, 1);
  document.visibilityState = 'hidden';
  document.dispatchEvent(new Event('visibilitychange'));
  assert.equal(timers.size, 0);
  document.visibilityState = 'visible';
  document.dispatchEvent(new Event('visibilitychange'));
  assert.equal(calls, 2);
  stop();
  finish();
  await Promise.resolve();
  assert.equal(timers.size, 0);
  document.dispatchEvent(new Event('visibilitychange'));
  assert.equal(calls, 2);
});

test('portal no administrador no monta ni consulta el buscador global', () => {
  const page = compile('../app/components/GlobalOperationsSearch.tsx', {
    react: {}, 'react/jsx-runtime': { jsx: (type, props) => ({ type, props }) },
    'lucide-react': {}, 'next/navigation': {}, '../lib/asistenciaStorage': {},
    '../lib/modulacionStorage': {}, '../lib/remoteStore': {}, '../lib/seguimientoStorage': {},
    '../lib/storageEvents': {}, '../lib/visiblePolling': {},
  });
  assert.equal(page.GlobalOperationsSearch({ isAdmin: false }), null);
  assert.ok(page.GlobalOperationsSearch({ isAdmin: true }));
});
