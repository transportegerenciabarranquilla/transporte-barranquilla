import assert from "node:assert/strict";
import { test } from "node:test";
import { FOXTROT_RANGE_LIMIT_METERS, assignContractors, dateKey, distanceBands, inBand, mapRows, parseMeters, suggestMapping, summarizeFoxtrotCrews, summarizeFoxtrotRrs } from "./foxtrot.ts";

test("agrupa por RR sin separar sus DT", () => {
  const base = { contractor: "Logisticos", code: "1", name: "Cliente", dt: "S00123", rr: "Ana", date: "2026-09-09", meters: 50 };
  const summaries = summarizeFoxtrotRrs([
    { ...base, inRange: true },
    { ...base, code: "2", dt: "S00456", meters: 130, inRange: false },
    { ...base, code: "3", dt: "S00789", meters: null, inRange: null },
  ]);
  assert.equal(summaries.length, 1);
  assert.equal(summaries[0].total, 3);
  assert.equal(summaries[0].inRange, 1);
  assert.equal(summaries[0].outOfRange, 1);
  assert.equal(summaries[0].unvalidated, 1);
  assert.equal(summaries[0].deliveryPercent, 50);
});

test("resume visitas y porcentaje de entrega por tripulación", () => {
  const base = { contractor: "Logisticos", code: "1", name: "Cliente", dt: "S00123", rr: "Ana", date: "2026-09-09", meters: 50 };
  const summaries = summarizeFoxtrotCrews([
    { ...base, inRange: true },
    { ...base, code: "2", inRange: true },
    { ...base, code: "3", meters: 130, inRange: false },
    { ...base, code: "4", meters: null, inRange: null },
  ]);
  assert.equal(summaries.length, 1);
  assert.equal(summaries[0].total, 3);
  assert.equal(summaries[0].inRange, 2);
  assert.equal(summaries[0].outOfRange, 1);
  assert.equal(summaries[0].deliveryPercent.toFixed(2), "66.67");
});

test("cruza DT normalizados, prioriza fecha y conserva los casos sin asignación", () => {
  const row = { contractor: "Ignorar", code: "1", name: "Cliente", dt: "S000123", rr: "RR", inRange: true, date: "2026-09-09", meters: 50 };
  const report = (contractor: string, operationalDate: string, dt: string) => ({ contractor, operationalDate, summary: { crews: [{ dt }] } });
  const reports = [report("A", "2026-09-09", "DT-123"), report("B", "2026-09-08", "123"), report("C", "2026-09-08", "456")];
  assert.equal(assignContractors([row], reports)[0].contractor, "A");
  assert.equal(assignContractors([{ ...row, dt: "R1S000123" }], reports)[0].contractor, "A");
  assert.equal(assignContractors([{ ...row, dt: "DT-R2S000123" }], reports)[0].contractor, "A");
  assert.equal(assignContractors([{ ...row, dt: "S456" }], reports)[0].contractor, "C");
  assert.equal(assignContractors([{ ...row, date: "2026-09-10" }], reports)[0].contractor, "DT con varias contratistas");
  assert.equal(assignContractors([{ ...row, dt: "999" }], reports)[0].contractor, "DT sin coincidencia");
  assert.equal(assignContractors([row], [reports[0], reports[0]])[0].contractor, "A");
  assert.equal(assignContractors([row], [...reports, report("B", row.date, "123")])[0].contractor, "DT con varias contratistas");
  assert.equal(assignContractors([row], [])[0].contractor, "DT sin coincidencia");
});

test("intervalos sin duplicar los límites ni perder distancias decimales", () => {
  const row = { contractor: "A", code: "001", name: "Cliente", dt: "12", rr: "RR", inRange: false, date: "2026-09-09", meters: 0 };
  for (const [meters, expected] of [[0, -1], [0.5, 0], [1, 0], [100, 0], [100.1, 1], [180, 1], [180.1, 2], [500, 2]]) {
    const matches = distanceBands.map((band, index) => inBand({ ...row, meters: meters + FOXTROT_RANGE_LIMIT_METERS }, band.min, band.max) ? index : -1).filter(index => index !== -1);
    assert.deepEqual(matches, expected === -1 ? [] : [expected]);
  }
  assert.equal(inBand({ ...row, meters: 20, inRange: true }, 0, 30), false);
  assert.equal(inBand({ ...row, meters: null }, 0, 30), false);
});
test("distancias y estados desconocidos no se convierten en cero ni en fuera de rango", () => {
  assert.equal(parseMeters("30,5 m"), 30.5);
  assert.equal(parseMeters("1.200,50"), 1200.5);
  for (const value of ["", "abc", "-2"]) assert.equal(parseMeters(value), null);
});
test("mapea columnas y conserva código, DT, RR y fecha", () => {
  const raw = { "Código cliente": "00123", "Nombre cliente": "Tienda", DT: "00045", RR: "Ana", "En rango": "No", "Visit Meters from Customer": "160,1", Fecha: "09/09/2026" };
  const result = mapRows([raw], suggestMapping(Object.keys(raw)), "Punto Corona", "")[0];
  assert.equal(result.code, "00123"); assert.equal(result.dt, "00045"); assert.equal(result.rr, "Ana");
  assert.equal(result.date, "2026-09-09"); assert.equal(result.meters, 160.1); assert.equal(result.inRange, false);
  assert.equal(dateKey("31/02/2026"), "");
});

test("Foxtrot clasifica con límite inclusivo de 50 metros y reconoce sus encabezados", () => {
  const raw = { "Customer ID": "00123", "Customer Name": "Tienda", "Route Name": "S8008938459", "Driver Name": "Ana", "Visit Meters from Customer": "50", "Planned Route Start Date": "2026-09-08" };
  const mapping = suggestMapping(Object.keys(raw));
  for (const [value, expected] of [["0", true], ["49,99", true], ["50", true], ["50,01", false], ["125", false], ["", null], ["abc", null]] as const) {
    const result = mapRows([{ ...raw, "Visit Meters from Customer": value }], mapping, "Punto Corona", "")[0];
    assert.equal(result.inRange, expected);
    assert.equal(result.code, "00123"); assert.equal(result.dt, "S8008938459"); assert.equal(result.rr, "Ana"); assert.equal(result.date, "2026-09-08");
  }
});
