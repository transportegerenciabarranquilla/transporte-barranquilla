import assert from "node:assert/strict";
import test from "node:test";
import * as XLSX from "xlsx";
import { matchRoutePerformance, normalizePerformancePlate, parseRoutePerformanceRows, performanceDate, summarizePerformanceCrews, type PerformanceVehicle } from "./routePerformanceImport.ts";

const headers = ["fecha_viaje2", "PLACA", "PLACAORIGINAL", "Viaje ", "PLAN_KM", "EJE_KM", "DIFERENCIAKM", "ENTREGA RANGO"];
const source = [headers, ["1/07/2026", "COXMB964", "", 1, "29,10", "59,33", "30,22", "49,10 %"]];
const vehicle = (overrides: Partial<PerformanceVehicle> = {}): PerformanceVehicle => ({ vehiculo: "XMB-964", fechaDespacho: "2026-07-01", fechaDt: "", date: "", createdAt: "", viaje: "1", nombreResponsable: "RR Ana", responsable: "Responsable", nombreAuxiliar1: "Conductor Luis", transportista: "Empresa", transporte: "123", ...overrides });

test("reads supplied headers in XLSX and XLS, preserves reported difference and percentage", () => {
  for (const bookType of ["xlsx", "xls"] as const) {
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(source), "Viajes");
    const loaded = XLSX.read(XLSX.write(book, { type: "buffer", bookType }), { type: "buffer", cellDates: true });
    const data = XLSX.utils.sheet_to_json<unknown[]>(loaded.Sheets.Viajes, { header: 1, raw: true, defval: "", blankrows: true });
    const [row] = parseRoutePerformanceRows(data);
    assert.equal(row.date, "2026-07-01");
    assert.equal(row.plannedKm, 29.1);
    assert.equal(row.executedKm, 59.33);
    assert.equal(row.differenceKm, 30.22); // Use the Excel value, not planned minus executed.
    assert.equal(row.rangePercent, 49.1);
    assert.ok(Math.abs(row.outsidePercent! - 50.9) < 1e-9);
  }
});

test("matches normalized plate and date, with trip disambiguation and actual crew fields", () => {
  const rows = parseRoutePerformanceRows(source);
  assert.equal(normalizePerformancePlate("COXMB964"), "XMB964");
  assert.equal(normalizePerformancePlate("CO1234"), "CO1234");
  const [row] = matchRoutePerformance(rows, [vehicle({ fechaDespacho: "2026-08-01" }), vehicle({ viaje: "11" }), vehicle()]);
  assert.equal(row.match, "matched");
  assert.equal(row.rr, "RR Ana");
  assert.equal(row.driver, "Conductor Luis");
  assert.equal(row.dt, "123");
});

test("does not assign an unrelated date, conflicting trip or ambiguous crew", () => {
  const rows = parseRoutePerformanceRows(source);
  assert.equal(matchRoutePerformance(rows, [vehicle({ fechaDespacho: "2026-07-02" })])[0].match, "missing");
  assert.equal(matchRoutePerformance(rows, [vehicle({ viaje: "11" })])[0].match, "missing");
  const ambiguous = matchRoutePerformance(rows, [vehicle(), vehicle({ transporte: "999", nombreResponsable: "Otro RR" })])[0];
  assert.equal(ambiguous.match, "ambiguous");
  assert.equal(ambiguous.rr, "");
  assert.equal(ambiguous.driver, "");
});

test("uses original plate when needed and missing trip only for a unique match", () => {
  const rows = parseRoutePerformanceRows([headers, ["1/07/2026", "COABC123", "XMB964", 1, 29, 59, 30, 1]]);
  assert.equal(matchRoutePerformance(rows, [vehicle({ viaje: "Pendiente" })])[0].match, "matched");
  assert.equal(matchRoutePerformance(rows, [vehicle({ viaje: "" }), vehicle({ viaje: "", transporte: "999" })])[0].match, "ambiguous");
  assert.equal(rows[0].rangePercent, 100);
});

test("supports Excel dates, fraction percentages, zero and missing percentages without inventing values", () => {
  const rows = parseRoutePerformanceRows([headers,
    [new Date(2026, 6, 1), "XMB964", "", 1, 1, 1, 0, 0.9231],
    [46204, "XMB964", "", 1, 1, 1, 0, 0],
    ["2026-07-01", "XMB964", "", 1, 1, 1, 0, ""],
  ]);
  assert.equal(rows[0].date, "2026-07-01");
  assert.ok(Math.abs(rows[0].rangePercent! - 92.31) < 1e-9);
  assert.equal(rows[1].rangePercent, 0);
  assert.equal(rows[1].outsidePercent, 100);
  assert.equal(rows[2].rangePercent, null);
  assert.equal(rows[2].outsidePercent, null);
  assert.equal(performanceDate("31/02/2026"), "");
  assert.throws(() => parseRoutePerformanceRows([headers, ["1/07/2026", "XMB964", "", 1, 1, 1, 0, "101 %"]]), /ENTREGA RANGO/);
  assert.throws(() => parseRoutePerformanceRows([headers, ["1/07/2026", "XMB964", "", 1, "", 1, 0, 50]]), /PLAN_KM/);
});

test("charts average per trip and exclude unmatched or missing percentage rows", () => {
  const rows = parseRoutePerformanceRows([headers,
    ["1/07/2026", "XMB964", "", 1, 1, 1, 0, "50 %"],
    ["1/07/2026", "XMB964", "", 1, 1, 1, 0, "100 %"],
    ["1/07/2026", "XMB964", "", 1, 1, 1, 0, ""],
    ["1/07/2026", "ABC123", "", 1, 1, 1, 0, 0],
  ]);
  const crews = summarizePerformanceCrews(matchRoutePerformance(rows, [vehicle()]));
  assert.equal(crews.length, 1);
  assert.equal(crews[0].trips, 2);
  assert.equal(crews[0].rangePercent, 75);
  const unidentified = matchRoutePerformance(rows, [vehicle({ nombreResponsable: "Sin identificar", responsable: "Sin responsable", nombreAuxiliar1: "Sin identificar" })]);
  assert.equal(summarizePerformanceCrews(unidentified).length, 0);
});
