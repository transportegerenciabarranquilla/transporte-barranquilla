import test from "node:test";
import assert from "node:assert/strict";
import { reconcileRangeVisits } from "./rangeVisitReconciliation.ts";
import { mergePuntoCoronaRouteReports, summarizeRows } from "../punto-corona/routeReportService.ts";
import type { PuntoCoronaRouteRow, PuntoCoronaRouteReport } from "./puntoCoronaRoutesStorage.ts";

const row = (id: string, overrides: Partial<PuntoCoronaRouteRow> = {}): PuntoCoronaRouteRow => ({
  id, dt: "8008986019", tourDisplayId: "S8008986019", tourDate: "2026-09-30", driverName: "RR", truckLicensePlate: "COPSX368",
  pocExternalId: "10391057", pocName: "Granero El Oriente", status: "RESCHEDULED", withinRadius: false,
  outOfRadiusReason: "", skippedReason: "", deliveredVolume: 0, refusedVolume: 0, ...overrides,
});

test("conserva la visita en rango y archiva las dos reprogramaciones", () => {
  const old = [row("5"), row("12", { manualOutOfRadiusReason: "Reconstrucción" })];
  const delivered = row("22", { status: "CONCLUDED", withinRadius: true });
  const result = reconcileRangeVisits([...old, delivered]);
  assert.deepEqual(result.rows, [delivered]);
  assert.deepEqual(result.superseded, old);
  const summary = summarizeRows(result.rows, 1, 1);
  assert.equal(summary.outOfRange, 0);
  assert.equal(summary.inRange, 1);
  assert.equal(summary.startedRows, 1);
  assert.equal(summary.deliveryRangePercent, 100);
  assert.equal(summary.crews[0].outOfRange, 0);
});

test("no mezcla clientes, fechas o DT ni elimina otras visitas fuera de rango", () => {
  const rows = [row("1"), row("2", { dt: "other" }), row("3", { tourDate: "2026-10-01" }), row("4", { pocExternalId: "otro" }), row("5", { status: "CONCLUDED" }), row("6", { withinRadius: true, status: "NOT_STARTED" })];
  assert.deepEqual(reconcileRangeVisits(rows).rows, rows);
  const result = reconcileRangeVisits([...rows, row("7", { status: "CONCLUDED", withinRadius: true })]);
  assert.deepEqual(result.superseded.map(item => item.id), ["1"]);
});

test("una nueva carga mantiene la corrección y el historial de motivos", () => {
  const oldRows = [row("5", { manualOutOfRadiusReason: "Apoyo de ingreso" }), row("12")];
  const existing: PuntoCoronaRouteReport = { id: "report", contractor: "Surti Cervezas", operationalDate: "2026-09-30", kind: "current", fileName: "old.csv", uploadedAt: "2026-09-30T20:00:00Z", rows: oldRows, summary: summarizeRows(oldRows, 1, 1) };
  const incoming = { ...existing, rows: [row("22", { withinRadius: true, status: "CONCLUDED" })] };
  const merged = mergePuntoCoronaRouteReports(existing, incoming);
  assert.equal(merged.rows.length, 1);
  assert.deepEqual(merged.supersededRangeRows, oldRows);
  assert.equal(merged.summary.outOfRange, 0);
  const repeated = mergePuntoCoronaRouteReports(merged, incoming);
  assert.deepEqual(repeated.supersededRangeRows, oldRows);
});
