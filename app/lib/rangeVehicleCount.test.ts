import test from "node:test";
import assert from "node:assert/strict";
import { countRangeVehiclesByWeekday, countRangeVehicles, RANGE_VEHICLE_WINDOWS, RANGE_VEHICLE_EVENING_WINDOWS, type RangeVehicleRow } from "./rangeVehicleCount.ts";

const row = (overrides: Partial<RangeVehicleRow> = {}): RangeVehicleRow => ({ contractor: "Logisticos", date: "2026-09-29", status: "CONCLUDED", withinRadius: false, truckLicensePlate: "ABC123", outOfRadiusTime: "08:30", ...overrides });

test("suma 20 y 30 vehículos de dos martes para mostrar exactamente 50", () => {
  const rows = ["2026-09-29", "2026-10-06"].flatMap((date, index) =>
    Array.from({ length: index === 0 ? 20 : 30 }, (_, plate) => row({ date, truckLicensePlate: `ABC${String(plate).padStart(3, "0")}` })));
  assert.equal(countRangeVehiclesByWeekday(rows)[1].total, 50);
});

test("suma los conteos por fechas del mismo día, deduplica placas e incluye fechas con cero", () => {
  const result = countRangeVehiclesByWeekday([
    row(), row({ truckLicensePlate: "COABC123" }), row({ truckLicensePlate: "abc-123" }),
    row({ truckLicensePlate: "XYZ999", outOfRadiusTime: undefined }),
    row({ date: "2026-10-06", withinRadius: true }),
    row({ date: "2026-10-13", status: "NOT_STARTED" }),
  ]);
  assert.deepEqual(result[1], { label: "Martes", days: 2, total: 2 });
  assert.deepEqual(result[0], { label: "Lunes", days: 0, total: 0 });
});

test("el total general suma por contratista y el filtro usa sus propias fechas", () => {
  const rows = [row(), row({ contractor: "Surti Cervezas" }),
    row({ contractor: "Surti Cervezas", date: "2026-10-06", withinRadius: true }),
    row({ contractor: "Punto Corona", date: "2026-10-13" })];
  assert.deepEqual(countRangeVehiclesByWeekday(rows)[1], { label: "Martes", days: 2, total: 2 });
  assert.deepEqual(countRangeVehiclesByWeekday(rows, "Logisticos")[1], { label: "Martes", days: 1, total: 1 });
});

test("excluye fechas inválidas y placas ausentes y devuelve conteos enteros", () => {
  const result = countRangeVehiclesByWeekday([
    row(), row({ date: "2026-10-06", truckLicensePlate: "Sin placa" }),
    row({ date: "2026-10-06", truckLicensePlate: "" }),
    row({ date: "2026-02-30" }), row({ date: "" }),
  ]);
  assert.equal(result[1].total, 1);
  assert.ok(result.every(day => Number.isInteger(day.total)));
  assert.equal(result.reduce((sum, day) => sum + day.days, 0), 2);
  assert.ok(countRangeVehiclesByWeekday([]).every(day => day.days === 0));
});

test("desglosa la tarde sin solapar límites y deduplica por franja", () => {
  const rows = ["15:59", "16:00", "17:59", "18:00", "19:59", "20:00", "21:59", "22:00", "23:59", "00:00"]
    .map((time, index) => row({ outOfRadiusTime: time, truckLicensePlate: `ABC${index}` }));
  assert.deepEqual(RANGE_VEHICLE_EVENING_WINDOWS.map(window => countRangeVehicles(rows, window.value)[0].vehicleCount), [2, 2, 2, 2]);
  const samePlate = rows.map(item => ({ ...item, truckLicensePlate: "ABC123" }));
  assert.equal(countRangeVehicles(samePlate, "16-24")[0].vehicleCount, 1);
  assert.deepEqual(RANGE_VEHICLE_EVENING_WINDOWS.map(window => countRangeVehicles(samePlate, window.value)[0].vehicleCount), [1, 1, 1, 1]);
});

test("separa las franjas de 2 a 4 y desde las 4 hasta medianoche", () => {
  const rows = ["05:59", "06:00", "07:59", "08:00", "10:00", "12:00", "13:59", "14:00", "15:59", "16:00", "23:59", "00:00"]
    .map((time, index) => row({ outOfRadiusTime: time, truckLicensePlate: `ABC${index}` }));
  const counts = RANGE_VEHICLE_WINDOWS.map(window => countRangeVehicles(rows, window.value)[0].vehicleCount);
  assert.deepEqual(counts, [2, 1, 1, 2, 2, 2]);
  const repeatedPlate = [row({ outOfRadiusTime: "14:00" }), row({ outOfRadiusTime: "15:59" }), row({ outOfRadiusTime: "16:00" }), row({ outOfRadiusTime: "23:59" })];
  assert.equal(countRangeVehicles(repeatedPlate, "14-16")[0].vehicleCount, 1);
  assert.equal(countRangeVehicles(repeatedPlate, "16-24")[0].vehicleCount, 1);
});

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
