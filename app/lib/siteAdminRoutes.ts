import { canAccessContractor } from "./adminScope";
import { normalizeComplaintDt } from "./complaints";
import { supabaseError, supabaseReadHeaders, supabaseRest } from "./supabaseServer";
import type { Vehiculo } from "../seguimiento/types";

type Session = { email: string; contractor: string; isAdmin: boolean; accessToken: string };
export async function readSiteAdminRoutes(session: Session) {
  const all: Array<{ contractor: string; data: Vehiculo }> = [];
  for (let offset = 0; ; offset += 1000) {
    const params = new URLSearchParams({ select: "contractor,data", order: "updated_at.desc", limit: "1000", offset: String(offset) });
    const response = await fetch(supabaseRest("seguimiento_vehiculos", `?${params}`), { headers: supabaseReadHeaders(session.accessToken), cache: "no-store" });
    if (!response.ok) throw new Error(await supabaseError(response));
    const page = await response.json() as typeof all;
    all.push(...page);
    if (page.length < 1000) break;
  }
  const rows = all.filter((row) => row.data && canAccessContractor(session, row.contractor));
  // Fuentes sin columna de contratista solo admiten DT inequívocos del CD.
  const foreignDts = new Set(all.filter((row) => !canAccessContractor(session, row.contractor)).map((row) => normalizeComplaintDt(row.data?.transporte)));
  const dts = new Set(rows.map((row) => normalizeComplaintDt(row.data.transporte)).filter((dt) => dt && !foreignDts.has(dt)));
  return { rows, dts };
}
