export type ComplaintChartRow = { contractor: string; date: string; status: string; issue: string; count: number; openedAt?: string; closedAt?: string; dt?: string; rr?: string; rrId?: string; client?: string; clientCode?: string; complaintId?: string; causal?: string; plate?: string; adjudicable?: string; observation?: string };
export type ComplaintChartMapping = Record<"contractor" | "date" | "status" | "issue" | "count", string> & { closedDate?: string; dt?: string; client?: string; clientCode?: string; complaintId?: string; rr?: string; causal?: string; plate?: string; adjudicable?: string; observation?: string };
export type ComplaintExcelRow = Record<string, string>;
export type ComplaintDateOrder = "dmy" | "mdy";

const key = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

export function suggestComplaintChartMapping(headers: string[]): ComplaintChartMapping {
  const aliases = {
    contractor: ["transportista", "contratista", "contractor"],
    date: ["fechacreacion", "fechadecreacion", "fechadeingresodelanovedad", "fechaingresodelanovedad", "fecha", "createddate"],
    status: ["estado", "estatus", "status"],
    issue: ["novedad", "motivo", "tipodequeja", "issue"],
    count: ["cantidad", "total", "quejas", "numerodequejas", "count"],
  };
  const mapping = Object.fromEntries(Object.entries(aliases).map(([field, names]) => [field, headers.find(header => names.includes(key(header))) || ""])) as ComplaintChartMapping;
  const closedDate = headers.find(header => ["fechadecierredelanovedad", "fechacierredelanovedad", "fechadecierre", "fechacierre", "closedat", "closeddate"].includes(key(header)));
  if (closedDate) mapping.closedDate = closedDate;
  const dt = headers.find(header => ["dt", "transporte", "numerodt", "numerodetransporte"].includes(key(header)));
  if (dt) mapping.dt = dt;
  const detailAliases = {
    client: ["nombredecliente", "nombrecliente", "cliente", "establecimiento", "establishment"],
    clientCode: ["codigo", "codigocliente", "codigodecliente", "codcliente", "code"],
    complaintId: ["ticket", "id", "idqueja", "numeroqueja"],
    rr: ["rr", "responsable", "personal", "nombrederesponsable"],
    causal: ["causal", "causales", "motivodecierre"],
    plate: ["placa", "placas"],
    adjudicable: ["adjudicablenoadjudicable", "adjudicable"],
    observation: ["observacion", "observaciones"],
  };
  for (const [field, names] of Object.entries(detailAliases)) {
    const header = headers.find(header => names.includes(key(header)));
    if (header) mapping[field as keyof typeof detailAliases] = header;
  }
  return mapping;
}

export function chartDate(value: string, order: ComplaintDateOrder = "dmy") {
  const text = value.trim();
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:$|[ T])/);
  const local = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?:$|\s)/);
  // Only infer order when one component cannot be a month. Ambiguous text
  // follows the user's selected order; Excel calendar dates arrive as ISO.
  const monthFirst = local && (Number(local[2]) > 12 || (Number(local[1]) <= 12 && order === "mdy"));
  const result = iso ? `${iso[1]}-${iso[2]}-${iso[3]}` : local ? `${local[3]}-${local[monthFirst ? 1 : 2].padStart(2, "0")}-${local[monthFirst ? 2 : 1].padStart(2, "0")}` : "";
  const parsed = new Date(`${result}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === result ? result : "";
}

export function parseComplaintChartRows(rows: ComplaintExcelRow[], mapping: ComplaintChartMapping, order: ComplaintDateOrder = "dmy"): ComplaintChartRow[] {
  if (![mapping.contractor, mapping.date, mapping.status, mapping.issue].some(Boolean)) throw new Error("Selecciona al menos una columna de transportista, fecha, estado o novedad.");
  const result: ComplaintChartRow[] = [];
  rows.forEach((row, index) => {
    const read = (field: keyof ComplaintChartMapping) => String(row[mapping[field] || ""] ?? "").trim();
    if (!Object.keys(mapping).some(field => read(field as keyof ComplaintChartMapping))) return;
    const count = mapping.count ? Number(read("count")) : 1;
    if ((mapping.count && !read("count")) || !Number.isSafeInteger(count) || count < 0) throw new Error(`Fila ${index + 2}: la cantidad debe ser un entero mayor o igual a cero, sin separadores de miles.`);
    const date = chartDate(read("date"), order);
    if (read("date") && !date) throw new Error(`Fila ${index + 2}: fecha inválida «${read("date") }» en ${mapping.date}. Usa dd/mm/aaaa, mm/dd/aaaa o aaaa-mm-dd.`);
    result.push({ contractor: read("contractor") || "Sin transportista", date, status: complaintChartStatus(read("status")), issue: read("issue") || "Sin novedad", count,
      ...(mapping.closedDate ? { openedAt: complaintClosureDate(read("date"), order), closedAt: complaintClosureDate(read("closedDate"), order) } : {}),
      ...(mapping.dt ? { dt: read("dt") } : {}),
      ...(mapping.client ? { client: read("client") } : {}),
      ...(mapping.clientCode ? { clientCode: read("clientCode") } : {}),
      ...(mapping.complaintId ? { complaintId: read("complaintId") } : {}),
      ...(mapping.rr ? { rr: read("rr") } : {}),
      ...(mapping.causal ? { causal: read("causal") } : {}),
      ...(mapping.plate ? { plate: read("plate") } : {}),
      ...(mapping.adjudicable ? { adjudicable: read("adjudicable") } : {}),
      ...(mapping.observation ? { observation: read("observation") } : {}),
    });
  });
  if (!result.length) throw new Error("La hoja no contiene filas para graficar.");
  return result;
}

export function complaintChartStatus(value: string) {
  if (["cerrado", "cerrada", "cerrdado", "cerrdao", "cerraddo"].includes(key(value))) return "Cerrada";
  if (["abierto", "abierta"].includes(key(value))) return "Abierta";
  return value || "Sin estado";
}

export function complaintStatusTotals(rows: ComplaintChartRow[]) {
  const result = { total: 0, closed: 0, open: 0, unknown: 0 };
  for (const row of rows) {
    result.total += row.count;
    const status = complaintChartStatus(row.status);
    if (status === "Cerrada") result.closed += row.count;
    else if (status === "Abierta") result.open += row.count;
    else result.unknown += row.count;
  }
  return result;
}

// Preserve clock precision for the closure metric. Local times use Colombia.
export function complaintClosureDate(value: string, order: ComplaintDateOrder = "dmy") {
  const date = chartDate(value, order);
  if (!date) return "";
  const suffix = value.trim().replace(/^(?:\d{4}-\d{2}-\d{2}|\d{1,2}[/-]\d{1,2}[/-]\d{4})/, "");
  if (!suffix) return date;
  const clock = suffix.match(/^[ T](\d{1,2}):(\d{2})(?::(\d{2})(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})?$/i);
  if (!clock || Number(clock[1]) > 23 || Number(clock[2]) > 59 || Number(clock[3] || 0) > 59) return "";
  const stamp = `${date}T${clock[1].padStart(2, "0")}:${clock[2]}:${clock[3] || "00"}${clock[4] || ""}${clock[5] || "-05:00"}`;
  return Number.isFinite(Date.parse(stamp)) ? stamp : "";
}

export function complaintClosureCategory(row: ComplaintChartRow): "within48" | "after48" | "missing" | "notClosed" {
  if (complaintChartStatus(row.status) !== "Cerrada") return "notClosed";
  const opened = complaintClosureDate(row.openedAt ?? row.date);
  const closed = complaintClosureDate(row.closedAt || "");
  if (!opened || !closed) return "missing";
  const estimated = opened.length === 10 || closed.length === 10;
  const start = Date.parse(estimated ? `${opened.slice(0, 10)}T00:00:00Z` : opened);
  const end = Date.parse(estimated ? `${closed.slice(0, 10)}T00:00:00Z` : closed);
  if (end < start) return "missing";
  return end - start <= 48 * 3_600_000 ? "within48" : "after48";
}

export function complaintClosureTotals(rows: ComplaintChartRow[]) {
  const result = { within48: 0, after48: 0, missing: 0, estimated: 0, evaluated: 0, percentage: 0 };
  for (const row of rows) {
    const category = complaintClosureCategory(row);
    if (category === "notClosed") continue;
    if (category === "missing") { result.missing += row.count; continue; }
    result.evaluated += row.count;
    if (complaintClosureDate(row.openedAt ?? row.date).length === 10 || complaintClosureDate(row.closedAt || "").length === 10) result.estimated += row.count;
    result[category] += row.count;
  }
  result.percentage = result.evaluated ? result.within48 / result.evaluated * 100 : 0;
  return result;
}

export function groupComplaintChart(rows: ComplaintChartRow[], field: "contractor" | "status" | "issue") {
  const groups = new Map<string, number>();
  for (const row of rows) groups.set(row[field], (groups.get(row[field]) || 0) + row.count);
  return [...groups].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "es"));
}

export function complaintWeekdays(rows: ComplaintChartRow[]) {
  const days = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"].map(label => ({ label, count: 0 }));
  for (const row of rows) {
    if (!chartDate(row.date)) continue;
    days[(new Date(`${row.date}T00:00:00Z`).getUTCDay() + 6) % 7].count += row.count;
  }
  return days;
}

export function complaintAccumulation(rows: ComplaintChartRow[]) {
  const dates = new Map<string, number>();
  let excluded = 0;
  for (const row of rows) {
    const date = chartDate(row.date);
    if (!date) { excluded += row.count; continue; }
    dates.set(date, (dates.get(date) || 0) + row.count);
  }
  const total = [...dates.values()].reduce((sum, count) => sum + count, 0);
  let accumulated = 0;
  const values = [...dates].sort(([a], [b]) => a.localeCompare(b)).map(([date, count]) => {
    accumulated += count;
    return { date, count, accumulated, percentage: total ? accumulated / total * 100 : 0 };
  });
  return { values, total, excluded };
}

export function complaintToday(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const part = (type: string) => parts.find(item => item.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function complaintLastThreeDays(rows: ComplaintChartRow[], today: string) {
  if (!chartDate(today)) return [];
  const end = new Date(`${today}T00:00:00Z`).getTime();
  const days = [2, 1, 0].map(offset => ({ date: new Date(end - offset * 86_400_000).toISOString().slice(0, 10), count: 0 }));
  for (const row of rows) {
    const day = days.find(item => item.date === chartDate(row.date));
    if (day) day.count += row.count;
  }
  return days;
}
