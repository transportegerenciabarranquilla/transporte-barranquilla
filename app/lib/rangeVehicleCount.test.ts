import test from "node:test";
import assert from "node:assert/strict";
import { countRangeVehicles, type RangeVehicleRow } from "./rangeVehicleCount.ts";

const row = (overrides: Partial<RangeVehicleRow> = {}): RangeVehicleRow => ({ contractor: "Logisticos", date: "2026-09-29", status: "CONCLUDED", withinRadius: false, truckLicensePlate: "ABC123", outOfRadiusTime: "08:30", ...overrides });

test("cuenta placas distintas sin dividir entre los días", () => {
  const result = countRangeVehicles([
    row(), row({ truckLicensePlate: "COABC123" }), row({ truckLicensePlate: "abc-123" }),
    row({ truckLicensePlate: "XYZ999" }),
    row({ date: "2026-09-30", withinRadius: true }),
    row({ date: "2026-09-30", outOfRadiusTime: "10:00" }),
  ], "8-10");
  assert.equal(result[0].vehicleCount, 2);
});

test("una placa repetida en varios días cuenta una vez por contratista", () => {
  const result = countRangeVehicles([row(), row({ date: "2026-09-30" }), row({ contractor: "Surti Cervezas" })], "8-10");
  assert.equal(result[0].vehicleCount, 1);
  assert.equal(result[1].vehicleCount, 1);
});

test("ignora placas ausentes, horas desconocidas, límites y visitas no iniciadas", () => {
  const result = countRangeVehicles([
    row({ truckLicensePlate: "" }), row({ truckLicensePlate: "Sin placa" }),
    row({ outOfRadiusTime: undefined }), row({ outOfRadiusTime: "07:59" }),
    row({ outOfRadiusTime: "10:00" }), row({ status: "NOT_STARTED" }),
    row({ outOfRadiusTime: undefined, outOfRadiusRecordedAt: "2026-09-29T13:00:00Z" }),
  ], "8-10");
  assert.equal(result[0].vehicleCount, 1);
  assert.equal(result[0].missingPlate, 2);
  assert.deepEqual(countRangeVehicles([row()], "all"), []);
  assert.deepEqual(countRangeVehicles([], "8-10"), []);
});
