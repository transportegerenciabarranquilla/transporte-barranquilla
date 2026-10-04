import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import ts from "typescript";

const require = createRequire(import.meta.url);
function harness(overrides = {}, globals = {}) {
  const modules = new Map();
  function load(file) {
    file = path.resolve(file);
    if (modules.has(file)) return modules.get(file).exports;
    const loadedModule = { exports: {} };
    modules.set(file, loadedModule);
    const source = ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    vm.runInNewContext(source, {
      module: loadedModule, exports: loadedModule.exports, URL, URLSearchParams, Request, Response, Event, AbortController, setTimeout, clearTimeout, ...globals,
      require(name) {
        if (name in overrides) return overrides[name];
        return name.startsWith(".") ? load(path.resolve(path.dirname(file), `${name.replace(/\.ts$/, "")}.ts`)) : require(name);
      },
    });
    return loadedModule.exports;
  }
  return load;
}

test("40 rutas: cambiar una preserva las referencias de las otras 39; soporta orden y eliminaciones", () => {
  const { shareRecordsByKey } = harness()("app/lib/structuralSharing.ts");
  const records = Array.from({ length: 40 }, (_, index) => ({ id: String(index), visitados: 7, details: { cajas: 30 } }));
  const copy = JSON.parse(JSON.stringify(records));
  assert.equal(shareRecordsByKey(records, copy, row => row.id), records);
  copy[12].visitados = 8;
  const next = shareRecordsByKey(records, copy, row => row.id);
  assert.equal(next.filter((row, index) => row === records[index]).length, 39);
  assert.equal(next[12].details, records[12].details);
  assert.equal(shareRecordsByKey(records, [...copy].reverse(), row => row.id)[0], records[39]);
  assert.equal(shareRecordsByKey(records, copy.slice(0, 3), row => row.id).length, 3);
});

test("invalidar caché durante una consulta no resucita datos antiguos ni borra una consulta nueva", async () => {
  const store = harness()("app/lib/serverCache.ts");
  let finishOld;
  const old = store.readServerCache("scope", 60_000, () => new Promise(resolve => { finishOld = resolve; }));
  store.clearServerCache("scope");
  await store.readServerCache("scope", 60_000, async () => "new");
  finishOld("old");
  await old;
  assert.equal(store.peekServerCache("scope"), "new");
  let reject;
  const failed = store.readServerCache("failure", 60_000, () => new Promise((_, fail) => { reject = fail; }));
  store.clearServerCache("failure");
  store.writeServerCache("failure", "saved", 60_000);
  reject(new Error("network"));
  await assert.rejects(failed);
  assert.equal(store.peekServerCache("failure"), "saved");
});

test("páginas limitadas y filtros literales: propietario anclado, búsqueda escapada y orden estable", () => {
  const query = harness()("app/lib/listQuery.ts");
  assert.equal(query.readListPage(new URLSearchParams("page=3&pageSize=50")).offset, 100);
  for (const invalid of ["page=-1", "page=1.5", "pageSize=500", "page=Infinity"]) assert.throws(() => query.readListPage(new URLSearchParams(invalid)));
  const owner = query.contractorSqlPattern("Logisticos");
  const jsPattern = owner.replaceAll("[^[:alnum:]]", "[^a-z0-9áéíóúñ]");
  assert.ok(new RegExp(jsPattern, "i").test("Logísticos"));
  assert.equal(new RegExp(jsPattern, "i").test("Logisticos Arenosa"), false);
  const params = query.scopedPersonnelParams("HL Logistica", 'José.*,x)"', 2, 50);
  assert.equal(params.get("offset"), "50");
  assert.equal(params.get("limit"), "50");
  assert.equal(params.get("select"), "CC,NOMBRE,CARGO,CONTRATISTA,CELULAR,CORREO");
  assert.ok(params.get("CONTRATISTA").startsWith("imatch.^"));
  const literal = new RegExp(query.literalSearchPattern("José.*"), "i");
  assert.ok(literal.test("JOSE.*"));
  assert.equal(literal.test("Jose anything"), false);
});

function remoteHarness() {
  const state = { now: Date.now(), pages: [], calls: [], notifications: 0 };
  class Clock extends Date { static now() { return state.now; } }
  const store = harness({ "./storageEvents": { notifyStorageChange: () => { state.notifications++; } } }, {
    Date: Clock,
    window: { location: { pathname: "/seguimiento", assign() {} }, dispatchEvent() {} },
    fetch: async (url) => { state.calls.push(url); const next = state.pages.shift(); assert.ok(next, "unexpected request"); return typeof next === "function" ? next() : Response.json(next); },
  })("app/lib/remoteStore.ts");
  return { store, state };
}
const endpoint = "/api/seguimiento";
const vehicle = (id, version = "2026-10-03T10:00:00.000001Z", visited = 7) => ({ recordId: id, recordUpdatedAt: version, visitados: visited });

test("una inserción entre la consulta de IDs y la de cambios permanece visible", async () => {
  const { store, state } = remoteHarness();
  state.pages.push({ records: [vehicle("a")], checkpoint: "2026-10-03T10:00:00Z" });
  await store.refreshRemoteRecords(endpoint, { force: true });
  state.pages.push({ records: [vehicle("b", "2026-10-03T10:01:00Z")], partial: true, recordIds: ["a"], checkpoint: "2026-10-03T10:01:00Z" });
  await store.refreshRemoteRecords(endpoint, { force: true, incremental: true });
  assert.equal(store.readCachedRemoteRecords(endpoint).length, 2);
});

test("lecturas lentas tienen timeout de 25 segundos y la cancelación del usuario se distingue", async () => {
  let timeout;
  let cleared = 0;
  const { apiQuery, ApiQueryError } = harness({}, {
    setTimeout: (callback, ms) => { assert.equal(ms, 25_000); timeout = callback; return 1; },
    clearTimeout: () => { cleared++; },
    fetch: (_, { signal }) => new Promise((_, reject) => {
      if (signal.aborted) reject(new Error("aborted"));
      else signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
    }),
  })("app/lib/apiQuery.ts");
  const slow = apiQuery("/test");
  timeout();
  await assert.rejects(slow, error => error instanceof ApiQueryError && error.status === 408);
  const parent = new AbortController();
  const canceled = apiQuery("/test", parent.signal);
  parent.abort();
  await assert.rejects(canceled, error => !(error instanceof ApiQueryError));
  assert.equal(cleared, 2);
});

test("Personal exige sesión, pagina en SQL y conserva el total y el filtro de propietario", async () => {
  const state = { session: null, calls: [] };
  const route = harness({
    "../../../lib/authServer": { getAuthenticatedSession: async () => state.session },
    "../../../lib/supabaseServer": { supabaseAdminHeaders: () => ({}), supabaseUserHeaders: () => ({}), supabaseRest: (table, query = "") => `https://example.test/${table}${query}` },
  }, { fetch: async (url, options) => {
    state.calls.push({ url: new URL(url), options });
    return Response.json([{ CC: "00123456", NOMBRE: "Persona", CARGO: "Conductor", CONTRATISTA: "Logísticos" }], { headers: { "Content-Range": "50-50/101" } });
  } })("app/api/people/personnel/route.ts");
  const request = new Request("https://example.test/?page=2&pageSize=50&q=Persona&contractor=Otro");
  assert.equal((await route.GET(request)).status, 401);
  state.session = { accessToken: "test", contractor: "People", isPeople: true };
  assert.equal((await route.GET(request)).status, 403);
  state.session = { accessToken: "test", contractor: "Logisticos" };
  assert.equal((await route.GET(new Request("https://example.test/?pageSize=500"))).status, 400);
  const response = await route.GET(request);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.total, 101);
  assert.equal(body.hasMore, true);
  assert.equal(body.people.length, 1);
  const { url, options } = state.calls[0];
  assert.equal(url.searchParams.get("offset"), "50");
  assert.equal(url.searchParams.get("limit"), "50");
  assert.ok(url.searchParams.get("CONTRATISTA").startsWith("imatch.^"));
  assert.equal(options.headers.Prefer, "count=exact");
});

test("delta aplica una actualización y una eliminación, mantiene otros registros y reconcilia cada 5 minutos", async () => {
  const { store, state } = remoteHarness();
  state.pages.push({ records: [vehicle("a"), vehicle("b"), vehicle("c")], checkpoint: "2026-10-03T10:00:00Z" });
  await store.refreshRemoteRecords(endpoint, { force: true });
  const previous = store.readCachedRemoteRecords(endpoint);
  state.pages.push({ records: [vehicle("a", "2026-10-03T10:01:00Z", 8)], partial: true, recordIds: ["a", "b"], checkpoint: "2026-10-03T10:01:00Z" });
  await store.refreshRemoteRecords(endpoint, { force: true, incremental: true });
  const next = store.readCachedRemoteRecords(endpoint);
  assert.equal(next.length, 2);
  assert.equal(next[0].visitados, 8);
  assert.equal(next[1], previous[1]);
  assert.equal(new URL(state.calls[1], "https://example.test").searchParams.get("since"), "2026-10-03T10:00:00Z");
  state.now += 300_001;
  state.pages.push({ records: [vehicle("b")], checkpoint: "2026-10-03T10:06:00Z" });
  await store.refreshRemoteRecords(endpoint, { force: true, incremental: true });
  assert.equal(state.calls[2], endpoint);
  assert.equal(store.readCachedRemoteRecords(endpoint).length, 1);
});

test("respuesta antigua, fallo de red y sesión cambiada no pisan la caché válida", async () => {
  const { store, state } = remoteHarness();
  state.pages.push({ records: [vehicle("a", "2026-10-03T10:00:00.000002Z", 8)], checkpoint: "2026-10-03T10:00:01Z" });
  await store.refreshRemoteRecords(endpoint, { force: true });
  const previous = store.readCachedRemoteRecords(endpoint);
  state.pages.push({ records: [vehicle("a")], partial: true, recordIds: ["a"], checkpoint: "2026-10-03T10:00:02Z" });
  await store.refreshRemoteRecords(endpoint, { force: true, incremental: true });
  assert.equal(store.readCachedRemoteRecords(endpoint), previous);
  state.pages.push(() => { throw new Error("offline"); });
  await store.refreshRemoteRecords(endpoint, { force: true });
  assert.equal(store.readCachedRemoteRecords(endpoint), previous);
  let finish;
  state.pages.push(() => new Promise(resolve => { finish = resolve; }));
  const pending = store.refreshRemoteRecords(endpoint, { force: true });
  store.clearRemoteCache();
  finish(Response.json({ records: [vehicle("other-account")] }));
  await pending;
  assert.equal(store.readCachedRemoteRecords(endpoint).length, 0);
});

test("API incremental valida sesión/cursor y mantiene alcance Arenosa en cambios e identidades", async () => {
  const state = { session: null, calls: [] };
  const route = harness({
    "../../lib/authServer": { getAuthenticatedSession: async () => state.session },
    "../../lib/scopedWrite": {}, "../../lib/auditLog": {},
    "../../lib/supabaseServer": { supabaseReadHeaders: () => ({}), supabaseRest: (table, query = "") => `https://example.test/${table}${query}` },
  }, { fetch: async url => { state.calls.push(new URL(url)); return Response.json([]); } })("app/api/seguimiento/route.ts");
  const request = since => new Request(`https://example.test/api/seguimiento?since=${encodeURIComponent(since)}`);
  assert.equal((await route.GET(request("2026-01-01T00:00:00Z"))).status, 401);
  state.session = { email: "adminare@gmail.com", contractor: "Admin Arenosa", isAdmin: true, isSiteAdmin: true, isPeople: false, userId: "a", accessToken: "test" };
  assert.equal((await route.GET(request("bad"))).status, 400);
  assert.equal((await route.GET(request("2999-01-01T00:00:00Z"))).status, 400);
  assert.equal(state.calls.length, 0);
  const response = await route.GET(request("2026-01-01T00:00:00Z"));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.partial, true);
  assert.equal(body.recordIds.length, 0);
  assert.equal(state.calls.length, 2);
  for (const url of state.calls) assert.ok(url.searchParams.getAll("and").some(value => value.includes('contractor.in.("Logisticos Arenosa","Punto Corona Arenosa")')));
  const changes = state.calls.find(url => url.searchParams.get("select").includes("data"));
  assert.ok(changes.searchParams.getAll("and").some(value => value.includes("updated_at.gte.2026-01-01")));
  state.calls = [];
  state.session = { ...state.session, email: "hllogistica@gmail.com", isAdmin: false, isSiteAdmin: false, contractor: "HL Logisticos" };
  assert.equal((await route.GET(request("2026-01-01T00:00:00Z"))).status, 200);
  for (const url of state.calls) {
    assert.ok(url.searchParams.get("or").includes("HL Logistica"));
    assert.ok(url.searchParams.get("or").includes("contractor.is.null"));
  }
});
