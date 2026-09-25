import assert from "node:assert/strict";
import test from "node:test";
import { coordinate, distanceMeters, parseRangeImport, suggestImportMapping } from "./clientRangeImport.ts";
import { buildClientRangeSummary } from "./clientRangeSummary.ts";

test("calcula distancia geográfica y valida coordenadas sin convertir vacíos en cero", () => {
  assert.equal(distanceMeters(10, -74, 10, -74), 0);
  assert.ok(Math.abs(distanceMeters(0, 0, 0, 1) - 111194.93) < 0.1);
  assert.equal(coordinate("10,123", 90), 10.123);
  assert.equal(coordinate("", 90), null);
  assert.equal(coordinate("91", 90), null);
  assert.equal(coordinate("-181", 180), null);
});

test("reconoce columnas, rechaza fechas imposibles y coordenadas incompletas", () => {
  const row = { "Código cliente": "42", Transportista: "A", Fecha: "24/09/2026", DT: "123", "Latitud cliente": "10", "Longitud cliente": "-74", "Latitud visita": "10.001", "Longitud visita": "-74" };
  const mapping = suggestImportMapping(Object.keys(row));
  const result = parseRangeImport([row], mapping);
  assert.equal(result.errors.length, 0);
  assert.equal(result.visits[0].date, "2026-09-24");
  assert.ok(result.visits[0].meters > 111 && result.visits[0].meters < 112);
  assert.equal(parseRangeImport([{ ...row, Fecha: "31/02/2026" }, { ...row, "Latitud visita": "" }], mapping).errors.length, 2);
});

test("Foxtrot incluye 50 m, calcula exceso y no duplica cargas repetidas", () => {
  const row = { contractor: "A", code: "42", name: "Tienda", date: "2026-09-24", dt: "123", meters: 50 };
  const filters = { contractor: "Todas", from: "", to: "", dt: "" };
  const [summary] = buildClientRangeSummary([], [], filters, [row, row, { ...row, date: "2026-09-25", meters: 125 }]);
  assert.equal(summary.inside, 1);
  assert.equal(summary.outside, 1);
  assert.equal(summary.maxExcess, 75);
  assert.equal(summary.maxDistance, 125);
  const [filtered] = buildClientRangeSummary([], [], { ...filters, to: "2026-09-24" }, [row, { ...row, date: "2026-09-25", meters: 125 }]);
  assert.equal(filtered.outside, 0);
  assert.equal(filtered.maxExcess, 0);
});
