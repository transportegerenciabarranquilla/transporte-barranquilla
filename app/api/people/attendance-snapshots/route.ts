import { NextResponse } from "next/server";
import { getAuthenticatedSession } from "../../../lib/authServer";
import { supabaseError, supabaseRest, supabaseUserHeaders } from "../../../lib/supabaseServer";

type ClockRow = { identificador?: string; nombreCompleto?: string; cargo?: string; contratista?: string; fechaKey?: string; entrada?: string; salida?: string; novedad?: string; relevoUsado?: boolean };
type AttendanceSnapshot = { operationalDate: string; fileName: string; rows: ClockRow[]; uploadedAt: string; closedAt: string | null };
type AttendanceRecord = { operational_date: string; contractor: string; file_name: string; rows: ClockRow[] | null; uploaded_at: string; closed_at: string | null };

export async function GET() {
  try {
    const session = await getAuthenticatedSession();
    if (!session) return NextResponse.json({ error: "Debes iniciar sesión." }, { status: 401 });
    const response = await fetch(
      supabaseRest("attendance_snapshots", "?select=operational_date,contractor,file_name,rows,uploaded_at,closed_at&order=operational_date.desc"),
      { headers: supabaseUserHeaders(session.accessToken), cache: "no-store" },
    );
    if (!response.ok) return NextResponse.json({ error: await supabaseError(response) }, { status: response.status });
    const records = (await response.json().catch(() => [])) as AttendanceRecord[];
    return NextResponse.json({ snapshots: records.map(toSnapshot) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo consultar la asistencia." }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const session = await getAuthenticatedSession();
    if (!session) return NextResponse.json({ error: "Debes iniciar sesión." }, { status: 401 });
    const body = (await request.json()) as { operationalDate?: string; fileName?: string; rows?: ClockRow[]; importMode?: "attendance" | "absence" };
    const today = bogotaToday();
    const operationalDate = String(body.operationalDate || "");
    const historicalImport = body.importMode === "absence";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(operationalDate) || operationalDate > today) return NextResponse.json({ error: "La fecha de la plantilla no es válida o pertenece al futuro." }, { status: 400 });
    if (!historicalImport && operationalDate !== today) return NextResponse.json({ error: `Solo se puede cargar la asistencia de hoy (${today}). Para fechas anteriores selecciona “Ausentismo y descanso”.` }, { status: 400 });
    if (!body.fileName || !Array.isArray(body.rows) || !body.rows.length) return NextResponse.json({ error: "El archivo no contiene marcaciones válidas." }, { status: 400 });
    if (body.rows.some((row) => row.fechaKey !== operationalDate)) return NextResponse.json({ error: "La carga contiene registros de una fecha diferente a la seleccionada." }, { status: 400 });
    const requestedRows = body.rows;
    const contractor = session.isPeople || session.isAdmin ? String(requestedRows[0]?.contratista || "Logísticos").trim() : session.contractor;
    const uploadedRows = requestedRows.map((row) => ({ ...row, contratista: contractor }));

    const current = await readSnapshot(operationalDate, contractor, session.accessToken);
    if (current instanceof NextResponse) return current;
    if (current?.closedAt && !historicalImport) return NextResponse.json({ error: "La jornada de hoy ya está cerrada." }, { status: 409 });
    // GeoVictoria es la fuente base. La plantilla histórica de ausentismo y
    // descanso la complementa sin borrar marcaciones que ya existan. Si no se
    // carga esa plantilla, las tres tablas continúan usando GeoVictoria.
    const rows = historicalImport && current
      ? mergeAttendanceRows(current.rows, uploadedRows)
      : uploadedRows;
    const snapshot: AttendanceSnapshot = { operationalDate, fileName: body.fileName, rows, uploadedAt: new Date().toISOString(), closedAt: current?.closedAt || null };
    const response = await fetch(supabaseRest("attendance_snapshots", "?on_conflict=operational_date,contractor"), {
      method: "POST",
      headers: supabaseUserHeaders(session.accessToken, { Prefer: "resolution=merge-duplicates,return=minimal" }),
      body: JSON.stringify({ operational_date: operationalDate, contractor, file_name: snapshot.fileName, rows, uploaded_by: session.userId, uploaded_at: snapshot.uploadedAt, closed_at: snapshot.closedAt }),
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
    const session = await getAuthenticatedSession();
    if (!session) return NextResponse.json({ error: "Debes iniciar sesión." }, { status: 401 });
    const body = (await request.json()) as { operationalDate?: string; personKey?: string; usedAsRelay?: boolean };
    const operationalDate = String(body.operationalDate || "");
    if (body.personKey && typeof body.usedAsRelay === "boolean") {
      const contractor = session.contractor;
      const current = await readSnapshot(operationalDate, contractor, session.accessToken);
      if (current instanceof NextResponse) return current;
      if (!current) return NextResponse.json({ error: "No existe asistencia para esa fecha." }, { status: 404 });
      const rows = current.rows.map((row) => attendanceRowKey(row) === body.personKey ? { ...row, relevoUsado: body.usedAsRelay } : row);
      const response = await fetch(supabaseRest("attendance_snapshots", `?operational_date=eq.${operationalDate}&contractor=eq.${encodeURIComponent(contractor)}`), { method: "PATCH", headers: supabaseUserHeaders(session.accessToken), body: JSON.stringify({ rows, uploaded_at: new Date().toISOString() }), cache: "no-store" });
      if (!response.ok) return NextResponse.json({ error: await supabaseError(response) }, { status: response.status });
      return NextResponse.json({ snapshot: { ...current, rows } });
    }
    if (!session.isPeople && !session.isAdmin) return NextResponse.json({ error: "No autorizado." }, { status: 403 });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(operationalDate) || operationalDate >= bogotaToday()) return NextResponse.json({ error: "Solo se puede cerrar una jornada anterior a hoy." }, { status: 400 });
    const closedAt = new Date().toISOString();
    const response = await fetch(supabaseRest("attendance_snapshots", `?operational_date=eq.${operationalDate}`), {
      method: "PATCH",
      headers: supabaseUserHeaders(session.accessToken),
      body: JSON.stringify({ closed_at: closedAt }),
      cache: "no-store",
    });
    if (!response.ok) return NextResponse.json({ error: await supabaseError(response) }, { status: response.status });
    return NextResponse.json({ snapshot: { operationalDate, closedAt } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo cerrar la jornada." }, { status: 500 });
  }
}

function attendanceRowKey(row: ClockRow) {
  const id = String(row.identificador || "").replace(/\D/g, "");
  if (id) return `id:${id}`;
  const name = String(row.nombreCompleto || "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return name ? `name:${name}` : "";
}

function mergeAttendanceRows(baseRows: ClockRow[], supplementalRows: ClockRow[]) {
  const merged = new Map<string, ClockRow>();
  baseRows.forEach((row, index) => merged.set(attendanceRowKey(row) || `base:${index}`, row));
  supplementalRows.forEach((row, index) => {
    const key = attendanceRowKey(row) || `supplemental:${index}`;
    const current = merged.get(key);
    if (!current) {
      merged.set(key, row);
      return;
    }
    merged.set(key, {
      ...current,
      ...Object.fromEntries(Object.entries(row).filter(([, value]) => value !== undefined && value !== null && String(value).trim() !== "")),
      // Una celda vacía en la plantilla complementaria no debe eliminar una
      // marcación real que ya vino de GeoVictoria.
      entrada: row.entrada?.trim() || current.entrada || "",
      salida: row.salida?.trim() || current.salida || "",
      relevoUsado: row.relevoUsado ?? current.relevoUsado,
    });
  });
  return Array.from(merged.values());
}

async function readSnapshot(operationalDate: string, contractor: string, accessToken: string): Promise<AttendanceSnapshot | NextResponse | null> {
  const response = await fetch(supabaseRest("attendance_snapshots", `?select=operational_date,contractor,file_name,rows,uploaded_at,closed_at&operational_date=eq.${operationalDate}&contractor=eq.${encodeURIComponent(contractor)}&limit=1`), { headers: supabaseUserHeaders(accessToken), cache: "no-store" });
  if (!response.ok) return NextResponse.json({ error: await supabaseError(response) }, { status: response.status });
  const records = (await response.json().catch(() => [])) as AttendanceRecord[];
  return records[0] ? toSnapshot(records[0]) : null;
}

function toSnapshot(record: AttendanceRecord): AttendanceSnapshot {
  return {
    operationalDate: String(record.operational_date || ""),
    fileName: String(record.file_name || ""),
    rows: Array.isArray(record.rows) ? record.rows : [],
    uploadedAt: String(record.uploaded_at || ""),
    closedAt: record.closed_at ? String(record.closed_at) : null,
  };
}

function bogotaToday() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}
