import { contractorLabel, normalizeContractorName } from "./contractors";
import { normalizeDt, summarizeModulaciones, type ModulacionRegistro } from "./modulacionStorage";
import { getCheckinByDt, type CheckinCajasRegistro } from "./checkinStorage";
import { scopeCheckinQuery } from "./checkinScope";
import { supabaseReadHeaders, supabaseRest, supabaseError } from "./supabaseServer";
import type { Vehiculo } from "../seguimiento/types";

type DataRow<T> = { contractor?: string; data?: T };
export type ExportCheckin = CheckinCajasRegistro & { contratista?: string };

async function readExportData<T>(table: "checkins_cajas" | "modulaciones_ruta", contractors: readonly string[], accessToken: string, select = "contractor,data"): Promise<T[]> {
  const headers = supabaseReadHeaders(accessToken);
  const groups = await Promise.all(contractors.map(async (contractor) => {
    const rows: T[] = [];
    for (let offset = 0; ; offset += 1000) {
      const idColumn = table === "checkins_cajas" ? "checkin_id" : "modulation_id";
      // Ambas fuentes guardan el propietario histórico en data.contratista.
      const params = scopeCheckinQuery(new URLSearchParams({ select, order: `updated_at.desc,${idColumn}.asc`, limit: "1000", offset: String(offset) }), [contractor]);
      const response = await fetch(supabaseRest(table, `?${params}`), { headers, cache: "no-store" });
      if (!response.ok) throw new Error(await supabaseError(response));
      const page = await response.json() as T[];
      rows.push(...page);
      if (page.length < 1000) return rows;
    }
  }));
  return groups.flat();
}

export async function readExportCheckins(contractors: readonly string[], accessToken: string): Promise<ExportCheckin[]> {
  const rows = await readExportData<DataRow<ExportCheckin>>("checkins_cajas", contractors, accessToken);
  return rows.flatMap((row) => row.data ? [{ ...row.data, contratista: contractorLabel(row.contractor || row.data.contratista) }] : []);
}

export async function readExportModulations(contractors: readonly string[], accessToken: string): Promise<ModulacionRegistro[]> {
  // El cálculo solo necesita estos campos; las evidencias pueden ser imágenes grandes.
  const select = "contractor,id:data->>id,contratista:data->>contratista,dt:data->>dt,fechaDespacho:data->>fechaDespacho,fechaDt:data->>fechaDt,createdAt:data->>createdAt,totalCajas:data->>totalCajas,cajasGestionadas:data->>cajasGestionadas";
  const rows = await readExportData<ModulacionRegistro & { contractor?: string }>("modulaciones_ruta", contractors, accessToken, select);
  return rows.map((row) => ({ ...row, contratista: contractorLabel(row.contractor || row.contratista) }));
}

export function exportDateKey(value: string | undefined) {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  const match = value.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);
  if (match) return `${match[3].length === 2 ? `20${match[3]}` : match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString().slice(0, 10);
}

export function exportRouteKey(contractor: string | undefined, dt: string | number | undefined, date: string) {
  return `${normalizeContractorName(contractor)}:${normalizeDt(dt)}:${date}`;
}

export function enrichExportVehicles(vehicles: Vehiculo[], modulations: ModulacionRegistro[], checkins: ExportCheckin[]) {
  const byRoute = new Map<string, ModulacionRegistro[]>();
  for (const record of modulations) {
    const date = exportDateKey(record.fechaDespacho || record.fechaDt || record.createdAt);
    const key = exportRouteKey(record.contratista, record.dt, date);
    byRoute.set(key, [...(byRoute.get(key) || []), record]);
  }
  return vehicles.map((vehicle) => {
    const date = exportDateKey(vehicle.fechaDespacho || vehicle.fechaDt || vehicle.date || vehicle.createdAt);
    const key = exportRouteKey(vehicle.transportista, vehicle.transporte, date);
    const checkin = getCheckinByDt(checkins, vehicle.transporte, { contractor: contractorLabel(vehicle.transportista), dateKey: date });
    const summary = summarizeModulaciones(byRoute.get(key) || [], vehicle.cajas, checkin?.totalCajas);
    return { ...vehicle, cajasCheckin: summary.cajasCheckin, cajasRechazadas: summary.cajasRechazadas,
      cajasGestionadas: summary.cajasGestionadas, cajasRefusalFinal: summary.cajasPendientes, refusal: summary.refusal };
  });
}
