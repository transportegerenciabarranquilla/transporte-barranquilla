import { normalizeContractorName } from "./contractors";
import type { PuntoCoronaRouteReport } from "./puntoCoronaRoutesStorage";
import type { Vehiculo } from "../seguimiento/types";
import { calculateRefusalTotals, type ModulacionRegistro } from "./modulacionStorage";
import { supabaseAdminHeaders, supabaseRest } from "./supabaseServer";

const CONTRACTORS = ["Logisticos", "Surti Cervezas", "HL Logisticos"] as const;
type DbRow<T> = { contractor: string; data: T | null; updated_at: string };
export type DailyContractorSummary = {
  contractor: string;
  tracking: { routes: number; visited: number; clients: number; percentage: number } | null;
  refusal: { percentage: number; pending: number; boxes: number } | null;
  range: { percentage: number; inRange: number; started: number; outside: number } | null;
};
type Checkin = { dt: string; totalCajas: number; contratista?: string; createdAt?: string };

export function dateKey(value: unknown) {
  const raw = String(value || "").trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const legacy = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  return legacy ? `${legacy[3].length === 2 ? `20${legacy[3]}` : legacy[3]}-${legacy[2].padStart(2, "0")}-${legacy[1].padStart(2, "0")}` : "";
}
function amount(value: unknown) { const parsed = Number(String(value ?? 0).replace(/\./g, "").replace(",", ".")); return Number.isFinite(parsed) ? parsed : 0; }
function percent(part: number, total: number) { return total ? Number((part / total * 100).toFixed(2)) : 0; }

export function calculateDailySummary(
  day: string,
  routeRows: DbRow<Vehiculo>[],
  rangeRows: DbRow<PuntoCoronaRouteReport>[],
  modulationRows: DbRow<ModulacionRegistro>[] = [],
  checkinRows: DbRow<Checkin>[] = [],
): { contractors: DailyContractorSummary[]; total: Omit<DailyContractorSummary, "contractor"> } {
  const contractors = CONTRACTORS.map(contractor => {
    const key = normalizeContractorName(contractor);
    const routes = new Map<string, Vehiculo>();
    for (const row of routeRows) {
      if (normalizeContractorName(row.contractor) !== key || !row.data) continue;
      if (dateKey(row.data.fechaDespacho || row.data.fechaDt || row.data.date || row.data.createdAt) !== day) continue;
      const dt = String(row.data.transporte || "").replace(/\D/g, "");
      if (dt && !routes.has(dt)) routes.set(dt, row.data);
    }
    const modulations = modulationRows.filter(row => normalizeContractorName(row.contractor) === key && row.data && dateKey(row.data.fechaDespacho || row.data.fechaDt || row.data.createdAt) === day).map(row => row.data!);
    const checkins = checkinRows.filter(row => normalizeContractorName(row.contractor) === key && row.data && dateKey(row.data.createdAt) === day).map(row => row.data!);
    const routeValues = [...routes.values()];
    const clients = routeValues.reduce((sum, route) => sum + amount(route.clientes), 0);
    const visited = routeValues.reduce((sum, route) => sum + amount(route.visitados), 0);
    const refusal = calculateRefusalTotals(routeValues.map(route => ({ ...route, cajas: amount(route.cajas) })), modulations, checkins, {
      getVehicleDate: route => dateKey((route as Vehiculo).fechaDespacho || (route as Vehiculo).fechaDt || (route as Vehiculo).date || (route as Vehiculo).createdAt),
      getModulationDate: record => dateKey(record.fechaDespacho || record.fechaDt || record.createdAt),
    });
    const boxes = refusal.cajasSeguimiento;
    const pending = refusal.pendientes;
    const reports = rangeRows.filter(row => normalizeContractorName(row.contractor) === key && row.data?.operationalDate === day);
    const latest = reports.find(row => row.data?.kind === "closure") || reports[0];
    const started = latest?.data?.rows.filter(row => row.status !== "NOT_STARTED") || [];
    const inRange = started.filter(row => row.withinRadius === true).length;
    const outside = started.filter(row => row.withinRadius === false).length;
    return {
      contractor,
      tracking: routeValues.length ? { routes: routeValues.length, clients, visited, percentage: percent(visited, clients) } : null,
      refusal: boxes ? { percentage: percent(pending, boxes), pending, boxes } : null,
      range: latest ? { percentage: percent(inRange, started.length), inRange, started: started.length, outside } : null,
    };
  });
  const boxes = contractors.reduce((sum, item) => sum + (item.refusal?.boxes || 0), 0);
  const routes = contractors.reduce((sum, item) => sum + (item.tracking?.routes || 0), 0);
  const clients = contractors.reduce((sum, item) => sum + (item.tracking?.clients || 0), 0);
  const visited = contractors.reduce((sum, item) => sum + (item.tracking?.visited || 0), 0);
  const pending = contractors.reduce((sum, item) => sum + (item.refusal?.pending || 0), 0);
  const started = contractors.reduce((sum, item) => sum + (item.range?.started || 0), 0);
  const inRange = contractors.reduce((sum, item) => sum + (item.range?.inRange || 0), 0);
  const outside = contractors.reduce((sum, item) => sum + (item.range?.outside || 0), 0);
  return { contractors, total: {
    tracking: routes ? { routes, clients, visited, percentage: percent(visited, clients) } : null,
    refusal: boxes ? { percentage: percent(pending, boxes), pending, boxes } : null,
    range: started ? { percentage: percent(inRange, started), inRange, started, outside } : null,
  } };
}

export async function loadDailySummary(day: string) {
  const headers = supabaseAdminHeaders();
  if (!headers) return null;
  const requestHeaders = headers;
  const filter = `in.(${CONTRACTORS.map(value => `"${value}"`).join(",")})`;
  async function read<T>(table: string, params: URLSearchParams): Promise<DbRow<T>[]> {
    const response = await fetch(supabaseRest(table, `?${params.toString()}`), { headers: requestHeaders, cache: "no-store", signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error(`${table}: HTTP ${response.status}`);
    return response.json() as Promise<DbRow<T>[]>;
  }
  try {
    const routesParams = new URLSearchParams({ select: "contractor,data,updated_at", contractor: filter, order: "updated_at.desc", limit: "5000" });
    const rangesParams = new URLSearchParams({ select: "contractor,data,updated_at", contractor: filter, operational_date: `eq.${day}`, order: "updated_at.desc", limit: "5000" });
    const [routes, ranges, modulations, checkins] = await Promise.all([
      read<Vehiculo>("seguimiento_vehiculos", routesParams),
      read<PuntoCoronaRouteReport>("punto_corona_route_reports", rangesParams),
      read<ModulacionRegistro>("modulaciones_ruta", routesParams),
      read<Checkin>("checkins_cajas", routesParams),
    ]);
    if ([routes, ranges, modulations, checkins].some(rows => rows.length >= 5000)) throw new Error("La consulta alcanzó el límite de 5000 registros.");
    return { ...calculateDailySummary(day, routes, ranges, modulations, checkins), routes, modulations };
  } catch (error) {
    console.error("No se pudo calcular el resumen general para n8n.", error);
    return null;
  }
}
