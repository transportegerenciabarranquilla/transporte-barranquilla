import { supabaseError, supabaseHeaders, supabaseRest } from "./supabaseServer";

export type SecurityState = {
  active: boolean;
  activatedAt: string;
  activatedBy: string;
  reason: string;
};

const OPEN_STATE: SecurityState = { active: false, activatedAt: "", activatedBy: "", reason: "" };

export async function readSecurityState(headers: Record<string, string> = supabaseHeaders()) {
  const params = new URLSearchParams({ select: "active,activated_at,activated_by,reason", state_id: "eq.global", limit: "1" });
  const response = await fetch(supabaseRest("app_security_state", `?${params}`), { headers, cache: "no-store" });
  if (!response.ok) {
    // La aplicacion sigue disponible mientras se instala la migracion. El
    // endpoint de escritura si informa el error para no simular un bloqueo.
    return { state: OPEN_STATE, configured: false, error: await supabaseError(response) };
  }
  const [row] = await response.json().catch(() => []);
  return {
    configured: true,
    state: row ? {
      active: row.active === true,
      activatedAt: String(row.activated_at || ""),
      activatedBy: String(row.activated_by || ""),
      reason: String(row.reason || ""),
    } : OPEN_STATE,
  };
}
