import { NextResponse } from "next/server";
import { getAuthenticatedSession } from "../../../lib/authServer";
import { isSecurityOwnerEmail } from "../../../lib/contractors";
import { readSecurityState } from "../../../lib/securityState";
import { supabaseAdminHeaders, supabaseError, supabaseRest, supabaseUserHeaders } from "../../../lib/supabaseServer";

export async function GET() {
  const session = await getAuthenticatedSession({ allowDuringLockdown: true });
  const headers = session ? (supabaseAdminHeaders() ?? supabaseUserHeaders(session.accessToken)) : undefined;
  const result = await readSecurityState(headers);
  return NextResponse.json({ ...result, canControl: isSecurityOwnerEmail(session?.email) });
}

export async function POST(request: Request) {
  const session = await getAuthenticatedSession({ allowDuringLockdown: true });
  if (!session || !isSecurityOwnerEmail(session.email)) return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  const body = await request.json().catch(() => ({})) as { active?: boolean; reason?: string };
  if (typeof body.active !== "boolean") return NextResponse.json({ error: "Estado invalido." }, { status: 400 });
  const headers = supabaseAdminHeaders({ Prefer: "resolution=merge-duplicates,return=minimal" })
    ?? supabaseUserHeaders(session.accessToken, { Prefer: "resolution=merge-duplicates,return=minimal" });
  const response = await fetch(supabaseRest("app_security_state", "?on_conflict=state_id"), {
    method: "POST",
    headers,
    body: JSON.stringify({
      state_id: "global",
      active: body.active,
      activated_at: body.active ? new Date().toISOString() : null,
      activated_by: session.email,
      reason: body.active ? String(body.reason || "Bloqueo preventivo de seguridad").slice(0, 300) : "",
      updated_at: new Date().toISOString(),
    }),
    cache: "no-store",
  });
  if (!response.ok) return NextResponse.json({ error: `No se pudo cambiar el bloqueo: ${await supabaseError(response)}` }, { status: response.status });
  return NextResponse.json({ ok: true, active: body.active });
}
