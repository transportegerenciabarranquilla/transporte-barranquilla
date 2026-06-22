import { NextResponse } from "next/server";
import type { Vehiculo } from "../../seguimiento/types";
import { getAuthenticatedSession } from "../../lib/authServer";
import { supabaseError, supabaseRest, supabaseUserHeaders } from "../../lib/supabaseServer";

const TABLE = "seguimiento_vehiculos";

export async function GET() {
  try {
    const session = await getAuthenticatedSession();
    if (!session) return NextResponse.json({ error: "Debes iniciar sesión." }, { status: 401 });
    const params = new URLSearchParams({ select: "data", "data->>transportista": `eq.${session.contractor}`, order: "updated_at.desc" });
    const response = await fetch(supabaseRest(TABLE, `?${params.toString()}`), {
      headers: supabaseUserHeaders(session.accessToken),
      cache: "no-store",
    });
    if (!response.ok) return NextResponse.json({ error: await supabaseError(response) }, { status: response.status });
    const rows = (await response.json()) as { data: Vehiculo }[];
    return NextResponse.json({ records: rows.map((row) => row.data) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Error consultando seguimiento." }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const session = await getAuthenticatedSession();
    if (!session) return NextResponse.json({ error: "Debes iniciar sesión." }, { status: 401 });
    const { records } = (await request.json()) as { records: Vehiculo[] };
    if (!Array.isArray(records)) return NextResponse.json({ error: "records debe ser una lista." }, { status: 400 });

    const scopedRecords = records.map((record) => ({
      ...record,
      transportista: session.contractor,
    }));

    const rows = scopedRecords.map((record, index) => ({
      record_id: record.recordId || `${record.transporte}-${record.fechaDespacho || record.fechaDt}-${index}`,
      data: record,
      updated_at: new Date().toISOString(),
    }));
    const upsert = await fetch(supabaseRest(TABLE, "?on_conflict=record_id"), {
      method: "POST",
      headers: supabaseUserHeaders(session.accessToken, { Prefer: "resolution=merge-duplicates,return=minimal" }),
      body: JSON.stringify(rows),
      cache: "no-store",
    });
    if (!upsert.ok) return NextResponse.json({ error: await supabaseError(upsert) }, { status: upsert.status });

    const keepIds = new Set(rows.map((row) => row.record_id));
    const currentParams = new URLSearchParams({ select: "record_id", "data->>transportista": `eq.${session.contractor}` });
    const currentResponse = await fetch(supabaseRest(TABLE, `?${currentParams.toString()}`), { headers: supabaseUserHeaders(session.accessToken), cache: "no-store" });
    if (currentResponse.ok) {
      const current = (await currentResponse.json()) as { record_id: string }[];
      const removed = current.map((row) => row.record_id).filter((id) => !keepIds.has(id));
      if (removed.length) {
        const filter = removed.map((id) => `"${id.replaceAll('"', '\\"')}"`).join(",");
        await fetch(supabaseRest(TABLE, `?record_id=in.(${encodeURIComponent(filter)})`), {
          method: "DELETE",
          headers: supabaseUserHeaders(session.accessToken),
          cache: "no-store",
        });
      }
    }

    return NextResponse.json({ records: scopedRecords });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Error guardando seguimiento." }, { status: 500 });
  }
}
