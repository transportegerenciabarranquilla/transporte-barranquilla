import { NextResponse } from "next/server";
import { fetchCriticalRouteOptions, type OsrmRoute } from "../../../lib/criticalRouteOptions";
import { getAuthenticatedSession } from "../../../lib/authServer";
import { supabaseAdminHeaders, supabaseError, supabaseRest, supabaseUserHeaders } from "../../../lib/supabaseServer";

const DISTRIBUTION_CENTER = {
  label: "Centro Distribución Galapa - Bavaria",
  latitude: 10.92614,
  longitude: -74.84523,
};

type NominatimResult = {
  display_name?: string;
  lat?: string;
  lon?: string;
  type?: string;
};

export async function GET(request: Request) {
  try {
    const session = await getAuthenticatedSession();
    if (!session) return NextResponse.json({ error: "Debes iniciar sesión." }, { status: 401 });
    if (!session.isPeople && !session.isAdmin) return NextResponse.json({ error: "No autorizado." }, { status: 403 });

    const searchParams = new URL(request.url).searchParams;
    if (searchParams.get("list") === "true") return listCriticalNeighborhoods(session.accessToken);

    const query = searchParams.get("q")?.trim().replace(/\s+/g, " ") || "";
    const selectedRoute = searchParams.get("route")?.trim() || "";
    if (query.length < 3) return NextResponse.json({ error: "Escribe al menos tres caracteres." }, { status: 400 });
    if (query.length > 120) return NextResponse.json({ error: "La búsqueda es demasiado larga." }, { status: 400 });

    const destination = await geocodeDestination(query);
    if (!destination) {
      return NextResponse.json({ error: `No encontramos “${query}” en Barranquilla ni en Colombia.` }, { status: 404 });
    }

    const routes = await fetchCriticalRouteOptions(DISTRIBUTION_CENTER, destination, "TransporteBarranquilla-RutasCriticas/1.0");
    if (!routes.length) {
      return NextResponse.json({ error: "No se encontró una ruta vehicular hasta ese destino." }, { status: 404 });
    }

    const routeHazards = selectedRoute ? await hazardsForRoute(selectedRoute, session.accessToken) : [];
    const options = routes.map(formatRoute);
    return NextResponse.json({
      origin: DISTRIBUTION_CENTER,
      destination,
      route: options[0],
      routes: options,
      disclaimer: "Ruta estimada para automóvil, sin tráfico en tiempo real ni restricciones específicas de vehículos pesados.",
      warnings: routeHazards.map((hazard) => hazard.description),
      hazards: routeHazards,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo calcular la ruta." }, { status: 500 });
  }
}

async function listCriticalNeighborhoods(accessToken: string) {
  const params = new URLSearchParams({ select: "*", limit: "200" });
  const headers = supabaseAdminHeaders() ?? supabaseUserHeaders(accessToken);
  const response = await fetch(supabaseRest("ruta_criticas", `?${params.toString()}`), { headers, cache: "no-store" });
  if (!response.ok) return NextResponse.json({ error: await supabaseError(response) }, { status: response.status });

  const rows = (await response.json().catch(() => [])) as Array<Record<string, unknown>>;
  const neighborhoods = rows.map((row, index) => ({
    id: Number(row["#"] ?? index + 1),
    route: String(row.RUTA ?? "").trim(),
    distributionCenter: String(row.CD ?? "").trim(),
    warnings: parseWarnings(row.ADVERTENCIAS ?? row.advertencias),
  })).filter((row) => row.route).sort((a, b) => a.id - b.id);
  return NextResponse.json({ neighborhoods });
}

async function hazardsForRoute(routeName: string, accessToken: string) {
  const params = new URLSearchParams({ select: "id,tipo,descripcion,latitud,longitud", ruta: `eq.${routeName}`, activo: "eq.true", order: "id.asc" });
  const headers = supabaseAdminHeaders() ?? supabaseUserHeaders(accessToken);
  const response = await fetch(supabaseRest("ruta_criticas_riesgos", `?${params}`), { headers, cache: "no-store" });
  if (!response.ok) return [];
  const rows = (await response.json().catch(() => [])) as Array<Record<string, unknown>>;
  return rows.map((row) => ({
    id: Number(row.id),
    type: String(row.tipo ?? "peligro"),
    description: String(row.descripcion ?? "Precaución en este punto"),
    latitude: Number(row.latitud),
    longitude: Number(row.longitud),
  })).filter((hazard) => Number.isFinite(hazard.latitude) && Number.isFinite(hazard.longitude));
}

function parseWarnings(value: unknown) {
  if (Array.isArray(value)) return value.map(String).map((item) => item.trim()).filter(Boolean);
  return String(value ?? "").split(/\r?\n|;/).map((item) => item.trim()).filter(Boolean);
}

async function geocodeDestination(query: string) {
  const attempts = [
    `${query}, Barranquilla, Atlántico, Colombia`,
    `${query}, Atlántico, Colombia`,
    `${query}, Colombia`,
  ];

  for (const search of attempts) {
    const params = new URLSearchParams({ q: search, format: "jsonv2", limit: "1", countrycodes: "co" });
    const response = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
      cache: "no-store",
      headers: {
        Accept: "application/json",
        "Accept-Language": "es-CO,es;q=0.9",
        "User-Agent": "TransporteBarranquilla-RutasCriticas/1.0",
      },
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) continue;
    const result = ((await response.json()) as NominatimResult[])[0];
    const latitude = Number(result?.lat);
    const longitude = Number(result?.lon);
    if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
      return {
        label: result.display_name || search,
        latitude,
        longitude,
        type: result.type || "place",
      };
    }
  }

  return null;
}

function formatRoute(route: OsrmRoute) {
  return {
    distanceMeters: Math.round(route.distance || 0),
    durationSeconds: Math.round(route.duration || 0),
    coordinates: route.geometry!.coordinates!,
    steps: (route.legs || []).flatMap(leg => leg.steps || [])
      .filter(step => Number(step.distance || 0) >= 20)
      .map(step => ({ distanceMeters: Math.round(step.distance || 0), durationSeconds: Math.round(step.duration || 0), instruction: maneuverLabel(step.maneuver?.type, step.maneuver?.modifier, step.name) })),
  };
}

function maneuverLabel(type = "", modifier = "", street = "") {
  const action = type === "depart"
    ? "Sal del centro de distribución"
    : type === "arrive"
      ? "Llega al destino"
      : type === "turn"
        ? `Gira ${directionLabel(modifier)}`
        : type === "roundabout" || type === "rotary"
          ? "Toma la glorieta"
          : type === "merge"
            ? "Incorpórate"
            : type === "fork"
              ? `Continúa ${directionLabel(modifier)}`
              : "Continúa";
  return street ? `${action} por ${street}` : action;
}

function directionLabel(value: string) {
  if (value.includes("left")) return "a la izquierda";
  if (value.includes("right")) return "a la derecha";
  if (value === "uturn") return "en U";
  return "recto";
}
