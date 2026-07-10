import { NextResponse } from "next/server";
import type { AsistenciaRegistro } from "../../../lib/asistenciaStorage";
import { normalizeContractorName } from "../../../lib/contractors";
import { supabaseAdminHeaders, supabaseError, supabaseHeaders, supabaseRest } from "../../../lib/supabaseServer";

const TABLE = "asistencias_ruta";
const PUBLIC_CONTRACTORS = ["logisticos", "puntocorona", "surticervezas"];

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const contractor = url.searchParams.get("contratista");
    const dt = normalizeDt(url.searchParams.get("dt"));
    const date = routeDateValue(url.searchParams.get("fecha") || url.searchParams.get("date") || "");

    if (!contractor || !PUBLIC_CONTRACTORS.includes(normalizeContractorName(contractor))) {
      return NextResponse.json({ error: "Contratista no valido." }, { status: 400 });
    }
    if (!dt) return NextResponse.json({ error: "Ingresa el DT." }, { status: 400 });

    const headers = supabaseAdminHeaders() ?? supabaseHeaders();
    const direct = await findByAttendanceKey(contractor, dt, headers, date);
    if (direct) return NextResponse.json({ records: [direct] });

    const params = new URLSearchParams({
      select: "data",
      contractor: `eq.${contractor}`,
      order: "updated_at.desc",
      limit: "200",
    });
    const response = await fetch(supabaseRest(TABLE, `?${params.toString()}`), {
      headers,
      cache: "no-store",
    });
    if (!response.ok) {
      return NextResponse.json(
        {
          error: `${await supabaseError(response)}. Ejecuta la politica de lectura publica de asistencias en Supabase.`,
        },
        { status: response.status },
      );
    }

    const rows = (await response.json()) as { data: AsistenciaRegistro }[];
    const records = rows.map((row) => row.data).filter((record) => matchesAttendance(record, contractor, dt, date));
    return NextResponse.json({ records });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Error consultando asistencia." }, { status: 500 });
  }
}

async function findByAttendanceKey(contractor: string, dt: string, headers: Record<string, string>, date: string) {
  const params = new URLSearchParams({
    select: "data",
    attendance_key: `eq.${createAttendanceKey(contractor, dt, date)}`,
    limit: "1",
  });
  const response = await fetch(supabaseRest(TABLE, `?${params.toString()}`), {
    headers,
    cache: "no-store",
  });
  if (!response.ok) return null;

  const rows = (await response.json().catch(() => [])) as { data: AsistenciaRegistro }[];
  return rows[0]?.data && matchesAttendance(rows[0].data, contractor, dt, date) ? rows[0].data : null;
}

function createAttendanceKey(contractor: string, dt: string, date: string) {
  return [contractor.toUpperCase().replace(/\s+/g, "-"), dt, date].filter(Boolean).join("-");
}

function matchesAttendance(record: AsistenciaRegistro, contractor: string, dt: string, date: string) {
  const matchesBase = normalizeContractorName(record.contratista) === normalizeContractorName(contractor) && normalizeDt(record.dt) === dt;
  if (!matchesBase) return false;
  return !date || attendanceDateValue(record) === date;
}

function normalizeDt(value: string | null | undefined) {
  return String(value ?? "")
    .replace(/^DT-?/i, "")
    .replace(/\D/g, "");
}

function routeDateValue(value: string | null | undefined) {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  if (value.includes("/")) {
    const [day, month, year] = value.split("/").map(Number);
    if ([day, month, year].every(Number.isFinite)) {
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(parsed.getDate()).padStart(2, "0")}`;
}

function attendanceDateValue(record: AsistenciaRegistro) {
  const keyDate = String(record.llave || "").match(/(\d{4}-\d{2}-\d{2})$/)?.[1] || "";
  return keyDate || routeDateValue(record.createdAt);
}
