import { NextResponse } from "next/server";
import { getAuthenticatedSession } from "../../../lib/authServer";
import { canAccessContractor } from "../../../lib/adminScope";
import { normalizeContractorName } from "../../../lib/contractors";
import { buildRrTripAverages, RR_TRIP_PEOPLE, RR_TRIP_START_DATE, rrTripDate, type RrTripSourceRow } from "../../../lib/rrTripAverage";
import { supabaseReadHeaders, supabaseRest } from "../../../lib/supabaseServer";

const SELECT = "contractor,visited:data->>visitados,company:data->>transportista,rr_cc:data->>cedulaResponsable,aux1_cc:data->>cedulaAuxiliar1,aux2_cc:data->>cedulaAuxiliar2,aux3_cc:data->>cedulaAuxiliar3,dt:data->>transporte,trip:data->>viaje,plate:data->>vehiculo,dispatch_date:data->>fechaDespacho,dt_date:data->>fechaDt,record_date:data->>date,created_at_data:data->>createdAt";
const ATTENDANCE_SELECT = "contractor,dt:data->>dt,created_at_data:data->>createdAt,rr_cc:data->>cedulaResponsable,aux1_cc:data->>cedulaAuxiliar1,aux2_cc:data->>cedulaAuxiliar2,aux3_cc:data->>cedulaAuxiliar3";
const PAGE_SIZE = 1000;

type SourceRow = RrTripSourceRow & { company?: string | null };
type AttendanceRow = Pick<RrTripSourceRow, "contractor" | "dt" | "created_at_data" | "rr_cc" | "aux1_cc" | "aux2_cc" | "aux3_cc">;
type PersonnelRow = { CC?: string | null; CARGO?: string | null; CONTRATISTA?: string | null };

async function readAttendance(accessToken: string) {
  const byRoute = new Map<string, AttendanceRow>();
  let offset = 0;
  while (true) {
    const query = new URLSearchParams({ select: ATTENDANCE_SELECT, order: "updated_at.asc", limit: String(PAGE_SIZE), offset: String(offset) });
    const response = await fetch(supabaseRest("asistencias_ruta", `?${query}`), { headers: supabaseReadHeaders(accessToken), cache: "no-store" });
    if (!response.ok) throw new Error("No se pudieron consultar las asistencias.");
    const batch = await response.json() as AttendanceRow[];
    for (const row of batch) {
      const date = rrTripDate(row);
      const dt = String(row.dt || "").replace(/\D/g, "");
      if (date >= RR_TRIP_START_DATE && dt) {
        byRoute.set(JSON.stringify([normalizeContractorName(row.contractor), dt, date]), row);
      }
    }
    if (batch.length < PAGE_SIZE) break;
    offset += batch.length;
  }
  return byRoute;
}

export async function GET() {
  const session = await getAuthenticatedSession({ allowSiteAdmin: true });
  if (!session) return NextResponse.json({ error: "Debes iniciar sesión." }, { status: 401 });
  if (!session.isAdmin) return NextResponse.json({ error: "Este módulo es exclusivo de administración." }, { status: 403 });

  try {
    const rows: RrTripSourceRow[] = [];
    let offset = 0;
    while (true) {
      const query = new URLSearchParams({ select: SELECT, order: "updated_at.asc,record_id.asc", limit: String(PAGE_SIZE), offset: String(offset) });
      const response = await fetch(supabaseRest("seguimiento_vehiculos", `?${query}`), { headers: supabaseReadHeaders(session.accessToken), cache: "no-store" });
      if (!response.ok) throw new Error("No se pudo consultar Seguimiento.");
      const batch = await response.json() as SourceRow[];
      for (const row of batch) {
        const contractor = row.contractor || row.company || "";
        if (rrTripDate(row) >= RR_TRIP_START_DATE && canAccessContractor(session, contractor)) rows.push({ ...row, contractor });
      }
      if (batch.length < PAGE_SIZE) break;
      offset += batch.length;
    }
    const attendance = await readAttendance(session.accessToken);
    const enrichedRows = rows.map(row => {
      const key = JSON.stringify([normalizeContractorName(row.contractor), String(row.dt || "").replace(/\D/g, ""), rrTripDate(row)]);
      const crew = attendance.get(key);
      return crew ? {
        ...row,
        rr_cc: row.rr_cc || crew.rr_cc,
        aux1_cc: row.aux1_cc || crew.aux1_cc,
        aux2_cc: row.aux2_cc || crew.aux2_cc,
        aux3_cc: row.aux3_cc || crew.aux3_cc,
      } : row;
    });
    const personnelQuery = new URLSearchParams({ select: "CC,CARGO,CONTRATISTA", CC: `in.(${RR_TRIP_PEOPLE.map(person => person.cc).join(",")})`, limit: "100" });
    const personnelResponse = await fetch(supabaseRest("transporte_barranquilla", `?${personnelQuery}`), { headers: supabaseReadHeaders(session.accessToken), cache: "no-store" });
    if (!personnelResponse.ok) throw new Error("No se pudieron consultar los cargos.");
    const personnel = await personnelResponse.json() as PersonnelRow[];
    const cargos = new Map<string, string>();
    for (const row of personnel) {
      const cc = String(row.CC || "").replace(/\D/g, "");
      const cargo = String(row.CARGO || "").trim();
      if (cc && cargo && canAccessContractor(session, row.CONTRATISTA || "") && !cargos.has(cc)) cargos.set(cc, cargo);
    }
    const people = buildRrTripAverages(enrichedRows).map(person => ({ ...person, cargo: cargos.get(person.cc) || "Sin cargo registrado" }));
    return NextResponse.json({ people, sourceRows: rows.length }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "No se pudieron calcular los promedios desde Seguimiento. Intenta de nuevo." }, { status: 503 });
  }
}
