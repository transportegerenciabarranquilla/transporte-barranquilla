import { NextResponse } from "next/server";
import { getAuthenticatedSession } from "../../../lib/authServer";
import { supabaseAdminHeaders, supabaseError, supabaseRest, supabaseUserHeaders } from "../../../lib/supabaseServer";

const PAGE_SIZE = 1_000;

export async function GET() {
  try {
    const session = await getAuthenticatedSession();
    if (!session) return NextResponse.json({ error: "Debes iniciar sesión." }, { status: 401 });
    if (!session.isPeople && !session.isAdmin) return NextResponse.json({ error: "No autorizado." }, { status: 403 });
    const headers = supabaseAdminHeaders() ?? supabaseUserHeaders(session.accessToken);
    const [rows, history] = await Promise.all([readRows("ZKI", headers), readHistory(headers)]);
    return NextResponse.json({ rows, history, source: { table: "ZKI", rows: rows.length, columns: rows[0] ? Object.keys(rows[0]) : [] } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo consultar ZKI." }, { status: 500 });
  }
}

async function readRows(table: string, headers: Record<string, string>) {
  const rows: Record<string, unknown>[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const query = new URLSearchParams({ select: "*", limit: String(PAGE_SIZE), offset: String(offset) });
    const response = await fetch(supabaseRest(table, `?${query}`), { headers, cache: "no-store" });
    if (!response.ok) throw new Error(`${table}: ${await supabaseError(response)}`);
    const page = (await response.json()) as Record<string, unknown>[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
}

async function readHistory(headers: Record<string, string>) {
  const select = [
    "vehiculo:data->>vehiculo", "territorio:data->>territorio", "clientes:data->>clientes",
    "visitados:data->>visitados", "fechaDespacho:data->>fechaDespacho",
    "nombreResponsable:data->>nombreResponsable", "responsable:data->>responsable",
    "cedulaResponsable:data->>cedulaResponsable", "nombreAuxiliar1:data->>nombreAuxiliar1",
    "cedulaAuxiliar1:data->>cedulaAuxiliar1",
  ].join(",");
  const query = new URLSearchParams({ select, order: "updated_at.desc", limit: "5000" });
  const response = await fetch(supabaseRest("seguimiento_vehiculos", `?${query}`), { headers, cache: "no-store" });
  if (!response.ok) throw new Error(`Seguimiento: ${await supabaseError(response)}`);
  const rows = (await response.json()) as Record<string, unknown>[];
  return rows.map((row) => ({ ...row, nombreResponsable: row.nombreResponsable || row.responsable }));
}
