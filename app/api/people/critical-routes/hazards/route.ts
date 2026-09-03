import { NextResponse } from "next/server";
import { getAuthenticatedSession } from "../../../../lib/authServer";
import { supabaseAdminHeaders, supabaseError, supabaseRest, supabaseUserHeaders } from "../../../../lib/supabaseServer";

const TYPES = new Set(["cables_bajos", "via_danada", "inundacion", "cierre", "peligro"]);

async function authorized() {
  const session = await getAuthenticatedSession();
  if (!session || (!session.isPeople && !session.isAdmin)) return null;
  return { session, headers: supabaseAdminHeaders() ?? supabaseUserHeaders(session.accessToken) };
}

export async function GET() {
  const auth = await authorized();
  if (!auth) return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  const params = new URLSearchParams({ select: "id,ruta,tipo,descripcion,latitud,longitud,activo", order: "id.desc" });
  const response = await fetch(supabaseRest("ruta_criticas_riesgos", `?${params}`), { headers: auth.headers, cache: "no-store" });
  if (!response.ok) return NextResponse.json({ error: await supabaseError(response) }, { status: response.status });
  return NextResponse.json({ hazards: await response.json() });
}

export async function POST(request: Request) {
  const auth = await authorized();
  if (!auth) return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  const route = String(body.route ?? "").trim();
  const type = String(body.type ?? "peligro");
  const description = String(body.description ?? "").trim();
  const latitude = Number(body.latitude);
  const longitude = Number(body.longitude);
  if (!route || !description || !TYPES.has(type) || !Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
    return NextResponse.json({ error: "Completa correctamente todos los campos." }, { status: 400 });
  }
  const response = await fetch(supabaseRest("ruta_criticas_riesgos"), {
    method: "POST", headers: { ...auth.headers, Prefer: "return=representation" }, cache: "no-store",
    body: JSON.stringify({ ruta: route, tipo: type, descripcion: description, latitud: latitude, longitud: longitude, activo: true }),
  });
  if (!response.ok) return NextResponse.json({ error: await supabaseError(response) }, { status: response.status });
  return NextResponse.json({ hazard: (await response.json())[0] }, { status: 201 });
}

export async function DELETE(request: Request) {
  const auth = await authorized();
  if (!auth) return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  const id = Number(new URL(request.url).searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "Señal inválida." }, { status: 400 });
  const response = await fetch(supabaseRest("ruta_criticas_riesgos", `?id=eq.${id}`), { method: "DELETE", headers: auth.headers, cache: "no-store" });
  if (!response.ok) return NextResponse.json({ error: await supabaseError(response) }, { status: response.status });
  return NextResponse.json({ ok: true });
}
