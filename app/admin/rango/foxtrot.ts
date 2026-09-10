export const fields = {
  contractor: "Contratista", code: "Código del cliente", name: "Nombre del cliente",
  dt: "DT", rr: "RR", meters: "Distancia al cliente (metros)", date: "Fecha",
} as const;
export type Field = keyof typeof fields;
export type Mapping = Record<Field, string>;
export type FileRow = Record<string, unknown>;
export type FoxtrotRow = { contractor: string; code: string; name: string; dt: string; rr: string; inRange: boolean | null; meters: number | null; date: string };
export type FoxtrotCrewSummary = { key: string; contractor: string; dt: string; rr: string; total: number; inRange: number; outOfRange: number; deliveryPercent: number };
export type FoxtrotRrSummary = { key: string; rr: string; contractors: string[]; total: number; inRange: number; outOfRange: number; unvalidated: number; deliveryPercent: number };
export const FOXTROT_RANGE_LIMIT_METERS = 50;
export const normalize = (value: unknown) => String(value ?? "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
export const normalizeDt = (value: unknown) => normalize(value).replace(/^dt/, "").replace(/^(?:r\d+s|rs1|s)(?=\d)/, "").replace(/^0+(?=\d)/, "");
const aliases: Record<Field, string[]> = {
  contractor: ["contratista", "transportista", "contractor"], code: ["codigo cliente", "codigo del cliente", "poc_external_id", "customer_code", "Customer ID"],
  name: ["nombre cliente", "nombre del cliente", "poc_name", "customer_name"], dt: ["dt", "tour_display_id", "transporte", "Route Name"],
  rr: ["rr", "responsable", "driver_name"],
  meters: ["Visit Meters from Customer", "distancia al cliente"], date: ["fecha", "tour_date", "date", "Planned Route Start Date"],
};
export function suggestMapping(headers: string[]): Mapping {
  return Object.fromEntries(Object.entries(aliases).map(([key, values]) => [key, headers.find(header => values.some(value => normalize(value) === normalize(header))) || ""])) as Mapping;
}
export function parseMeters(value: unknown): number | null {
  const text = String(value ?? "").trim().replace(/\s*m(?:etros)?$/i, "").replace(/\s/g, "");
  if (!text) return null;
  const normalized = text.includes(",") && text.includes(".")
    ? (text.lastIndexOf(",") > text.lastIndexOf(".") ? text.replace(/\./g, "").replace(",", ".") : text.replace(/,/g, ""))
    : text.replace(",", ".");
  const number = Number(normalized);
  return Number.isFinite(number) && number >= 0 ? number : null;
}
export function dateKey(value: unknown): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
  const text = String(value ?? "").trim();
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:$|[ T])/);
  const local = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  const key = iso ? `${iso[1]}-${iso[2]}-${iso[3]}` : local ? `${local[3]}-${local[2].padStart(2, "0")}-${local[1].padStart(2, "0")}` : "";
  const parsed = new Date(`${key}T12:00:00Z`);
  return key && !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === key ? key : "";
}
export function mapRows(rows: FileRow[], mapping: Mapping, contractor: string, date: string): FoxtrotRow[] {
  return rows.map(row => {
    const read = (field: Field) => String(row[mapping[field]] ?? "").trim();
    const meters = parseMeters(row[mapping.meters]);
    return { contractor: mapping.contractor ? read("contractor") : contractor, date: mapping.date ? dateKey(row[mapping.date]) : date,
      code: read("code"), name: read("name"), dt: read("dt"), rr: read("rr"), inRange: meters === null ? null : meters <= FOXTROT_RANGE_LIMIT_METERS, meters };
  });
}
export const distanceBands = [
  { min: 0, max: 100, label: "0–100 m" },
  { min: 100, max: 180, label: "100–180 m" },
  { min: 180, max: Number.POSITIVE_INFINITY, label: "180+ m" },
];
export function inBand(row: FoxtrotRow, min: number, max: number) { return row.inRange === false && row.meters !== null && row.meters - FOXTROT_RANGE_LIMIT_METERS > min && row.meters - FOXTROT_RANGE_LIMIT_METERS <= max; }

export function assignContractors(rows: FoxtrotRow[], reports: { contractor: string; operationalDate: string; summary: { crews: { dt: string }[] } }[]) {
  const byDate = new Map<string, Map<string, string>>();
  const byDt = new Map<string, Map<string, string>>();
  function add(index: Map<string, Map<string, string>>, key: string, contractor: string) {
    const candidates = index.get(key) || new Map<string, string>();
    candidates.set(normalize(contractor), contractor);
    index.set(key, candidates);
  }
  for (const report of reports) {
    if (!report.contractor.trim()) continue;
    for (const crew of report.summary.crews) {
      const dt = normalizeDt(crew.dt);
      if (!dt) continue;
      add(byDate, `${report.operationalDate}:${dt}`, report.contractor);
      add(byDt, dt, report.contractor);
    }
  }
  return rows.map(row => {
    const dt = normalizeDt(row.dt);
    const candidates = byDate.get(`${row.date}:${dt}`) || byDt.get(dt);
    const contractor = candidates?.size === 1 ? Array.from(candidates.values())[0] : candidates?.size ? "DT con varias contratistas" : "DT sin coincidencia";
    return { ...row, contractor };
  });
}

export function summarizeFoxtrotCrews(rows: FoxtrotRow[]): FoxtrotCrewSummary[] {
  const summaries = new Map<string, Omit<FoxtrotCrewSummary, "deliveryPercent">>();
  for (const row of rows) {
    if (row.inRange === null) continue;
    const key = getFoxtrotCrewKey(row);
    const summary = summaries.get(key) || { key, contractor: row.contractor, dt: row.dt, rr: row.rr, total: 0, inRange: 0, outOfRange: 0 };
    summary.total += 1;
    if (row.inRange) summary.inRange += 1;
    else summary.outOfRange += 1;
    summaries.set(key, summary);
  }
  return Array.from(summaries.values())
    .map(summary => ({ ...summary, deliveryPercent: summary.total ? (summary.inRange / summary.total) * 100 : 0 }))
    .sort((a, b) => a.deliveryPercent - b.deliveryPercent || a.contractor.localeCompare(b.contractor) || normalizeDt(a.dt).localeCompare(normalizeDt(b.dt)));
}

export function getFoxtrotCrewKey(row: Pick<FoxtrotRow, "contractor" | "dt" | "rr">) {
  return `${normalize(row.contractor)}:${normalizeDt(row.dt)}:${normalize(row.rr)}`;
}

export function getFoxtrotRrKey(row: Pick<FoxtrotRow, "rr">) {
  return normalize(row.rr);
}

export function summarizeFoxtrotRrs(rows: FoxtrotRow[]): FoxtrotRrSummary[] {
  const summaries = new Map<string, { key: string; rr: string; contractors: Set<string>; total: number; inRange: number; outOfRange: number; unvalidated: number }>();
  for (const row of rows) {
    const key = getFoxtrotRrKey(row);
    if (!key) continue;
    const summary = summaries.get(key) || { key, rr: row.rr, contractors: new Set<string>(), total: 0, inRange: 0, outOfRange: 0, unvalidated: 0 };
    if (row.contractor) summary.contractors.add(row.contractor);
    summary.total += 1;
    if (row.inRange === true) summary.inRange += 1;
    else if (row.inRange === false) summary.outOfRange += 1;
    else summary.unvalidated += 1;
    summaries.set(key, summary);
  }
  return Array.from(summaries.values())
    .map(summary => ({
      ...summary,
      contractors: Array.from(summary.contractors).sort(),
      deliveryPercent: summary.inRange + summary.outOfRange ? (summary.inRange / (summary.inRange + summary.outOfRange)) * 100 : 0,
    }))
    .sort((a, b) => a.deliveryPercent - b.deliveryPercent || a.rr.localeCompare(b.rr));
}
