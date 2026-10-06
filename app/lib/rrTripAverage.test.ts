import test from "node:test";
import assert from "node:assert/strict";
import { buildRrTripAverages, RR_TRIP_PEOPLE } from "./rrTripAverage.ts";

test("muestra las 13 personas y cuenta cada viaje una sola vez por fecha, contratista, DT y número", () => {
  const rows = buildRrTripAverages([
    { contractor: "Logisticos", dispatch_date: "2026-10-06", dt: "S8001", trip: "Viaje 1", aux1_cc: "1042971540" },
    { contractor: "Logisticos", dispatch_date: "2026-10-06", dt: "8001", trip: "1", aux2_cc: "1042971540" },
    { contractor: "Logisticos", dispatch_date: "2026-10-06", dt: "8001", trip: "2", aux1_cc: "1042971540" },
    { contractor: "Logisticos", dispatch_date: "2026-10-07", dt: "8002", trip: "1", aux3_cc: "1042971540" },
  ]);
  assert.equal(rows.length, RR_TRIP_PEOPLE.length);
  assert.deepEqual(rows[0].days, [{ date: "2026-10-06", trips: 2, visited: null }, { date: "2026-10-07", trips: 1, visited: null }]);
  assert.equal(rows[0].cc, "1042971540");
  assert.deepEqual(rows[4].days, []);
});

test("suma visitas por viaje sin duplicar personas ni versiones y conserva las fechas ordenadas", () => {
  const base = { contractor: "Logisticos", rr_cc: "1042971540", aux1_cc: "1042971540", trip: "1" };
  const person = buildRrTripAverages([
    { ...base, dispatch_date: "2026-10-07", dt: "2", visited: 0 },
    { ...base, dispatch_date: "2026-10-06", dt: "1", visited: "10" },
    { ...base, dispatch_date: "2026-10-06", dt: "1", visited: "12" },
    { ...base, dispatch_date: "2026-10-06", dt: "3", visited: 5 },
  ])[0];
  assert.deepEqual(person.days, [
    { date: "2026-10-06", trips: 2, visited: 17 },
    { date: "2026-10-07", trips: 1, visited: 0 },
  ]);
});

test("no presenta datos ausentes o inválidos como cero visitas", () => {
  for (const visited of [null, undefined, "", "abc", -1, 1.5]) {
    const person = buildRrTripAverages([{ rr_cc: "1042971540", dt: "1", dispatch_date: "2026-10-06", visited }])[0];
    assert.equal(person.days[0].visited, null);
  }
});

test("solo atribuye viajes por cédula y no por coincidencias de nombres", () => {
  const rows = buildRrTripAverages([
    { dispatch_date: "2026-10-06", dt: "1", aux1: "Cristo González", aux1_cc: "99999999" },
    { dispatch_date: "2026-10-06", dt: "2", aux1: "José Moron", aux1_cc: "8769783" },
    { dispatch_date: "2026-10-06", dt: "3", aux1: "Cristo González" },
    { dispatch_date: "2026-10-06", dt: "4", aux1_cc: "CC 1042971540" },
  ]);
  assert.equal(rows[0].days[0].trips, 1);
  assert.equal(rows[4].name, "Luis Eduardo Orozco Moron");
  assert.equal(rows[4].days[0].trips, 1);
});
