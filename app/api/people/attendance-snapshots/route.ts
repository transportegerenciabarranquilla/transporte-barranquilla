import { NextResponse } from "next/server";
import { getAuthenticatedSession } from "../../../lib/authServer";
import { supabaseError, supabaseRest, supabaseUserHeaders } from "../../../lib/supabaseServer";

type ClockRow = { identificador?: string; nombreCompleto?: string; cargo?: string; contratista?: string; fechaKey?: string; entrada?: string; salida?: string };
type AttendanceSnapshot = { operationalDate: string; fileName: string; rows: ClockRow[]; uploadedAt: string; closedAt: string | null };
type ProfileRecord = { profile_id: string; data: Partial<AttendanceSnapshot> | null };

const PROFILE_PREFIX = "attendance:";

export async function GET() {
  try {
    const session = await getPeopleSession();
    if (session instanceof NextResponse) return session;
    const response = await fetch(
      supabaseRest("people_profiles", `?select=profile_id,data&profile_id=like.${PROFILE_PREFIX}*&order=profile_id.desc`),
      { headers: supabaseUserHeaders(session.accessToken), cache: "no-store" },
    );
    if (!response.ok) return NextResponse.json({ error: await supabaseError(response) }, { status: response.status });
    const records = (await response.json().catch(() => [])) as ProfileRecord[];
    return NextResponse.json({ snapshots: records.map(toSnapshot).filter(Boolean) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo consultar la asistencia." }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const session = await getPeopleSession();
    if (session instanceof NextResponse) return session;
    const body = (await request.json()) as { operationalDate?: string; fileName?: string; rows?: ClockRow[] };
    const today = bogotaToday();
    if (body.operationalDate !== today) return NextResponse.json({ error: `Solo se puede cargar la asistencia de hoy (${today}).` }, { status: 400 });
    if (!body.fileName || !Array.isArray(body.rows) || !body.rows.length) return NextResponse.json({ error: "El archivo no contiene marcaciones válidas para hoy." }, { status: 400 });
    if (body.rows.some((row) => row.fechaKey !== today)) return NextResponse.json({ error: "La carga contiene registros de una fecha diferente a hoy." }, { status: 400 });

    const current = await readSnapshot(today, session.accessToken);
    if (current instanceof NextResponse) return current;
    if (current?.closedAt) return NextResponse.json({ error: "La jornada de hoy ya está cerrada." }, { status: 409 });

    const snapshot: AttendanceSnapshot = { operationalDate: today, fileName: body.fileName, rows: body.rows, uploadedAt: new Date().toISOString(), closedAt: null };
    const response = await fetch(supabaseRest("people_profiles", "?on_conflict=profile_id"), {
      method: "POST",
      headers: supabaseUserHeaders(session.accessToken, { Prefer: "resolution=merge-duplicates,return=minimal" }),
      body: JSON.stringify({ profile_id: `${PROFILE_PREFIX}${today}`, contractor: "attendance", cc: null, data: snapshot, updated_at: snapshot.uploadedAt }),
      cache: "no-store",
    });
    if (!response.ok) return NextResponse.json({ error: await supabaseError(response) }, { status: response.status });
    return NextResponse.json({ snapshot });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo guardar la asistencia." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await getPeopleSession();
    if (session instanceof NextResponse) return session;
    const body = (await request.json()) as { operationalDate?: string };
    const operationalDate = String(body.operationalDate || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(operationalDate) || operationalDate >= bogotaToday()) return NextResponse.json({ error: "Solo se puede cerrar una jornada anterior a hoy." }, { status: 400 });
    const current = await readSnapshot(operationalDate, session.accessToken);
    if (current instanceof NextResponse) return current;
    if (!current) return NextResponse.json({ error: "No existe una jornada abierta para esa fecha." }, { status: 404 });
    if (current.closedAt) return NextResponse.json({ snapshot: current });
    const snapshot = { ...current, closedAt: new Date().toISOString() };
    const response = await fetch(supabaseRest("people_profiles", `?profile_id=eq.${encodeURIComponent(`${PROFILE_PREFIX}${operationalDate}`)}`), {
      method: "PATCH",
      headers: supabaseUserHeaders(session.accessToken),
      body: JSON.stringify({ data: snapshot, updated_at: snapshot.closedAt }),
      cache: "no-store",
    });
    if (!response.ok) return NextResponse.json({ error: await supabaseError(response) }, { status: response.status });
    return NextResponse.json({ snapshot });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo cerrar la jornada." }, { status: 500 });
  }
}

async function getPeopleSession() {
  const session = await getAuthenticatedSession();
  if (!session) return NextResponse.json({ error: "Debes iniciar sesión." }, { status: 401 });
  if (!session.isPeople && !session.isAdmin) return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  return session;
}

async function readSnapshot(operationalDate: string, accessToken: string): Promise<AttendanceSnapshot | NextResponse | null> {
  const response = await fetch(supabaseRest("people_profiles", `?select=profile_id,data&profile_id=eq.${encodeURIComponent(`${PROFILE_PREFIX}${operationalDate}`)}&limit=1`), { headers: supabaseUserHeaders(accessToken), cache: "no-store" });
  if (!response.ok) return NextResponse.json({ error: await supabaseError(response) }, { status: response.status });
  const records = (await response.json().catch(() => [])) as ProfileRecord[];
  return records[0] ? toSnapshot(records[0]) : null;
}

function toSnapshot(record: ProfileRecord): AttendanceSnapshot {
  const operationalDate = String(record.data?.operationalDate || record.profile_id.replace(PROFILE_PREFIX, ""));
  return {
    operationalDate,
    fileName: String(record.data?.fileName || ""),
    rows: Array.isArray(record.data?.rows) ? record.data.rows : [],
    uploadedAt: String(record.data?.uploadedAt || ""),
    closedAt: record.data?.closedAt ? String(record.data.closedAt) : null,
  };
}

function bogotaToday() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}
