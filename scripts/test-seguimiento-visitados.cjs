// Prueba del handler real con sesión y Supabase simulados; no toca datos reales.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const test = require('node:test');
const root = path.resolve(__dirname, '..');
const compile = (source) => ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS } }).outputText;

function harness() {
  let session = { contractor: 'Logisticos', accessToken: 'test', userId: 'test-user', isAdmin: false };
  let data = { recordId: 'test-route', transportista: 'Logisticos', transporte: '123', vehiculo: 'TEST', fechaDespacho: '2026-09-24', clientes: 18, visitados: 12, status: 'En ruta', horaLlegada: 'Pendiente', visitadosUpdatedAt: '2099-01-01T00:00:00.000Z' };
  let writes = 0;
  let confirmWrongValue = false;
  const fetchMock = async (url, options = {}) => {
    const target = new URL(url);
    if (!target.pathname.endsWith('/seguimiento_vehiculos')) return Response.json([]);
    if (options.method === 'PATCH') {
      assert.equal(target.searchParams.get('contractor'), 'eq.Logisticos');
      assert.equal(target.searchParams.get('record_id'), 'eq.test-route');
      data = JSON.parse(options.body).data;
      writes++;
      return Response.json([{ record_id: 'test-route', data: confirmWrongValue ? { ...data, visitados: 12 } : data }]);
    }
    return Response.json([{ record_id: 'test-route', contractor: 'Logisticos', data }]);
  };
  const mocks = {
    'next/server': { NextResponse: Response },
    '../../lib/authServer': { getAuthenticatedSession: async () => session },
    '../../lib/contractors': { normalizeContractorName: value => String(value || '').toLowerCase().replace(/[^a-z]/g, '') },
    '../../lib/adminScope': { scopeQuery() {} },
    '../../lib/scopedWrite': {},
    '../../lib/auditLog': {},
    '../../lib/seguimientoUpsert': {},
    '../../seguimiento/utils': { getVehicleRecordKey: row => `${row.transporte}:${row.fechaDespacho}` },
    '../../lib/supabaseServer': {
      supabaseRest: (table, query = '') => `https://test.invalid/${table}${query}`,
      supabaseReadHeaders: () => ({}), supabaseUserHeaders: () => ({}), supabaseHeaders: () => ({}),
      supabaseAdminHeaders: extra => ({ ...extra }), supabaseError: async () => 'Error simulado',
    },
    '../../lib/serverCache': {
      clearServerCache() {},
      cachedJsonFetch: async (key, ttl, url, init) => {
        assert.ok(!key.includes('seguimiento_vehiculos'), 'La lectura de la contratista debe consultar datos frescos');
        return (await fetchMock(url, init)).json();
      },
    },
  };
  const filename = path.join(root, 'app/api/seguimiento/route.ts');
  const handler = new Module(filename, module);
  handler.filename = filename;
  handler.require = id => { if (!(id in mocks)) throw new Error(`Dependencia sin simular: ${id}`); return mocks[id]; };
  handler._compile(`const fetch = globalThis.__seguimientoTestFetch;\n${compile(fs.readFileSync(filename, 'utf8'))}`, filename);
  return { api: handler.exports, fetchMock, session: value => { session = value; }, writes: () => writes, wrong: () => { confirmWrongValue = true; } };
}

test('guardar 14 y volver a consultar conserva 14; protege propiedad y valida confirmación', async () => {
  // El fetch queda capturado por cada módulo; nunca se hace una llamada de red.
  globalThis.__seguimientoTestFetch = (...args) => active.fetchMock(...args);
  const active = harness();
  const request = visitados => new Request('http://test/api/seguimiento', { method: 'PATCH', body: JSON.stringify({ recordId: 'test-route', changes: { visitados } }) });
  let response = await active.api.PATCH(request(14));
  assert.equal(response.status, 200);
  let body = await response.json();
  assert.equal(body.record.visitados, 14);
  assert.ok(Date.parse(body.record.visitadosUpdatedAt) > Date.parse('2099-01-01T00:00:00Z'));
  response = await active.api.GET(new Request('http://test/api/seguimiento'));
  assert.equal(response.status, 200);
  body = await response.json();
  assert.equal(body.records[0].visitados, 14);
  for (const invalid of [-1, 19, 1.5, '14']) assert.equal((await active.api.PATCH(request(invalid))).status, 400);
  assert.equal(active.writes(), 1);
  active.session({ contractor: 'Punto Corona', accessToken: 'test', userId: 'test' });
  assert.equal((await active.api.PATCH(request(13))).status, 403);
  active.session(null);
  assert.equal((await active.api.PATCH(request(13))).status, 401);
  active.session({ contractor: 'Logisticos', accessToken: 'test', userId: 'test' });
  active.wrong();
  assert.equal((await active.api.PATCH(request(13))).status, 409);
  delete globalThis.__seguimientoTestFetch;
});
