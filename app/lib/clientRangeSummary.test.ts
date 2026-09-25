import assert from "node:assert/strict";
import test from "node:test";
import { buildClientRangeSummary } from "./clientRangeSummary.ts";
import type { PuntoCoronaRouteReport, PuntoCoronaRouteRow } from "./puntoCoronaRoutesStorage";
import type { ModulacionRegistro } from "./modulacionStorage";

const filters = { contractor: "Todas", from: "", to: "", dt: "" };
function report(id: string, date: string, rows: Partial<PuntoCoronaRouteRow>[], kind = "closure", contractor = "A") {
  return { id, contractor, operationalDate: date, kind, uploadedAt: `${date}T12:00:00Z`, rows: rows.map((row, index) => ({ id: String(index), dt: "123", pocExternalId: "42", pocName: "Tienda", status: "CONCLUDED", withinRadius: true, ...row })) } as PuntoCoronaRouteReport;
}
function modulation(id: string, contractor = "A") {
  return { id, contratista: contractor, codigoCliente: "42", nombreCliente: "Tienda", dt: "123", fechaDespacho: "2026-09-24", createdAt: "2026-09-25T12:00:00Z" } as ModulacionRegistro;
}

test("prioriza cierre, evita visitas duplicadas y conserva las visitas de distintos días", () => {
  const rows = buildClientRangeSummary([
    report("current", "2026-09-24", [{ withinRadius: true }], "current"),
    report("closure", "2026-09-24", [{ withinRadius: false }, { withinRadius: false }]),
    report("next", "2026-09-25", [{}, { pocExternalId: "43", withinRadius: null }, { pocExternalId: "44", status: "NOT_STARTED" }]),
  ], [modulation("m1"), modulation("m1"), modulation("m2")], filters);
  assert.equal(rows.length, 2);
  assert.deepEqual([rows[0].inside, rows[0].outside, rows[0].modulations], [1, 1, 2]);
  assert.equal(rows[1].unknown, 1);
  assert.equal(rows[1].outside, 0);
});

test("separa contratistas y filtra fecha operativa y DT en ambas fuentes", () => {
  const reports = [report("a", "2026-09-24", [{}]), report("b", "2026-09-24", [{}], "closure", "B")];
  const modulations = [modulation("m1"), modulation("m2", "B")];
  assert.equal(buildClientRangeSummary(reports, modulations, filters).length, 2);
  const rows = buildClientRangeSummary(reports, modulations, { contractor: "A", from: "2026-09-24", to: "2026-09-24", dt: "R1S123" });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].modulations, 1);
  assert.deepEqual(buildClientRangeSummary(reports, modulations, { ...filters, dt: "999" }), []);
  assert.deepEqual(buildClientRangeSummary(reports, modulations, { ...filters, from: "2026-09-25" }), []);
});
