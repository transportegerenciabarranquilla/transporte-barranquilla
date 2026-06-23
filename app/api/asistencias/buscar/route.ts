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

    if (!contractor || !PUBLIC_CONTRACTORS.includes(normalizeContractorName(contractor))) {
      return NextResponse.json({ error: "Contratista no valido." }, { status: 400 });
    }
    if (!dt) return NextResponse.json({ error: "Ingresa el DT." }, { status: 400 });

    const headers = supabaseAdminHeaders() ?? supabaseHeaders();
    const direct = await findByAttendanceKey(contractor, dt, headers);
    if (direct) return NextResponse.json({ records: [direct] });

    const params = new URLSearchParams({ select: "data", order: "updated_at.desc", limit: "2000" });
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
    const records = rows.map((row) => row.data).filter((record) => matchesAttendance(record, contractor, dt));
    return NextResponse.json({ records });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Error consultando asistencia." }, { status: 500 });
  }
}

async function findByAttendanceKey(contractor: string, dt: string, headers: Record<string, string>) {
  const params = new URLSearchParams({
    select: "data",
    attendance_key: `eq.${createAttendanceKey(contractor, dt)}`,
    limit: "1",
  });
  const response = await fetch(supabaseRest(TABLE, `?${params.toString()}`), {
    headers,
    cache: "no-store",
  });
  if (!response.ok) return null;

  const rows = (await response.json().catch(() => [])) as { data: AsistenciaRegistro }[];
  return rows[0]?.data && matchesAttendance(rows[0].data, contractor, dt) ? rows[0].data : null;
}

function createAttendanceKey(contractor: string, dt: string) {
  return `${contractor.toUpperCase().replace(/\s+/g, "-")}-${dt}`;
}

function matchesAttendance(record: AsistenciaRegistro, contractor: string, dt: string) {
  return normalizeContractorName(record.contratista) === normalizeContractorName(contractor) && normalizeDt(record.dt) === dt;
}

function normalizeDt(value: string | null | undefined) {
  return String(value ?? "")
    .replace(/^DT-?/i, "")
    .replace(/\D/g, "");
}
