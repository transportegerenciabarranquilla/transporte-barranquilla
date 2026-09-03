import { NextResponse } from "next/server";
import { getAuthenticatedSession } from "../../../lib/authServer";
import { effectiveRestEnd, normalizeDocument, type EffectiveRestSourceRow } from "../../../lib/effectiveRest";
import { supabaseError, supabaseRest, supabaseUserHeaders } from "../../../lib/supabaseServer";

type SnapshotRecord = { operational_date?: string; contractor?: string; rows?: EffectiveRestSourceRow[] | null };

export async function GET(request: Request) {
  try {
    const session = await getAuthenticatedSession();
    if (!session) return NextResponse.json({ error: "Debes iniciar sesión." }, { status: 401 });
    if (!session.isPeople && !session.isAdmin) return NextResponse.json({ error: "No autorizado." }, { status: 403 });

    const document = normalizeDocument(new URL(request.url).searchParams.get("document"));
    if (!document) return NextResponse.json({ error: "Ingresa un número de cédula válido." }, { status: 400 });

    const response = await fetch(
      supabaseRest("attendance_snapshots", "?select=operational_date,contractor,rows&order=operational_date.desc&limit=45"),
      { headers: supabaseUserHeaders(session.accessToken), cache: "no-store" },
    );
    if (!response.ok) return NextResponse.json({ error: await supabaseError(response) }, { status: response.status });

    const snapshots = (await response.json().catch(() => [])) as SnapshotRecord[];
    const matchingRows = snapshots.flatMap((snapshot) => (Array.isArray(snapshot.rows) ? snapshot.rows : []).map((row) => ({
      ...row,
      fechaKey: row.fechaKey || snapshot.operational_date || "",
      contratista: row.contratista || snapshot.contractor || "",
    }))).filter((row) => normalizeDocument(row.identificador) === document);
    const matches: Array<{ row: EffectiveRestSourceRow; end: Date }> = [];
    matchingRows.forEach((row) => {
      const end = effectiveRestEnd(row);
      if (end) matches.push({ row, end });
    });
    matches.sort((a, b) => b.end.getTime() - a.end.getTime());

    if (!matches.length) return NextResponse.json({ error: "No encontramos un descanso efectivo para esta cédula en los archivos cargados." }, { status: 404 });

    const latest = matches[0];
    const now = new Date();
    return NextResponse.json({
      person: { document, name: latest.row.nombreCompleto || "", role: latest.row.cargo || "", contractor: latest.row.contratista || "" },
      departureAt: clockDateIso(latest.row.fechaKey || "", latest.row.salida),
      allowedAt: latest.end.toISOString(),
      checkedAt: now.toISOString(),
      allowed: now.getTime() >= latest.end.getTime(),
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo consultar el descanso efectivo." }, { status: 500 });
  }
}

function clockDateIso(date: string, value: unknown) {
  const end = effectiveRestEnd({ fechaKey: date, salida: String(value || "") });
  return end ? new Date(end.getTime() - (10 * 60 * 60 + 10 * 60) * 1000).toISOString() : "";
}
