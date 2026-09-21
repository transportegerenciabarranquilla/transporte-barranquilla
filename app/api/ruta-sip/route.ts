import { NextResponse } from "next/server";
import { getAuthenticatedSession } from "../../lib/authServer";
import { normalizeContractorName } from "../../lib/contractors";
import { supabaseAdminHeaders, supabaseRest, supabaseUserHeaders } from "../../lib/supabaseServer";
import type { Vehiculo } from "../../seguimiento/types";

type StoredRoute = { record_id: string; contractor?: string; data: Vehiculo | null };

export async function GET() {
  try {
    const session = await getAuthenticatedSession();
    if (!session || (!session.isAdmin && normalizeContractorName(session.contractor) !== "logisticos")) {
      return NextResponse.json({ error: "Ruta SIF está disponible para Logísticos Galapa." }, { status: 403 });
    }

    const params = new URLSearchParams({ select: "record_id,contractor,data", order: "updated_at.desc" });
    const response = await fetch(supabaseRest("seguimiento_vehiculos", `?${params.toString()}`), {
      headers: supabaseAdminHeaders() ?? supabaseUserHeaders(session.accessToken),
      cache: "no-store",
    });
    const body = await response.json().catch(() => []);
    if (!response.ok || !Array.isArray(body)) return NextResponse.json({ error: "No se pudieron consultar las rutas SIP." }, { status: response.status || 500 });

    const allowedContractors = new Set(["logisticos", "surticervezas"]);
    const records = (body as StoredRoute[])
      .filter((row): row is StoredRoute & { data: Vehiculo } => Boolean(row.data))
      .map((row) => ({ ...row.data, recordId: row.record_id, transportista: row.data.transportista || row.contractor || "" }))
      .filter((record) => allowedContractors.has(normalizeContractorName(record.transportista)));

    return NextResponse.json({ records });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudieron consultar las rutas SIP." }, { status: 500 });
  }
}
