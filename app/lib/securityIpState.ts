import { normalizeIp } from "./securityIp";
import { supabaseAdminHeaders, supabaseError, supabaseHeaders, supabaseRest } from "./supabaseServer";

export type IpBlock = { ip: string; reason: string; activatedAt: string };
const TABLE = "app_security_state";

export async function isIpBlocked(ip: string | null) {
  if (!ip) return false;
  const params = new URLSearchParams({ select: "active", state_id: `eq.ip:${ip}`, limit: "1" });
  const response = await fetch(supabaseRest(TABLE, `?${params}`), { headers: supabaseAdminHeaders() ?? supabaseHeaders(), cache: "no-store" });
  if (!response.ok) throw new Error("No se pudo verificar el bloqueo de IP.");
  const rows = await response.json() as { active: boolean }[];
  return rows[0]?.active === true;
}

export async function readIpBlocks(headers: Record<string, string>) {
  const records: IpBlock[] = [];
  for (let offset = 0; ; offset += 1000) {
    const params = new URLSearchParams({ select: "state_id,reason,activated_at", state_id: "like.ip:*", active: "eq.true", order: "state_id.asc", offset: String(offset), limit: "1000" });
    const response = await fetch(supabaseRest(TABLE, `?${params}`), { headers, cache: "no-store" });
    if (!response.ok) throw new Error(await supabaseError(response));
    const rows = await response.json() as { state_id: string; reason: string; activated_at: string }[];
    for (const row of rows) {
      const ip = normalizeIp(row.state_id.slice(3));
      if (ip) records.push({ ip, reason: row.reason, activatedAt: row.activated_at });
    }
    if (rows.length < 1000) return records;
  }
}
