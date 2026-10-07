import { NextResponse } from "next/server";
import { fetchCriticalRouteOptions, type OsrmRoute } from "../../../lib/criticalRouteOptions";

const ORIGIN = { label: "Centro Distribución Galapa - Bavaria", latitude: 10.92614, longitude: -74.84523 };

type NominatimResult = { display_name?: string; lat?: string; lon?: string };
export async function GET(request: Request) {
  try {
    const query = new URL(request.url).searchParams.get("q")?.trim().slice(0, 120) || "";
    if (query.length < 3) return NextResponse.json({ error: "Destino inválido." }, { status: 400 });
    const destination = await geocode(query);
    if (!destination) return NextResponse.json({ error: "No encontramos ese barrio." }, { status: 404 });
    const routes = await fetchCriticalRouteOptions(ORIGIN, destination, "TransporteBarranquilla/1.0");
    if (!routes.length) return NextResponse.json({ error: "No encontramos una ruta vehicular." }, { status: 404 });
    const options = routes.map(formatRoute);
    return NextResponse.json({ origin: ORIGIN, destination, route: options[0], routes: options });
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

function formatRoute(route: OsrmRoute) {
  return { coordinates: route.geometry!.coordinates!, direction: route.direction || null, distanceMeters: Math.round(route.distance || 0), durationSeconds: Math.round(route.duration || 0), steps: (route.legs || []).flatMap(leg => leg.steps || []).filter(step => Number(step.distance) >= 20).map(step => ({ distanceMeters: Math.round(step.distance || 0), durationSeconds: Math.round(step.duration || 0), instruction: instruction(step.maneuver?.type, step.maneuver?.modifier, step.name) })) };
}

function instruction(type = "", modifier = "", street = "") {
  const turn = modifier.includes("left") ? "a la izquierda" : modifier.includes("right") ? "a la derecha" : "recto";
  const action = type === "depart" ? "Sal del centro de distribución" : type === "arrive" ? "Llegaste al destino" : type === "turn" ? `Gira ${turn}` : type === "roundabout" || type === "rotary" ? "Toma la glorieta" : type === "merge" ? "Incorpórate a la vía" : `Continúa ${turn}`;
  return street ? `${action} por ${street}` : action;
}
