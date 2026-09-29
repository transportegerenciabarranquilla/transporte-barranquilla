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
