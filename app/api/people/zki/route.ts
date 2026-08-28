import { NextResponse } from "next/server";
import { getAuthenticatedSession } from "../../../lib/authServer";
import { supabaseAdminHeaders, supabaseError, supabaseRest, supabaseUserHeaders } from "../../../lib/supabaseServer";
import { readZkiCrewRows } from "./crewTable";

const PAGE_SIZE = 1_000;
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
    const [zki, capacities, crew] = await Promise.all([readZkiHistory(headers), readRows("capacidad_carga", headers), readZkiCrewRows(headers)]);
    const payload = { rows: zki.rows, history: [], capacities, crew, source: { table: "ZKI", rows: zki.sourceRows, columns: zki.columns } };
    cachedPayload = { value: payload, expiresAt: Date.now() + CACHE_TTL_MS };
    return NextResponse.json(payload, { headers: { "X-ZKI-Cache": "MISS" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo consultar ZKI." }, { status: 500 });
  }
}

async function readZkiHistory(headers: Record<string, string>) {
  const columns = ["Codigo", "Poblacion", "Barrio", "Nombre", "Cedula", "Cargo"];
  const readPage = async (offset: number, count = false) => {
    const query = new URLSearchParams({ select: columns.join(","), limit: String(PAGE_SIZE), offset: String(offset) });
    const response = await fetch(supabaseRest("ZKI", `?${query}`), {
      headers: count ? { ...headers, Prefer: "count=exact" } : headers,
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`ZKI: ${await supabaseError(response)}`);
    const rows = await response.json() as Record<string, unknown>[];
    const totalText = response.headers.get("content-range")?.split("/")[1] || "";
    const total = /^\d+$/.test(totalText) ? Number(totalText) : undefined;
    return { rows, total };
  };

  const first = await readPage(0, true);
  const pages: Record<string, unknown>[][] = [first.rows];
  if (first.total !== undefined) {
    const offsets = Array.from({ length: Math.max(0, Math.ceil(first.total / PAGE_SIZE) - 1) }, (_, index) => (index + 1) * PAGE_SIZE);
    // Se limita la concurrencia para acelerar Supabase sin lanzar decenas de
    // solicitudes simultáneas sobre tablas históricas grandes.
    for (let index = 0; index < offsets.length; index += 8) {
      const batch = await Promise.all(offsets.slice(index, index + 8).map((offset) => readPage(offset)));
      pages.push(...batch.map((page) => page.rows));
    }
  } else {
    for (let offset = PAGE_SIZE; pages.at(-1)?.length === PAGE_SIZE; offset += PAGE_SIZE) {
      const page = await readPage(offset);
      pages.push(page.rows);
    }
  }

  const sourceRows = first.total ?? pages.reduce((total, page) => total + page.length, 0);
  const compacted = new Map<string, Record<string, unknown>>();
  pages.flat().forEach((row) => {
    const key = columns.map((column) => String(row[column] ?? "").trim().toLocaleLowerCase("es")).join("\u001f");
    const current = compacted.get(key);
    if (current) current.Visitas = Number(current.Visitas || 1) + 1;
    else compacted.set(key, { ...row, Visitas: 1 });
  });
  return { rows: [...compacted.values()], sourceRows, columns };
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
