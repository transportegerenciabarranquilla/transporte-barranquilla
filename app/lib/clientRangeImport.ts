export type ImportedRangeVisit = { contractor: string; code: string; name: string; date: string; dt: string; meters: number };
export const importFields = {
  contractor: "Transportista", code: "Código cliente", name: "Nombre cliente", date: "Fecha", dt: "DT",
  clientLat: "Latitud cliente", clientLng: "Longitud cliente", visitLat: "Latitud visita", visitLng: "Longitud visita",
} as const;
export type ImportField = keyof typeof importFields;
export type ImportMapping = Record<ImportField, string>;
const normalize = (value: string) => value.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
const aliases: Record<ImportField, string[]> = {
  contractor: ["contratista", "transportista", "contractor"], code: ["codigo cliente", "codigo del cliente", "poc_external_id", "customer id"],
  name: ["nombre cliente", "nombre del cliente", "poc_name", "customer name"], date: ["fecha", "date", "tour_date", "fecha visita"], dt: ["dt", "transporte", "tour_display_id"],
  clientLat: ["latitud cliente", "customer latitude", "client latitude", "poc latitude"], clientLng: ["longitud cliente", "customer longitude", "client longitude", "poc longitude"],
  visitLat: ["latitud visita", "visit latitude", "latitud entrega"], visitLng: ["longitud visita", "visit longitude", "longitud entrega"],
};
export function suggestImportMapping(headers: string[]): ImportMapping {
  return Object.fromEntries(Object.entries(aliases).map(([field, names]) => [field, headers.find(header => names.some(name => normalize(name) === normalize(header))) || ""])) as ImportMapping;
}
export function coordinate(value: unknown, limit: number): number | null {
  const text = String(value ?? "").trim().replace(",", ".");
  if (!/^[+-]?\d+(?:\.\d+)?$/.test(text)) return null;
  const number = Number(text);
  return Number.isFinite(number) && Math.abs(number) <= limit ? number : null;
}
export function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number) {
  const radians = (number: number) => number * Math.PI / 180;
  const a = Math.sin(radians(lat2 - lat1) / 2) ** 2 + Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(radians(lng2 - lng1) / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, a))));
}
function importDate(value: unknown) {
  if (value instanceof Date && Number.isFinite(value.getTime())) return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
  const text = String(value ?? "").trim();
  const match = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  const date = match ? `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}` : text.slice(0, 10);
  const parsed = new Date(`${date}T12:00:00Z`);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date ? date : "";
}
export function parseRangeImport(rows: Record<string, unknown>[], mapping: ImportMapping) {
  const visits: ImportedRangeVisit[] = [];
  const errors: string[] = [];
  for (const [index, row] of rows.entries()) {
    const read = (field: ImportField) => String(row[mapping[field]] ?? "").trim();
    const date = importDate(row[mapping.date]);
    const lat1 = coordinate(row[mapping.clientLat], 90), lng1 = coordinate(row[mapping.clientLng], 180);
    const lat2 = coordinate(row[mapping.visitLat], 90), lng2 = coordinate(row[mapping.visitLng], 180);
    if (!read("code") || !read("contractor") || !read("dt") || !date || lat1 === null || lng1 === null || lat2 === null || lng2 === null) {
      errors.push(`Fila ${index + 2}: revisa código, transportista, DT, fecha y las cuatro coordenadas.`);
      continue;
    }
    visits.push({ contractor: read("contractor"), code: read("code"), name: read("name"), dt: read("dt"), date, meters: distanceMeters(lat1, lng1, lat2, lng2) });
  }
  return { visits, errors };
}
