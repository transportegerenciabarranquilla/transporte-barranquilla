export type AdminDateRange = { from: string; to: string };

export function bogotaToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export function adminDateRange(search: URLSearchParams): AdminDateRange {
  const from = search.get("desde") || "";
  const to = search.get("hasta") || "";
  for (const date of [from, to]) {
    if (date && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date)) {
      throw new Error("La fecha debe tener el formato AAAA-MM-DD.");
    }
  }
  if (from && to && from > to) throw new Error("La fecha inicial no puede superar la final.");
  return { from, to };
}

// Mantiene la prioridad fechaDespacho -> fechaDt -> date -> createdAt.
// Se agrega con AND: nunca reemplaza el filtro por contratista.
export function applyAdminDateFilter(params: URLSearchParams, fields: string[], range: AdminDateRange, routeDts: string[] = []) {
  if (!range.from && !range.to) return;
  const clauses = fields.map((field, index) => {
    const path = `data->>${field}`;
    const bounds = [range.from ? `${path}.gte.${range.from}` : "", range.to ? `${path}.lt.${nextDay(range.to)}` : ""].filter(Boolean);
    const legacy: string[] = [];
    // Formatos históricos DD/MM/AAAA y DD-MM-AAAA.
    if (range.from && range.to && range.from === range.to) {
      const [year, month, day] = range.from.split("-");
      const variants = new Set([`${day}/${month}/${year}`, `${Number(day)}/${Number(month)}/${year}`, `${day}-${month}-${year}`, `${Number(day)}-${Number(month)}-${year}`]);
      variants.forEach(value => legacy.push(`${path}.eq.${value}`));
    } else {
      // Los rangos históricos incluyen formatos antiguos para filtrar después
      // de normalizar; la lectura inicial de hoy siempre queda acotada.
      legacy.push(`${path}.like.*/*`, `${path}.like.*-*-????`);
    }
    const missingEarlier = fields.slice(0, index).map(earlier => `or(data->>${earlier}.is.null,data->>${earlier}.eq."")`);
    return `and(${[...missingEarlier, `or(and(${bounds.join(",")}),${legacy.join(",")})`].join(",")})`;
  });
  const ids = Array.from(new Set(routeDts.filter(value => /^\d+$/.test(value))));
  // Incluye registros anteriores de rutas activas (pernocta y check-in).
  if (ids.length) clauses.push(`data->>dt.in.(${ids.join(",")})`);
  params.append("and", `(or(${clauses.join(",")}))`);
}

function nextDay(date: string) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + 1);
  return value.toISOString().slice(0, 10);
}
