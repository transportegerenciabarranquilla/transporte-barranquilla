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
