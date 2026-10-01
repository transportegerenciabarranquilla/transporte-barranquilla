import assert from "node:assert/strict";
import test from "node:test";
import { compareModulaciones, checkinDate, type ComparisonCheckin } from "./modulacionComparison";
import type { ModulacionRegistro } from "./modulacionStorage";

const checkin = (changes: Partial<ComparisonCheckin> = {}): ComparisonCheckin => ({
  id: "1", dt: "123", contratista: "Logisticos", totalCajas: 12,
  createdAt: "2026-10-01T18:00:00Z", updatedAt: "2026-10-01T18:00:00Z", ...changes,
});
const modulation = (changes: Partial<ModulacionRegistro> = {}): ModulacionRegistro => ({
  id: "m1", dt: "DT-123", contratista: "Logisticos", totalCajas: "7", cajasGestionadas: "2",
  codigoCliente: "1", persona: "Ana", causal: "", comentario: "", imagenNombre: "", imagenVista: "",
  createdAt: "2026-09-30T17:00:00Z", ...changes,
});

test("cruza por DT y contratista, suma modulaciones sin confundir otras contratistas", () => {
  const rows = compareModulaciones([checkin(), checkin({ id: "2", contratista: "Surti Cervezas" })],
    [modulation(), modulation({ id: "m2", totalCajas: "5" })]);
  assert.equal(rows.find(row => row.contractor === "Surti Cervezas")?.missing, true);
  const matched = rows.find(row => row.contractor === "Logisticos")!;
  assert.equal(matched.modulated, 12);
  assert.equal(matched.managed, 4);
  assert.equal(matched.count, 2);
  assert.equal(matched.missing, false);
});

test("usa el último check-in y no marca cero cajas como falta de modulación", () => {
  const rows = compareModulaciones([checkin(), checkin({ id: "2", totalCajas: 0, updatedAt: "2026-10-01T19:00:00Z" })], []);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].checkin, 0);
  assert.equal(rows[0].missing, false);
});

test("normaliza HL y calcula la fecha del check-in en Colombia", () => {
  assert.equal(checkinDate("2026-10-02T02:00:00Z"), "2026-10-01");
  const [row] = compareModulaciones([checkin({ contratista: "HL Logistica" })], [modulation({ contratista: "HL Logisticos" })]);
  assert.equal(row.count, 1);
  assert.equal(row.missing, false);
});
