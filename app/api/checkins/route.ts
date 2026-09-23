import { allowedContractors } from "../../lib/adminScope";
import { scopeCheckinQuery } from "../../lib/checkinScope";
import { NextResponse } from "next/server";
import type { CheckinCajasRegistro } from "../../lib/checkinStorage";
import { writeAuditLog } from "../../lib/auditLog";
import { getAuthenticatedSession } from "../../lib/authServer";
import { isOperationalContractor, normalizeContractorName } from "../../lib/contractors";
import { cachedJsonFetch, clearServerCache } from "../../lib/serverCache";
import { supabaseAdminHeaders, supabaseError, supabaseReadHeaders, supabaseRest, supabaseUserHeaders } from "../../lib/supabaseServer";

const TABLE = "checkins_cajas";
const LIST_CACHE_TTL_MS = 0;
type CheckinWithContractor = CheckinCajasRegistro & { contratista?: string };

export async function GET() {
  try {
    const session = await getAuthenticatedSession({ allowSiteAdmin: true });
    if (!session) return NextResponse.json({ error: "Debes iniciar sesion." }, { status: 401 });
    const params = scopeCheckinQuery(new URLSearchParams({
      select: "contractor,data", order: "updated_at.desc,checkin_id.asc",
    }), session.isAdmin ? allowedContractors(session) : [session.contractor]);
    const rows: { contractor?: string; data: CheckinWithContractor }[] = [];
    const pageSize = 1000;
    const headers = supabaseReadHeaders(session.accessToken);
    for (let offset = 0; ; offset += pageSize) {
      const pageParams = new URLSearchParams(params);
      pageParams.set("limit", String(pageSize));
      pageParams.set("offset", String(offset));
      const url = supabaseRest(TABLE, `?${pageParams.toString()}`);
      const page = await cachedJsonFetch<typeof rows>(
        `supabase:${TABLE}:list:${session.isAdmin ? "admin" : session.contractor}:${url}`,
        LIST_CACHE_TTL_MS,
        url,
        { headers },
      );
      rows.push(...page);
      if (page.length < pageSize) break;
    }
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
    if (!isOperationalContractor(session.contractor)) return NextResponse.json({ error: "Solo las contratistas pueden guardar checkins." }, { status: 403 });
    const { records, deleteMissing = false } = (await request.json()) as {
      records: CheckinCajasRegistro[];
      deleteMissing?: boolean;
    };
    if (!Array.isArray(records)) return NextResponse.json({ error: "records debe ser una lista." }, { status: 400 });
    if (records.some((record) => !record || typeof record.id !== "string" || !record.id.trim() || typeof record.dt !== "string" || !/^\d+$/.test(record.dt) || !Number.isSafeInteger(record.totalCajas) || record.totalCajas < 0)) {
      return NextResponse.json({ error: "Cada checkin debe tener un identificador, DT y cantidad entera de cajas válida." }, { status: 400 });
    }
    const headers = checkinWriteHeaders(session.accessToken, session.contractor);
    // Los IDs son globales. Antes de escribir con permisos del servidor,
    // impedir que un ID ajeno cambie de contratista mediante el upsert.
    if (records.length) {
      const ids = records.map((record) => `"${record.id.replaceAll('"', '\\"')}"`).join(",");
      const params = new URLSearchParams({
        select: "checkin_id,contractor,data",
        checkin_id: `in.(${ids})`,
      });
      const existingResponse = await fetch(supabaseRest(TABLE, `?${params}`), { headers, cache: "no-store" });
      if (!existingResponse.ok) return NextResponse.json({ error: await supabaseError(existingResponse) }, { status: existingResponse.status });
      const existing = await existingResponse.json() as { contractor: string | null; data?: CheckinWithContractor }[];
      if (existing.some((row) => normalizeContractorName(row.contractor ?? row.data?.contratista) !== normalizeContractorName(session.contractor))) {
        return NextResponse.json({ error: "No puedes modificar checkins de otra contratista." }, { status: 403 });
      }
    }
    const rows = records.map((record) => ({
      checkin_id: record.id,
      contractor: session.contractor,
      data: { ...record, contratista: session.contractor },
      updated_at: new Date().toISOString(),
    }));
    if (rows.length) {
      const upsertResponse = await fetch(supabaseRest(TABLE, "?on_conflict=checkin_id"), {
        method: "POST",
        headers: { ...headers, Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify(rows),
        cache: "no-store",
      });
      if (!upsertResponse.ok) return NextResponse.json({ error: await supabaseError(upsertResponse) }, { status: upsertResponse.status });
      clearServerCache(`supabase:${TABLE}:`);
      clearServerCache("supabase:admin-seguimiento:");

      // Confirmar con los mismos permisos de lectura usados al recargar.
      // Un HTTP exitoso por sí solo no confirma que el check-in sea recuperable.
      for (let offset = 0; offset < rows.length; offset += 100) {
        const batch = rows.slice(offset, offset + 100);
        const ids = batch.map((row) => `"${row.checkin_id.replaceAll('"', '\\"')}"`).join(",");
        const params = scopeCheckinQuery(new URLSearchParams({
          select: "checkin_id,data",
          checkin_id: `in.(${ids})`,
        }), [session.contractor]);
        const confirmation = await fetch(supabaseRest(TABLE, `?${params}`), {
          headers: supabaseReadHeaders(session.accessToken),
          cache: "no-store",
        });
        if (!confirmation.ok) return NextResponse.json({ error: await supabaseError(confirmation) }, { status: confirmation.status });
        const saved = await confirmation.json() as { checkin_id: string; data: CheckinCajasRegistro }[];
        if (!Array.isArray(saved) || batch.some((row) => !saved.some((item) =>
          item.checkin_id === row.checkin_id && item.data?.dt === row.data.dt && item.data?.totalCajas === row.data.totalCajas
        ))) {
          return NextResponse.json({ error: "No se pudo confirmar el checkin al consultar Supabase. Recarga y verifica el registro antes de intentar nuevamente." }, { status: 502 });
        }
      }
    }

    if (deleteMissing) {
      const keepIds = new Set(rows.map((row) => row.checkin_id));
      const currentParams = scopeCheckinQuery(new URLSearchParams({ select: "checkin_id" }), [session.contractor]);
      const currentResponse = await fetch(supabaseRest(TABLE, `?${currentParams.toString()}`), {
        headers,
        cache: "no-store",
      });
      if (currentResponse.ok) {
        const current = (await currentResponse.json()) as { checkin_id: string }[];
        const removed = current.map((row) => row.checkin_id).filter((id) => !keepIds.has(id));
        if (removed.length) {
          const filter = removed.map((id) => `"${id.replaceAll('"', '\\"')}"`).join(",");
          const deleteParams = scopeCheckinQuery(new URLSearchParams({ checkin_id: `in.(${filter})` }), [session.contractor]);
          await fetch(
            supabaseRest(TABLE, `?${deleteParams}`),
            {
              method: "DELETE",
              headers,
              cache: "no-store",
            },
          );
          clearServerCache(`supabase:${TABLE}:`);
          clearServerCache("supabase:admin-seguimiento:");
        }
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

    return NextResponse.json({ records: rows.map((row) => row.data) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Error guardando check-in." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const session = await getAuthenticatedSession();
    if (!session) return NextResponse.json({ error: "Debes iniciar sesion." }, { status: 401 });
    if (session.isAdmin) return NextResponse.json({ error: "El administrador solo consulta los checkins globales." }, { status: 403 });
    if (!isOperationalContractor(session.contractor)) return NextResponse.json({ error: "Solo las contratistas pueden eliminar checkins." }, { status: 403 });

    const { ids } = (await request.json()) as { ids?: string[] };
    const cleanIds = Array.isArray(ids) ? ids.map(String).filter(Boolean) : [];
    if (!cleanIds.length) return NextResponse.json({ deleted: 0 });

    const filter = cleanIds.map((id) => `"${id.replaceAll('"', '\\"')}"`).join(",");
    const params = scopeCheckinQuery(new URLSearchParams({ checkin_id: `in.(${filter})` }), [session.contractor]);
    const response = await fetch(
      supabaseRest(TABLE, `?${params}`),
      {
        method: "DELETE",
        headers: checkinWriteHeaders(session.accessToken, session.contractor),
        cache: "no-store",
      },
    );
    if (!response.ok) return NextResponse.json({ error: await supabaseError(response) }, { status: response.status });

    clearServerCache(`supabase:${TABLE}:`);
    clearServerCache("supabase:admin-seguimiento:");
    return NextResponse.json({ deleted: cleanIds.length });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Error eliminando check-in." }, { status: 500 });
  }
}

function checkinWriteHeaders(accessToken: string, contractor: string) {
  // HL aún puede tener las políticas históricas sin checkins_cajas.
  // La sesión y el alcance se validan antes de usar estos permisos.
  return (normalizeContractorName(contractor) === "hllogisticos" ? supabaseAdminHeaders() : null)
    ?? supabaseUserHeaders(accessToken);
}
