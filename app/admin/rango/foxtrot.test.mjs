import assert from "node:assert/strict";
import test from "node:test";
import { assignRouteRrs, distanceBands, inBand } from "./foxtrot.ts";

const row = { contractor: "Logisticos", dt: "800893849", date: "2026-09-08", rr: "Palomino", meters: 75, inRange: false };
const vehicle = { transportista: "Logisticos", transporte: "DT-800893849", fechaDespacho: "2026-09-08", nombreResponsable: "Meriño Quintero Jose Del Carmen", cedulaResponsable: "72002479" };

test("uses the dispatch crew even when attendance was created on another day", () => {
  const attendance = [{ contratista: "Logisticos", dt: row.dt, createdAt: "2026-09-07T12:00:00Z", nombreResponsable: vehicle.nombreResponsable, cedulaResponsable: vehicle.cedulaResponsable }];
  assert.equal(assignRouteRrs([row], attendance, [vehicle])[0].rr, vehicle.nombreResponsable);
});

test("does not borrow a vehicle RR from another date or contractor", () => {
  for (const other of [{ ...vehicle, fechaDespacho: "2026-09-07" }, { ...vehicle, transportista: "Surti Cervezas" }]) {
    assert.equal(assignRouteRrs([row], [], [other])[0].rr, "RR sin coincidencia");
  }
});

test("conflicting vehicle assignments remain unresolved", () => {
  assert.equal(assignRouteRrs([row], [], [vehicle, { ...vehicle, nombreResponsable: "Otro RR", cedulaResponsable: "123" }])[0].rr, "RR con varias coincidencias");
});

test("distance bands use actual distance and keep 50 meters inside range", () => {
  for (const [meters, expected] of [[50, -1], [51, 0], [100, 0], [101, 1], [180, 1], [181, 2]]) {
    assert.deepEqual(distanceBands.map(b => inBand({ ...row, meters, inRange: meters <= 50 }, b.min, b.max)), distanceBands.map((_, i) => i === expected));
  }
});
