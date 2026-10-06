import test from "node:test";
import assert from "node:assert/strict";
import { buildRrTripAverages, RR_TRIP_PEOPLE } from "./rrTripAverage.ts";

test("muestra las 13 personas y cuenta cada viaje una sola vez por fecha, contratista, DT y número", () => {
  const rows = buildRrTripAverages([
    { contractor: "Logisticos", dispatch_date: "2026-10-01", dt: "S8001", trip: "Viaje 1", aux1: "Gonzalez Medina Cristo Jose" },
    { contractor: "Logisticos", dispatch_date: "2026-10-01", dt: "8001", trip: "1", aux2: "Gonzalez Medina Cristo Jose" },
    { contractor: "Logisticos", dispatch_date: "2026-10-01", dt: "8001", trip: "2", aux1: "Gonzalez Medina Cristo Jose" },
    { contractor: "Logisticos", dispatch_date: "2026-10-02", dt: "8002", trip: "1", aux3: "Gonzalez Medina Cristo Jose" },
  ]);
  assert.equal(rows.length, RR_TRIP_PEOPLE.length);
  assert.deepEqual(rows[0].days, [{ date: "2026-10-01", trips: 2, visited: null }, { date: "2026-10-02", trips: 1, visited: null }]);
  assert.equal(rows[0].matchedNames[0], "Gonzalez Medina Cristo Jose");
  assert.deepEqual(rows[4].days, []);
});

test("suma visitas por viaje sin duplicar personas ni versiones y conserva las fechas ordenadas", () => {
  const base = { contractor: "Logisticos", rr: "Cristo González", aux1: "Cristo González", trip: "1" };
  const person = buildRrTripAverages([
    { ...base, dispatch_date: "2026-10-02", dt: "2", visited: 0 },
    { ...base, dispatch_date: "2026-10-01", dt: "1", visited: "10" },
    { ...base, dispatch_date: "2026-10-01", dt: "1", visited: "12" },
    { ...base, dispatch_date: "2026-10-01", dt: "3", visited: 5 },
  ])[0];
  assert.deepEqual(person.days, [
    { date: "2026-10-01", trips: 2, visited: 17 },
    { date: "2026-10-02", trips: 1, visited: 0 },
  ]);
});

test("no presenta datos ausentes o inválidos como cero visitas", () => {
  for (const visited of [null, undefined, "", "abc", -1, 1.5]) {
    const person = buildRrTripAverages([{ rr: "Cristo González", dt: "1", dispatch_date: "2026-10-01", visited }])[0];
    assert.equal(person.days[0].visited, null);
  }
});

test("reconoce variantes verificadas sin atribuir viajes de homónimos", () => {
  const rows = buildRrTripAverages([
    { dispatch_date: "2026-10-01", dt: "1", aux1: "Russo Oyaga Dairo Aldemar" },
    { dispatch_date: "2026-10-01", dt: "2", aux2: "Cabarcas Garcia Eulogio Antonio" },
    { dispatch_date: "2026-10-01", dt: "3", aux3: "Garcia Pacheco Alvaro Luis" },
    { dispatch_date: "2026-10-01", dt: "4", aux1: "Orozco Moron Luis Eduardo" },
  ]);
  assert.equal(rows.find(row => row.name === "Darío Russo")?.days[0].trips, 1);
  assert.equal(rows.find(row => row.name === "Eulogio Cabarcaz")?.days[0].trips, 1);
  assert.equal(rows.find(row => row.name === "Álvaro García")?.days[0].trips, 1);
  assert.deepEqual(rows.find(row => row.name === "José Moron")?.days, []);
});
