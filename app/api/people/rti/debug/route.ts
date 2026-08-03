import { NextResponse } from "next/server";
import { getAuthenticatedSession } from "../../../../lib/authServer";
import {
  supabaseAdminHeaders,
  supabaseError,
  supabaseHeaders,
  supabaseRest,
  supabaseUserHeaders,
} from "../../../../lib/supabaseServer";

// Endpoint temporal de diagnóstico: muestra filas crudas de RACOCIMI1,
// RACOCIMI2 y seguimiento_vehiculos (para la misma Ruta/DT) y así confirmar
// si el retorno de envase se puede fechar de forma confiable cruzando por DT
// con seguimiento (día de despacho y día de retorno del vehículo). Borrar
// una vez resuelto el cruce por fecha.
export async function GET(request: Request) {
  try {
    const session = await getAuthenticatedSession();
    if (!session) return NextResponse.json({ error: "Debes iniciar sesión." }, { status: 401 });
    if (!session.isPeople && !session.isAdmin) return NextResponse.json({ error: "No autorizado." }, { status: 403 });

    const params = new URL(request.url).searchParams;
    const ruta = params.get("ruta")?.trim();
    const limit = params.get("limit")?.trim() || "10";
    const nonzero = params.get("nonzero") === "1";
    const headers = supabaseAdminHeaders() ?? supabaseUserHeaders(session.accessToken);
    const relatedHeaders = supabaseAdminHeaders() ?? supabaseHeaders();

    const [racocimi1, racocimi2, seguimiento] = await Promise.all([
      sampleTable("RACOCIMI1", headers, ruta, limit, nonzero),
      sampleTable("RACOCIMI2", headers, ruta, limit, nonzero),
      sampleSeguimiento(relatedHeaders, ruta, limit),
    ]);

    return NextResponse.json({ RACOCIMI1: racocimi1, RACOCIMI2: racocimi2, seguimiento_vehiculos: seguimiento });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo consultar la muestra." },
      { status: 500 },
    );
  }
}

async function sampleTable(
  table: string,
  headers: Record<string, string>,
  ruta: string | undefined,
  limit: string,
  nonzero: boolean,
) {
  const query = new URLSearchParams({ select: "*", limit });
  // Ruta es int8 (entero) en Supabase: hay que filtrar con eq, no con ilike
  // (ilike es para texto y falla/no aplica sobre una columna numérica).
  if (ruta && /^\d+$/.test(ruta)) query.set("Ruta", `eq.${ruta}`);
  // nonzero=1 busca un ejemplo con retorno real (>0) en vez de filas en 0,
  // para poder comparar unidades de medida en un caso ya devuelto.
  if (nonzero) query.set("Cantidad real", "neq.0");
  const response = await fetch(supabaseRest(table, `?${query.toString()}`), { headers, cache: "no-store" });
  if (!response.ok) return { error: await supabaseError(response) };
  return await response.json();
}

async function sampleSeguimiento(headers: Record<string, string>, ruta: string | undefined, limit: string) {
  const query = new URLSearchParams({ select: "contractor,data,updated_at", order: "updated_at.desc", limit });
  // seguimiento_vehiculos guarda el DT sin el prefijo "10" (los últimos 10
  // dígitos de Ruta, p.ej. 108008722178 -> 8008722178).
  const short = ruta && ruta.length > 10 ? ruta.slice(-10) : ruta;
  if (short) query.set("data->>transporte", `ilike.*${short}*`);
  const response = await fetch(supabaseRest("seguimiento_vehiculos", `?${query.toString()}`), { headers, cache: "no-store" });
  if (!response.ok) return { error: await supabaseError(response) };
  return await response.json();
}
