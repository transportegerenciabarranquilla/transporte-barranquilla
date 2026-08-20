import { NextResponse } from "next/server";
import { getAuthenticatedSession } from "../../../lib/authServer";
import { normalizeComplaintDt } from "../../../lib/complaints";
import { supabaseError, supabaseReadHeaders, supabaseRest, supabaseUserHeaders } from "../../../lib/supabaseServer";
import type { Vehiculo } from "../../../seguimiento/types";

export async function GET() {
  const session = await getAuthenticatedSession();
  if (!session) return NextResponse.json({ error: "Debes iniciar sesion." }, { status: 401 });
  if (!session.isAdmin) return NextResponse.json({ error: "Solo administracion puede consultar Cashell." }, { status: 403 });

  const records: Record<string, unknown>[] = [];
  const pageSize = 1000;
  for (let offset = 0; ; offset += pageSize) {
    const params = new URLSearchParams({ select: "*", limit: String(pageSize), offset: String(offset) });
    const response = await fetch(supabaseRest("CASHELL", `?${params}`), {
      headers: supabaseReadHeaders(session.accessToken),
      cache: "no-store",
    });
    if (!response.ok) return NextResponse.json({ error: `Tabla cashell: ${await supabaseError(response)}` }, { status: response.status });
    const page = await response.json() as Record<string, unknown>[];
    records.push(...page);
    if (page.length < pageSize) break;
  }

  return NextResponse.json({ records });
}

export async function POST(request: Request) {
  const session = await getAuthenticatedSession();
  if (!session) return NextResponse.json({ error: "Debes iniciar sesion." }, { status: 401 });
  if (!session.isAdmin) return NextResponse.json({ error: "Solo administracion puede cruzar Seguimiento." }, { status: 403 });
  const body = await request.json().catch(() => ({})) as { dts?: unknown[] };
  const dts = Array.from(new Set((body.dts || []).map(normalizeComplaintDt).filter(Boolean)));
  if (!dts.length) return NextResponse.json({ records: [] });
  if (dts.length > 5000) return NextResponse.json({ error: "El archivo supera 5.000 DT unicos." }, { status: 413 });

  const records: Array<{ contractor: string; data: Vehiculo }> = [];
  for (let index = 0; index < dts.length; index += 500) {
    const response = await fetch(supabaseRest("rpc/find_complaint_tracking"), {
      method: "POST",
      headers: supabaseUserHeaders(session.accessToken),
      body: JSON.stringify({ complaint_dts: dts.slice(index, index + 500) }),
      cache: "no-store",
    });
    if (!response.ok) return NextResponse.json({ error: `Seguimiento: ${await supabaseError(response)}` }, { status: response.status });
    records.push(...await response.json() as Array<{ contractor: string; data: Vehiculo }>);
  }
  return NextResponse.json({ records });
}
