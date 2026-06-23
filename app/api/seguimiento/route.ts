import { NextResponse } from "next/server";
import type { Vehiculo } from "../../seguimiento/types";
import { getAuthenticatedSession } from "../../lib/authServer";
import { normalizeContractorName } from "../../lib/contractors";
import { supabaseError, supabaseHeaders, supabaseRest, supabaseUserHeaders } from "../../lib/supabaseServer";

const TABLE = "seguimiento_vehiculos";
const PUBLIC_CONTRACTORS: Record<string, string> = {
  logisticos: "Logisticos",
  puntocorona: "Punto Corona",
  surticervezas: "Surti Cervezas",
};

export async function GET(request: Request) {
  try {
    const session = await getAuthenticatedSession();
    const requestedContractor = new URL(request.url).searchParams.get("contratista");
    const publicContractor = PUBLIC_CONTRACTORS[normalizeContractorName(requestedContractor)];

    if (!session && !publicContractor) return NextResponse.json({ error: "Debes iniciar sesión." }, { status: 401 });

    const contractor = session?.contractor || publicContractor;
    const params = new URLSearchParams(
      session?.isAdmin
        ? { select: "contractor,data", order: "updated_at.desc" }
        : { select: "data", contractor: `eq.${contractor}`, order: "updated_at.desc" },
    );
    const response = await fetch(supabaseRest(TABLE, `?${params.toString()}`), {
      headers: session ? supabaseUserHeaders(session.accessToken) : supabaseHeaders(),
      cache: "no-store",
    });
    if (!response.ok) return NextResponse.json({ error: await supabaseError(response) }, { status: response.status });

    const rows = (await response.json()) as { contractor?: string; data: Vehiculo }[];
    return NextResponse.json({ records: rows.map((row) => ({ ...row.data, transportista: row.contractor || row.data.transportista })) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Error consultando seguimiento." }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const session = await getAuthenticatedSession();
    if (!session) return NextResponse.json({ error: "Debes iniciar sesión." }, { status: 401 });
    if (session.isAdmin) return NextResponse.json({ error: "El administrador solo consulta el seguimiento global." }, { status: 403 });
    const { records } = (await request.json()) as { records: Vehiculo[] };
    if (!Array.isArray(records)) return NextResponse.json({ error: "records debe ser una lista." }, { status: 400 });

    const scopedRecords = records.map((record) => ({
      ...record,
      transportista: session.contractor,
    }));

    const rows = scopedRecords.map((record, index) => ({
      record_id: record.recordId || `${record.transporte}-${record.fechaDespacho || record.fechaDt}-${index}`,
      contractor: session.contractor,
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
    const currentParams = new URLSearchParams({ select: "record_id", contractor: `eq.${session.contractor}` });
    const currentResponse = await fetch(supabaseRest(TABLE, `?${currentParams.toString()}`), {
      headers: supabaseUserHeaders(session.accessToken),
      cache: "no-store",
    });
    if (currentResponse.ok) {
      const current = (await currentResponse.json()) as { record_id: string }[];
      const removed = current.map((row) => row.record_id).filter((id) => !keepIds.has(id));
      if (removed.length) {
        const filter = removed.map((id) => `"${id.replaceAll('"', '\\"')}"`).join(",");
        await fetch(supabaseRest(TABLE, `?record_id=in.(${encodeURIComponent(filter)})&contractor=eq.${encodeURIComponent(session.contractor)}`), {
          method: "DELETE",
          headers: supabaseUserHeaders(session.accessToken),
          cache: "no-store",
        });
      }
    }

    const savedParams = new URLSearchParams({ select: "data", contractor: `eq.${session.contractor}`, order: "updated_at.desc" });
    const savedResponse = await fetch(supabaseRest(TABLE, `?${savedParams.toString()}`), {
      headers: supabaseUserHeaders(session.accessToken),
      cache: "no-store",
    });
    if (!savedResponse.ok) return NextResponse.json({ error: await supabaseError(savedResponse) }, { status: savedResponse.status });

    const savedRows = (await savedResponse.json()) as { data: Vehiculo }[];
    return NextResponse.json({ records: savedRows.map((row) => row.data) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Error guardando seguimiento." }, { status: 500 });
  }
}
