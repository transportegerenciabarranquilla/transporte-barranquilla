import { NextResponse } from "next/server";
import { writeAuditLog } from "../../lib/auditLog";
import { getAuthenticatedSession } from "../../lib/authServer";
import type { DailyAbsenteeismRecord } from "../../lib/dailyAbsenteeism";
import { supabaseError, supabaseReadHeaders, supabaseRest, supabaseUserHeaders } from "../../lib/supabaseServer";

const TABLE = "daily_absenteeism";

export async function GET() {
  const session = await getAuthenticatedSession();
  if (!session) return NextResponse.json({ error: "Debes iniciar sesión." }, { status: 401 });
  const params = new URLSearchParams(session.isAdmin ? { select: "contractor,data", order: "absence_date.desc" } : { select: "contractor,data", contractor: `eq.${session.contractor}`, order: "absence_date.desc" });
  const response = await fetch(supabaseRest(TABLE, `?${params}`), { cache: "no-store", headers: supabaseReadHeaders(session.accessToken) });
  if (!response.ok) return NextResponse.json({ error: await supabaseError(response) }, { status: response.status });
  const rows = (await response.json()) as Array<{ contractor: string; data: DailyAbsenteeismRecord }>;
  return NextResponse.json({ records: rows.map((row) => ({ ...row.data, contractor: row.contractor })) });
}

export async function POST(request: Request) {
  const session = await getAuthenticatedSession();
  if (!session) return NextResponse.json({ error: "Debes iniciar sesión." }, { status: 401 });
  if (session.isAdmin || session.isPeople) return NextResponse.json({ error: "Solo los contratistas registran ausentismo." }, { status: 403 });
  const input = (await request.json()) as DailyAbsenteeismRecord;
  const scheduled = Math.max(0, Math.trunc(Number(input.scheduled) || 0));
  const absent = Math.max(0, Math.trunc(Number(input.absent) || 0));
  if (!input.date || scheduled <= 0 || absent > scheduled) return NextResponse.json({ error: "Revisa la fecha y las cantidades de personal." }, { status: 400 });
  const id = `${session.contractor}:${input.date}`;
  const record: DailyAbsenteeismRecord = { ...input, id, contractor: session.contractor, scheduled, absent, updatedAt: new Date().toISOString() };
  const response = await fetch(supabaseRest(TABLE, "?on_conflict=absence_id"), {
    method: "POST",
    headers: supabaseUserHeaders(session.accessToken, { Prefer: "resolution=merge-duplicates,return=minimal" }),
    body: JSON.stringify([{ absence_id: id, contractor: session.contractor, absence_date: input.date, data: record, updated_at: record.updatedAt }]),
    cache: "no-store",
  });
  if (!response.ok) return NextResponse.json({ error: await supabaseError(response) }, { status: response.status });
  await writeAuditLog({ action: "ausentismo_diario_guardado", contractor: session.contractor, details: { date: input.date, scheduled, absent }, module: "ausentismo", recordId: id, request, session });
  return NextResponse.json({ record });
}
