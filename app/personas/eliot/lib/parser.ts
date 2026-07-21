import * as XLSX from "xlsx";
import { calculateTdSeconds, classifyTd, parseTimeSeconds } from "./time";
import type { CrewMember, CrewRole, ParseResult, TdRow } from "./types";

const SHEET_NAME = "DATA ASISTENCIA";
const REQUIRED_HEADERS = [
  "DT",
  "Placa",
  "Fecha despacho",
  "Hora salida",
  "Nombre RR",
  "Cedula RR",
  "Nombre conductor / auxiliar 1",
  "Cedula conductor / auxiliar 1",
  "Nombre auxiliar 2",
  "Cedula auxiliar 2",
  "hora de llegada RR",
  "hora de llegada aux",
  "hora de llegada conductor",
];

export async function hashFileBuffer(buffer: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function parseTdWorkbook(buffer: ArrayBuffer): ParseResult {
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  const sheetName = workbook.SheetNames.find((name) => normalizeHeader(name) === normalizeHeader(SHEET_NAME));
  if (!sheetName) throw new Error(`El archivo debe incluir la hoja "${SHEET_NAME}".`);

  const sheet = workbook.Sheets[sheetName];
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "", raw: true });
  if (!rawRows.length) throw new Error("La hoja DATA ASISTENCIA no contiene registros.");

  validateHeaders(Object.keys(rawRows[0]));
  const warnings: string[] = [];
  const rows = rawRows.map((raw, index) => mapRow(raw, index + 2, warnings)).filter((row): row is TdRow => Boolean(row));
  if (!rows.length) throw new Error("No se encontraron filas válidas para procesar.");

  const dates = Array.from(new Set(rows.map((row) => row.dispatchDate).filter(Boolean)));
  if (!dates.length) throw new Error("No se encontró una Fecha despacho válida.");
  if (dates.length > 1) throw new Error(`El archivo mezcla varias fechas de despacho: ${dates.join(", ")}. Carga un día por archivo.`);

  return { operationalDate: dates[0], rows, warnings: unique(warnings) };
}

function mapRow(raw: Record<string, unknown>, excelRow: number, warnings: string[]): TdRow | null {
  const read = createRowReader(raw);
  const dt = cleanText(read("DT"));
  const plate = cleanText(read("Placa")).toUpperCase();
  const dispatchDate = parseDateKey(read("Fecha despacho"));
  if (!dt && !plate && !dispatchDate) return null;

  const departureSeconds = parseTimeSeconds(read("Hora salida"));
  if (departureSeconds === null) warnings.push(`Fila ${excelRow}: hora de salida inválida o pendiente.`);

  const crew = {
    rr: createMember("rr", read("Nombre RR"), read("Cedula RR"), read("hora de llegada RR"), departureSeconds),
    aux: createMember(
      "aux",
      read("Nombre conductor / auxiliar 1"),
      read("Cedula conductor / auxiliar 1"),
      read("hora de llegada aux"),
      departureSeconds,
    ),
    conductor: createMember(
      "conductor",
      read("Nombre auxiliar 2"),
      read("Cedula auxiliar 2"),
      read("hora de llegada conductor"),
      departureSeconds,
    ),
  } satisfies Record<CrewRole, CrewMember>;

  for (const member of Object.values(crew)) {
    if (!member.validPerson) warnings.push(`Fila ${excelRow}: ${roleLabel(member.role)} sin persona asignada.`);
    else if (member.status === "sin-marcacion") warnings.push(`Fila ${excelRow}: ${member.name} sin marcación de ${roleLabel(member.role)}.`);
  }

  return {
    id: `${dispatchDate || "sin-fecha"}:${dt || "sin-dt"}:${plate || "sin-placa"}:${excelRow}`,
    dt,
    trip: cleanText(read("Viaje")),
    plate,
    responsible: cleanText(read("Responsable")),
    dispatchDate,
    dtDate: parseDateKey(read("Fecha DT")),
    routeStatus: cleanText(read("Estado")),
    clients: parseNumber(read("Clientes")),
    visited: parseNumber(read("Visitados")),
    boxes: parseNumber(read("Cajas")),
    hectoliters: parseNumber(read("HL")),
    departureSeconds,
    lateDepartureCause: cleanText(read("Causal salida tardia")),
    lateDepartureComment: cleanText(read("Comentario salida tardia")),
    routeArrival: cleanText(read("Hora llegada")),
    routeTime: cleanText(read("Tiempo ruta")),
    plannedTime: cleanText(read("Tiempo planeado")),
    territory: cleanText(read("Territorio")),
    carrier: cleanText(read("Transportista")) || "Sin transportista",
    crew,
  };
}

function createMember(
  role: CrewRole,
  rawName: unknown,
  rawDocument: unknown,
  rawArrival: unknown,
  departureSeconds: number | null,
): CrewMember {
  const name = cleanText(rawName);
  const document = normalizeDocument(rawDocument);
  const arrivalSeconds = parseTimeSeconds(rawArrival);
  const tdSeconds = calculateTdSeconds(departureSeconds, arrivalSeconds);
  const validPerson = Boolean(name && !/^sin\s+(responsable|nombre|asignar)$/i.test(normalizeText(name)));
  return { role, name, document, arrivalSeconds, tdSeconds, status: classifyTd(tdSeconds), validPerson };
}

function validateHeaders(headers: string[]) {
  const normalized = new Set(headers.map(normalizeHeader));
  const missing = REQUIRED_HEADERS.filter((header) => !normalized.has(normalizeHeader(header)));
  if (missing.length) throw new Error(`Faltan columnas requeridas: ${missing.join(", ")}.`);
}

function createRowReader(row: Record<string, unknown>) {
  const values = new Map(Object.entries(row).map(([key, value]) => [normalizeHeader(key), value]));
  return (header: string) => values.get(normalizeHeader(header));
}

export function normalizeHeader(value: string) {
  return normalizeText(value).replace(/[^a-z0-9]/g, "");
}

function normalizeText(value: unknown) {
  return String(value ?? "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function cleanText(value: unknown) {
  if (value === null || value === undefined) return "";
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  return String(value).trim();
}

function normalizeDocument(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return String(Math.trunc(value));
  return cleanText(value).replace(/\.0$/, "").replace(/\D/g, "");
}

function parseNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const normalized = cleanText(value).replace(/\s/g, "").replace(/\.(?=\d{3}(?:\D|$))/g, "").replace(",", ".");
  const parsed = Number(normalized.replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseDateKey(value: unknown) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) return `${parsed.y}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}`;
  }
  const text = cleanText(value);
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  const match = text.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  if (match) return `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
  return "";
}

function roleLabel(role: CrewRole) {
  return role === "rr" ? "RR" : role === "aux" ? "auxiliar" : "conductor";
}

function unique(values: string[]) {
  return Array.from(new Set(values));
}
