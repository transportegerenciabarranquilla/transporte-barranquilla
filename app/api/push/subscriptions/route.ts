import { NextResponse } from "next/server";
import { getAuthenticatedSession } from "../../../lib/authServer";
import { supabaseAdminHeaders, supabaseError, supabaseRest, supabaseUserHeaders } from "../../../lib/supabaseServer";

export async function POST(request: Request) {
  const session = await getAuthenticatedSession();
  if (!session?.isAdmin) return NextResponse.json({ error: "Solo el administrador puede activar avisos." }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  const endpoint = String(body.endpoint || "").trim();
  const p256dh = String(body.keys?.p256dh || "").trim();
  const auth = String(body.keys?.auth || "").trim();
  if (!endpoint.startsWith("https://") || !p256dh || !auth) {
    return NextResponse.json({ error: "La suscripción enviada no es válida." }, { status: 400 });
  }

  const headers = supabaseAdminHeaders({ Prefer: "resolution=merge-duplicates,return=minimal" })
    ?? supabaseUserHeaders(session.accessToken, { Prefer: "resolution=merge-duplicates,return=minimal" });
  const response = await fetch(supabaseRest("push_subscriptions", "?on_conflict=endpoint"), {
    method: "POST",
    headers,
    body: JSON.stringify({
      endpoint,
      p256dh,
      auth,
      user_id: session.userId,
      email: session.email,
      contractor: session.contractor,
      is_admin: true,
      enabled: true,
      updated_at: new Date().toISOString(),
    }),
    cache: "no-store",
  });
  if (!response.ok) return NextResponse.json({ error: await supabaseError(response) }, { status: response.status });
  return NextResponse.json({ ok: true });
}
