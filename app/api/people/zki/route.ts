import { NextResponse } from "next/server";
import { getAuthenticatedSession } from "../../../lib/authServer";
import { supabaseAdminHeaders, supabaseError, supabaseRest, supabaseUserHeaders } from "../../../lib/supabaseServer";
import { formatPersonName } from "../../../lib/personNames";
import { readZkiCrewRows } from "./crewTable";

const PAGE_SIZE = 1_000;
const MAX_PAGES_PER_REQUEST = 3;
const MAX_CLIENT_CODES_PER_PAGE = 25;
const CACHE_TTL_MS = 30 * 60 * 1_000;
type ZkiPayload = { rows: Record<string, unknown>[]; history: Record<string, unknown>[]; capacities: Record<string, unknown>[]; crew: Awaited<ReturnType<typeof readZkiCrewRows>>; source: { table: string; rows: number; columns: string[] } };
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
    // El cálculo vigente obtiene conocimiento de ZKI y las parejas de
    // Conductores-placas. Recorrer todo seguimiento_vehiculos era redundante:
    // rankCandidates no usa ese histórico y la consulta ralentizaba cada carga.
    const [capacities, crew] = await Promise.all([readRows("capacidad_carga", headers), readZkiCrewRows(headers)]);
    // El catálogo de clientes aún no se ha cargado. Consultar aquí toda la
    // tabla ZKI bloqueaba la planeación con cientos de miles de registros.
    const payload = { rows: [], history: [], capacities, crew, source: { table: "ZKI", rows: 0, columns: ZKI_COLUMNS } };
    cachedPayload = { value: payload, expiresAt: Date.now() + CACHE_TTL_MS };
    return NextResponse.json(payload, { headers: { "X-ZKI-Cache": "MISS" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo consultar ZKI." }, { status: 500 });
  }
}

const ZKI_COLUMNS = ["Codigo", "Poblacion", "Barrio", "Nombre", "Cedula", "Cargo"];

export async function POST(request: Request) {
  try {
    const session = await getAuthenticatedSession();
    if (!session) return NextResponse.json({ error: "Debes iniciar sesión." }, { status: 401 });
    if (!session.isPeople && !session.isAdmin) return NextResponse.json({ error: "No autorizado." }, { status: 403 });
    const body = await request.json().catch(() => ({})) as { clientCodes?: unknown; offset?: unknown };
    if (!Array.isArray(body.clientCodes)) return NextResponse.json({ error: "Envía los códigos de cliente del Excel." }, { status: 400 });
    const codes = [...new Set(body.clientCodes.map((value) => String(value ?? "").trim().replace(/\.0+$/, "")).filter((value) => /^\d+$/.test(value)))];
    if (!codes.length || codes.length > MAX_CLIENT_CODES_PER_PAGE) return NextResponse.json({ error: `Consulta entre 1 y ${MAX_CLIENT_CODES_PER_PAGE} códigos de cliente por página.` }, { status: 400 });
    const offset = Number(body.offset ?? 0);
    if (!Number.isSafeInteger(offset) || offset < 0 || offset > 1_000_000 || offset % PAGE_SIZE !== 0) {
      return NextResponse.json({ error: "La página solicitada no es válida." }, { status: 400 });
    }
    const headers = supabaseAdminHeaders() ?? supabaseUserHeaders(session.accessToken);
    const zki = await readZkiHistoryPage(headers, codes, offset);
    return NextResponse.json({ rows: zki.rows, sourceRows: zki.sourceRows, hasMore: zki.hasMore });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo consultar ZKI." }, { status: 500 });
  }
}

async function readZkiHistoryPage(headers: Record<string, string>, codes: string[], offset: number) {
  const compacted = new Map<string, Record<string, unknown>>();
  let sourceRows = 0;
  let hasMore = false;
  for (let pageIndex = 0; pageIndex < MAX_PAGES_PER_REQUEST; pageIndex += 1) {
    const query = new URLSearchParams({ select: ZKI_COLUMNS.join(","), Codigo: `in.(${codes.join(",")})`, order: "Codigo.asc,Cedula.asc,Nombre.asc,Barrio.asc,Poblacion.asc,Cargo.asc", limit: String(PAGE_SIZE), offset: String(offset + pageIndex * PAGE_SIZE) });
    const response = await fetch(supabaseRest("ZKI", `?${query}`), { headers, cache: "no-store" });
    if (!response.ok) throw new Error(`ZKI: ${await supabaseError(response)}`);
    const page = await response.json() as Record<string, unknown>[];
    sourceRows += page.length;
    page.forEach((row) => {
      const key = ZKI_COLUMNS.map((column) => String(row[column] ?? "").trim().toLocaleLowerCase("es")).join("\u001f");
      const current = compacted.get(key);
      if (current) current.Visitas = Number(current.Visitas || 1) + 1;
      else compacted.set(key, { ...row, Nombre: formatPersonName(row.Nombre), Visitas: 1 });
    });
    hasMore = page.length === PAGE_SIZE;
    if (!hasMore) break;
  }
  return { rows: [...compacted.values()], sourceRows, hasMore };
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
