import type { RtiRecord } from "./rtiTypes";

export function uniqueValues(records: RtiRecord[], field: "responsible" | "reference" | "carrier") {
  return Array.from(new Set(records.map((record) => record[field]).filter(Boolean))).sort((left, right) => left.localeCompare(right, "es-CO"));
}

export function performanceColor(percentage: number) {
  if (percentage >= 95) return "bg-gradient-to-r from-emerald-500 to-emerald-400";
  if (percentage >= 85) return "bg-gradient-to-r from-amber-500 to-yellow-400";
  return "bg-gradient-to-r from-red-600 to-orange-500";
}

export function differenceColor(value: number) {
  if (value >= 100) return "rounded-t-sm bg-emerald-400";
  if (value >= 0) return "rounded-t-sm bg-amber-400";
  if (value <= -50) return "rounded-b-sm bg-red-600";
  return "rounded-b-sm bg-red-400";
}

export function rankingColor(percentage: number) {
  if (percentage >= 98) return "bg-lime-500 text-slate-950";
  if (percentage >= 85) return "bg-amber-400 text-slate-950";
  return "bg-red-500 text-white";
}

export function aggregateRecords(records: RtiRecord[], keyFor: (record: RtiRecord) => string) {
  const groups = new Map<string, { outbound: number; returned: number }>();
  records.forEach((record) => {
    const name = keyFor(record);
    if (!name) return;
    const current = groups.get(name) ?? { outbound: 0, returned: 0 };
    groups.set(name, {
      outbound: current.outbound + (record.outbound || 0),
      returned: current.returned + (record.returned || 0),
    });
  });
  return Array.from(groups, ([name, result]) => ({
    name,
    outbound: result.outbound,
    returned: result.returned,
    difference: Math.round((result.outbound - result.returned) * 10) / 10,
    percentage: result.outbound ? Math.round((result.returned / result.outbound) * 1_000) / 10 : 0,
  }));
}

export function percentageBarColor(percentage: number) {
  if (percentage >= 95) return "bg-gradient-to-t from-emerald-700 to-emerald-400";
  if (percentage >= 85) return "bg-gradient-to-t from-amber-500 to-yellow-300";
  return "bg-gradient-to-t from-red-700 to-red-400";
}

export function skuBarColor(index: number) {
  return ["bg-emerald-500", "bg-amber-400", "bg-red-500"][index % 3];
}

export function parseDatabaseRows(rows: Record<string, unknown>[]) {
  return rows.map((row): RtiRecord => {
    const dateValue = readColumn(row, ["fecha de despacho", "fecha despacho", "fecha", "date", "dia fecha"]);
    const parsedDate = dateValue ? new Date(String(dateValue)) : null;
    const numericPercentage = parseNumber(readColumn(row, ["porcentaje rti", "porcentaje rti 1", "rti", "porcentaje", "cumplimiento", "% rti"])) ?? 0;
    const dayValue = parseNumber(readColumn(row, ["dia", "día", "day"]));
    const yearValue = parseNumber(readColumn(row, ["ano", "año", "year"]));
    const percentage = numericPercentage > 0 && numericPercentage <= 2 ? numericPercentage * 100 : numericPercentage;
    return {
      day: dayValue ?? (parsedDate && Number.isFinite(parsedDate.getTime()) ? parsedDate.getUTCDate() : 0),
      month: normalizeMonth(readColumn(row, ["mes", "month"]), parsedDate),
      year: yearValue ?? (parsedDate && Number.isFinite(parsedDate.getTime()) ? parsedDate.getUTCFullYear() : 0),
      responsible: String(readColumn(row, ["nombre rr"]) || "Sin responsable").trim(),
      reference: String(readColumn(row, ["descripcion de envase", "descripción de envase", "referencia de envase", "referencia", "envase", "material", "sku"]) || "Sin referencia").trim(),
      material: String(readColumn(row, ["material", "sku", "referencia"]) || "Sin material").trim(),
      carrier: String(readColumn(row, ["transportista", "carrier", "empresa transportadora", "contratista"]) || "Sin transportista").trim(),
      percentage: Math.round(percentage * 10) / 10,
      outbound: parseNumber(readColumn(row, ["cajas reales salida"])) ?? undefined,
      returned: parseNumber(readColumn(row, ["cajas reales retorno"])) ?? undefined,
      dt: String(readColumn(row, ["dt", "ruta"]) || "").trim() || undefined,
    };
  });
}

function readColumn(row: Record<string, unknown>, aliases: string[]) {
  return Object.entries(row).find(([column, value]) =>
    aliases.some((alias) => normalizeColumnName(column) === normalizeColumnName(alias)) &&
    value !== undefined && value !== null && value !== "",
  )?.[1];
}

function parseNumber(value: unknown) {
  if (value === undefined || value === null || value === "") return null;
  const number = Number(String(value).replace("%", "").replace(",", ".").trim());
  return Number.isFinite(number) ? number : null;
}

function normalizeMonth(value: unknown, parsedDate: Date | null) {
  const months = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
  const numericMonth = parseNumber(value);
  if (numericMonth && numericMonth >= 1 && numericMonth <= 12) return months[numericMonth - 1];
  const text = String(value || "").trim();
  const match = months.find((month) => normalizeColumnName(month) === normalizeColumnName(text));
  if (match) return match;
  return parsedDate && Number.isFinite(parsedDate.getTime()) ? months[parsedDate.getUTCMonth()] : getBogotaDateParts().month;
}

export function normalizeColumnName(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
}

export function monthIndex(value: string) {
  return ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"].indexOf(normalizeColumnName(value));
}

export function recordDateKey(record: Pick<RtiRecord, "day" | "month" | "year">) {
  const month = monthIndex(record.month) + 1;
  return `${record.year}-${String(Math.max(month, 1)).padStart(2, "0")}-${String(record.day).padStart(2, "0")}`;
}

export function getBogotaDateParts() {
  const parts = new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "long", year: "numeric", timeZone: "America/Bogota" }).formatToParts(new Date());
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value || "";
  const month = value("month");
  return { day: Number(value("day")), month: month.charAt(0).toUpperCase() + month.slice(1), year: Number(value("year")) };
}
