import { NextResponse } from "next/server";
import { getAuthenticatedSession } from "../../../lib/authServer";

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

type OsrmRoute = {
  distance?: number;
  duration?: number;
  geometry?: { coordinates?: [number, number][]; type?: string };
  legs?: Array<{
    steps?: Array<{
      distance?: number;
      duration?: number;
      name?: string;
      maneuver?: { type?: string; modifier?: string };
    }>;
  }>;
};

export async function GET(request: Request) {
  try {
    const session = await getAuthenticatedSession();
    if (!session) return NextResponse.json({ error: "Debes iniciar sesión." }, { status: 401 });
    if (!session.isPeople && !session.isAdmin) return NextResponse.json({ error: "No autorizado." }, { status: 403 });

    const query = new URL(request.url).searchParams.get("q")?.trim().replace(/\s+/g, " ") || "";
    if (query.length < 3) return NextResponse.json({ error: "Escribe al menos tres caracteres." }, { status: 400 });
    if (query.length > 120) return NextResponse.json({ error: "La búsqueda es demasiado larga." }, { status: 400 });

    const destination = await geocodeDestination(query);
    if (!destination) {
      return NextResponse.json({ error: `No encontramos “${query}” en Barranquilla ni en Colombia.` }, { status: 404 });
    }

    const route = await calculateFastestRoute(destination.longitude, destination.latitude);
    if (!route?.geometry?.coordinates?.length) {
      return NextResponse.json({ error: "No se encontró una ruta vehicular hasta ese destino." }, { status: 404 });
    }

    return NextResponse.json({
      origin: DISTRIBUTION_CENTER,
      destination,
      route: {
        distanceMeters: Math.round(route.distance || 0),
        durationSeconds: Math.round(route.duration || 0),
        coordinates: route.geometry.coordinates,
        steps: (route.legs?.[0]?.steps || [])
          .filter((step) => Number(step.distance || 0) >= 20)
          .map((step) => ({
            distanceMeters: Math.round(step.distance || 0),
            durationSeconds: Math.round(step.duration || 0),
            instruction: maneuverLabel(step.maneuver?.type, step.maneuver?.modifier, step.name),
          })),
      },
      disclaimer: "Ruta estimada para automóvil, sin tráfico en tiempo real ni restricciones específicas de vehículos pesados.",
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo calcular la ruta." }, { status: 500 });
  }
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

async function calculateFastestRoute(longitude: number, latitude: number) {
  const coordinates = `${DISTRIBUTION_CENTER.longitude},${DISTRIBUTION_CENTER.latitude};${longitude},${latitude}`;
  const params = new URLSearchParams({ alternatives: "false", geometries: "geojson", overview: "full", steps: "true" });
  const response = await fetch(`https://router.project-osrm.org/route/v1/driving/${coordinates}?${params}`, {
    cache: "no-store",
    headers: { Accept: "application/json", "User-Agent": "TransporteBarranquilla-RutasCriticas/1.0" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error("El servicio de rutas no respondió. Intenta nuevamente.");
  const body = (await response.json()) as { code?: string; routes?: OsrmRoute[] };
  return body.code === "Ok" ? body.routes?.[0] || null : null;
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
