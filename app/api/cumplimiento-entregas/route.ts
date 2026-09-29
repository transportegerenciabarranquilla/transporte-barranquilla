import { NextResponse } from "next/server";
import { getAuthenticatedSession } from "../../lib/authServer";
import { canAccessDeliveryCompliance, contractorLabel } from "../../lib/contractors";
import { readRoutePerformanceFile } from "../../lib/routePerformanceFile";
import { deliveryComplianceRows } from "../../lib/deliveryCompliance";
import { readAdminTvRows } from "../../lib/adminTvRows";
import { supabaseReadHeaders } from "../../lib/supabaseServer";
import type { PerformanceVehicle } from "../../lib/routePerformanceImport";

export async function GET() {
  try {
    const session = await getAuthenticatedSession();
    if (!session) return NextResponse.json({ error: "Debes iniciar sesión." }, { status: 401 });
    if (!canAccessDeliveryCompliance(session)) return NextResponse.json({ error: "No autorizado." }, { status: 403 });
    const file = await readRoutePerformanceFile();
    if (!file.rows.length) return NextResponse.json(file);
    const fields = ["vehiculo", "fechaDespacho", "fechaDt", "date", "createdAt", "viaje", "nombreResponsable", "responsable", "nombreAuxiliar1", "cedulaResponsable", "cedulaAuxiliar1", "transportista", "transporte"];
    const params = new URLSearchParams({
      select: `contractor,${fields.map((field) => `${field}:data->>${field}`).join(",")}`,
      order: "updated_at.desc,record_id.desc", limit: "1000",
    });
    const records = await readAdminTvRows<PerformanceVehicle & { contractor?: string }>("seguimiento_vehiculos", params, supabaseReadHeaders(session.accessToken));
    const rows = deliveryComplianceRows(file.rows, records.map((record) => ({ ...record, transportista: contractorLabel(record.contractor || record.transportista) })));
    return NextResponse.json({ rows, fileName: file.fileName, uploadedAt: file.uploadedAt });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo consultar el cumplimiento de entregas." }, { status: 500 });
  }
}
