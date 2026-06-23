import { NextResponse } from "next/server";
import type { ModulacionRegistro } from "../../lib/modulacionStorage";
import { getAuthenticatedSession } from "../../lib/authServer";
import { normalizeContractorName } from "../../lib/contractors";
import { supabaseError, supabaseHeaders, supabaseRest, supabaseUserHeaders } from "../../lib/supabaseServer";

const TABLE = "modulaciones_ruta";
const PUBLIC_CONTRACTORS = ["logisticos", "puntocorona", "surticervezas"];

export async function GET() {
  try {
    const session = await getAuthenticatedSession();
    if (!session) return NextResponse.json({ error: "Debes iniciar sesión." }, { status: 401 });

    const params = new URLSearchParams(
      session.isAdmin
        ? { select: "contractor,data", order: "updated_at.desc" }
        : { select: "data", contractor: `eq.${session.contractor}`, order: "updated_at.desc" },
    );
    const response = await fetch(supabaseRest(TABLE, `?${params.toString()}`), {
      headers: supabaseUserHeaders(session.accessToken),
      cache: "no-store",
    });
    if (!response.ok) return NextResponse.json({ error: await supabaseError(response) }, { status: response.status });

    const rows = (await response.json()) as { contractor?: string; data: ModulacionRegistro }[];
    return NextResponse.json({ records: rows.map((row) => ({ ...row.data, contratista: row.contractor || row.data.contratista })) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Error consultando modulaciones." }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const session = await getAuthenticatedSession();
    if (session?.isAdmin) return NextResponse.json({ error: "El administrador solo consulta las modulaciones globales." }, { status: 403 });
    const { records } = (await request.json()) as { records: ModulacionRegistro[] };
    if (!Array.isArray(records)) return NextResponse.json({ error: "records debe ser una lista." }, { status: 400 });

    const isPublicSubmission = records.length === 1 && Boolean(records[0]?.contratista);
    const contractor = isPublicSubmission ? records[0]?.contratista : session?.contractor || records[0]?.contratista;
    if (!contractor || !PUBLIC_CONTRACTORS.includes(normalizeContractorName(contractor))) {
      return NextResponse.json({ error: "Contratista no válido." }, { status: 400 });
    }
    if (records.some((record) => record.contratista && normalizeContractorName(record.contratista) !== normalizeContractorName(contractor))) {
      return NextResponse.json({ error: `Solo puedes guardar modulaciones de ${contractor}.` }, { status: 403 });
    }

    const rows = records.map((record) => ({
      modulation_id: record.id,
      contractor,
      data: { ...record, contratista: contractor },
      updated_at: new Date().toISOString(),
    }));
    const response = await fetch(supabaseRest(TABLE, isPublicSubmission ? "" : "?on_conflict=modulation_id"), {
      method: "POST",
      headers: !isPublicSubmission && session
        ? supabaseUserHeaders(session.accessToken, { Prefer: "resolution=merge-duplicates,return=minimal" })
        : supabaseHeaders({ Prefer: "return=minimal" }),
      body: JSON.stringify(rows),
      cache: "no-store",
    });
    if (!response.ok) return NextResponse.json({ error: await supabaseError(response) }, { status: response.status });

    if (isPublicSubmission || !session) return NextResponse.json({ records: rows.map((row) => row.data) });

    const savedParams = new URLSearchParams({ select: "data", contractor: `eq.${session.contractor}`, order: "updated_at.desc" });
    const savedResponse = await fetch(supabaseRest(TABLE, `?${savedParams.toString()}`), {
      headers: supabaseUserHeaders(session.accessToken),
      cache: "no-store",
    });
    if (!savedResponse.ok) return NextResponse.json({ error: await supabaseError(savedResponse) }, { status: savedResponse.status });

    const savedRows = (await savedResponse.json()) as { data: ModulacionRegistro }[];
    return NextResponse.json({ records: savedRows.map((row) => row.data) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Error guardando modulaciones." }, { status: 500 });
  }
}
