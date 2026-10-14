import assert from "node:assert/strict";
import test from "node:test";
import { parseActivePersonnelIds, remainingActivePersonnel } from "./activePersonnel.ts";

test("acepta una columna con encabezado o sin encabezado y elimina duplicados", () => {
  assert.deepEqual(parseActivePersonnelIds([
    { name: "Activos", rows: [["Cédula"], [100872871], ["72051374"], ["100872871"]] },
    { name: "Otros", rows: [["104344432"], [null]] },
  ]), ["100872871", "72051374", "104344432"]);
});

test("lee la columna cédula aunque tenga otras columnas", () => {
  assert.deepEqual(parseActivePersonnelIds([{ name: "Personal", rows: [["Nombre", "CC"], ["Saúl", 72051374]] }]), ["72051374"]);
});

test("rechaza hojas ambiguas y cédulas inválidas", () => {
  assert.throws(() => parseActivePersonnelIds([{ name: "Hoja1", rows: [["Saúl", 72051374]] }]), /columna Cédula/);
  assert.throws(() => parseActivePersonnelIds([{ name: "Hoja1", rows: [["Cédula"], ["ABC"]] }]), /Cédula inválida/);
});

test("la pestaña de disponibles excluye a quienes ya tienen cualquier cargo asignado", () => {
  const active = [
    { id: "00123", name: "RR asignado" },
    { id: "456", name: "Conductor asignado" },
    { id: "789", name: "Auxiliar libre" },
  ];
  assert.deepEqual(remainingActivePersonnel(active, ["123", "456"]), [active[2]]);
});
