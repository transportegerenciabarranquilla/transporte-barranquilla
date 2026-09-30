import test from "node:test";
import assert from "node:assert/strict";
import { RANGE_HOUR_WINDOWS, rangeTime, rangeHour } from "./rangeHours.ts";
import { filterRangeHours, summarizeRangeReasons } from "./rangeReasonSummary.ts";
import { parsePuntoCoronaRouteFile, mergePuntoCoronaRouteReports } from "../punto-corona/routeReportService.ts";
import type { Vehiculo } from "../seguimiento/types";

test("interpreta horas locales y convierte timestamps a Colombia", () => {
  assert.equal(rangeTime("2026-09-30T13:45:00Z"), "08:45");
  assert.equal(rangeTime("2026-09-30T02:15:00Z"), "21:15");
  assert.equal(rangeTime("2026-09-30T13:45:00-05:00"), "13:45");
  assert.equal(rangeTime("8:59"), "08:59");
  assert.equal(rangeTime("12:00 a. m."), "00:00");
  assert.equal(rangeTime("1:15 PM"), "13:15");
  assert.equal(rangeTime(0.5), "12:00");
  for (const value of [undefined, "", "2026-09-30", "25:00", "09:65", "pendiente"]) assert.equal(rangeTime(value), null);
  assert.equal(rangeHour("23:59"), 23);
});

test("franjas conservan totales por contratista e incluyen visitas sin clasificar", () => {
  const row = { contractor: "Surti Cervezas", status: "CONCLUDED", withinRadius: false, outOfRadiusReason: "Apoyo de ingreso", skippedReason: "" };
  const rows = [
    { ...row, outOfRadiusTime: "08:00" },
    { ...row, outOfRadiusTime: "08:59", outOfRadiusReason: "" },
    { ...row, outOfRadiusTime: "09:00" },
    { ...row },
    { ...row, withinRadius: true, outOfRadiusTime: "08:00" },
    { ...row, status: "NOT_STARTED", outOfRadiusTime: "08:00" },
  ];
  const [group] = summarizeRangeReasons(rows);
  assert.equal(group.total, 4);
  assert.equal(group.hours[8], 2);
  assert.equal(group.hours[9], 1);
  assert.equal(group.unknownHour, 1);
  assert.deepEqual(group.reasonTimes[0], ["08:00", "09:00"]);
  assert.equal(group.reasonUnknownHours[0], 1);
  assert.deepEqual(group.reasonTimes[1], []);
  assert.equal(group.hours.reduce((sum, count) => sum + count, 0) + group.unknownHour, group.total);
  assert.equal(summarizeRangeReasons(filterRangeHours(rows, "8"))[0].total, 2);
  assert.equal(summarizeRangeReasons(filterRangeHours(rows, "unknown"))[0].total, 1);
  assert.equal(summarizeRangeReasons(filterRangeHours(rows, "all"))[0].total, 4);
  assert.deepEqual(summarizeRangeReasons(filterRangeHours(rows, "10")), []);
});

test("la carga CSV guarda la hora y otra carga sin columna conserva la existente", async () => {
  const base = "tour_display_id;poc_external_id;tour_date;status;within_radius";
  const values = "123;456;2026-09-30;CONCLUDED;false";
  const vehicles = [{ transporte: "123", transportista: "Surti Cervezas" }] as Vehiculo[];
  const original = await parsePuntoCoronaRouteFile(new File([`${base};Hora fuera de rango\n${values};08:45`], "bees.csv"), vehicles, "Surti Cervezas");
  assert.equal(original.rows[0].outOfRadiusTime, "08:45");
  const incoming = await parsePuntoCoronaRouteFile(new File([`${base}\n${values}`], "bees.csv"), vehicles, "Surti Cervezas");
  assert.equal(incoming.rows[0].outOfRadiusTime, undefined);
  assert.equal(mergePuntoCoronaRouteReports(original, incoming).rows[0].outOfRadiusTime, "08:45");
});

test("las franjas de dos horas acumulan todas las visitas sin duplicar los límites", () => {
  const base = { contractor: "Logisticos", status: "CONCLUDED", withinRadius: false, outOfRadiusReason: "", skippedReason: "" };
  const times = ["05:59", "06:00", "07:59", "08:00", "09:59", "10:00", "11:59", "12:00", "13:59", "14:00", "15:59", "16:00", "22:30"];
  const rows = times.map(outOfRadiusTime => ({ ...base, outOfRadiusTime }));
  for (const window of RANGE_HOUR_WINDOWS) {
    const selected = filterRangeHours(rows, window.value);
    assert.equal(selected.length, 2, window.value);
    assert.equal(summarizeRangeReasons(selected)[0].total, 2);
    assert.equal(summarizeRangeReasons(selected)[0].unclassified, 2);
  }
  assert.equal(filterRangeHours(rows, "other").length, 3);
  assert.equal(filterRangeHours([...rows, base], "unknown").length, 1);
  assert.equal(filterRangeHours([...rows, base], "all").length, 14);
  const combined = [
    ...rows,
    { ...base, contractor: "Surti Cervezas", outOfRadiusRecordedAt: "2026-09-29T13:30:00Z", outOfRadiusReason: "Reubicación" },
    { ...base, contractor: "Surti Cervezas", outOfRadiusRecordedAt: "2026-09-30T14:59:00Z", outOfRadiusReason: "Reubicación" },
    { ...base, withinRadius: true, outOfRadiusTime: "08:30" },
    { ...base, status: "NOT_STARTED", outOfRadiusTime: "08:30" },
  ];
  const groups = summarizeRangeReasons(filterRangeHours(combined, "8-10"));
  assert.equal(groups.reduce((sum, group) => sum + group.total, 0), 4);
  assert.equal(groups.reduce((sum, group) => sum + group.unclassified, 0), 2);
});
