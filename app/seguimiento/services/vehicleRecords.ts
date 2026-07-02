import { readAsistenciaRegistros, type AsistenciaRegistro } from "../../lib/asistenciaStorage";
import { getCheckinByDt, readCheckinCajasRegistros } from "../../lib/checkinStorage";
import {
  getLocalDateKey,
  getModulacionesByDt,
  readModulacionRegistros,
  summarizeModulaciones,
} from "../../lib/modulacionStorage";
import { readSeguimientoVehiculos, saveSeguimientoVehiculos } from "../../lib/seguimientoStorage";
import type { Vehiculo } from "../types";
import { getVehicleRecordKey } from "../utils";

export function loadSeguimientoVehiculos() {
  if (typeof window === "undefined") return [];

  const stored = readSeguimientoVehiculos();
  return prepareVehicles(stored);
}

export function persistVehicles(records: Vehiculo[]) {
  const prepared = prepareSeguimientoVehicles(records);
  void saveSeguimientoVehiculos(prepared).catch(() => undefined);
  return prepared;
}

export function prepareSeguimientoVehicles(records: Vehiculo[]) {
  return prepareVehicles(records);
}

export async function parseSeguimientoFile(file: File, currentVehicles: Vehiculo[]) {
  const XLSX = await import("xlsx");
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  const firstSheet = workbook.SheetNames[0];
  const sheet = workbook.Sheets[firstSheet];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
  const capacityByPlate = createCapacityByPlate(currentVehicles);

  return rows.map((row) => mapExcelRowToVehicle(row, capacityByPlate)).filter(Boolean) as Vehiculo[];
}

export function mergeVehiclesByDt(current: Vehiculo[], imported: Vehiculo[]) {
  const records = new Map(current.map((vehicle) => [getVehicleRecordKey(vehicle), vehicle]));
  const capacityByPlate = createCapacityByPlate(current);

  imported.forEach((vehicle) => {
    const currentRecord = records.get(getVehicleRecordKey(vehicle));
    const fixedCapacity = getFixedCapacity(vehicle.vehiculo, capacityByPlate, vehicle.capacidad);

    records.set(getVehicleRecordKey(vehicle), mergeImportedVehicle(currentRecord, vehicle, fixedCapacity));
  });

  return Array.from(records.values());
}

function mergeImportedVehicle(currentRecord: Vehiculo | undefined, importedVehicle: Vehiculo, fixedCapacity: number) {
  if (!currentRecord) {
    return {
      ...importedVehicle,
      capacidad: fixedCapacity,
    };
  }

  const clientes = importedVehicle.clientes > 0 ? importedVehicle.clientes : currentRecord.clientes;
  const visitados = Math.max(Number(currentRecord.visitados || 0), Number(importedVehicle.visitados || 0));

  return {
    ...currentRecord,
    ...importedVehicle,
    clientes,
    visitados: Math.min(visitados, clientes || visitados),
    capacidad: fixedCapacity,
  };
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
      cajasGestionadas: resumen.cajasGestionadas,
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
  const withIds = ensureVehicleRecordIds(records);
  const withNumericBoxes = normalizeVehicleBoxes(withIds);
  const withAttendance = applyAttendanceToVehicles(withNumericBoxes);
  return enrichVehiclesWithModulacion(withAttendance, readModulacionRegistros());
}

function normalizeVehicleBoxes(records: Vehiculo[]) {
  return records.map((vehicle) => ({
    ...vehicle,
    cajas: Number(vehicle.cajas || 0),
  }));
}

function ensureVehicleRecordIds(records: Vehiculo[]) {
  const usedIds = new Set<string>();

  return records.map((vehicle, index) => {
    const baseId = vehicle.recordId || `vehiculo-${getVehicleRecordKey(vehicle)}-${index}`;
    const recordId = getUniqueRecordId(baseId, usedIds);

    return {
      ...vehicle,
      recordId,
    };
  });
}

function getUniqueRecordId(baseId: string, usedIds: Set<string>) {
  let recordId = baseId;
  let suffix = 2;

  while (usedIds.has(recordId)) {
    recordId = `${baseId}-${suffix}`;
    suffix += 1;
  }

  usedIds.add(recordId);
  return recordId;
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
      nombreResponsable: attendance.nombreResponsable || vehicle.nombreResponsable,
      nombreAuxiliar1: attendance.nombreAuxiliar1 || vehicle.nombreAuxiliar1,
      nombreAuxiliar2: attendance.nombreAuxiliar2 || vehicle.nombreAuxiliar2,
      responsable: shouldFillResponsible(vehicle.responsable)
        ? attendance.nombreResponsable || vehicle.responsable
        : vehicle.responsable,
    };
  });
}

function readAttendanceByDt() {
  const records = new Map<string, AsistenciaRegistro>();
  if (typeof window === "undefined") return records;

  try {
    readAsistenciaRegistros().forEach((registro) => {
      const dt = normalizeDt(registro.dt);
      if (!dt) return;

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

  // Fecha operativa: siempre priorizar despacho sobre cualquier otra fecha.
  const fechaDespacho =
    dateValue(value(["fecha despacho", "fecha de despacho", "f despacho", "despacho", "dia despacho"])) ||
    dateValue(value(["fecha"])) ||
    dateValue(value(["dia"])) ||
    getLocalDateKey();
  const fechaDt = dateValue(value(["fecha dt", "fecha de dt", "dt fecha", "fecha salida"])) || fechaDespacho;
  const onTimeClassification = getOnTimeClassification(fechaDt, fechaDespacho);
  const clientes = roundedNumberValue(value(["clientes", "total clientes", "clientes programados"]), 0);
  const visitados = roundedNumberValue(value(["visitados", "clientes visitados"]), 0);
  const importedCapacity = numberValue(value(["capacidad", "capacidad peso", "capacidad vehiculo"]), 1);
  const createdAt = new Date(`${fechaDespacho}T00:00:00`).toISOString();
  const status = stringValue(value(["status", "estado"])) || "Cargando";
  const horaSalida = timeValue(value(["hora salida", "salida"]));
  const horaLlegada = timeValue(value(["hora llegada", "llegada"]));
  const shouldUseImportedDeparture = isStartedStatus(status) || Boolean(horaLlegada);

  return {
    cajasGestionadas: roundedNumberValue(value(["cajas gestionadas", "gestionadas"]), 0),
    cajasReportadas: roundedNumberValue(value(["cajas reportadas", "reportadas"]), 0),
    createdAt,
    date: fechaDespacho,
    mes: stringValue(value(["mes"])) || new Date(`${fechaDespacho}T00:00:00`).toLocaleDateString("es-CO", { month: "long" }),
    cd: stringValue(value(["cd", "centro distribucion"])) || "BAQ",
    transportista: stringValue(value(["transportista", "contratista"])) || "Pendiente",
    llave: stringValue(value(["llave"])) || `${transporte || vehiculo}-${fechaDespacho}`,
    transporte: transporte || vehiculo,
    centro: stringValue(value(["centro", "sede"])) || "Punto Corona",
    codTransportista: stringValue(value(["cod transportista", "codigo transportista"])) || "-",
    fechaDt,
    fechaDespacho,
    vehiculo,
    responsable: stringValue(value(["responsable", "rr", "conductor", "nombre"])) || "Sin responsable",
    territorio: stringValue(value(["territorio", "zona", "ruta"])) || "Pendiente",
    viaje: stringValue(value(["viaje"])) || "Pendiente",
    bloque: stringValue(value(["bloque"])) || "Pendiente",
    cajas: numberValue(value(["cajas", "total cajas", "cajas programadas", "cajas salida"]), 0),
    hl: numberValue(value(["hl", "hectolitros"]), 0),
    clientes,
    visitados: Math.min(visitados, clientes || visitados),
    horaSalida: shouldUseImportedDeparture ? horaSalida || "Pendiente" : "Pendiente",
    causalSalidaTardia: stringValue(value(["causal salida tardia", "causal salida tarde", "motivo salida tardia"])),
    comentarioSalidaTardia: stringValue(value(["comentario salida tardia", "comentario salida tarde", "observacion salida tardia"])),
    peso: numberValue(value(["peso", "peso dt"]), 0),
    capacidad: getFixedCapacity(vehiculo, capacityByPlate, importedCapacity),
    validadorPeso: stringValue(value(["validador peso", "validador"])) || "Pendiente",
    avanceRuta: stringValue(value(["avance ruta", "avance"])) || "0%",
    status,
    horaLlegada: horaLlegada || "Pendiente",
    tiempoRuta: durationValue(value(["tiempo ruta", "tiempo en ruta"])) || "Pendiente",
    tiempoPlaneado: durationValue(value(["tiempo planeado", "tiempo plan", "tiempo planificado", "tiempo estimado", "duracion planeada", "duracion planificada"])),
    metaRelevo: stringValue(value(["meta relevo"])) || "Pendiente",
    horaInicioRelevo: stringValue(value(["hora inicio relevo"])) || "Pendiente",
    clasificacionRelevo: stringValue(value(["clasificacion relevo"])) || "Pendiente",
    alertaSifPotencial: stringValue(value(["alerta sif potencial", "alerta sif"])) || "Pendiente",
    relevador: stringValue(value(["relevador"])) || "-",
    causalDesviado: stringValue(value(["causal desviado"])) || "-",
    clasificacionOnTime: onTimeClassification,
    recargue: stringValue(value(["recargue"])) || "Pendiente",
    cedulaResponsable: stringValue(value(["cedula responsable", "cedula rr"])),
    cedulaAuxiliar1: stringValue(value(["cedula auxiliar 1", "cedula conductor"])),
    cedulaAuxiliar2: stringValue(value(["cedula auxiliar 2"])),
  };
}

function isStartedStatus(value: string) {
  const normalized = value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

  return ["en ruta", "retornando", "recargue", "finalizado"].includes(normalized);
}

function getOnTimeClassification(fechaDt: string | undefined, fechaDespacho: string | undefined) {
  const dtDate = dateValue(fechaDt);
  const dispatchDate = dateValue(fechaDespacho);

  if (!dtDate || !dispatchDate) return "Pendiente";
  return dtDate === dispatchDate ? "On Time" : "No On Time";
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

function timeValue(value: unknown) {
  if (value instanceof Date) return formatTimeFromDate(value);
  return String(value ?? "").trim();
}

function durationValue(value: unknown) {
  if (value instanceof Date) return formatTimeFromDate(value);

  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    const totalSeconds = value < 1 ? Math.round(value * 24 * 3600) : Math.round(value * 3600);
    return formatDurationFromSeconds(totalSeconds);
  }

  const text = String(value ?? "").trim();
  if (!text || /^\d{4}-\d{2}-\d{2}$/.test(text)) return "";

  const numericValue = Number(text.replace(",", "."));
  if (Number.isFinite(numericValue) && numericValue > 0) {
    const totalSeconds = numericValue < 1 ? Math.round(numericValue * 24 * 3600) : Math.round(numericValue * 3600);
    return formatDurationFromSeconds(totalSeconds);
  }

  return text;
}

function formatTimeFromDate(value: Date) {
  const hours = value.getHours();
  const minutes = value.getMinutes();
  const seconds = value.getSeconds();
  return seconds ? `${padTime(hours)}:${padTime(minutes)}:${padTime(seconds)}` : `${padTime(hours)}:${padTime(minutes)}`;
}

function formatDurationFromSeconds(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return seconds ? `${padTime(hours)}:${padTime(minutes)}:${padTime(seconds)}` : `${padTime(hours)}:${padTime(minutes)}`;
}

function padTime(value: number) {
  return String(value).padStart(2, "0");
}

function numberValue(value: unknown, fallback: number) {
  const parsed = Number(String(value ?? "").replace(",", ".").replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function roundedNumberValue(value: unknown, fallback: number) {
  return Math.round(numberValue(value, fallback));
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
