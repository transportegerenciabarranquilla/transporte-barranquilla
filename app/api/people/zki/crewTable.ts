import { supabaseError, supabaseRest } from "../../../lib/supabaseServer";

export const ZKI_CREW_TABLE = "Conductores-placas";

export type ZkiCrewRow = { plate: string; driver: string; driverId: string; responsible: string; responsibleId: string };

export async function readZkiCrewRows(headers: Record<string, string>) {
  const response = await fetch(supabaseRest(ZKI_CREW_TABLE, "?select=*&limit=3000"), { headers, cache: "no-store" });
  if (!response.ok) throw new Error(`${ZKI_CREW_TABLE}: ${await supabaseError(response)}`);
  const rows = await response.json() as Record<string, unknown>[];
  const records = rows.map((row): ZkiCrewRow => ({
    plate: normalizePlate(row.PLACA),
    driver: String(row.CONDUCTOR || "").trim(),
    driverId: String(row.Cedula || "").replace(/\D/g, ""),
    responsible: String(row.RESPONSABLE || "").trim(),
    responsibleId: String(row["Cedula-RR"] || "").replace(/\D/g, ""),
  })).filter((row) => row.plate);
  if (!records.length) {
    throw new Error(`La tabla ${ZKI_CREW_TABLE} devolvió 0 registros. Activa su permiso SELECT/RLS antes de calcular ZKI.`);
  }
  return records;
}

export function normalizePlate(value: unknown) {
  const raw = String(value || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "").replace(/^vh/, "");
  const withoutEquipmentPrefix = /^co[a-z]{3}\d{3}$/.test(raw) ? raw.slice(2) : raw;
  return /^[a-z]{3}\d{3}$/.test(withoutEquipmentPrefix) ? withoutEquipmentPrefix : "";
}
