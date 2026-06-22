import { NextResponse } from "next/server";
import type { ModulacionRegistro } from "../../lib/modulacionStorage";
import { getAuthenticatedSession } from "../../lib/authServer";
import { supabaseError, supabaseRest, supabaseUserHeaders } from "../../lib/supabaseServer";

const TABLE = "modulaciones_ruta";

export async function GET() {
  try {
    const session = await getAuthenticatedSession();
    if (!session) return NextResponse.json({ error: "Debes iniciar sesión." }, { status: 401 });
    const params = new URLSearchParams({ select: "data", "data->>contratista": `eq.${session.contractor}`, order: "updated_at.desc" });
    const response = await fetch(supabaseRest(TABLE, `?${params.toString()}`), { headers: supabaseUserHeaders(session.accessToken), cache: "no-store" });
    if (!response.ok) return NextResponse.json({ error: await supabaseError(response) }, { status: response.status });
    const rows = (await response.json()) as { data: ModulacionRegistro }[];
    return NextResponse.json({ records: rows.map((row) => row.data) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Error consultando modulaciones." }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const session = await getAuthenticatedSession();
    if (!session) return NextResponse.json({ error: "Debes iniciar sesión." }, { status: 401 });
    const { records } = (await request.json()) as { records: ModulacionRegistro[] };
    if (!Array.isArray(records)) return NextResponse.json({ error: "records debe ser una lista." }, { status: 400 });
    const rows = records.map((record) => ({
      modulation_id: record.id,
      data: { ...record, contratista: session.contractor },
      updated_at: new Date().toISOString(),
    }));
    const response = await fetch(supabaseRest(TABLE, "?on_conflict=modulation_id"), {
      method: "POST",
      headers: supabaseUserHeaders(session.accessToken, { Prefer: "resolution=merge-duplicates,return=minimal" }),
      body: JSON.stringify(rows),
      cache: "no-store",
    });
    if (!response.ok) return NextResponse.json({ error: await supabaseError(response) }, { status: response.status });
    return NextResponse.json({ records });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Error guardando modulaciones." }, { status: 500 });
  }
}
