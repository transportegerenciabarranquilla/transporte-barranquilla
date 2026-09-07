import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
function compile(path, mocks) {
 const source = ts.transpileModule(fs.readFileSync(new URL(path, import.meta.url), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS } }).outputText;
 const module = { exports: {} };
 new Function('require', 'module', 'exports', source)((name) => { if (name in mocks) return mocks[name]; throw Error(name); }, module, module.exports);
 return module.exports;
}
test('pagina check-ins sin perder el filtro', async () => {
 const calls = [];
 const route = compile('../api/checkins/route.ts', {
 '../../lib/adminScope': { scopeQuery: () => {} },
 'next/server': { NextResponse: { json: (body) => body } },
 '../../lib/auditLog': {},
 '../../lib/authServer': { getAuthenticatedSession: async () => ({ contractor: 'Logisticos', accessToken: 'test' }) },
 '../../lib/supabaseServer': { supabaseRest: (table, query) => `https://example.test/${table}${query}`, supabaseReadHeaders: () => ({}) },
 '../../lib/serverCache': { cachedJsonFetch: async (_key, _ttl, raw) => {
 const url = new URL(raw); calls.push(url);
 return Array.from({ length: calls.length === 1 ? 1000 : 1 }, () => ({ data: { totalCajas: 713 } }));
 } },
 });
 const result = await route.GET();
 assert.equal(result.records.length, 1001);
 assert.deepEqual(calls.map(url => url.searchParams.get('offset')), ['0', '1000']);
 for (const url of calls) assert.equal(url.searchParams.get('contractor'), 'eq.Logisticos');
});
test('cierres de Logisticos y Surti, check-in cero y sin check-in', () => {
 const { calculateRefusalTotals } = compile('./modulacionStorage.ts', { './remoteStore': {} });
 for (const [contractor, boxes, checkin, rejected, managed, expected] of [['Logisticos', 22286, 713, 744, 298, 3.2], ['Surti Cervezas', 17083, 253, 268, 95, 1.48]]) {
 const vehicles = [{ transporte: '123', transportista: contractor, cajas: boxes }];
 const modulations = [{ dt: '123', contratista: contractor, totalCajas: rejected, cajasGestionadas: managed }];
 const result = calculateRefusalTotals(vehicles, modulations, [{ dt: '123', contratista: contractor, totalCajas: checkin }]);
 assert.equal(result.pendientes, checkin);
 assert.equal(result.porcentaje, expected);
 assert.equal(calculateRefusalTotals(vehicles, modulations, [{ dt: '123', contratista: contractor, totalCajas: 0 }]).pendientes, 0);
 assert.equal(calculateRefusalTotals(vehicles, modulations, []).pendientes, rejected - managed);
 }
});
test('administracion conserva el DT mas reciente sin sumar duplicados', async () => {
 const contractors = ['Logisticos', 'Surti Cervezas'];
 const route = compile('../api/admin/seguimiento/route.ts', {
 '../../../lib/adminScope': { allowedContractors: () => contractors },
 'next/server': { NextResponse: { json: (body) => body } },
 '../../../lib/authServer': { getAuthenticatedSession: async () => ({ isAdmin: true }) },
 '../../../lib/contractors': { CONTRACTORS: contractors, contractorLabel: value => value, isPuntoCoronaContractor: () => false, normalizeContractorName: value => value || '' },
 '../../../seguimiento/utils': { normalizeCajasTotal: Number, normalizeCajasValue: Number },
 '../../../lib/supabaseServer': { supabaseAdminHeaders: () => ({}), supabaseHeaders: () => ({}), supabaseUserHeaders: () => ({}), supabaseRest: (table, query) => `https://example.test/${table}${query}` },
 '../../../lib/serverCache': { cachedJsonFetch: async (_key, _ttl, raw) => {
 const url = new URL(raw);
 const contractor = url.searchParams.get('contractor').slice(3);
 if (url.pathname !== '/seguimiento_vehiculos' || Number(url.searchParams.get('offset')) > 0) return [];
 return [22286, 999].map(cajas => ({ contractor, data: { transporte: '123', fechaDespacho: '2026-09-05', cajas } }));
 } },
 });
 const result = await route.GET();
 assert.equal(result.records.length, 2);
 assert.deepEqual(result.records.map(row => row.cajas), [22286, 22286]);
});
test('cierre completo aunque la base limite cada respuesta a menos filas', async () => {
 const contractors = ['Logisticos', 'Surti Cervezas'];
 const calls = [];
 const route = compile('../api/admin/seguimiento/route.ts', {
 '../../../lib/adminScope': { allowedContractors: () => contractors },
 'next/server': { NextResponse: { json: body => body } },
 '../../../lib/authServer': { getAuthenticatedSession: async () => ({ isAdmin: true }) },
 '../../../lib/contractors': { CONTRACTORS: contractors, contractorLabel: value => value, isPuntoCoronaContractor: () => false, normalizeContractorName: value => value || '' },
 '../../../seguimiento/utils': { normalizeCajasTotal: Number, normalizeCajasValue: Number },
 '../../../lib/supabaseServer': { supabaseAdminHeaders: () => ({}), supabaseHeaders: () => ({}), supabaseUserHeaders: () => ({}), supabaseRest: (table, query) => `https://example.test/${table}${query}` },
 '../../../lib/serverCache': { cachedJsonFetch: async (_key, _ttl, raw) => {
 const url = new URL(raw);
 const contractor = url.searchParams.get('contractor').slice(3);
 const offset = Number(url.searchParams.get('offset'));
 const logisticos = contractor === 'Logisticos';
 if (url.pathname === '/seguimiento_vehiculos') {
 calls.push([contractor, offset]);
 // Emula un servidor cuyo límite real es inferior al solicitado.
 const boxes = logisticos ? [15000, 7286] : [13000, 4083];
 return boxes.slice(offset, offset + 1).map((cajas, i) => ({ contractor, data: { transporte: String(offset + i + 1), fechaDespacho: '2026-09-05', cajas } }));
 }
 if (url.pathname === '/checkins_cajas' && offset === 0) return [{ contractor, data: { dt: '1', totalCajas: logisticos ? 713 : 253 } }];
 return [];
 } },
 });
 const result = await route.GET();
 assert.equal(result.records.length, 4);
 for (const contractor of contractors) assert.deepEqual(calls.filter(row => row[0] === contractor).map(row => row[1]), [0, 1, 2]);
 for (const [contractor, boxes, final, percentage] of [['Logisticos', 22286, 713, 3.2], ['Surti Cervezas', 17083, 253, 1.48]]) {
 const records = result.records.filter(row => row.transportista === contractor);
 assert.equal(records.reduce((sum, row) => sum + row.cajas, 0), boxes);
 assert.equal(records.reduce((sum, row) => sum + row.cajasRefusalFinal, 0), final);
 assert.equal(Number((final / boxes * 100).toFixed(2)), percentage);
 }
});
