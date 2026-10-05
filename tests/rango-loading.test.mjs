import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
function compile(path, mocks = {}) {
  const source = ts.transpileModule(fs.readFileSync(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const loaded = { exports: {} };
  new Function("require", "module", "exports", source)(name => {
    if (name in mocks) return mocks[name];
    throw new Error(name);
  }, loaded, loaded.exports);
  return loaded.exports;
}
for (const stage of ["request", "body"]) {
  test(`la espera de ${stage} termina, revierte la caché y libera la cola`, async t => {
    const timers = [];
    t.mock.method(globalThis, "setTimeout", (fn, ms) => { timers.push({ fn, ms }); return timers.length; });
    t.mock.method(globalThis, "clearTimeout", () => {});
    let signal;
    t.mock.method(globalThis, "fetch", async (_url, options) => {
      signal = options.signal;
      const pending = () => new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true }));
      return stage === "body" ? { ok: true, json: pending } : pending();
    });
    const remote = compile("../app/lib/remoteStore.ts", {
      "./storageEvents": { notifyStorageChange() {} },
      "./seguimientoPersistence": {},
      "./structuralSharing": compile("../app/lib/structuralSharing.ts"),
      "./sessionCacheRevision": { advanceSessionCacheRevision() {} },
    });
    const pending = remote.saveRemoteRecords("/api/punto-corona-routes", [{ id: "new" }]);
    const rejected = assert.rejects(pending, /60 segundos.*comprueba/);
    for (let i = 0; i < 10; i++) await Promise.resolve();
    assert.equal(timers[0].ms, 60_000);
    timers[0].fn();
    await rejected;
    assert.ok(signal.aborted);
    assert.deepEqual(remote.readCachedRemoteRecords("/api/punto-corona-routes"), []);
    globalThis.fetch = async () => Response.json({ records: [{ id: "confirmed" }] });
    assert.deepEqual(await remote.saveRemoteRecords("/api/punto-corona-routes", [{ id: "confirmed" }]), [{ id: "confirmed" }]);
  });
}
test("sincroniza solamente rutas cuyos clientes cambiaron", async () => {
  const page = fs.readFileSync(new URL("../app/punto-corona/page.tsx", import.meta.url), "utf8");
  const source = page.slice(page.indexOf("async function updateSeguimientoClientsFromBees"), page.indexOf("function getRealModulationPercent"));
  const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
  const writes = [];
  const sync = new Function("normalizeDt", "normalizeClienteCode", "NOT_STARTED", "saveSeguimientoVehiculos", "prepareSeguimientoVehicles", `${code}; return updateSeguimientoClientsFromBees;`)(String, String, "NOT_STARTED", async rows => writes.push(rows), rows => rows);
  const date = "2026-10-05";
  const vehicles = [
    { transporte: "1", fechaDespacho: date, clientes: 1, visitados: 0 },
    { transporte: "2", fechaDespacho: date, clientes: 1, visitados: 1 },
    { transporte: "3", fechaDespacho: date, clientes: 10, visitados: 0 },
    { transporte: "1", fechaDespacho: "2026-10-04", clientes: 1, visitados: 0 },
  ];
  const report = { operationalDate: date, rows: [
    { dt: "1", pocExternalId: "a", status: "CONCLUDED" },
    { dt: "2", pocExternalId: "b", status: "CONCLUDED" },
  ] };
  assert.deepEqual(await sync(vehicles, report), { updated: 1 });
  assert.deepEqual(writes[0], [{ ...vehicles[0], visitados: 1 }]);
  assert.deepEqual(await sync([{ ...vehicles[0], visitados: 1 }, ...vehicles.slice(1)], report), { updated: 0 });
  assert.equal(writes.length, 1);
});
