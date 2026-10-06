import { NextResponse } from "next/server";
import { getAuthenticatedSession } from "../../../lib/authServer";
import { canAccessContractor } from "../../../lib/adminScope";
import { buildRrTripAverages, RR_TRIP_START_DATE, rrTripDate, type RrTripSourceRow } from "../../../lib/rrTripAverage";
import { supabaseReadHeaders, supabaseRest } from "../../../lib/supabaseServer";

const SELECT = "contractor,visited:data->>visitados,company:data->>transportista,rr:data->>nombreResponsable,alt:data->>responsable,aux1:data->>nombreAuxiliar1,aux2:data->>nombreAuxiliar2,aux3:data->>nombreAuxiliar3,dt:data->>transporte,trip:data->>viaje,plate:data->>vehiculo,dispatch_date:data->>fechaDespacho,dt_date:data->>fechaDt,record_date:data->>date,created_at_data:data->>createdAt";
const PAGE_SIZE = 1000;

type SourceRow = RrTripSourceRow & { company?: string | null };

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
    return NextResponse.json({ people: buildRrTripAverages(rows), sourceRows: rows.length }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "No se pudieron calcular los promedios desde Seguimiento. Intenta de nuevo." }, { status: 503 });
  }
}
