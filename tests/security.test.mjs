import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

function compile(relative, mocks = {}) {
  const path = new URL(relative, import.meta.url);
  const code = ts.transpileModule(fs.readFileSync(path, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const compiledModule = { exports: {} };
  new Function('require', 'module', 'exports', code)((name) => {
    if (name in mocks) return mocks[name];
    if (name.startsWith('.')) return compile(new URL(`${name.replace(/\.ts$/, '')}.ts`, path), mocks);
    return require(name);
  }, compiledModule, compiledModule.exports);
  return compiledModule.exports;
}
const supabase = {
  supabaseRest: (table, query = '') => `https://db.test/${table}${query}`,
  supabaseHeaders: () => ({}), supabaseAdminHeaders: () => ({}),
  supabaseUserHeaders: () => ({}), supabaseError: async () => 'error',
};
const responseMock = { NextResponse: { json: (body, init) => Response.json(body, init) } };

test('HL: los dos DT intercambiados siguen visibles y conservan sus IDs al volver a guardar', async () => {
  const rows = [
    { record_id: 'vehiculo-8008973771-2026-09-24', contractor: null, data: { transporte: '8008973733', vehiculo: 'COLCM500', transportista: 'HL Logisticos', fechaDespacho: '2026-09-24', viaje: '11' } },
    { record_id: 'vehiculo-8008973733-2026-09-24', contractor: null, data: { transporte: '8008973771', vehiculo: 'COUYY192', transportista: 'HL Logisticos', fechaDespacho: '2026-09-24', viaje: '11' } },
  ];
  let written;
  const route = compile('../app/api/seguimiento/route.ts', {
    'next/server': responseMock,
    '../../lib/authServer': { getAuthenticatedSession: async () => ({ contractor: 'HL Logisticos', accessToken: 'test', userId: 'hl', isAdmin: false }) },
    '../../lib/supabaseServer': { ...supabase, supabaseReadHeaders: () => ({}) },
    '../../lib/scopedWrite': { scopedWrite: async (table, column, records) => { written = records; return null; } },
    '../../lib/auditLog': { writeAuditLog: async () => {} },
    '../../lib/serverCache': { clearServerCache: () => {}, cachedJsonFetch: async (key, ttl, url) => new URL(url).pathname === '/seguimiento_vehiculos' ? rows : [] },
  });
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    assert.equal(init.method, undefined, 'Guardar nunca debe borrar filas');
    return Response.json(rows);
  };
  try {
    const response = await route.GET(new Request('https://example.test/api/seguimiento'));
    assert.equal(response.status, 200);
    const { records } = await response.json();
    assert.equal(records.length, 2);
    assert.deepEqual(records.map(r => [r.recordId, r.transporte, r.vehiculo]), rows.map(r => [r.record_id, r.data.transporte, r.data.vehiculo]));
    const saved = await route.PUT(new Request('https://example.test/api/seguimiento', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ records }) }));
    assert.equal(saved.status, 200);
    assert.equal((await saved.json()).records.length, 2);
    assert.deepEqual(written.map(r => [r.record_id, r.data.transporte, r.data.vehiculo]), rows.map(r => [r.record_id, r.data.transporte, r.data.vehiculo]));
  } finally { globalThis.fetch = oldFetch; }
});

test('segundos viajes: editar DT y placas conserva la fila; duplicados y registros ajenos no se escriben', async () => {
  const route = compile('../app/api/seguimiento/route.ts', {
    'next/server': responseMock,
    '../../lib/authServer': { getAuthenticatedSession: async () => ({ contractor: 'HL Logisticos', accessToken: 'test', isAdmin: false }) },
    '../../lib/supabaseServer': { ...supabase, supabaseReadHeaders: () => ({}) },
    './supabaseServer': supabase,
    '../../lib/auditLog': {},
    '../../lib/serverCache': { clearServerCache: () => {} },
  });
  const oldFetch = globalThis.fetch;
  try {
    for (const scenario of ['save', 'duplicate', 'foreign', 'blank']) {
      let writes = 0;
      globalThis.fetch = async (url, init) => {
        const params = new URL(url).searchParams;
        if (init.method === 'PATCH') {
          writes++;
          assert.equal(params.get('record_id'), 'eq.stable-id');
          assert.equal(params.get('contractor'), 'is.null');
          assert.equal(params.get('data->>transportista'), 'eq.HL Logisticos');
          const data = JSON.parse(init.body).data;
          assert.equal(data.recordId, 'stable-id');
          assert.equal(data.transporte, '222');
          assert.equal(data.vehiculo, 'NEW123');
          assert.equal(data.vehiculoAnterior, 'OLD123');
          assert.equal(data.viaje, '11');
          assert.equal(data.fechaDespacho, '2026-09-24');
          return Response.json([{ record_id: 'stable-id' }]);
        }
        assert.equal(init.method, undefined, 'No se permite borrar o insertar al editar');
        if (params.get('record_id')) return Response.json([{ contractor: null, data: { transporte: '111', transportista: scenario === 'foreign' ? 'Surti Cervezas' : 'HL Logisticos', vehiculo: 'OLD123', viaje: '11', fechaDespacho: '2026-09-24' } }]);
        assert.ok(params.get('or').includes('contractor.is.null'));
        return Response.json(scenario === 'duplicate' ? [{ record_id: 'another-id', data: { transporte: '222', fechaDespacho: '2026-09-24' } }] : []);
      };
      const response = await route.PATCH(new Request('https://example.test/api/seguimiento', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recordId: 'stable-id', changes: { transporte: scenario === 'blank' ? ' ' : ' 222 ', vehiculo: 'new123', vehiculoAnterior: 'old123' } }),
      }));
      assert.equal(response.status, { save: 200, duplicate: 409, foreign: 403, blank: 400 }[scenario]);
      assert.equal(writes, scenario === 'save' ? 1 : 0);
      if (scenario === 'save') assert.equal((await response.json()).record.recordId, 'stable-id');
    }
  } finally { globalThis.fetch = oldFetch; }
});

test('origen: rechaza ataques de otros sitios y subdominios, admite el formulario propio', () => {
  const { isTrustedMutation } = compile('../app/lib/requestOrigin.ts');
  for (const origin of ['https://evil.test', 'https://sub.example.test', 'null']) {
    assert.equal(isTrustedMutation(new Request('https://example.test/api/x', { method: 'POST', headers: { origin } })), false);
  }
  assert.equal(isTrustedMutation(new Request('https://example.test/api/x', { method: 'POST', headers: { origin: 'https://example.test' } })), true);
  assert.equal(isTrustedMutation(new Request('https://example.test/api/x', { method: 'POST', headers: { 'sec-fetch-site': 'cross-site' } })), false);
});

test('DELETE coordenadas: anónimo 401, contratista 403, sin acceso a DB', async () => {
  let session = null;
  const route = compile('../app/api/public/critical-routes/route.ts', {
    'next/server': responseMock,
    '../../../lib/authServer': { getAuthenticatedSession: async () => session },
    '../../../lib/supabaseServer': supabase,
  });
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw Error('No debe consultar la DB'); };
  try {
    const request = new Request('https://example.test/api/public/critical-routes?id=123', { method: 'DELETE' });
    assert.equal((await route.DELETE(request)).status, 401);
    session = { isAdmin: false, isPeople: false, contractor: 'Logisticos' };
    assert.equal((await route.DELETE(request)).status, 403);
  } finally { globalThis.fetch = oldFetch; }
});

test('escritura: un ID ajeno devuelve 403 antes de mutar', async () => {
  const { scopedWrite } = compile('../app/lib/scopedWrite.ts', { './supabaseServer': supabase });
  const oldFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => { calls.push(init); return Response.json([{ id: 'foreign', contractor: 'Punto Corona' }]); };
  try {
    const response = await scopedWrite('records', 'id', [{ id: 'foreign', contractor: 'Logisticos' }], {});
    assert.equal(response.status, 403);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].method, undefined);
  } finally { globalThis.fetch = oldFetch; }
});

test('seguimiento: guarda históricos HL con contractor NULL y completa el propietario', async () => {
  const { scopedWrite } = compile('../app/lib/scopedWrite.ts', { './supabaseServer': supabase });
  const oldFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push(init);
    const params = new URL(url).searchParams;
    if (!init.method) {
      assert.equal(params.get('select'), 'record_id,contractor,data');
      return Response.json([{ record_id: 'hl-historico', contractor: null, data: { transportista: 'HL Logistica' } }]);
    }
    assert.equal(init.method, 'PATCH');
    assert.equal(params.get('record_id'), 'eq.hl-historico');
    assert.equal(params.get('contractor'), 'is.null');
    assert.equal(params.get('data->>transportista'), 'eq.HL Logistica');
    const saved = JSON.parse(init.body);
    assert.equal(saved.contractor, 'HL Logisticos');
    assert.equal(saved.data.status, 'En ruta');
    return Response.json([{ record_id: 'hl-historico' }]);
  };
  try {
    const result = await scopedWrite('seguimiento_vehiculos', 'record_id', [{ record_id: 'hl-historico', contractor: 'HL Logisticos', data: { transportista: 'HL Logisticos', status: 'En ruta' } }], {}, { legacyOwnerField: 'transportista' });
    assert.equal(result, null);
    assert.equal(calls.length, 2);
  } finally { globalThis.fetch = oldFetch; }
});

test('seguimiento: rechaza históricos ajenos, sin dueño o con contractor distinto aunque el cliente diga HL', async () => {
  const { scopedWrite } = compile('../app/lib/scopedWrite.ts', { './supabaseServer': supabase });
  const oldFetch = globalThis.fetch;
  try {
    for (const stored of [
      { contractor: null, data: { transportista: 'Surti Cervezas' } },
      { contractor: null, data: {} },
      { contractor: 'Surti Cervezas', data: { transportista: 'HL Logisticos' } },
    ]) {
      globalThis.fetch = async (url, init) => {
        assert.equal(init.method, undefined, 'No debe escribir filas ajenas');
        return Response.json([{ record_id: 'historico', ...stored }]);
      };
      const result = await scopedWrite('seguimiento_vehiculos', 'record_id', [{ record_id: 'historico', contractor: 'HL Logisticos', data: { transportista: 'HL Logisticos' } }], {}, { legacyOwnerField: 'transportista' });
      assert.equal(result.status, 403);
    }
  } finally { globalThis.fetch = oldFetch; }
});

test('escritura: otros módulos siguen rechazando propietarios NULL', async () => {
  const { scopedWrite } = compile('../app/lib/scopedWrite.ts', { './supabaseServer': supabase });
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    assert.equal(init.method, undefined);
    return Response.json([{ id: 'historico', contractor: null, data: { transportista: 'HL Logisticos' } }]);
  };
  try {
    assert.equal((await scopedWrite('records', 'id', [{ id: 'historico', contractor: 'HL Logisticos' }], {})).status, 403);
  } finally { globalThis.fetch = oldFetch; }
});

test('seguimiento: detecta si el dueño histórico cambió antes de escribir', async () => {
  const { scopedWrite } = compile('../app/lib/scopedWrite.ts', { './supabaseServer': supabase });
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => Response.json(init.method ? [] : [{ record_id: 'historico', contractor: null, data: { transportista: 'HL Logisticos' } }]);
  try {
    assert.equal((await scopedWrite('seguimiento_vehiculos', 'record_id', [{ record_id: 'historico', contractor: 'HL Logisticos' }], {}, { legacyOwnerField: 'transportista' })).status, 409);
  } finally { globalThis.fetch = oldFetch; }
});

test('escritura: carrera de inserción no se convierte en upsert de una fila ajena', async () => {
  const { scopedWrite } = compile('../app/lib/scopedWrite.ts', { './supabaseServer': supabase });
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    if (!init.method) return Response.json([]);
    assert.equal(init.method, 'POST');
    assert.equal(new URL(url).searchParams.has('on_conflict'), false);
    assert.equal(init.headers.Prefer.includes('merge-duplicates'), false);
    return Response.json({}, { status: 409 });
  };
  try {
    assert.equal((await scopedWrite('records', 'id', [{ id: 'racing', contractor: 'Logisticos' }], {})).status, 409);
  } finally { globalThis.fetch = oldFetch; }
});

test('escritura: actualiza solo ID y propietario persistido; admite alias HL', async () => {
  const { scopedWrite } = compile('../app/lib/scopedWrite.ts', { './supabaseServer': supabase });
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    if (!init.method) return Response.json([{ id: 'own', contractor: 'HL Logistica' }]);
    assert.equal(init.method, 'PATCH');
    assert.equal(new URL(url).searchParams.get('contractor'), 'eq.HL Logistica');
    assert.equal(new URL(url).searchParams.get('id'), 'eq.own');
    return Response.json([{ id: 'own' }]);
  };
  try { assert.equal(await scopedWrite('records', 'id', [{ id: 'own', contractor: 'HL Logisticos' }], {}), null); }
  finally { globalThis.fetch = oldFetch; }
});

test('escritura: error consultando propiedad falla cerrado', async () => {
  const { scopedWrite } = compile('../app/lib/scopedWrite.ts', { './supabaseServer': supabase });
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async (_url, init) => { assert.equal(init.method, undefined); return new Response(null, { status: 503 }); };
  try { assert.equal((await scopedWrite('records', 'id', [{ id: 'own', contractor: 'Logisticos' }], {})).status, 503); }
  finally { globalThis.fetch = oldFetch; }
});

test('push: rechaza localhost, IP privada, credenciales y dominios que imitan proveedores', () => {
  const { isAllowedPushEndpoint } = compile('../app/lib/pushEndpoint.ts');
  for (const url of ['https://127.0.0.1/a', 'https://10.0.0.1/a', 'https://fcm.googleapis.com.evil.test/a', 'https://user@fcm.googleapis.com/a', 'http://fcm.googleapis.com/a']) assert.equal(isAllowedPushEndpoint(url), false);
  assert.equal(isAllowedPushEndpoint('https://fcm.googleapis.com/fcm/send/test'), true);
});

test('layout admin: anónimo y contratista redirigidos; admin admitido', async () => {
  let session = null;
  const { default: layout } = compile('../app/admin/layout.tsx', {
    'next/navigation': { redirect: () => { throw Error('REDIRECT'); } },
    '../lib/authServer': { getAuthenticatedSession: async (options) => { assert.equal(options.refreshSession, false); return session; } },
  });
  await assert.rejects(layout({ children: 'privado' }), /REDIRECT/);
  session = { isAdmin: false };
  await assert.rejects(layout({ children: 'privado' }), /REDIRECT/);
  session = { isAdmin: true };
  assert.equal(await layout({ children: 'privado' }), 'privado');
});

test('JWT manipulado no fija el rol: identidad obtenida de Supabase Auth', async () => {
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ id: 'contractor-a', email: 'logisticos@bavaria-seguimiento.com', user_metadata: { isAdmin: true } });
  const auth = compile('../app/lib/authServer.ts', {
    'next/headers': { cookies: async () => ({ get: () => ({ value: 'forged-admin-token' }) }) },
    './supabaseServer': { ...supabase, requireSupabaseKey: () => 'test', SUPABASE_URL: 'https://db.test' },
    './securityState': { readSecurityState: async () => ({ state: { active: false } }) },
  });
  try { const session = await auth.getAuthenticatedSession(); assert.equal(session.isAdmin, false); assert.equal(session.contractor, 'Logisticos'); }
  finally { globalThis.fetch = oldFetch; }
});

test('Excel: escritura/lectura XLSX conserva texto, números y columnas usadas por importaciones', () => {
  const XLSX = require('xlsx');
  const rows = [{ DT: '001234', CONTRATISTA: 'HL Logísticos', Cajas: 12, Fecha: '2026-09-24' }];
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(rows), 'Datos');
  for (const bookType of ['xlsx', 'xls', 'csv']) {
    const buffer = XLSX.write(book, { type: 'buffer', bookType });
    const parsed = XLSX.read(buffer, { type: 'buffer', raw: true });
    const result = XLSX.utils.sheet_to_json(parsed.Sheets[parsed.SheetNames[0]]);
    assert.equal(String(result[0].Cajas), '12');
    assert.equal(result[0].CONTRATISTA, 'HL Logísticos');
  }
});
