import { NextResponse } from "next/server";
import { supabaseError, supabaseHeaders, supabaseRest } from "../../../lib/supabaseServer";

export async function GET() {
  try {
    const params = new URLSearchParams({ select: "*", limit: "200" });
    const response = await fetch(supabaseRest("ruta_criticas", `?${params}`), {
      cache: "no-store",
      headers: supabaseHeaders(),
    });

    if (!response.ok) {
      return NextResponse.json({ error: await supabaseError(response) }, { status: response.status });
    }

    const rows = (await response.json().catch(() => [])) as Array<Record<string, unknown>>;
    const neighborhoods = rows
      .map((row, index) => ({
        id: Number(row["#"] ?? index + 1),
        route: String(row.RUTA ?? "").trim(),
        distributionCenter: String(row.CD ?? "").trim(),
      }))
      .filter((row) => row.route)
      .sort((a, b) => a.id - b.id);

    const hazardResponse = await fetch(supabaseRest("ruta_criticas_riesgos", "?select=id,ruta,tipo,descripcion,latitud,longitud,activo&activo=eq.true&order=id.desc"), { cache: "no-store", headers: supabaseHeaders() });
    const hazards = hazardResponse.ok ? await hazardResponse.json().catch(() => []) : [];
    return NextResponse.json({ neighborhoods, hazards });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudieron cargar los barrios." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const route = String(body.route ?? "").trim().slice(0, 120);
    const type = String(body.type ?? "peligro");
    const description = String(body.description ?? "").trim().slice(0, 240);
    const latitude = Number(body.latitude);
    const longitude = Number(body.longitude);
    const allowedTypes = new Set(["cables_bajos", "via_danada", "inundacion", "cierre", "peligro"]);
    if (!route || !description || !allowedTypes.has(type) || !Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
      return NextResponse.json({ error: "Completa correctamente el reporte." }, { status: 400 });
    }
    const response = await fetch(supabaseRest("ruta_criticas_riesgos"), {
      method: "POST", cache: "no-store", headers: supabaseHeaders({ Prefer: "return=representation" }),
      body: JSON.stringify({ ruta: route, tipo: type, descripcion: description, latitud: latitude, longitud: longitude, activo: true }),
    });
    if (!response.ok) return NextResponse.json({ error: await supabaseError(response) }, { status: response.status });
    return NextResponse.json({ hazard: (await response.json())[0] }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo guardar el reporte." }, { status: 500 });
  }
}
