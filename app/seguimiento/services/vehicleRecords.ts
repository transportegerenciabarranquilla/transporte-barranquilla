import { ASISTENCIA_STORAGE_KEY, type AsistenciaRegistro } from "../../lib/asistenciaStorage";
import { getCheckinByDt, readCheckinCajasRegistros } from "../../lib/checkinStorage";
import {
  getLocalDateKey,
  getModulacionesByDt,
  readModulacionRegistros,
  summarizeModulaciones,
} from "../../lib/modulacionStorage";
import { readSeguimientoVehiculos, saveSeguimientoVehiculos } from "../../lib/seguimientoStorage";
import { initialVehicles } from "../data";
import type { Vehiculo } from "../types";
import { getVehicleRecordKey } from "../utils";

export function loadSeguimientoVehiculos() {
  if (typeof window === "undefined") return initialVehicles;

  const stored = readSeguimientoVehiculos();
  const baseVehicles = stored.length ? stored : initialVehicles;

  return prepareVehicles(baseVehicles);
}

export function persistVehicles(records: Vehiculo[]) {
  const prepared = prepareVehicles(records);
  saveSeguimientoVehiculos(prepared);
  return prepared;
}

export async function parseSeguimientoFile(file: File, currentVehicles: Vehiculo[]) {
  const XLSX = await import("xlsx");
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  const firstSheet = workbook.SheetNames[0];
  const sheet = workbook.Sheets[firstSheet];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
  const capacityByPlate = createCapacityByPlate([...initialVehicles, ...currentVehicles]);

  return rows.map((row) => mapExcelRowToVehicle(row, capacityByPlate)).filter(Boolean) as Vehiculo[];
}

export function mergeVehiclesByDt(current: Vehiculo[], imported: Vehiculo[]) {
  const records = new Map(current.map((vehicle) => [getVehicleRecordKey(vehicle), vehicle]));
  const capacityByPlate = createCapacityByPlate(current);

  imported.forEach((vehicle) => {
    const currentRecord = records.get(getVehicleRecordKey(vehicle));
    const fixedCapacity = getFixedCapacity(vehicle.vehiculo, capacityByPlate, vehicle.capacidad);

    records.set(getVehicleRecordKey(vehicle), {
      ...currentRecord,
      ...vehicle,
      capacidad: fixedCapacity,
    });
  });

  return Array.from(records.values());
}

export function enrichVehiclesWithModulacion(vehiculos: Vehiculo[], modulaciones: ReturnType<typeof readModulacionRegistros>) {
  const checkins = readCheckinCajasRegistros();

  return vehiculos.map((vehiculo) => {
    const registrosDt = getModulacionesByDt(modulaciones, vehiculo.transporte);
    const checkin = getCheckinByDt(checkins, vehiculo.transporte);
    const resumen = summarizeModulaciones(registrosDt, vehiculo.cajas, checkin?.totalCajas);

    return {
      ...vehiculo,
      cajasRechazadas: resumen.cajasRechazadas,
      cajasReubicadas: resumen.cajasReubicadas,
      cajasCheckin: resumen.cajasCheckin,
      cajasRefusalFinal: resumen.cajasPendientes,
      clientesRechazan: resumen.clientesRechazan,
      topeMaximoCajas: resumen.topeMaximoCajas,
      refusal: resumen.refusal,
      moduladores: resumen.moduladores,
      causalesModulacion: resumen.causales,
    };
  });
}

function prepareVehicles(records: Vehiculo[]) {
  const withAttendance = applyAttendanceToVehicles(records);
  return enrichVehiclesWithModulacion(withAttendance, readModulacionRegistros());
}

function applyAttendanceToVehicles(records: Vehiculo[]) {
  const attendanceByDt = readAttendanceByDt();
  if (!attendanceByDt.size) return records;

  return records.map((vehicle) => {
    const attendance = attendanceByDt.get(normalizeDt(vehicle.transporte));
    if (!attendance) return vehicle;

    return {
      ...vehicle,
      cedulaResponsable: attendance.cedulaResponsable || vehicle.cedulaResponsable,
      cedulaAuxiliar1: attendance.cedulaAuxiliar1 || vehicle.cedulaAuxiliar1,
      cedulaAuxiliar2: attendance.cedulaAuxiliar2 || vehicle.cedulaAuxiliar2,
      responsable: shouldFillResponsible(vehicle.responsable) ? `RR ${attendance.cedulaResponsable}` : vehicle.responsable,
    };
  });
}

function readAttendanceByDt() {
  const records = new Map<string, AsistenciaRegistro>();
  if (typeof window === "undefined") return records;

  const current = localStorage.getItem(ASISTENCIA_STORAGE_KEY);
  if (!current) return records;

  try {
    const parsed = JSON.parse(current) as AsistenciaRegistro[];
    parsed.forEach((registro) => {
      const dt = normalizeDt(registro.dt);
      if (!dt || registro.contratista !== "Punto Corona") return;

      const existing = records.get(dt);
      if (!existing || new Date(registro.createdAt).getTime() > new Date(existing.createdAt).getTime()) {
        records.set(dt, registro);
      }
    });
  } catch {
    return records;
  }

  return records;
}

function shouldFillResponsible(value: string) {
  const normalized = value.trim().toLowerCase();
  return !normalized || normalized === "pendiente" || normalized === "sin responsable";
}

function mapExcelRowToVehicle(row: Record<string, unknown>, capacityByPlate: Map<string, number>) {
  const value = createRowReader(row);
  const transporte = stringValue(value(["dt", "transporte", "documento transporte", "nro dt", "numero dt"]));
  const vehiculo = stringValue(value(["vehiculo", "placa", "carro", "nombre vehiculo", "nombre de la ruta"])) || transporte;

  if (!transporte && !vehiculo) return null;

  const fecha = dateValue(value(["fecha despacho", "fecha", "fecha dt", "dia"])) || getLocalDateKey();
  const clientes = numberValue(value(["clientes", "total clientes", "clientes programados"]), 0);
  const visitados = numberValue(value(["visitados", "clientes visitados"]), 0);
  const importedCapacity = numberValue(value(["capacidad", "capacidad peso", "capacidad vehiculo"]), 1);
  const createdAt = new Date(`${fecha}T00:00:00`).toISOString();

  return {
    cajasGestionadas: numberValue(value(["cajas gestionadas", "gestionadas"]), 0),
    cajasReportadas: numberValue(value(["cajas reportadas", "reportadas"]), 0),
    createdAt,
    date: fecha,
    mes: stringValue(value(["mes"])) || new Date(`${fecha}T00:00:00`).toLocaleDateString("es-CO", { month: "long" }),
    cd: stringValue(value(["cd", "centro distribucion"])) || "BAQ",
    transportista: stringValue(value(["transportista", "contratista"])) || "Pendiente",
    llave: stringValue(value(["llave"])) || `${transporte || vehiculo}-${fecha}`,
    transporte: transporte || vehiculo,
    centro: stringValue(value(["centro", "sede"])) || "Punto Corona",
    codTransportista: stringValue(value(["cod transportista", "codigo transportista"])) || "-",
    fechaDt: dateValue(value(["fecha dt"])) || fecha,
    fechaDespacho: fecha,
    vehiculo,
    responsable: stringValue(value(["responsable", "rr", "conductor", "nombre"])) || "Sin responsable",
    territorio: stringValue(value(["territorio", "zona", "ruta"])) || "Pendiente",
    viaje: stringValue(value(["viaje"])) || "Pendiente",
    bloque: stringValue(value(["bloque"])) || "Pendiente",
    cajas: numberValue(value(["cajas", "total cajas", "cajas programadas", "cajas salida"]), 0),
    hl: numberValue(value(["hl", "hectolitros"]), 0),
    clientes,
    visitados: Math.min(visitados, clientes || visitados),
    horaSalida: stringValue(value(["hora salida", "salida"])) || "Pendiente",
    peso: numberValue(value(["peso", "peso dt"]), 0),
    capacidad: getFixedCapacity(vehiculo, capacityByPlate, importedCapacity),
    validadorPeso: stringValue(value(["validador peso", "validador"])) || "Pendiente",
    avanceRuta: stringValue(value(["avance ruta", "avance"])) || "0%",
    status: stringValue(value(["status", "estado"])) || "Cargando",
    horaLlegada: stringValue(value(["hora llegada", "llegada"])) || "Pendiente",
    tiempoRuta: stringValue(value(["tiempo ruta", "tiempo en ruta"])) || "Pendiente",
    metaRelevo: stringValue(value(["meta relevo"])) || "Pendiente",
    horaInicioRelevo: stringValue(value(["hora inicio relevo"])) || "Pendiente",
    clasificacionRelevo: stringValue(value(["clasificacion relevo"])) || "Pendiente",
    alertaSifPotencial: stringValue(value(["alerta sif potencial", "alerta sif"])) || "Pendiente",
    relevador: stringValue(value(["relevador"])) || "-",
    causalDesviado: stringValue(value(["causal desviado"])) || "-",
    clasificacionOnTime: stringValue(value(["clasificacion on time", "on time"])) || "Pendiente",
    recargue: stringValue(value(["recargue"])) || "Pendiente",
    cedulaResponsable: stringValue(value(["cedula responsable", "cedula rr"])),
    cedulaAuxiliar1: stringValue(value(["cedula auxiliar 1", "cedula conductor"])),
    cedulaAuxiliar2: stringValue(value(["cedula auxiliar 2"])),
  };
}

function createCapacityByPlate(vehicles: Vehiculo[]) {
  const capacities = new Map<string, number>();

  vehicles.forEach((vehicle) => {
    const plate = normalizePlate(vehicle.vehiculo);
    if (!plate || capacities.has(plate) || !vehicle.capacidad) return;
    capacities.set(plate, vehicle.capacidad);
  });

  return capacities;
}

function getFixedCapacity(plate: string, capacityByPlate: Map<string, number>, fallback: number) {
  return capacityByPlate.get(normalizePlate(plate)) ?? fallback;
}

function normalizePlate(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]/g, "");
}

function normalizeDt(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/^dt-?/i, "")
    .replace(/[^a-z0-9]/g, "");
}

function createRowReader(row: Record<string, unknown>) {
  const normalized = new Map(Object.entries(row).map(([key, value]) => [normalizeHeader(key), value]));

  return (aliases: string[]) => {
    for (const alias of aliases) {
      const found = normalized.get(normalizeHeader(alias));
      if (found !== undefined && found !== "") return found;
    }

    return "";
  };
}

function normalizeHeader(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function stringValue(value: unknown) {
  if (value instanceof Date) return getLocalDateKey(value);
  return String(value ?? "").trim();
}

function numberValue(value: unknown, fallback: number) {
  const parsed = Number(String(value ?? "").replace(",", ".").replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function dateValue(value: unknown) {
  if (value instanceof Date) return getLocalDateKey(value);

  const text = stringValue(value);
  if (!text) return "";

  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) return getLocalDateKey(parsed);

  const match = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (!match) return "";

  const [, day, month, year] = match;
  const fullYear = year.length === 2 ? `20${year}` : year;
  return `${fullYear}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}
