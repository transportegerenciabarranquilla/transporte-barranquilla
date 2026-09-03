import { NextResponse } from "next/server";

const ORIGIN = { label: "Centro Distribución Galapa - Bavaria", latitude: 10.92614, longitude: -74.84523 };

type NominatimResult = { display_name?: string; lat?: string; lon?: string };
type OsrmRoute = { distance?: number; duration?: number; geometry?: { coordinates?: [number, number][] }; legs?: Array<{ steps?: Array<{ distance?: number; duration?: number; name?: string; maneuver?: { type?: string; modifier?: string } }> }> };

export async function GET(request: Request) {
  try {
    const query = new URL(request.url).searchParams.get("q")?.trim().slice(0, 120) || "";
    if (query.length < 3) return NextResponse.json({ error: "Destino inválido." }, { status: 400 });
    const destination = await geocode(query);
    if (!destination) return NextResponse.json({ error: "No encontramos ese barrio." }, { status: 404 });
    const route = await directions(destination.longitude, destination.latitude);
    if (!route?.geometry?.coordinates?.length) return NextResponse.json({ error: "No encontramos una ruta vehicular." }, { status: 404 });
    return NextResponse.json({ origin: ORIGIN, destination, route: { coordinates: route.geometry.coordinates, distanceMeters: Math.round(route.distance || 0), durationSeconds: Math.round(route.duration || 0), steps: (route.legs?.[0]?.steps || []).filter((step) => Number(step.distance) >= 20).map((step) => ({ distanceMeters: Math.round(step.distance || 0), durationSeconds: Math.round(step.duration || 0), instruction: instruction(step.maneuver?.type, step.maneuver?.modifier, step.name) })) } });
  } catch { return NextResponse.json({ error: "No se pudo calcular la ruta. Intenta nuevamente." }, { status: 500 }); }
}

async function geocode(query: string) {
  for (const search of [`${query}, Barranquilla, Atlántico, Colombia`, `${query}, Atlántico, Colombia`]) {
    const params = new URLSearchParams({ q: search, format: "jsonv2", limit: "1", countrycodes: "co" });
    const response = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, { cache: "no-store", headers: { "User-Agent": "TransporteBarranquilla/1.0", "Accept-Language": "es-CO" }, signal: AbortSignal.timeout(12000) });
    if (!response.ok) continue;
    const result = ((await response.json()) as NominatimResult[])[0];
    const latitude = Number(result?.lat); const longitude = Number(result?.lon);
    if (Number.isFinite(latitude) && Number.isFinite(longitude)) return { label: result.display_name || search, latitude, longitude };
  }
  return null;
}

async function directions(longitude: number, latitude: number) {
  const points = `${ORIGIN.longitude},${ORIGIN.latitude};${longitude},${latitude}`;
  const response = await fetch(`https://router.project-osrm.org/route/v1/driving/${points}?alternatives=false&geometries=geojson&overview=full&steps=true`, { cache: "no-store", headers: { "User-Agent": "TransporteBarranquilla/1.0" }, signal: AbortSignal.timeout(20000) });
  if (!response.ok) return null;
  const body = await response.json() as { code?: string; routes?: OsrmRoute[] };
  return body.code === "Ok" ? body.routes?.[0] || null : null;
}

function instruction(type = "", modifier = "", street = "") {
  const turn = modifier.includes("left") ? "a la izquierda" : modifier.includes("right") ? "a la derecha" : "recto";
  const action = type === "depart" ? "Sal del centro de distribución" : type === "arrive" ? "Llegaste al destino" : type === "turn" ? `Gira ${turn}` : type === "roundabout" || type === "rotary" ? "Toma la glorieta" : type === "merge" ? "Incorpórate a la vía" : `Continúa ${turn}`;
  return street ? `${action} por ${street}` : action;
}
