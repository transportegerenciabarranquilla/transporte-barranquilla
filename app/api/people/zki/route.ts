import { NextResponse } from "next/server";
import { getAuthenticatedSession } from "../../../lib/authServer";
import { supabaseAdminHeaders, supabaseError, supabaseRest, supabaseUserHeaders } from "../../../lib/supabaseServer";

const PAGE_SIZE = 1_000;
const CACHE_TTL_MS = 5 * 60 * 1_000;
type ZkiPayload = { rows: Record<string, unknown>[]; history: Record<string, unknown>[]; capacities: Record<string, unknown>[]; source: { table: string; rows: number; columns: string[] } };
let cachedPayload: { expiresAt: number; value: ZkiPayload } | null = null;

export async function GET(request: Request) {
  try {
    const session = await getAuthenticatedSession();
    if (!session) return NextResponse.json({ error: "Debes iniciar sesión." }, { status: 401 });
    if (!session.isPeople && !session.isAdmin) return NextResponse.json({ error: "No autorizado." }, { status: 403 });
    const refresh = new URL(request.url).searchParams.get("refresh") === "1";
    if (!refresh && cachedPayload && cachedPayload.expiresAt > Date.now()) {
      return NextResponse.json(cachedPayload.value, { headers: { "X-ZKI-Cache": "HIT" } });
    }
    const headers = supabaseAdminHeaders() ?? supabaseUserHeaders(session.accessToken);
    const [rows, history, capacities] = await Promise.all([readRows("ZKI", headers), readHistory(headers), readRows("capacidad_carga", headers)]);
    const payload = { rows, history, capacities, source: { table: "ZKI", rows: rows.length, columns: rows[0] ? Object.keys(rows[0]) : [] } };
    cachedPayload = { value: payload, expiresAt: Date.now() + CACHE_TTL_MS };
    return NextResponse.json(payload, { headers: { "X-ZKI-Cache": "MISS" } });
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
