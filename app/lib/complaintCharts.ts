export type ComplaintChartRow = { contractor: string; date: string; status: string; issue: string; count: number };
export type ComplaintChartMapping = Record<"contractor" | "date" | "status" | "issue" | "count", string>;
export type ComplaintExcelRow = Record<string, string>;

const key = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

export function suggestComplaintChartMapping(headers: string[]): ComplaintChartMapping {
  const aliases = {
    contractor: ["transportista", "contratista", "contractor"],
    date: ["fechacreacion", "fechadecreacion", "fecha", "createddate"],
    status: ["estado", "status"],
    issue: ["novedad", "motivo", "tipodequeja", "issue"],
    count: ["cantidad", "total", "quejas", "numerodequejas", "count"],
  };
  return Object.fromEntries(Object.entries(aliases).map(([field, names]) => [field, headers.find(header => names.includes(key(header))) || ""])) as ComplaintChartMapping;
}

export function chartDate(value: string) {
  const text = value.trim();
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:$|[ T])/);
  const local = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?:$|\s)/);
  const result = iso ? `${iso[1]}-${iso[2]}-${iso[3]}` : local ? `${local[3]}-${local[2].padStart(2, "0")}-${local[1].padStart(2, "0")}` : "";
  const parsed = new Date(`${result}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === result ? result : "";
}

export function parseComplaintChartRows(rows: ComplaintExcelRow[], mapping: ComplaintChartMapping): ComplaintChartRow[] {
  if (![mapping.contractor, mapping.date, mapping.status, mapping.issue].some(Boolean)) throw new Error("Selecciona al menos una columna de transportista, fecha, estado o novedad.");
  const result: ComplaintChartRow[] = [];
  rows.forEach((row, index) => {
    const read = (field: keyof ComplaintChartMapping) => String(row[mapping[field]] ?? "").trim();
    if (!Object.keys(mapping).some(field => read(field as keyof ComplaintChartMapping))) return;
    const count = mapping.count ? Number(read("count")) : 1;
    if ((mapping.count && !read("count")) || !Number.isSafeInteger(count) || count < 0) throw new Error(`Fila ${index + 2}: la cantidad debe ser un entero mayor o igual a cero, sin separadores de miles.`);
    const date = chartDate(read("date"));
    if (read("date") && !date) throw new Error(`Fila ${index + 2}: fecha inválida. Usa dd/mm/aaaa o aaaa-mm-dd.`);
    result.push({ contractor: read("contractor") || "Sin transportista", date, status: read("status") || "Sin estado", issue: read("issue") || "Sin novedad", count });
  });
  if (!result.length) throw new Error("La hoja no contiene filas para graficar.");
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
