import type { AsistenciaRegistro } from "../../lib/asistenciaStorage";
import type { Vehiculo } from "../../seguimiento/types";
import type { RawRow } from "./zkiEngine";

export type DriverAdherenceRow = {
  driver: string;
  driverId: string;
  plannedPlate: string;
  actualPlate: string;
  dt: string;
  attended: boolean;
  adherent: boolean;
  status: "Cumplió" | "Cambió de VH" | "Sin asistencia" | "Sin VH real";
};

export function calculateDriverAdherence(rows: RawRow[], attendances: AsistenciaRegistro[], vehicles: Vehiculo[], dateKey: string) {
  const actualByDt = new Map(vehicles
    .filter((vehicle) => vehicleDate(vehicle) === dateKey)
    .map((vehicle) => [digits(vehicle.transporte), vehicle]));
  const attendanceForDate = attendances.filter((attendance) => attendanceDate(attendance) === dateKey);
  const results = parsePlannedDrivers(rows).map((planned): DriverAdherenceRow => {
    const attendance = attendanceForDate.find((item) => samePerson(planned.driverId, planned.driver, item.cedulaAuxiliar1, item.nombreAuxiliar1 || ""));
    if (!attendance) return { ...planned, actualPlate: "", dt: "", attended: false, adherent: false, status: "Sin asistencia" };
    const vehicle = actualByDt.get(digits(attendance.dt));
    const actualPlate = normalizePlate(vehicle?.vehiculo);
    if (!actualPlate) return { ...planned, actualPlate: "", dt: attendance.dt, attended: true, adherent: false, status: "Sin VH real" };
    const adherent = actualPlate === planned.plannedPlate;
    return { ...planned, actualPlate, dt: attendance.dt, attended: true, adherent, status: adherent ? "Cumplió" : "Cambió de VH" };
  });
  return [...new Map(results.map((row) => [`${row.driverId || normalize(row.driver)}:${row.plannedPlate}`, row])).values()];
}

function parsePlannedDrivers(rows: RawRow[]) {
  return rows.flatMap((row) => {
    const driver = text(read(row, ["Nombre conductor", "Conductor", "Nombre del conductor", "Driver"]));
    const driverId = digits(read(row, ["Cedula conductor", "Cédula conductor", "Cedula del conductor", "Documento conductor"]));
    const plannedPlate = normalizePlate(read(row, ["Placa", "Vehículo", "Vehiculo", "VH", "Placa asignada"]));
    if ((!driver && !driverId) || !plannedPlate) return [];
    return [{ driver: driver || driverId, driverId, plannedPlate }];
  });
}

function read(row: RawRow, labels: string[]) {
  const wanted = new Set(labels.map(normalize));
  const entry = Object.entries(row).find(([key]) => wanted.has(normalize(key)));
  return entry?.[1];
}

function samePerson(leftId: string, leftName: string, rightId: string, rightName: string) {
  const leftDigits = digits(leftId); const rightDigits = digits(rightId);
  if (leftDigits && rightDigits && leftDigits === rightDigits) return true;
  return Boolean(normalize(leftName) && normalize(leftName) === normalize(rightName));
}

function attendanceDate(record: AsistenciaRegistro) {
  const keyDate = String(record.llave || "").match(/(\d{4}-\d{2}-\d{2})/)?.[1];
  return keyDate || normalizeDate(record.createdAt);
}

function vehicleDate(vehicle: Vehiculo) { return normalizeDate(vehicle.fechaDespacho || vehicle.fechaDt || vehicle.date || vehicle.createdAt); }
function normalizeDate(value: unknown) {
  const raw = text(value);
  const iso = raw.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  const latin = raw.match(/(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  return latin ? `${latin[3]}-${latin[2].padStart(2, "0")}-${latin[1].padStart(2, "0")}` : raw.slice(0, 10);
}
function normalizePlate(value: unknown) { return text(value).toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/^CO(?=[A-Z]{3}\d{3}$)/, ""); }
function digits(value: unknown) { return text(value).replace(/\D/g, "").replace(/^0+/, ""); }
function normalize(value: unknown) { return text(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, ""); }
function text(value: unknown) { return String(value || "").trim(); }
