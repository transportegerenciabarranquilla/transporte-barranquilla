export type CoordinateRecord = {
  id: number;
  ruta: string;
  tipo: string;
  descripcion: string;
  latitud: number;
  longitud: number;
  activo: boolean;
  codigoCliente: string;
  contratista: string;
  nombreRr: string;
  createdAt: string;
};

// La tabla existente tiene descripcion TEXT. Este sobre versionado conserva
// los datos de la captura sin exigir cambios de esquema; los riesgos antiguos
// siguen usando una descripción de texto normal.
export function encodeCoordinateDetails(details: { codigoCliente: string; contratista: string; nombreRr: string; createdAt: string }) {
  return JSON.stringify({ module: "ubicaciones", version: 1, ...details });
}

export function readCoordinateRecord(row: Record<string, unknown>): CoordinateRecord {
  let details: Record<string, unknown> = {};
  const description = String(row.descripcion || "");
  try {
    const parsed = JSON.parse(description);
    if (parsed?.module === "ubicaciones" && parsed.version === 1) details = parsed;
  } catch { /* Los registros anteriores tienen descripciones de texto. */ }
  return {
    id: Number(row.id), ruta: String(row.ruta || "Sin cliente"), tipo: String(row.tipo || ""),
    descripcion: details.module ? "Ubicación del cliente registrada mediante GPS." : description,
    latitud: row.latitud == null ? NaN : Number(row.latitud), longitud: row.longitud == null ? NaN : Number(row.longitud), activo: row.activo !== false,
    codigoCliente: String(row.codigoCliente || details.codigoCliente || ""),
    contratista: String(row.contratista || details.contratista || ""),
    nombreRr: String(row.nombreRr || details.nombreRr || ""),
    createdAt: String(row.createdAt || row.created_at || row.creado_en || details.createdAt || ""),
  };
}

export function coordinateDay(value: string) {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value || "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function filterCoordinateRecords(rows: CoordinateRecord[], search: string, from: string, to: string) {
  if (from && to && from > to) return [];
  const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const query = normalize(search.trim());
  return rows.filter((row) => {
    const day = coordinateDay(row.createdAt);
    if ((from || to) && !day) return false;
    return (!from || day >= from) && (!to || day <= to)
      && normalize(`${row.ruta} ${row.tipo} ${row.codigoCliente} ${row.contratista} ${row.nombreRr}`).includes(query);
  }).sort((a, b) => b.id - a.id);
}

export function coordinatesCsv(rows: CoordinateRecord[]) {
  const cell = (value: unknown) => {
    let text = String(value ?? "");
    if (typeof value === "string" && /^\s*[=+\-@\t\r\n]/.test(text)) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
  };
  const values: unknown[][] = [["ID", "Fecha (Bogotá)", "Contratista", "RR", "Cédula RR", "Código de cliente", "Cliente", "Latitud", "Longitud"]];
  rows.forEach((row) => values.push([row.id, coordinateDay(row.createdAt), row.contratista, row.nombreRr, row.tipo, row.codigoCliente, row.ruta, row.latitud, row.longitud]));
  return `\uFEFF${values.map((row) => row.map(cell).join(";")).join("\r\n")}`;
}
