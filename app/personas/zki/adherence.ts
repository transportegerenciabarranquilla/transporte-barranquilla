import type { AsistenciaRegistro } from "../../lib/asistenciaStorage";
import type { Vehiculo } from "../../seguimiento/types";
import type { RawRow } from "./zkiEngine";

export type DriverAdherenceRow = {
  territory: string;
  driver: string;
  driverId: string;
  responsible: string;
  responsibleId: string;
  auxiliary: string;
  auxiliaryId: string;
  actualDriver: string;
  actualDriverId: string;
  actualResponsible: string;
  actualResponsibleId: string;
  actualAuxiliary: string;
  actualAuxiliaryId: string;
  plannedPlate: string;
  actualPlate: string;
  dt: string;
  attended: boolean;
  adherent: boolean;
  responsibleAdherent: boolean;
  auxiliaryAdherent: boolean;
  crewAdherent: boolean;
  habitualPlate: string;
  habitualVehicle: boolean | null;
  status: "Cumplió" | "VH salió con otro conductor" | "Sin asistencia" | "Sin VH de salida";
};

type HabitualDriverVehicle = { plate: string; driver: string; driverId: string };

export function calculateDriverAdherence(
  rows: RawRow[],
  attendances: AsistenciaRegistro[],
  vehicles: Vehiculo[],
  dateKey: string,
  habitualPairs: HabitualDriverVehicle[] = [],
) {
  // El DT ya identifica la salida. Se prefiere el registro de la fecha
  // auditada, pero se conserva como respaldo el mismo DT aunque seguimiento
  // tenga una fecha diferente o vacía.
  const actualByDt = new Map<string, Vehiculo>();
  vehicles.forEach((vehicle) => {
    const dt = digits(vehicle.transporte);
    if (dt && !actualByDt.has(dt)) actualByDt.set(dt, vehicle);
  });
  vehicles.forEach((vehicle) => {
    const dt = digits(vehicle.transporte);
    if (dt && vehicleDate(vehicle) === dateKey) actualByDt.set(dt, vehicle);
  });
  const attendanceForDate = attendances.filter((attendance) => attendanceDate(attendance) === dateKey);
  const results = parsePlannedDrivers(rows).map((planned): DriverAdherenceRow => {
    const habitualPair = habitualPairs.find((pair) => samePerson(planned.driverId, planned.driver, pair.driverId, pair.driver));
    const habitualPlate = normalizePlate(habitualPair?.plate);
    const habitual = { habitualPlate, habitualVehicle: habitualPlate ? habitualPlate === planned.plannedPlate : null };
    // La adherencia se audita contra el VH planeado. El DT del conductor no
    // puede decidir qué carro se usa para evaluar también al RR y al auxiliar,
    // porque las personas pueden aparecer con otro rol o en asistencias
    // separadas. Solo se usa el DT como respaldo si Seguimiento no contiene el
    // VH planeado.
    const plannedVehicle = preferredVehicleForPlate(vehicles, planned.plannedPlate, dateKey);
    if (plannedVehicle) {
      const driverAdherent = personInVehicleOrAttendance(planned.driverId, planned.driver, plannedVehicle, attendanceForDate);
      const crew = crewAdherence(planned, plannedVehicle, attendanceForDate);
      return {
        ...planned,
        ...habitual,
        actualPlate: normalizePlate(plannedVehicle.vehiculo),
        dt: plannedVehicle.transporte,
        attended: driverAdherent,
        adherent: driverAdherent,
        ...crew,
        ...crewDetails(plannedVehicle, attendanceForDate),
        crewAdherent: driverAdherent && crew.responsibleAdherent && crew.auxiliaryAdherent,
        status: driverAdherent ? "Cumplió" : "VH salió con otro conductor",
      };
    }
    const attendance = attendanceForDate.find((item) => personInAttendance(planned.driverId, planned.driver, item));
    if (!attendance) {
      return { ...planned, ...habitual, ...crewDetails(), actualPlate: "", dt: "", attended: false, adherent: false, responsibleAdherent: false, auxiliaryAdherent: false, crewAdherent: false, status: "Sin asistencia" };
    }
    const vehicle = actualByDt.get(digits(attendance.dt));
    const actualPlate = normalizePlate(vehicle?.vehiculo);
    if (!vehicle || !actualPlate) return { ...planned, ...habitual, ...crewDetails(), actualPlate: "", dt: attendance.dt, attended: true, adherent: false, responsibleAdherent: false, auxiliaryAdherent: false, crewAdherent: false, status: "Sin VH de salida" };
    const adherent = actualPlate === planned.plannedPlate && personInVehicleOrAttendance(planned.driverId, planned.driver, vehicle, attendanceForDate);
    const crew = crewAdherence(planned, vehicle, attendanceForDate);
    return { ...planned, ...habitual, ...crew, ...crewDetails(vehicle, attendanceForDate), actualPlate, dt: attendance.dt, attended: true, adherent, crewAdherent: adherent && crew.responsibleAdherent && crew.auxiliaryAdherent, status: adherent ? "Cumplió" : "VH salió con otro conductor" };
  });
  return [...new Map(results.map((row) => [`${row.driverId || normalize(row.driver)}:${row.plannedPlate}`, row])).values()];
}

function preferredVehicleForPlate(vehicles: Vehiculo[], plate: string, dateKey: string) {
  const matching = vehicles.filter((vehicle) => normalizePlate(vehicle.vehiculo) === plate);
  return matching.find((vehicle) => vehicleDate(vehicle) === dateKey) || matching[0];
}

function crewAdherence(planned: ReturnType<typeof parsePlannedDrivers>[number], vehicle: Vehiculo | undefined, attendances: AsistenciaRegistro[] = []) {
  if (!vehicle) return { responsibleAdherent: false, auxiliaryAdherent: false };
  return {
    responsibleAdherent: personInVehicleOrAttendance(planned.responsibleId, planned.responsible, vehicle, attendances),
    auxiliaryAdherent: personInVehicleOrAttendance(planned.auxiliaryId, planned.auxiliary, vehicle, attendances),
  };
}

function personInVehicleOrAttendance(id: string, name: string, vehicle: Vehiculo, attendances: AsistenciaRegistro[]) {
  if (personInVehicle(id, name, vehicle)) return true;
  const vehicleDt = digits(vehicle.transporte);
  return Boolean(vehicleDt) && attendances.some((attendance) =>
    digits(attendance.dt) === vehicleDt && personInAttendance(id, name, attendance),
  );
}

function personInVehicle(id: string, name: string, vehicle: Vehiculo) {
  return [
    [vehicle.cedulaResponsable, vehicle.nombreResponsable || vehicle.responsable],
    [vehicle.cedulaAuxiliar1, vehicle.nombreAuxiliar1],
    [vehicle.cedulaAuxiliar2, vehicle.nombreAuxiliar2],
  ].some(([crewId, crewName]) => samePerson(id, name, String(crewId || ""), String(crewName || "")));
}

function personInAttendance(id: string, name: string, attendance: AsistenciaRegistro) {
  return [
    [attendance.cedulaResponsable, attendance.nombreResponsable],
    [attendance.cedulaAuxiliar1, attendance.nombreAuxiliar1],
    [attendance.cedulaAuxiliar2, attendance.nombreAuxiliar2],
  ].some(([crewId, crewName]) => samePerson(id, name, String(crewId || ""), String(crewName || "")));
}

function crewDetails(vehicle?: Vehiculo, attendances: AsistenciaRegistro[] = []) {
  const attendance = vehicle
    ? attendances.find((item) => digits(item.dt) === digits(vehicle.transporte))
    : undefined;
  return {
    actualDriver: vehicle?.nombreAuxiliar1 || attendance?.nombreAuxiliar1 || "",
    actualDriverId: String(vehicle?.cedulaAuxiliar1 || attendance?.cedulaAuxiliar1 || ""),
    actualResponsible: vehicle?.nombreResponsable || vehicle?.responsable || attendance?.nombreResponsable || "",
    actualResponsibleId: String(vehicle?.cedulaResponsable || attendance?.cedulaResponsable || ""),
    actualAuxiliary: vehicle?.nombreAuxiliar2 || attendance?.nombreAuxiliar2 || "",
    actualAuxiliaryId: String(vehicle?.cedulaAuxiliar2 || attendance?.cedulaAuxiliar2 || ""),
  };
}

function parsePlannedDrivers(rows: RawRow[]) {
  return rows.flatMap((row) => {
    const territory = text(read(row, ["ID territorio", "Territorio", "Zona", "Ruta"]));
    const driver = text(read(row, ["Nombre conductor", "Conductor", "Nombre del conductor", "Driver"]));
    const driverId = digits(read(row, ["Cedula conductor", "Cédula conductor", "Cedula del conductor", "Documento conductor"]));
    const responsible = text(read(row, ["Nombre responsable", "Responsable", "Nombre RR", "RR"]));
    const responsibleId = digits(read(row, ["Cedula responsable", "Cédula responsable", "Cedula RR", "Cédula RR"]));
    const auxiliary = text(read(row, ["Nombre auxiliar", "Auxiliar", "Nombre auxiliar 2"]));
    const auxiliaryId = digits(read(row, ["Cedula auxiliar", "Cédula auxiliar", "Cedula auxiliar 2", "Cédula auxiliar 2"]));
    const plannedPlate = normalizePlate(read(row, ["Placa", "Vehículo", "Vehiculo", "VH", "Placa asignada"]));
    if ((!driver && !driverId) || !plannedPlate) return [];
    return [{ territory, driver: driver || driverId, driverId, responsible, responsibleId, auxiliary, auxiliaryId, plannedPlate }];
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
