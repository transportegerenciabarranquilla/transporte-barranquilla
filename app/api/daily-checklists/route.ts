import { NextResponse } from "next/server";
import { writeAuditLog } from "../../lib/auditLog";
import { getAuthenticatedSession } from "../../lib/authServer";
import type { DailyChecklistRecord } from "../../lib/dailyChecklist";
import { clearServerCache } from "../../lib/serverCache";
import { supabaseError, supabaseReadHeaders, supabaseRest, supabaseUserHeaders } from "../../lib/supabaseServer";

const TABLE = "daily_route_checklists";

export async function GET() {
  try {
    const session = await getAuthenticatedSession();
    if (!session) return NextResponse.json({ error: "Debes iniciar sesión." }, { status: 401 });
    const params = new URLSearchParams(
      session.isAdmin
        ? { select: "contractor,data", order: "updated_at.desc" }
        : { select: "contractor,data", contractor: `eq.${session.contractor}`, order: "updated_at.desc" },
    );
    const response = await fetch(supabaseRest(TABLE, `?${params}`), { cache: "no-store", headers: supabaseReadHeaders(session.accessToken) });
    if (!response.ok) return NextResponse.json({ error: await supabaseError(response) }, { status: response.status });
    const rows = (await response.json()) as Array<{ contractor: string; data: DailyChecklistRecord }>;
    return NextResponse.json({ records: rows.map((row) => ({ ...row.data, contractor: row.contractor })) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Error consultando checklists." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getAuthenticatedSession();
    if (!session) return NextResponse.json({ error: "Debes iniciar sesión." }, { status: 401 });
    if (session.isAdmin || session.isPeople) return NextResponse.json({ error: "El administrador y People solo consultan los checklists." }, { status: 403 });
    const record = (await request.json()) as DailyChecklistRecord;
    const percentage = Number(record?.percentage);
    if (!record || !["departure", "return"].includes(record.type) || !record.date || !Number.isFinite(percentage) || percentage < 0 || percentage > 100) {
      return NextResponse.json({ error: "Completa la fecha y un porcentaje entre 0 y 100." }, { status: 400 });
    }
    const id = `${session.contractor}:${record.type}:${record.date}`;
    const saved: DailyChecklistRecord = { ...record, id, percentage, contractor: session.contractor, updatedAt: new Date().toISOString() };
    const response = await fetch(supabaseRest(TABLE, "?on_conflict=checklist_id"), {
      method: "POST",
      headers: supabaseUserHeaders(session.accessToken, { Prefer: "resolution=merge-duplicates,return=minimal" }),
      body: JSON.stringify([{ checklist_id: id, contractor: session.contractor, checklist_date: record.date, checklist_type: record.type, data: saved, updated_at: saved.updatedAt }]),
      cache: "no-store",
    });
    if (!response.ok) return NextResponse.json({ error: await supabaseError(response) }, { status: response.status });
    clearServerCache(`supabase:${TABLE}:`);
    await writeAuditLog({ action: "checklist_diario_guardado", contractor: session.contractor, details: { type: record.type, date: record.date, percentage }, module: "checklist", recordId: id, request, session });
    return NextResponse.json({ record: saved });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Error guardando checklist." }, { status: 500 });
  }
}
