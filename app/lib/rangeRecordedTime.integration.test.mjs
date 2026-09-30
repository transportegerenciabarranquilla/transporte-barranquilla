import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
function compile(relative, overrides) {
  const path = new URL(relative, import.meta.url);
  const source = ts.transpileModule(fs.readFileSync(path, "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS } }).outputText;
  const loaded = { exports: {} };
  new Function("require", "module", "exports", source)(name => {
    if (name in overrides) return overrides[name];
    if (name.startsWith(".")) return compile(new URL(`${name}.ts`, path).href, overrides);
    return require(name);
  }, loaded, loaded.exports);
  return loaded.exports;
}

test("PUT guarda la primera hora del servidor y la conserva al cerrar; rechaza sin sesión", async () => {
  let session = { contractor: "Surti Cervezas", accessToken: "test", isAdmin: false };
  const stored = new Map();
  const server = { supabaseAdminHeaders: () => ({}), supabaseRest: (table, query = "") => `https://test.local/${table}${query}` };
  const route = compile("../api/punto-corona-routes/route.ts", {
    "next/server": { NextResponse: { json: (body, init) => ({ body, status: init?.status ?? 200 }) } },
    "../../lib/authServer": { getAuthenticatedSession: async () => session },
    "../../lib/supabaseServer": server,
    "../../lib/serverCache": { clearServerCache: () => {} },
    "../../lib/auditLog": { writeAuditLog: async () => {} },
    "../../lib/scopedWrite": { scopedWrite: async (_table, _id, rows, _headers, options) => {
      for (const row of rows) {
        assert.equal(row.contractor, session.contractor);
        if (stored.has(row.report_id)) assert.equal(options.expectedVersions.get(row.report_id), stored.get(row.report_id).updated_at);
        stored.set(row.report_id, row);
      }
      return null;
    } },
  });
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    assert.equal(options.cache, "no-store");
    const parsed = new URL(url);
    if (parsed.pathname === "/seguimiento_vehiculos") return Response.json([{ contractor: session.contractor, data: { transporte: "123" } }]);
    assert.equal(parsed.searchParams.get("contractor"), `eq.${session.contractor}`);
    return Response.json([...stored.values()].slice(Number(parsed.searchParams.get("offset"))));
  };
  const report = { id: "current", contractor: "forged", operationalDate: "2026-09-30", uploadedAt: "2026-09-30T10:00:00Z", kind: "current", summary: {}, rows: [
    { id: "client", dt: "123", tourDisplayId: "123", truckLicensePlate: "ABC123", status: "CONCLUDED", withinRadius: false, outOfRadiusRecordedAt: "2000-01-01T00:00:00Z" },
  ] };
  const put = record => route.PUT(new Request("https://test.local", { method: "PUT", body: JSON.stringify({ records: [record] }) }));
  try {
    const before = Date.now();
    const first = await put(report);
    assert.equal(first.status, 200);
    const stamp = first.body.records[0].rows[0].outOfRadiusRecordedAt;
    assert.ok(Date.parse(stamp) >= before);
    assert.ok(Date.parse(stamp) <= Date.now());
    assert.equal(first.body.records[0].rows[0].outOfRadiusRecordedSource, "system");
    assert.equal((await put(report)).body.records[0].rows[0].outOfRadiusRecordedAt, stamp);
    const closure = await put({ ...report, id: "closure", kind: "closure" });
    assert.equal(closure.body.records[0].rows[0].outOfRadiusRecordedAt, stamp);
    session = null;
    assert.equal((await put(report)).status, 401);
    assert.equal(stored.size, 2);
  } finally {
    globalThis.fetch = oldFetch;
  }
});
