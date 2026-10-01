import test from "node:test";
import assert from "node:assert/strict";
import { beesOutsideByContractor, beesOutsideByHour, beesOutsideByWeekday, beesRangeTotals, type BeesRangeRow } from "./beesRangeCharts.ts";

const row = (id: number, overrides: Partial<BeesRangeRow> = {}): BeesRangeRow => ({
  id: String(id), pocExternalId: String(id), pocName: `Cliente ${id}`, contractor: "Logisticos", date: "2026-10-01", dt: "8008986019",
  tourDisplayId: "S8008986019", tourDate: "2026-10-01", driverName: "RR", truckLicensePlate: "ABC123", status: "CONCLUDED",
  withinRadius: false, outOfRadiusTime: "08:00", outOfRadiusReason: "", skippedReason: "", deliveredVolume: 0, refusedVolume: 0, ...overrides,
});
const sum = (values: Array<{ count: number }>) => values.reduce((total, value) => total + value.count, 0);

test("190 de 200 en BEES produce exactamente 10 fuera de rango en las tres gráficas", () => {
  const rows = Array.from({ length: 200 }, (_, index) => row(index, { withinRadius: index < 190 }));
  const totals = beesRangeTotals(rows);
  assert.equal(totals.inside / totals.total * 100, 95);
  assert.equal(totals.outside, 10);
  assert.equal(beesOutsideByContractor(rows).reduce((total, group) => total + group.outside, 0), 10);
  assert.equal(sum(beesOutsideByWeekday(rows)), 10);
  assert.equal(sum(beesOutsideByHour(rows)), 10);
});

test("no depende de motivos ni placas e incluye Punto Corona, sin fecha y sin hora", () => {
  const rows = [row(1, { contractor: "Punto Corona", outOfRadiusTime: undefined, truckLicensePlate: "" }), row(2, { date: "", outOfRadiusTime: "05:00" }), row(3, { manualOutOfRadiusReason: "Apoyo de ingreso", outOfRadiusTime: "23:59" })];
  assert.equal(beesRangeTotals(rows).outside, 3);
  assert.equal(beesOutsideByContractor(rows).find(group => group.contractor === "Punto Corona")?.outside, 1);
  assert.equal(beesOutsideByWeekday(rows).find(day => day.label === "Sin fecha")?.count, 1);
  assert.equal(beesOutsideByHour(rows).find(hour => hour.label === "Sin hora")?.count, 1);
  assert.equal(sum(beesOutsideByHour(rows, true)), 3);
  const changedReasons = rows.map(item => ({ ...item, manualOutOfRadiusReason: "Otro motivo", outOfRadiusReason: "Otro" }));
  assert.deepEqual(beesOutsideByHour(rows), beesOutsideByHour(changedReasons));
  assert.deepEqual(beesOutsideByWeekday(rows), beesOutsideByWeekday(changedReasons));
});

test("comparte la deduplicación BEES y separa clientes sin validar de fuera de rango", () => {
  const rows = [row(1), row(1, { id: "otra-visita" }), row(2, { withinRadius: null }), row(3, { status: "NOT_STARTED" }), row(1, { date: "2026-10-02" }), row(1, { contractor: "Surti Cervezas" })];
  const totals = beesRangeTotals(rows);
  assert.equal(totals.total, 4);
  assert.equal(totals.outside, 3);
  assert.equal(totals.unvalidated, 1);
  assert.equal(sum(beesOutsideByWeekday(rows)), 3);
  assert.equal(sum(beesOutsideByHour(rows)), 3);
});
