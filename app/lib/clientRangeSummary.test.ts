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

test("cuenta atenciones y refusal del cierre con fechas inclusivas y sin duplicados", () => {
  const reports = [
    report("current", "2026-09-24", [{ refusedVolume: 100 }], "current"),
    report("closure", "2026-09-24", [
      { withinRadius: false, refusedVolume: 4.5, deliveredVolume: 10.5 },
      { withinRadius: false, refusedVolume: 4.5, deliveredVolume: 10.5 },
      { dt: "456", withinRadius: null, refusedVolume: 2, deliveredVolume: 8 },
      { pocExternalId: "99", status: "NOT_STARTED", refusedVolume: 50 },
    ]),
    report("next", "2026-09-25", [{ refusedVolume: 3, deliveredVolume: 12 }]),
    report("outside", "2026-09-26", [{ refusedVolume: 20 }]),
  ];
  const [row] = buildClientRangeSummary(reports, [modulation("m1"), modulation("m1")], {
    ...filters, from: "2026-09-24", to: "2026-09-25",
  });
  assert.equal(row.attentions, 3);
  assert.equal(row.inside, 1);
  assert.equal(row.outside, 1);
  assert.equal(row.unknown, 1);
  assert.equal(row.refusedVolume, 9.5);
  assert.equal(row.refusal, 23.75);
  assert.equal(row.modulations, 1);
  assert.equal(row.outsidePercent, 50);
  assert.equal(row.visits.length, row.attentions);
  assert.deepEqual(row.visits.map(visit => visit.date), ["2026-09-25", "2026-09-24", "2026-09-24"]);
  assert.equal(row.visits.reduce((sum, visit) => sum + (visit.refusedVolume ?? 0), 0), row.refusedVolume);
  assert.equal(row.visits.reduce((sum, visit) => sum + (visit.deliveredVolume ?? 0), 0), row.deliveredVolume);
  assert.equal(row.modulationHistory.length, row.modulations);
  const [day] = buildClientRangeSummary(reports, [modulation("m1")], {
    ...filters, from: "2026-09-25", to: "2026-09-25",
  });
  assert.equal(day.attentions, 1);
  assert.equal(day.refusal, 20);
  assert.equal(day.modulations, 0);
  assert.equal(day.outsidePercent, 0);
  assert.equal(day.visits.length, 1);
  assert.equal(day.modulationHistory.length, 0);
});

test("una modulación sin visita no crea una atención ni un rechazo", () => {
  const [row] = buildClientRangeSummary([], [modulation("m1")], filters);
  assert.equal(row.attentions, 0);
  assert.equal(row.refusal, null);
  assert.equal(row.modulations, 1);
  assert.equal(row.outsidePercent, null);
  assert.deepEqual(row.visits, []);
  assert.equal(row.modulationHistory.length, 1);
});

test("historial conserva causal y comentario y separa contratistas y DT", () => {
  const reports = [
    report("a", "2026-09-24", [{ withinRadius: null }, { dt: "999", withinRadius: false }]),
    report("b", "2026-09-24", [{ withinRadius: false }], "closure", "B"),
  ];
  const records = [{ ...modulation("m1"), causal: "Local cerrado", comentario: "Primer contacto", comentarioModulador: "Se contactó al cliente" }, modulation("m2", "B")];
  const [row] = buildClientRangeSummary(reports, records, { ...filters, contractor: "A", dt: "123" });
  assert.equal(row.outsidePercent, null);
  assert.equal(row.visits.length, 1);
  assert.equal(row.visits[0].withinRadius, null);
  assert.equal(row.modulationHistory.length, 1);
  assert.equal(row.modulationHistory[0].causal, "Local cerrado");
  assert.equal(row.modulationHistory[0].comment, "Se contactó al cliente");
  assert.equal(row.modulationHistory[0].date, "2026-09-24");
});
