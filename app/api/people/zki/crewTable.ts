import { supabaseError, supabaseRest } from "../../../lib/supabaseServer";
import { formatPersonName } from "../../../lib/personNames";

export const ZKI_CREW_TABLE = "Conductores-placas";

export type ZkiCrewRow = { plate: string; driver: string; driverId: string; responsible: string; responsibleId: string };

export async function readZkiCrewRows(headers: Record<string, string>) {
  const [response, peopleResponse] = await Promise.all([
    fetch(supabaseRest(ZKI_CREW_TABLE, "?select=*&limit=3000"), { headers, cache: "no-store" }),
    fetch(supabaseRest("transporte_barranquilla", "?select=CC,NOMBRE,CARGO,CONTRATISTA&limit=3000"), { headers, cache: "no-store" }),
  ]);
  if (!response.ok) throw new Error(`${ZKI_CREW_TABLE}: ${await supabaseError(response)}`);
  const rows = await response.json() as Record<string, unknown>[];
  const people = peopleResponse.ok ? await peopleResponse.json() as Record<string, unknown>[] : [];
  const officialId = (name: string, role: "driver" | "responsible") => people.find((person) => {
    if (personKey(person.NOMBRE) !== personKey(name)) return false;
    const cargo = personKey(person.CARGO);
    return role === "driver"
      ? cargo.includes("conductor")
      : cargo === "rr" || cargo.includes("responsable") || (cargo.includes("lider") && cargo.includes("ruta"));
  })?.CC;
  const records = rows.map((row): ZkiCrewRow => ({
    plate: normalizePlate(row.PLACA),
    driver: formatPersonName(row.CONDUCTOR),
    driverId: String(officialId(formatPersonName(row.CONDUCTOR), "driver") || row.Cedula || "").replace(/\D/g, ""),
    responsible: formatPersonName(row.RESPONSABLE),
    responsibleId: String(officialId(formatPersonName(row.RESPONSABLE), "responsible") || row["Cedula-RR"] || "").replace(/\D/g, ""),
  })).filter((row) => row.plate);
  if (!records.length) {
    throw new Error(`La tabla ${ZKI_CREW_TABLE} devolvió 0 registros. Activa su permiso SELECT/RLS antes de calcular ZKI.`);
  }
  return records;
}

function personKey(value: unknown) {
  return String(value ?? "").trim().toLocaleLowerCase("es-CO").normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
}

export function normalizePlate(value: unknown) {
  const raw = String(value || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "").replace(/^vh/, "");
  const withoutEquipmentPrefix = /^co[a-z]{3}\d{3}$/.test(raw) ? raw.slice(2) : raw;
  return /^[a-z]{3}\d{3}$/.test(withoutEquipmentPrefix) ? withoutEquipmentPrefix : "";
}
