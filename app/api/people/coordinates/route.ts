import { NextResponse } from "next/server";
import { getAuthenticatedSession } from "../../../lib/authServer";
import { supabaseAdminHeaders, supabaseError, supabaseRest, supabaseUserHeaders } from "../../../lib/supabaseServer";

type CoordinateRow = {
  CodigoCliente: number | string | null;
  Latitud_fix: number | string | null;
  Longitud_fix: number | string | null;
};

export async function GET(request: Request) {
  try {
    const session = await getAuthenticatedSession();
    if (!session) return NextResponse.json({ error: "Debes iniciar sesión." }, { status: 401 });
    if (!session.isPeople && !session.isAdmin) return NextResponse.json({ error: "No autorizado." }, { status: 403 });

    const codigo = new URL(request.url).searchParams.get("codigo")?.replace(/\D/g, "") || "";
    if (!codigo) return NextResponse.json({ error: "Ingresa un código de cliente." }, { status: 400 });

    const params = new URLSearchParams({
      select: "CodigoCliente,Longitud_fix,Latitud_fix",
      CodigoCliente: `eq.${codigo}`,
      limit: "1",
    });
    const response = await fetch(supabaseRest("Cordenadas", `?${params.toString()}`), {
      headers: supabaseAdminHeaders() ?? supabaseUserHeaders(session.accessToken),
      cache: "no-store",
    });
    if (!response.ok) return NextResponse.json({ error: await supabaseError(response) }, { status: response.status });

    const row = ((await response.json()) as CoordinateRow[])[0];
    if (!row) {
      return NextResponse.json({
        coordinate: null,
        hint: "Si el código existe, ejecuta supabase/coordinates_access.sql en Supabase para habilitar la lectura autenticada.",
      });
    }

    const rawLatitude = Number(row.Latitud_fix);
    const rawLongitude = Number(row.Longitud_fix);
    const latitude = normalizeLatitude(rawLatitude);
    const longitude = normalizeLongitude(rawLongitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return NextResponse.json({ error: "El cliente tiene coordenadas inválidas." }, { status: 422 });
    }

    return NextResponse.json({
      coordinate: {
        codigo: String(row.CodigoCliente ?? codigo),
        latitude,
        longitude,
        rawLatitude,
        rawLongitude,
      },
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudieron consultar las coordenadas." }, { status: 500 });
  }
}

function normalizeLongitude(value: number) {
  let result = value;
  while (Math.abs(result) > 180) result /= 10;
  return result;
}

function normalizeLatitude(value: number) {
  let result = value;
  while (Math.abs(result) > 15) result /= 10;
  if (Math.abs(result) >= 0.5 && Math.abs(result) < 2) result *= 10;
  return result;
}
