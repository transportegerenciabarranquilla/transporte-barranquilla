import {
  getPuntoCoronaClosureReportId,
  getPuntoCoronaCurrentReportId,
  type PuntoCoronaCrewSummary,
  type PuntoCoronaRouteReport,
  type PuntoCoronaRouteRow,
  type PuntoCoronaRouteSummary,
} from "../lib/puntoCoronaRoutesStorage";
import { getLocalDateKey, normalizeDt } from "../lib/modulacionStorage";
import type { Vehiculo } from "../seguimiento/types";

const NOT_STARTED = "NOT_STARTED";
const CONCLUDED = "CONCLUDED";
const RETURNED = "DEFINITELY_RETURNED";
const WAITING_MODULATION = "WAITING_MODULATION";
const PARTIAL_DELIVERY = "PARTIAL_DELIVERY";

export async function parsePuntoCoronaRouteFile(file: File, seguimientoVehicles: Vehiculo[], contractor: string) {
  const rawRows = await readFileRows(file);
  const operationalDate = getOperationalDate(rawRows) || getLocalDateKey();
  const seguimientoByDt = createSeguimientoByDt(seguimientoVehicles);
  const rows = rawRows
    .map((row) => {
      const routeRow = mapRouteRow(row);
      const routeDt = normalizeDt(routeRow.dt);
      const vehicle = seguimientoByDt.get(routeDt);
      return vehicle ? mergeRouteWithSeguimiento(routeRow, vehicle, routeDt) : null;
    })
    .filter(Boolean) as PuntoCoronaRouteRow[];
  const summary = summarizeRows(rows, seguimientoByDt.size, rawRows);
  const uploadedAt = new Date().toISOString();

  return {
    id: getPuntoCoronaCurrentReportId(operationalDate, contractor),
    contractor,
    operationalDate,
    kind: "current",
    fileName: file.name,
    uploadedAt,
    rows,
    summary,
  } satisfies PuntoCoronaRouteReport;
}

export function createClosureReport(report: PuntoCoronaRouteReport) {
  return {
    ...report,
    id: getPuntoCoronaClosureReportId(report.operationalDate, report.contractor),
    kind: "closure",
    closedAt: new Date().toISOString(),
  } satisfies PuntoCoronaRouteReport;
}

function createSeguimientoByDt(vehicles: Vehiculo[]) {
  const records = new Map<string, Vehiculo>();

  vehicles.forEach((vehicle) => {
    const dt = normalizeDt(vehicle.transporte);
    if (dt && !records.has(dt)) records.set(dt, vehicle);
  });

  return records;
}

async function readFileRows(file: File) {
  if (isCsv(file)) {
    const text = await file.text();
    return parseDelimitedText(text);
  }

  const XLSX = await import("xlsx");
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  const firstSheet = workbook.SheetNames[0];
  const sheet = workbook.Sheets[firstSheet];

  return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
}

function isCsv(file: File) {
  return /\.csv$/i.test(file.name) || file.type.includes("csv");
}

function parseDelimitedText(text: string) {
  const cleanText = text.replace(/^\uFEFF/, "");
  const delimiter = detectDelimiter(cleanText);
  const rows = parseCsvRows(cleanText, delimiter);
  const headers = rows[0]?.map((header) => header.trim()) ?? [];

  return rows.slice(1).map((row) =>
    headers.reduce<Record<string, unknown>>((record, header, index) => {
      record[header] = row[index] ?? "";
      return record;
    }, {}),
  );
}

function detectDelimiter(text: string) {
  const firstLine = text.split(/\r?\n/, 1)[0] || "";
  const semicolons = (firstLine.match(/;/g) || []).length;
  const commas = (firstLine.match(/,/g) || []).length;

  return semicolons >= commas ? ";" : ",";
}

function parseCsvRows(text: string, delimiter: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"' && inQuotes && next === '"') {
      cell += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === delimiter && !inQuotes) {
      row.push(cell);
      cell = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell);
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      cell = "";
      continue;
    }

    cell += char;
  }

  row.push(cell);
  if (row.some((value) => value.trim())) rows.push(row);
  return rows;
}

function mapRouteRow(row: Record<string, unknown>): PuntoCoronaRouteRow {
  const read = createRowReader(row);
  const tourDisplayId = read(["tour_display_id", "tour display id", "dt"]);
  const pocExternalId = read(["poc_external_id", "codigo cliente", "cliente"]);

  return {
    id: `${tourDisplayId}-${pocExternalId}-${read(["visit_order", "original_order"])}`,
    dt: normalizeDt(tourDisplayId),
    tourDisplayId,
    tourDate: toDateKey(read(["tour_date", "fecha"])),
    driverName: read(["driver_name", "tripulacion", "rr", "responsable"]),
    truckLicensePlate: read(["truck_license_plate", "placa", "vehiculo"]),
    pocExternalId,
    pocName: read(["poc_name", "nombre cliente", "cliente"]),
    status: read(["status", "estado"]),
    withinRadius: readBoolean(read(["within_radius", "en rango"])),
    outOfRadiusReason: read(["out_of_radius_reason", "razon fuera de rango"]),
    skippedReason: read(["skipped_reason", "razon omitido"]),
    deliveredVolume: readNumber(read(["total_delivered_vol", "volumen entregado"])),
    refusedVolume: readNumber(read(["total_refused_vol", "volumen rechazado"])),
  };
}

function mergeRouteWithSeguimiento(row: PuntoCoronaRouteRow, vehicle: Vehiculo, routeDt: string) {
  const seguimientoClientes = Number(vehicle.clientes || 0);
  const seguimientoVisitados = Number(vehicle.visitados || 0);

  return {
    ...row,
    dt: routeDt,
    driverName: getVehicleCrewName(vehicle) || row.driverName,
    truckLicensePlate: vehicle.vehiculo || row.truckLicensePlate,
    seguimientoClientes,
    seguimientoVisitados,
    seguimientoProgress: percentage(seguimientoVisitados, seguimientoClientes),
  };
}

function getVehicleCrewName(vehicle: Vehiculo) {
  return vehicle.nombreResponsable || vehicle.responsable || "";
}

function summarizeRows(
  rows: PuntoCoronaRouteRow[],
  seguimientoDtsCount: number,
  rawRows: Record<string, unknown>[],
): PuntoCoronaRouteSummary {
  const startedRows = rows.filter((row) => row.status !== NOT_STARTED);
  const closedRows = rows.filter((row) => row.status === CONCLUDED || isRejectedForModulation(row.status));
  const inRange = startedRows.filter((row) => row.withinRadius === true).length;
  const outOfRange = startedRows.filter((row) => row.withinRadius === false).length;
  const concluded = rows.filter((row) => row.status === CONCLUDED).length;
  const returned = rows.filter((row) => isRejectedForModulation(row.status)).length;
  const modulatedRows = startedRows.filter((row) => row.status === CONCLUDED).length;
  const modulationRejectedRows = startedRows.filter((row) => isRejectedForModulation(row.status)).length;
  const modulationOpenRows = startedRows.length - modulatedRows - modulationRejectedRows;

  return {
    seguimientoDts: seguimientoDtsCount,
    csvDts: new Set(rawRows.map((row) => normalizeDt(String(row.tour_display_id ?? ""))).filter(Boolean)).size,
    matchedDts: new Set(rows.map((row) => normalizeDt(row.dt)).filter(Boolean)).size,
    totalRows: rows.length,
    ignoredNotStarted: rows.filter((row) => row.status === NOT_STARTED).length,
    startedRows: startedRows.length,
    inRange,
    outOfRange,
    concluded,
    returned,
    openRows: startedRows.length - closedRows.length,
    modulatedRows,
    modulationOpenRows,
    modulationPercent: percentage(modulatedRows, modulatedRows + modulationRejectedRows),
    deliveryRangePercent: percentage(inRange, startedRows.length),
    crews: summarizeCrews(rows),
  };
}

function summarizeCrews(rows: PuntoCoronaRouteRow[]) {
  const groups = new Map<string, PuntoCoronaRouteRow[]>();

  rows.forEach((row) => {
    const key = `${normalizeDt(row.dt)}:${row.driverName}:${row.truckLicensePlate}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  });

  return Array.from(groups.entries())
    .map(([key, crewRows]) => summarizeCrew(key, crewRows))
    .sort((a, b) => b.totalStarted - a.totalStarted);
}

function summarizeCrew(key: string, rows: PuntoCoronaRouteRow[]): PuntoCoronaCrewSummary {
  const started = rows.filter((row) => row.status !== NOT_STARTED);
  const concluded = rows.filter((row) => row.status === CONCLUDED).length;
  const returned = rows.filter((row) => isRejectedForModulation(row.status)).length;
  const modulatedRows = started.filter((row) => row.status === CONCLUDED).length;
  const modulationRejectedRows = started.filter((row) => isRejectedForModulation(row.status)).length;
  const modulationOpenRows = started.length - modulatedRows - modulationRejectedRows;
  const inRange = started.filter((row) => row.withinRadius === true).length;
  const outOfRange = started.filter((row) => row.withinRadius === false).length;

  return {
    key,
    dt: rows[0]?.dt || "",
    driverName: rows[0]?.driverName || "Sin tripulacion",
    truckLicensePlate: rows[0]?.truckLicensePlate || "Sin placa",
    totalStarted: started.length,
    inRange,
    outOfRange,
    concluded,
    returned,
    open: started.length - concluded - returned,
    modulatedRows,
    modulationOpenRows,
    modulationPercent: percentage(modulatedRows, modulatedRows + modulationRejectedRows),
    deliveryRangePercent: percentage(inRange, started.length),
    seguimientoClientes: Number(rows[0]?.seguimientoClientes || 0),
    seguimientoVisitados: Number(rows[0]?.seguimientoVisitados || 0),
    seguimientoProgress: Number(rows[0]?.seguimientoProgress || 0),
  };
}

function isRejectedForModulation(status: string) {
  return status === RETURNED || status === WAITING_MODULATION || status === PARTIAL_DELIVERY;
}

function createRowReader(row: Record<string, unknown>) {
  const normalized = new Map(Object.entries(row).map(([key, value]) => [normalizeKey(key), value]));

  return (keys: string[]) => {
    for (const key of keys) {
      const value = normalized.get(normalizeKey(key));
      if (value !== undefined && value !== null && String(value).trim() !== "") return String(value).trim();
    }

    return "";
  };
}

function normalizeKey(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function readBoolean(value: string) {
  const normalized = value.trim().toLowerCase();
  if (["true", "si", "yes", "1"].includes(normalized)) return true;
  if (["false", "no", "0"].includes(normalized)) return false;
  return null;
}

function readNumber(value: string) {
  const parsed = Number(value.replace(",", ".").replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function percentage(value: number, total: number) {
  return total ? Number(((value / total) * 100).toFixed(2)) : 0;
}

function getOperationalDate(rows: Record<string, unknown>[]) {
  const date = rows.map((row) => String(row.tour_date ?? "")).find(Boolean);
  return toDateKey(date || "");
}

function toDateKey(value: string) {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);

  if (value.includes("/")) {
    const [day, month, year] = value.split("/").map(Number);
    if ([day, month, year].every(Number.isFinite)) {
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return getLocalDateKey(parsed);
}
