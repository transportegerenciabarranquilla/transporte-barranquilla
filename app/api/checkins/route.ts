import { NextResponse } from "next/server";
import type { CheckinCajasRegistro } from "../../lib/checkinStorage";
import { writeAuditLog } from "../../lib/auditLog";
import { getAuthenticatedSession } from "../../lib/authServer";
import { cachedJsonFetch, clearServerCache } from "../../lib/serverCache";
import { supabaseError, supabaseReadHeaders, supabaseRest, supabaseUserHeaders } from "../../lib/supabaseServer";

const TABLE = "checkins_cajas";
const LIST_CACHE_TTL_MS = 45_000;
type CheckinWithContractor = CheckinCajasRegistro & { contratista?: string };

export async function GET() {
  try {
    const session = await getAuthenticatedSession();
    if (!session) return NextResponse.json({ error: "Debes iniciar sesion." }, { status: 401 });
    const params = new URLSearchParams(
      session.isAdmin
        ? { select: "contractor,data", order: "updated_at.desc" }
        : { select: "data", contractor: `eq.${session.contractor}`, order: "updated_at.desc" },
    );
    const url = supabaseRest(TABLE, `?${params.toString()}`);
    const rows = await cachedJsonFetch<{ contractor?: string; data: CheckinWithContractor }[]>(
      `supabase:${TABLE}:list:${session.isAdmin ? "admin" : session.contractor}:${url}`,
      LIST_CACHE_TTL_MS,
      url,
      { headers: supabaseReadHeaders(session.accessToken) },
    );
    return NextResponse.json({ records: rows.map((row) => ({ ...row.data, contratista: row.contractor || row.data.contratista })) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Error consultando check-in." }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const session = await getAuthenticatedSession();
    if (!session) return NextResponse.json({ error: "Debes iniciar sesion." }, { status: 401 });
    if (session.isAdmin) return NextResponse.json({ error: "El administrador solo consulta los checkins globales." }, { status: 403 });
    const { records } = (await request.json()) as { records: CheckinCajasRegistro[] };
    if (!Array.isArray(records)) return NextResponse.json({ error: "records debe ser una lista." }, { status: 400 });
    const rows = records.map((record) => ({
      checkin_id: record.id,
      contractor: session.contractor,
      data: { ...record, contratista: session.contractor },
      updated_at: new Date().toISOString(),
    }));
    if (rows.length) {
      const upsertResponse = await fetch(supabaseRest(TABLE, "?on_conflict=checkin_id"), {
        method: "POST",
        headers: supabaseUserHeaders(session.accessToken, { Prefer: "resolution=merge-duplicates,return=minimal" }),
        body: JSON.stringify(rows),
        cache: "no-store",
      });
      if (!upsertResponse.ok) return NextResponse.json({ error: await supabaseError(upsertResponse) }, { status: upsertResponse.status });
      clearServerCache(`supabase:${TABLE}:`);
      clearServerCache("supabase:admin-seguimiento:");
    }

    const keepIds = new Set(rows.map((row) => row.checkin_id));
    const currentParams = new URLSearchParams({ select: "checkin_id", contractor: `eq.${session.contractor}` });
    const currentResponse = await fetch(supabaseRest(TABLE, `?${currentParams.toString()}`), {
      headers: supabaseUserHeaders(session.accessToken),
      cache: "no-store",
    });
    if (currentResponse.ok) {
      const current = (await currentResponse.json()) as { checkin_id: string }[];
      const removed = current.map((row) => row.checkin_id).filter((id) => !keepIds.has(id));
      if (removed.length) {
        const filter = removed.map((id) => `"${id.replaceAll('"', '\\"')}"`).join(",");
        await fetch(
          supabaseRest(TABLE, `?checkin_id=in.(${encodeURIComponent(filter)})&contractor=eq.${encodeURIComponent(session.contractor)}`),
          {
            method: "DELETE",
            headers: supabaseUserHeaders(session.accessToken),
            cache: "no-store",
          },
        );
        clearServerCache(`supabase:${TABLE}:`);
        clearServerCache("supabase:admin-seguimiento:");
      }
    }

    await writeAuditLog({
      action: "checkin_guardado",
      contractor: session.contractor,
      details: {
        records: records.length,
        dts: records.map((record) => record.dt).slice(0, 30),
      },
      module: "checkin",
      recordId: rows.map((row) => row.checkin_id).slice(0, 5).join(","),
      request,
      session,
    });

    return NextResponse.json({ records });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Error guardando check-in." }, { status: 500 });
  }
}
