import { NextResponse } from "next/server";
import type { AsistenciaRegistro } from "../../lib/asistenciaStorage";
import { getAuthenticatedSession } from "../../lib/authServer";
import { normalizeContractorName } from "../../lib/contractors";
import { supabaseAdminHeaders, supabaseError, supabaseHeaders, supabaseRest, supabaseUserHeaders } from "../../lib/supabaseServer";

const TABLE = "asistencias_ruta";

export async function GET() {
  try {
    const session = await getAuthenticatedSession();
    if (!session) return NextResponse.json({ error: "Debes iniciar sesión." }, { status: 401 });
    const params = new URLSearchParams({ select: "data", contractor: `eq.${session.contractor}`, order: "updated_at.desc" });
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
    const isPublicSubmission = records.length === 1 && Boolean(records[0]?.contratista);
    const contractor = isPublicSubmission ? records[0]?.contratista : session?.contractor || records[0]?.contratista;
    if (!contractor || !publicContractors.includes(normalizeContractorName(contractor))) {
      return NextResponse.json({ error: "Contratista no válido." }, { status: 400 });
    }
    if (records.some((record) => normalizeContractorName(record.contratista) !== normalizeContractorName(contractor))) {
      return NextResponse.json({ error: `Solo puedes guardar asistencia de ${contractor}.` }, { status: 403 });
    }
    const rows = records.map((record) => ({
      attendance_key: record.llave,
      contractor,
      data: { ...record, contratista: contractor },
      updated_at: new Date().toISOString(),
    }));
    const response = await fetch(supabaseRest(TABLE, isPublicSubmission ? "" : "?on_conflict=attendance_key"), {
      method: "POST",
      headers: getWriteHeaders(session?.accessToken, isPublicSubmission),
      body: JSON.stringify(rows),
      cache: "no-store",
    });
    if (!response.ok) return NextResponse.json({ error: await supabaseError(response) }, { status: response.status });
    if (isPublicSubmission || !session) return NextResponse.json({ records });

    const keepKeys = new Set(rows.map((row) => row.attendance_key));
    const currentParams = new URLSearchParams({ select: "attendance_key", contractor: `eq.${session.contractor}` });
    const currentResponse = await fetch(supabaseRest(TABLE, `?${currentParams.toString()}`), { headers: supabaseUserHeaders(session.accessToken), cache: "no-store" });
    if (currentResponse.ok) {
      const current = (await currentResponse.json()) as { attendance_key: string }[];
      const removed = current.map((row) => row.attendance_key).filter((key) => !keepKeys.has(key));
      if (removed.length) {
        const filter = removed.map((key) => `"${key.replaceAll('"', '\\"')}"`).join(",");
        await fetch(supabaseRest(TABLE, `?attendance_key=in.(${encodeURIComponent(filter)})&contractor=eq.${encodeURIComponent(session.contractor)}`), {
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

function getWriteHeaders(accessToken: string | undefined, isPublicSubmission: boolean) {
  if (!isPublicSubmission && accessToken) {
    return supabaseUserHeaders(accessToken, { Prefer: "resolution=merge-duplicates,return=minimal" });
  }

  return supabaseAdminHeaders({ Prefer: "return=minimal" }) || supabaseHeaders({ Prefer: "return=minimal" });
}
