import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";

const source = ts.transpileModule(fs.readFileSync(new URL("./n8nDailySummary.ts", import.meta.url), "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS } }).outputText;
const loaded = { exports: {} };
new Function("require", "module", "exports", source)(name => {
  if (name === "./contractors") return { normalizeContractorName: value => String(value || "").toLowerCase().replace(/[^a-z]/g, "") };
  if (name === "./modulacionStorage") return { calculateRefusalTotals: vehicles => ({ cajasSeguimiento: vehicles.reduce((sum, item) => sum + item.cajas, 0), pendientes: vehicles.reduce((sum, item) => sum + item.cajasRefusalFinal, 0) }) };
  if (name === "./supabaseServer") return {};
  throw new Error(name);
}, loaded, loaded.exports);
const { calculateDailySummary, dateKey } = loaded.exports;
const day = "2026-10-05";

test("resume seguimiento, refusal y rango por contratista y pondera los totales", () => {
  const routes = [
    { contractor: "Logisticos", updated_at: "2026-10-05T12:00:00Z", data: { transporte: "1", fechaDespacho: day, cajas: 100, cajasRefusalFinal: 10, clientes: 10, visitados: 5 } },
    { contractor: "Surti Cervezas", updated_at: "2026-10-05T12:00:00Z", data: { transporte: "2", fechaDespacho: "5/10/2026", cajas: 300, cajasRefusalFinal: 60, clientes: 30, visitados: 30 } },
    { contractor: "Logisticos", updated_at: "2026-10-04T12:00:00Z", data: { transporte: "3", fechaDespacho: "2026-10-04", cajas: 999, cajasRefusalFinal: 999, clientes: 100, visitados: 0 } },
  ];
  const reports = [
    { contractor: "Logisticos", updated_at: "2026-10-05T12:00:00Z", data: { operationalDate: day, kind: "current", rows: [{ status: "CONCLUDED", withinRadius: true }] } },
    { contractor: "Logisticos", updated_at: "2026-10-05T13:00:00Z", data: { operationalDate: day, kind: "closure", rows: [{ status: "CONCLUDED", withinRadius: false }, { status: "CONCLUDED", withinRadius: true }] } },
    { contractor: "Surti Cervezas", updated_at: "2026-10-05T12:00:00Z", data: { operationalDate: day, kind: "current", rows: [{ status: "CONCLUDED", withinRadius: true }, { status: "NOT_STARTED", withinRadius: false }] } },
  ];
  const result = calculateDailySummary(day, routes, reports);
  assert.deepEqual(result.total.tracking, { routes: 2, clients: 40, visited: 35, percentage: 87.5 });
  assert.deepEqual(result.total.refusal, { percentage: 17.5, pending: 70, boxes: 400 });
  assert.deepEqual(result.total.range, { percentage: 66.67, inRange: 2, started: 3, outside: 1 });
  assert.equal(result.contractors[2].range, null);
  assert.equal(dateKey("5/10/2026"), day);
});
