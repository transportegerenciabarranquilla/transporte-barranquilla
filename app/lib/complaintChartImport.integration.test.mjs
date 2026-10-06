import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
function compile(path, mocks = {}) {
  const source = ts.transpileModule(fs.readFileSync(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const loaded = { exports: {} };
  new Function("require", "module", "exports", source)(name => name in mocks ? mocks[name] : require(name), loaded, loaded.exports);
  return loaded.exports;
}
const contractors = compile("./contractors.ts");
const charts = compile("./complaintCharts.ts");
function route(session) {
  return compile("../api/complaints/chart-rows/route.ts", {
    "../../../lib/adminScope": { canAccessContractor: () => true },
    "../../../lib/authServer": { getAuthenticatedSession: async () => session },
    "../../../lib/complaintCharts": charts,
    "../../../lib/contractors": contractors,
    "../../../lib/supabaseServer": {
      supabaseAdminHeaders: () => ({ apikey: "test" }),
      supabaseReadHeaders: () => ({ apikey: "test" }),
      supabaseRest: (table, query = "") => `https://example.test/${table}${query}`,
      supabaseError: async response => (await response.json()).message,
    },
    "next/server": { NextResponse: { json: (body, init) => ({ body, status: init?.status || 200 }) } },
  });
}

test("guarda la causal, el DT y el RR mediante upsert por Ticket", async t => {
  let saved;
  t.mock.method(globalThis, "fetch", async (url, options) => {
    assert.match(url, /complaint_chart_rows\?on_conflict=contractor,ticket/);
    assert.equal(options.method, "POST");
    saved = JSON.parse(options.body);
    return Response.json(null, { status: 201 });
  });
  const handler = route({ contractor: "Logisticos", isAdmin: false, accessToken: "token", email: "test@example.test" });
  const row = { complaintId: "4638107", contractor: "Logisticos", date: "2026-09-04", openedAt: "2026-09-04", closedAt: "2026-09-07", status: "Cerrada", issue: "Saldo", count: 1, causal: "Ausentismo", dt: "8008916262", rr: "SERGIO DE LA CRUZ" };
  const result = await handler.POST(new Request("https://example.test", { method: "POST", body: JSON.stringify({ rows: [row], sourceName: "quejas.xlsx" }) }));
  assert.equal(result.status, 200);
  assert.equal(result.body.saved, 1);
  assert.equal(saved[0].ticket, "4638107");
  assert.equal(saved[0].data.causal, "Ausentismo");
  assert.equal(saved[0].data.dt, "8008916262");
  assert.equal(saved[0].data.rr, "SERGIO DE LA CRUZ");
});

test("rechaza Ticket repetido y contratista fuera del alcance", async t => {
  let writes = 0;
  t.mock.method(globalThis, "fetch", async () => { writes++; return Response.json(null, { status: 201 }); });
  const handler = route({ contractor: "Logisticos", isAdmin: false, accessToken: "token", email: "test@example.test" });
  const row = { complaintId: "1", contractor: "Logisticos", date: "2026-09-04", openedAt: "2026-09-04", status: "Cerrada", issue: "Saldo", count: 1 };
  assert.equal((await handler.POST(new Request("https://example.test", { method: "POST", body: JSON.stringify({ rows: [row, row] }) }))).status, 400);
  assert.equal((await handler.POST(new Request("https://example.test", { method: "POST", body: JSON.stringify({ rows: [{ ...row, contractor: "Contratista desconocida" }] }) }))).status, 403);
  assert.equal(writes, 0);
});
