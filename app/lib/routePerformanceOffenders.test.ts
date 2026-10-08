import assert from "node:assert/strict";
import test from "node:test";

import { buildDriverOffenders } from "./routePerformanceOffenders.ts";

test("agrupa por conductor y RR, ordena por menor ADH_KM y limita el ranking", () => {
  const rows = [
    { driver: "José Pérez", rr: "Ana", contractor: "Logisticos", adherenceKmPercent: 40, differenceKm: 12 },
    { driver: "JOSE PEREZ", rr: "Ana", contractor: "Logisticos", adherenceKmPercent: 60, differenceKm: -8 },
    { driver: "José Pérez", rr: "Luis", contractor: "Logisticos", adherenceKmPercent: 30, differenceKm: 5 },
    { driver: "Marta", rr: "Ana", contractor: "Surti Cervezas", adherenceKmPercent: 90, differenceKm: 3 },
  ];
  const ranking = buildDriverOffenders(rows, 2);
  assert.equal(ranking.length, 2);
  assert.deepEqual(ranking.map((item) => [item.driver, item.rr, item.adherenceKmPercent]), [
    ["José Pérez", "Luis", 30],
    ["José Pérez", "Ana", 50],
  ]);
  assert.equal(ranking[1].trips, 2);
  assert.equal(ranking[1].differenceKm, 20);
});

test("excluye filas sin conductor identificado o sin adherencia", () => {
  const ranking = buildDriverOffenders([
    { driver: "Sin identificar", rr: "Ana", contractor: "Logisticos", adherenceKmPercent: 20, differenceKm: 10 },
    { driver: "Marta", rr: "Ana", contractor: "Logisticos", adherenceKmPercent: null, differenceKm: 7 },
    { driver: "Luis", rr: "", contractor: "Logisticos", adherenceKmPercent: 0, differenceKm: 4 },
  ]);
  assert.deepEqual(ranking.map((item) => [item.driver, item.rr, item.adherenceKmPercent]), [["Luis", "", 0]]);
});

test("muestra por placa los vehículos que todavía no tienen conductor registrado", () => {
  const ranking = buildDriverOffenders([
    { driver: "", rr: "", contractor: "Surti Cervezas", matchedPlate: "COPSX942", adherenceKmPercent: 65.8, rangePercent: 100, differenceKm: 11.71 },
    { driver: "Sin identificar", rr: "", contractor: "Surti Cervezas", matchedPlate: "COVEJ198", adherenceKmPercent: 74, rangePercent: 50, differenceKm: 9.2 },
  ]);
  assert.deepEqual(ranking.map((item) => [item.driver, item.plates, item.contractor]), [
    ["Sin registrar", ["PSX942"], "Surti Cervezas"],
    ["Sin registrar", ["VEJ198"], "Surti Cervezas"],
  ]);
});

test("muestra todas las placas de la tripulación sin duplicar ni alterar los indicadores", () => {
  const trip = { driver: "Luis", rr: "Ana", contractor: "Logisticos", adherenceKmPercent: 50, differenceKm: 5 };
  const [group] = buildDriverOffenders([
    { ...trip, plate: "COABC123" },
    { ...trip, plate: "abc-123" },
    { ...trip, plate: "XXX999", matchedPlate: "XYZ789" },
    { ...trip, originalPlate: "DEF456" },
    { ...trip },
    { ...trip, plate: "BAD111", adherenceKmPercent: null },
  ]);
  assert.deepEqual(group.plates, ["ABC123", "DEF456", "XYZ789"]);
  assert.equal(group.trips, 5);
  assert.equal(group.adherenceKmPercent, 50);
  assert.equal(group.differenceKm, 25);
});
