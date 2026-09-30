import { NextResponse } from "next/server";
import { getAuthenticatedSession } from "../../../lib/authServer";
import { isSecurityOwnerEmail } from "../../../lib/contractors";
import { normalizeIp, requestIp } from "../../../lib/securityIp";
import { readIpBlocks } from "../../../lib/securityIpState";
import { supabaseAdminHeaders, supabaseError, supabaseRest, supabaseUserHeaders } from "../../../lib/supabaseServer";

export async function GET(request: Request) {
  try {
    const session = await getAuthenticatedSession({ allowDuringLockdown: true });
    if (!session || !isSecurityOwnerEmail(session.email)) return NextResponse.json({ error: "No autorizado." }, { status: 403 });
    const headers = supabaseAdminHeaders() ?? supabaseUserHeaders(session.accessToken);
    return NextResponse.json({ records: await readIpBlocks(headers), currentIp: requestIp(request.headers) });
  } catch {
    return NextResponse.json({ error: "No se pudo consultar la lista de IP bloqueadas." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getAuthenticatedSession({ allowDuringLockdown: true });
    if (!session || !isSecurityOwnerEmail(session.email)) return NextResponse.json({ error: "No autorizado." }, { status: 403 });
    const body = await request.json().catch(() => null);
    const ip = normalizeIp(body?.ip);
    if (!ip || typeof body?.active !== "boolean") return NextResponse.json({ error: "Indica una dirección IPv4 o IPv6 válida y el estado del bloqueo." }, { status: 400 });
    if (body.active && !requestIp(request.headers)) return NextResponse.json({ error: "Configura una cabecera de IP de confianza antes de activar bloqueos." }, { status: 503 });
    const headers = supabaseAdminHeaders({ Prefer: "resolution=merge-duplicates,return=representation" })
      ?? supabaseUserHeaders(session.accessToken, { Prefer: "resolution=merge-duplicates,return=representation" });
    const response = await fetch(supabaseRest("app_security_state", "?on_conflict=state_id"), {
      method: "POST", headers, cache: "no-store",
      body: JSON.stringify({ state_id: `ip:${ip}`, active: body.active, activated_at: body.active ? new Date().toISOString() : null,
        activated_by: session.email, reason: body.active ? String(body.reason || "Bloqueo por IP").slice(0, 300) : "", updated_at: new Date().toISOString() }),
    });
    if (!response.ok) return NextResponse.json({ error: `No se pudo guardar el bloqueo: ${await supabaseError(response)}` }, { status: response.status });
    const [saved] = await response.json();
    if (saved?.state_id !== `ip:${ip}` || saved.active !== body.active) return NextResponse.json({ error: "El servidor no confirmó el cambio." }, { status: 503 });
    return NextResponse.json({ ok: true, ip, active: saved.active });
  } catch {
    return NextResponse.json({ error: "No se pudo guardar el bloqueo por IP." }, { status: 503 });
  }
}
