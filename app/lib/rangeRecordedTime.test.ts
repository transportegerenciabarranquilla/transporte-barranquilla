import test from "node:test";
import assert from "node:assert/strict";
import { addHistoricalRangeTimes, recordRangeTimes } from "./rangeRecordedTime.ts";
import { recordedRangeTime } from "./rangeHours.ts";
import { filterRangeHours, summarizeRangeReasons } from "./rangeReasonSummary.ts";
import type { PuntoCoronaRouteReport, PuntoCoronaRouteRow } from "./puntoCoronaRoutesStorage";

const now = "2026-09-30T15:20:00.000Z";
function report(overrides: Partial<PuntoCoronaRouteRow> = {}, contractor = "Surti Cervezas") {
  return { contractor, operationalDate: "2026-09-30", uploadedAt: "2026-09-30T12:00:00.000Z", rows: [
    { id: "1", dt: "123", truckLicensePlate: "ABC123", status: "CONCLUDED", withinRadius: false,
      outOfRadiusReason: "Apoyo de ingreso", skippedReason: "", ...overrides },
  ] } as PuntoCoronaRouteReport;
}

test("el servidor registra una nueva visita fuera de rango y no acepta la hora del cliente", () => {
  const incoming = report({ outOfRadiusRecordedAt: "2000-01-01T00:00:00Z", outOfRadiusRecordedSource: "system" });
  const [saved] = recordRangeTimes([incoming], [], now);
  assert.equal(saved.rows[0].outOfRadiusRecordedAt, now);
  assert.equal(saved.rows[0].outOfRadiusRecordedSource, "system");
  assert.equal(recordedRangeTime(saved.rows[0]), "10:20");
  const [repeat] = recordRangeTimes([incoming], [saved], "2026-09-30T20:00:00Z");
  assert.equal(repeat.rows[0].outOfRadiusRecordedAt, now);
});

test("solo un estado fuera de rango iniciado recibe una hora", () => {
  for (const overrides of [{ withinRadius: true }, { withinRadius: null }, { status: "NOT_STARTED" }]) {
    assert.equal(recordRangeTimes([report(overrides)], [], now)[0].rows[0].outOfRadiusRecordedAt, undefined);
  }
  assert.equal(recordRangeTimes([report()], [report({ withinRadius: true })], now)[0].rows[0].outOfRadiusRecordedAt, now);
});

test("el historial usa la primera evidencia disponible e identifica su fuente sin modificar originales", () => {
  const early = report();
  const late = { ...report(), uploadedAt: "2026-09-30T19:00:00Z" };
  const result = addHistoricalRangeTimes([late, early]);
  assert.equal(result[0].rows[0].outOfRadiusRecordedAt, early.uploadedAt);
  assert.equal(result[0].rows[0].outOfRadiusRecordedSource, "report");
  assert.equal(late.rows[0].outOfRadiusRecordedAt, undefined);
  const saved = recordRangeTimes([late], [early], now)[0];
  assert.equal(saved.rows[0].outOfRadiusRecordedAt, early.uploadedAt);
  assert.equal(saved.rows[0].outOfRadiusRecordedSource, "report");
});

test("no mezcla contratistas, visitas o vehículos y no inventa referencias sin fecha", () => {
  const stored = report();
  for (const incoming of [report({}, "Punto Corona"), report({ id: "2" }), report({ truckLicensePlate: "XYZ999" })]) {
    assert.equal(recordRangeTimes([incoming], [stored], now)[0].rows[0].outOfRadiusRecordedAt, now);
  }
  const missing = { ...report(), uploadedAt: "" };
  assert.equal(addHistoricalRangeTimes([missing])[0].rows[0].outOfRadiusRecordedAt, undefined);
});

test("las franjas y las barras usan la hora del servidor en Colombia", () => {
  const saved = recordRangeTimes([report()], [], now)[0];
  const rows = saved.rows.map(row => ({ ...row, contractor: saved.contractor }));
  assert.equal(filterRangeHours(rows, "10").length, 1);
  assert.equal(filterRangeHours(rows, "15").length, 0);
  assert.deepEqual(summarizeRangeReasons(rows)[0].reasonTimes[0], ["10:20"]);
});
