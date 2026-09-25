export const deliveryRangeFields = { rr: "RR / Responsable", conductor: "Conductor", range: "Entrega en rango" } as const;
export type DeliveryRangeField = keyof typeof deliveryRangeFields;
export type DeliveryRangeMapping = Record<DeliveryRangeField, number>;
export type DeliveryRangeRow = { fila: number; rr: string; conductor: string; inRange: boolean | null };
export type DeliveryRangeSummary = { key: string; rr: string; conductor: string; total: number; inRange: number; outOfRange: number; unvalidated: number; percentage: number | null };

const normalize = (value: unknown) => String(value ?? "").trim().toLocaleLowerCase("es").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
const aliases: Record<DeliveryRangeField, string[]> = {
  rr: ["rr", "responsable", "responsable de ruta", "nombre responsable"],
  conductor: ["conductor", "nombre conductor", "driver", "driver name", "nombre del conductor"],
  range: ["entrega en rango", "en rango", "rango", "within radius", "within delivery radius", "in range"],
};

export function suggestDeliveryRangeMapping(headers: unknown[]): DeliveryRangeMapping {
  return Object.fromEntries(Object.entries(aliases).map(([field, names]) => [field, headers.findIndex((header) => names.some((name) => normalize(header) === normalize(name)))])) as DeliveryRangeMapping;
}

function parseRange(value: unknown, fila: number): boolean | null {
  if (value === true || value === 1) return true;
  if (value === false || value === 0) return false;
  if (typeof value === "number") throw new Error(`Fila ${fila}: el rango debe ser Sí/No o 1/0, no un porcentaje ni una distancia.`);
  const text = String(value ?? "").trim().toLocaleLowerCase("es").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[\s_]+/g, "");
  if (["si", "s", "yes", "true", "verdadero", "1", "enrango", "dentroderango", "dentrodelrango"].includes(text)) return true;
  if (["no", "n", "false", "falso", "0", "fueraderango", "fueradelrango"].includes(text)) return false;
  if (["", "sinvalidar", "sindato", "sindatos", "pendiente", "na", "n/a", "—", "-"].includes(text)) return null;
  throw new Error(`Fila ${fila}: rango «${String(value)}» no reconocido. Usa Sí/No, En rango/Fuera de rango o 1/0.`);
}

export function parseDeliveryRangeRows(data: unknown[][], mapping: DeliveryRangeMapping): DeliveryRangeRow[] {
  const columns = Object.values(mapping);
  if (columns.some((column) => !Number.isInteger(column) || column < 0 || column >= (data[0]?.length ?? 0))) throw new Error("Selecciona las columnas de RR, conductor y entrega en rango.");
  if (new Set(columns).size !== columns.length) throw new Error("RR, conductor y entrega en rango deben usar columnas distintas.");
  const rows: DeliveryRangeRow[] = [];
  data.slice(1).forEach((cells, index) => {
    if (cells.every((value) => value == null || String(value).trim() === "")) return;
    const fila = index + 2;
    const rr = String(cells[mapping.rr] ?? "").trim();
    const conductor = String(cells[mapping.conductor] ?? "").trim();
    if (!rr || !conductor) throw new Error(`Fila ${fila}: completa el RR y el conductor.`);
    rows.push({ fila, rr, conductor, inRange: parseRange(cells[mapping.range], fila) });
  });
  if (!rows.length) throw new Error("La primera hoja no contiene entregas para mostrar.");
  return rows;
}

export function summarizeDeliveryRange(rows: DeliveryRangeRow[]): DeliveryRangeSummary[] {
  const groups = new Map<string, DeliveryRangeSummary>();
  for (const row of rows) {
    const nameKey = (value: string) => value.trim().replace(/\s+/g, " ").toLocaleLowerCase("es");
    const key = JSON.stringify([nameKey(row.rr), nameKey(row.conductor)]);
    const group = groups.get(key) ?? { key, rr: row.rr, conductor: row.conductor, total: 0, inRange: 0, outOfRange: 0, unvalidated: 0, percentage: null };
    group.total += 1;
    if (row.inRange === true) group.inRange += 1;
    else if (row.inRange === false) group.outOfRange += 1;
    else group.unvalidated += 1;
    const validated = group.inRange + group.outOfRange;
    group.percentage = validated ? group.inRange / validated * 100 : null;
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => a.rr.localeCompare(b.rr, "es") || a.conductor.localeCompare(b.conductor, "es"));
}
