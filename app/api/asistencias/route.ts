import { NextResponse } from "next/server";
import type { AsistenciaRegistro } from "../../lib/asistenciaStorage";
import { getAuthenticatedSession } from "../../lib/authServer";
import { normalizeContractorName } from "../../lib/contractors";
import { supabaseError, supabaseHeaders, supabaseRest, supabaseUserHeaders } from "../../lib/supabaseServer";

const TABLE = "asistencias_ruta";

export async function GET() {
  try {
    const session = await getAuthenticatedSession();
    if (!session) return NextResponse.json({ error: "Debes iniciar sesión." }, { status: 401 });
    const params = new URLSearchParams({ select: "data", "data->>contratista": `eq.${session.contractor}`, order: "updated_at.desc" });
    const response = await fetch(supabaseRest(TABLE, `?${params.toString()}`), { headers: supabaseUserHeaders(session.accessToken), cache: "no-store" });
    if (!response.ok) return NextResponse.json({ error: await supabaseError(response) }, { status: response.status });
    const rows = (await response.json()) as { data: AsistenciaRegistro }[];
    return NextResponse.json({ records: rows.map((row) => row.data) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Error consultando asistencias." }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const session = await getAuthenticatedSession();
    const { records } = (await request.json()) as { records: AsistenciaRegistro[] };
    if (!Array.isArray(records)) return NextResponse.json({ error: "records debe ser una lista." }, { status: 400 });
    const publicContractors = ["logisticos", "puntocorona", "surticervezas"];
    const contractor = session?.contractor || records[0]?.contratista;
    if (!contractor || !publicContractors.includes(normalizeContractorName(contractor))) {
      return NextResponse.json({ error: "Contratista no válido." }, { status: 400 });
    }
    if (records.some((record) => normalizeContractorName(record.contratista) !== normalizeContractorName(contractor))) {
      return NextResponse.json({ error: `Solo puedes guardar asistencia de ${contractor}.` }, { status: 403 });
    }
    const rows = records.map((record) => ({ attendance_key: record.llave, data: record, updated_at: new Date().toISOString() }));
    const response = await fetch(supabaseRest(TABLE, "?on_conflict=attendance_key"), {
      method: "POST",
      headers: session
        ? supabaseUserHeaders(session.accessToken, { Prefer: "resolution=merge-duplicates,return=minimal" })
        : supabaseHeaders({ Prefer: "resolution=merge-duplicates,return=minimal" }),
      body: JSON.stringify(rows),
      cache: "no-store",
    });
    if (!response.ok) return NextResponse.json({ error: await supabaseError(response) }, { status: response.status });
    if (!session) return NextResponse.json({ records });

    const keepKeys = new Set(rows.map((row) => row.attendance_key));
    const currentParams = new URLSearchParams({ select: "attendance_key", "data->>contratista": `eq.${session.contractor}` });
    const currentResponse = await fetch(supabaseRest(TABLE, `?${currentParams.toString()}`), { headers: supabaseUserHeaders(session.accessToken), cache: "no-store" });
    if (currentResponse.ok) {
      const current = (await currentResponse.json()) as { attendance_key: string }[];
      const removed = current.map((row) => row.attendance_key).filter((key) => !keepKeys.has(key));
      if (removed.length) {
        const filter = removed.map((key) => `"${key.replaceAll('"', '\\"')}"`).join(",");
        await fetch(supabaseRest(TABLE, `?attendance_key=in.(${encodeURIComponent(filter)})`), {
          method: "DELETE",
          headers: supabaseUserHeaders(session.accessToken),
          cache: "no-store",
        });
      }
    }
    return NextResponse.json({ records });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Error guardando asistencia." }, { status: 500 });
  }
}
