import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
function compile(path, mocks = {}) {
  const code = ts.transpileModule(fs.readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', code)((name) => {
    if (name in mocks) return mocks[name];
    if (name === 'react/jsx-runtime') return require(name);
    throw Error(`Import sin mock: ${name}`);
  }, mod, mod.exports);
  return mod.exports;
}
const contractors = compile('../app/lib/contractors.ts');
const reasons = compile('../app/lib/rangeReasons.ts');
const rangoSession = compile('../app/lib/rangoSession.ts', { './contractors': contractors });
const report = { id: 'r1', contractor: 'Surti Cervezas', kind: 'current', operationalDate: '2026-09-30', summary: { startedRows: 2 }, rows: [
  { id: 'c1', pocName: 'Las Brisas', pocExternalId: '14471339', status: 'CONCLUDED', withinRadius: false, outOfRadiusReason: 'Posición incorrecta' },
  { id: 'c2', status: 'CONCLUDED', withinRadius: false, outOfRadiusReason: 'Original' },
] };

async function withApi(callback, { auth = { contractor: 'Surti Cervezas', accessToken: 'test', isAdmin: false }, contractor = 'Surti Cervezas', kind = 'current', fail = false, conflict = false, missing = false } = {}) {
  let stored = { report_id: 'r1', contractor, kind, updated_at: 'v1', data: structuredClone({ ...report, contractor, kind }) };
  const calls = [];
  const invalidations = [];
  const route = compile('../app/api/punto-corona-routes/route.ts', {
    'next/server': { NextResponse: { json: (body, init) => Response.json(body, init) } },
    '../../lib/authServer': { getAuthenticatedSession: async () => auth },
    '../../lib/contractors': contractors,
    '../../lib/rangeReasons': reasons,
    '../../lib/scopedWrite': {}, '../../lib/modulacionStorage': {},
    '../../lib/auditLog': { writeAuditLog: async () => {} },
    '../../lib/serverCache': { clearServerCache: (key) => invalidations.push(key), cachedJsonFetch: async () => [structuredClone(stored)] },
    '../../lib/supabaseServer': { supabaseRest: (table, query) => `https://db.test/${table}${query}`, supabaseAdminHeaders: () => ({}), supabaseUserHeaders: () => ({}), supabaseError: async () => 'Error de conexión' },
  });
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const params = new URL(url).searchParams;
    calls.push({ params, ...init });
    if (init.method === 'PATCH') {
      if (fail) return Response.json({}, { status: 503 });
      if (conflict) {
        conflict = false;
        stored.updated_at = 'v2';
        stored.data.rows[1].manualOutOfRadiusReason = 'Reconstrucción';
        return Response.json([]);
      }
      assert.equal(params.get('updated_at'), `eq.${stored.updated_at}`);
      stored = { ...stored, ...JSON.parse(init.body) };
      return Response.json([stored]);
    }
    return Response.json(missing ? [] : [stored]);
  };
  const patch = (reason, rowId = 'c1', expectedContractor) => route.PATCH(new Request('https://app.test/api/punto-corona-routes', { method: 'PATCH', body: JSON.stringify({ reportId: 'r1', rowId, reason, contractor: expectedContractor }) }));
  try { await callback({ patch, route, calls, invalidations, stored: () => stored }); }
  finally { globalThis.fetch = original; }
}

for (const contractor of ['Surti Cervezas', 'HL Logisticos', 'Logisticos']) {
test(`${contractor}: cada opción se guarda y GET recupera el motivo sin alterar el archivo ni los totales`, async () => {
  await withApi(async ({ patch, route, calls, invalidations }) => {
    for (const reason of reasons.RANGE_REASONS) {
      const result = await patch(reason);
      assert.equal(result.status, 200);
      const loaded = await (await route.GET()).json();
      assert.equal(loaded.records[0].rows[0].manualOutOfRadiusReason, reason);
      assert.equal(loaded.records[0].rows[0].outOfRadiusReason, 'Posición incorrecta');
      assert.deepEqual(loaded.records[0].summary, report.summary);
      assert.deepEqual(loaded.records[0].rows[1], report.rows[1]);
    }
    assert.ok(calls.every((call) => call.params.get('contractor') === `eq.${contractor}`));
    assert.ok(invalidations.includes('supabase:admin-rango:'));
  }, { contractor, auth: { contractor, accessToken: 'test', isAdmin: false } });
});
}

test('la regla compartida habilita las contratistas solicitadas y sus nombres normalizados', () => {
  for (const value of ['Surti Cervezas', 'HL Logisticos', 'HL Logistica', 'Logísticos']) {
    assert.equal(contractors.canEditRangeReasons(value), true);
  }
  for (const value of ['Punto Corona', 'Logisticos Arenosa', 'Punto Corona Arenosa', 'Admin', '', null]) {
    assert.equal(contractors.canEditRangeReasons(value), false);
  }
});

test('HL Logisticos y Logisticos no pueden editar reportes ajenos ni cierres', async () => {
  for (const contractor of ['HL Logisticos', 'Logisticos']) {
    const auth = { contractor, accessToken: 'test', isAdmin: false };
    for (const options of [{ auth }, { auth, contractor, kind: 'closure' }]) {
      await withApi(async ({ patch, calls }) => {
        assert.equal((await patch('Reubicación')).status, options.kind ? 409 : 404);
        assert.ok(calls.every((call) => call.method !== 'PATCH'));
      }, options);
    }
  }
});
test('rechaza otras cuentas, sesiones ausentes, cierres y motivos inválidos', async () => {
  for (const [options, status] of [[{ auth: null }, 401], [{ auth: { contractor: 'Punto Corona' } }, 403], [{ auth: { contractor: 'Surti Cervezas', isAdmin: true } }, 403], [{ kind: 'closure' }, 409], [{ missing: true }, 404]]) {
    await withApi(async ({ patch, calls }) => {
      assert.equal((await patch('Reubicación')).status, status);
      assert.ok(calls.every((call) => call.method !== 'PATCH'));
    }, options);
  }
  await withApi(async ({ patch, calls, stored }) => {
    assert.equal((await patch('Cualquier texto')).status, 400);
    assert.equal(calls.length, 0);
    assert.equal((await patch('Reubicación', 'desconocido')).status, 400);
    stored().data.rows[0].withinRadius = true;
    assert.equal((await patch('Reubicación')).status, 400);
  });
});
test('conserva ediciones concurrentes y comunica fallos sin modificar datos', async () => {
  await withApi(async ({ patch, stored }) => {
    assert.equal((await patch('Apoyo de ingreso')).status, 200);
    assert.equal(stored().data.rows[1].manualOutOfRadiusReason, 'Reconstrucción');
  }, { conflict: true });
  await withApi(async ({ patch, stored }) => {
    assert.equal((await patch('Apoyo de ingreso')).status, 503);
    assert.equal(stored().data.rows[0].manualOutOfRadiusReason, undefined);
  }, { fail: true });
});

function componentHarness(save) {
  const states = [];
  let index = 0;
  const Component = compile('../app/punto-corona/RangeReasonSelect.tsx', {
    react: { useState: (initial) => { const slot = index++; if (!(slot in states)) states[slot] = initial; return [states[slot], (value) => { states[slot] = value; }]; } },
    '../lib/rangeReasons': reasons,
    '../lib/puntoCoronaRoutesStorage': { savePuntoCoronaRangeReason: save },
  }).default;
  return (props = {}) => { index = 0; return Component({ reportId: 'r1', contractor: 'Surti Cervezas', row: report.rows[0], disabled: false, ...props }); };
}
function children(tree) { return tree.props.children.flat(Infinity).filter(Boolean); }
const tick = () => new Promise((resolve) => setImmediate(resolve));
test('comprueba la sesión real antes de guardar en las tres contratistas', async () => {
  const originalFetch = globalThis.fetch;
  try {
    for (const contractor of ['Surti Cervezas', 'HL Logisticos', 'Logisticos']) {
      let active = { contractor, isAdmin: false };
      let writes = 0;
      globalThis.fetch = async (url, init) => {
        assert.equal(url, '/api/session/session');
        assert.equal(init.cache, 'no-store');
        return Response.json({ session: active });
      };
      const storage = compile('../app/lib/puntoCoronaRoutesStorage.ts', {
        './remoteStore': { saveRemoteRecords: async (_endpoint, _records, options) => { writes++; assert.equal(options.extraBody.contractor, contractor); return []; } },
        './rangoSession': rangoSession,
      });
      await storage.savePuntoCoronaRangeReason('r1', 'c1', 'Reubicación', contractor);
      assert.equal(writes, 1);
      active = { contractor: 'Admin', isAdmin: true };
      await assert.rejects(storage.savePuntoCoronaRangeReason('r1', 'c1', 'Reubicación', contractor), /otra pestaña/);
      active = { contractor: contractor === 'Logisticos' ? 'HL Logisticos' : 'Logisticos', isAdmin: false };
      await assert.rejects(storage.savePuntoCoronaRangeReason('r1', 'c1', 'Reubicación', contractor), /sesión cambió/);
      active = null;
      await assert.rejects(storage.savePuntoCoronaRangeReason('r1', 'c1', 'Reubicación', contractor));
      assert.equal(writes, 1, 'No escribe con una sesión distinta');
    }
    globalThis.fetch = async () => Response.json({}, { status: 401 });
    await assert.rejects(rangoSession.getRangoSession('Surti Cervezas'), /sesión terminó/);
  } finally { globalThis.fetch = originalFetch; }
});

test('si la cuenta cambia después de verificarla, el servidor rechaza la edición sin escribir', async () => {
  for (const contractor of ['Surti Cervezas', 'HL Logisticos', 'Logisticos']) {
    await withApi(async ({ patch, calls }) => {
      const response = await patch('Reubicación', 'c1', contractor);
      assert.equal(response.status, 409);
      assert.match((await response.json()).error, /sesión cambió en otra pestaña/);
      assert.equal(calls.length, 0);
    }, { auth: { contractor: 'Admin', isAdmin: true } });
  }
});

test('desplegable permite las cuatro opciones, guarda al cambiar y refleja confirmación y errores', async () => {
  const calls = [];
  const render = componentHarness(async (...args) => { calls.push(args); });
  let select = children(render())[0];
  assert.deepEqual(children(select).slice(1).map((item) => item.props.value), reasons.RANGE_REASONS);
  for (const reason of reasons.RANGE_REASONS) {
    select.props.onChange({ target: { value: reason } });
    assert.equal(children(render())[0].props.disabled, true);
    await tick();
    const tree = render({ row: { ...report.rows[0], manualOutOfRadiusReason: reason } });
    select = children(tree)[0];
    assert.equal(select.props.value, reason);
    assert.equal(children(tree).at(-1).props.children, 'Motivo guardado');
  }
  assert.equal(calls.length, 4);
  assert.deepEqual(calls[0], ['r1', 'c1', 'Apoyo de ingreso', 'Surti Cervezas']);
  assert.equal(children(render({ disabled: true }))[0].props.disabled, true);
  const failure = componentHarness(async () => { throw Error('Sin conexión'); });
  children(failure())[0].props.onChange({ target: { value: 'Reubicación' } });
  await tick();
  assert.equal(children(failure()).find((item) => item.props.role === 'alert').props.children, 'Sin conexión');
  assert.equal(children(failure())[0].props.value, '');
});

test('el guardado actualiza la caché del portal, sobrevive una recarga y revierte errores', async () => {
  await withApi(async ({ route }) => {
    const apiFetch = globalThis.fetch;
    globalThis.fetch = async (url, init = {}) => {
      if (url === '/api/session/session') return Response.json({ session: { contractor: 'Surti Cervezas', isAdmin: false } });
      if (url !== '/api/punto-corona-routes') return apiFetch(url, init);
      return init.method === 'PATCH'
        ? route.PATCH(new Request(`https://app.test${url}`, init))
        : route.GET();
    };
    let notifications = 0;
    const remote = compile('../app/lib/remoteStore.ts', {
      './storageEvents': { notifyStorageChange: () => notifications++ },
      './seguimientoPersistence': {},
    });
    const storage = compile('../app/lib/puntoCoronaRoutesStorage.ts', { './remoteStore': remote, './rangoSession': rangoSession });
    const endpoint = '/api/punto-corona-routes';
    await remote.refreshRemoteRecords(endpoint, { force: true });
    await storage.savePuntoCoronaRangeReason('r1', 'c1', 'Reubicación', 'Surti Cervezas');
    assert.equal(remote.readCachedRemoteRecords(endpoint)[0].rows[0].manualOutOfRadiusReason, 'Reubicación');
    await tick();
    remote.clearRemoteCache();
    await remote.refreshRemoteRecords(endpoint, { force: true });
    assert.equal(remote.readCachedRemoteRecords(endpoint)[0].rows[0].manualOutOfRadiusReason, 'Reubicación');
    await assert.rejects(storage.savePuntoCoronaRangeReason('r1', 'c1', 'Inválido', 'Surti Cervezas'));
    assert.equal(remote.readCachedRemoteRecords(endpoint)[0].rows[0].manualOutOfRadiusReason, 'Reubicación');
    assert.ok(notifications > 2);
  });
});

test('una nueva carga y el cierre conservan el motivo manual', () => {
  const service = compile('../app/punto-corona/routeReportService.ts', {
    '../lib/puntoCoronaRoutesStorage': { getPuntoCoronaClosureReportId: () => 'closure' },
    '../lib/contractors': contractors,
    '../lib/modulacionStorage': { normalizeDt: (value) => String(value || '') },
    '../seguimiento/utils': {},
  });
  const existing = structuredClone(report);
  existing.rows[0].manualOutOfRadiusReason = 'Cambio de Coordenadas';
  const incoming = structuredClone(report);
  incoming.rows[0].outOfRadiusReason = 'Nuevo motivo del archivo';
  const merged = service.mergePuntoCoronaRouteReports(existing, incoming);
  assert.equal(merged.rows[0].manualOutOfRadiusReason, 'Cambio de Coordenadas');
  assert.equal(merged.rows[0].outOfRadiusReason, 'Nuevo motivo del archivo');
  assert.equal(service.createClosureReport(merged).rows[0].manualOutOfRadiusReason, 'Cambio de Coordenadas');
});
