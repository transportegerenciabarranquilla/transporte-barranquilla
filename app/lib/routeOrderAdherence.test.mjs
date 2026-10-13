import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";

function compile(path, mocks = {}) {
  const source = ts.transpileModule(fs.readFileSync(new URL(path, import.meta.url), "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS } }).outputText;
  const loaded = { exports: {} };
  new Function("require", "module", "exports", source)(name => { if (name in mocks) return mocks[name]; throw new Error(name); }, loaded, loaded.exports);
  return loaded.exports;
}

const contractors = compile("./contractors.ts");
const { buildMonthlyOrderAdherence, buildRrOrderAdherence, filterAdherenceReportsByDate, preferredAdherenceReports } = compile("./routeOrderAdherence.ts", { "./contractors": contractors });

const row = (rr, planned, actual, id) => ({
  id, dt: "8001", tourDisplayId: "S8001", tourDate: "2026-09-10", driverName: rr, truckLicensePlate: "ABC123",
  pocExternalId: id, pocName: `Cliente ${id}`, plannedVisitOrder: planned, actualVisitOrder: actual,
  status: "CONCLUDED", withinRadius: true, outOfRadiusReason: "", skippedReason: "", deliveredVolume: 1, refusedVolume: 0,
});

const report = (kind, date, rows, contractor = "Logisticos") => ({ contractor, operationalDate: date, kind, uploadedAt: `${date}T12:00:00Z`, rows });

test("calcula cumplimiento por RR sin contar filas que no tienen ambos ordenes", () => {
  const rows = buildRrOrderAdherence([report("closure", "2026-09-10", [row("Ana", 1, 1, "1"), row("Ana", 2, 3, "2"), row("Ana", 3, null, "3")])]);
  assert.deepEqual(rows[0], { contractor: "Logisticos", rr: "Ana", routes: 1, evaluated: 2, compliant: 1, nonCompliant: 1, withoutOrder: 1, percentage: 50 });
});

test("el cierre prevalece sobre el reporte actual del mismo dia", () => {
  const current = report("current", "2026-09-10", [row("Ana", 1, 2, "1")]);
  const closure = report("closure", "2026-09-10", [row("Ana", 1, 1, "1")]);
  assert.equal(preferredAdherenceReports([current, closure]).length, 1);
  assert.equal(buildRrOrderAdherence([current, closure])[0].percentage, 100);
});

test("consolida el porcentaje mensual por contratista", () => {
  const reports = [
    report("closure", "2026-09-10", [row("Ana", 1, 1, "1"), row("Ana", 2, 3, "2")]),
    report("closure", "2026-09-11", [row("Luis", 1, 1, "3"), row("Luis", 2, 2, "4")], "Surti Cervezas"),
  ];
  assert.deepEqual(buildMonthlyOrderAdherence(reports).map(({ contractor, percentage }) => [contractor, percentage]), [["Surti Cervezas", 100], ["Logisticos", 50]]);
});

test("recupera visit_order de reportes historicos usando el sufijo del ID", () => {
  const legacyRows = [
    { ...row("Ana", null, null, "8001-cliente-a-1") },
    { ...row("Ana", null, null, "8001-cliente-b-3") },
  ];
  const result = buildRrOrderAdherence([report("closure", "2026-08-10", legacyRows)]);
  assert.equal(result[0].evaluated, 2);
  assert.equal(result[0].compliant, 1);
  assert.equal(result[0].percentage, 50);
});

test("filtra los reportes usando ambas fechas de forma inclusiva", () => {
  const reports = ["2026-05-01", "2026-06-15", "2026-10-02", "2026-10-03"].map((date) => report("closure", date, []));
  assert.deepEqual(filterAdherenceReportsByDate(reports, "2026-06-15", "2026-10-02").map((item) => item.operationalDate), ["2026-06-15", "2026-10-02"]);
});
