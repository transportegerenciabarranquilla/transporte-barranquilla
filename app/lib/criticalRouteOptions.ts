export type CardinalDirection = "Norte" | "Sur" | "Este";

export type OsrmRoute = {
  distance?: number;
  duration?: number;
  direction?: CardinalDirection;
  geometry?: { coordinates?: [number, number][] };
  legs?: Array<{ steps?: Array<{ distance?: number; duration?: number; name?: string; maneuver?: { type?: string; modifier?: string } }> }>;
};

type Point = { longitude: number; latitude: number };

async function requestRoutes(points: Point[], alternatives: number, userAgent: string): Promise<OsrmRoute[]> {
  const coordinates = points.map(({ longitude, latitude }) => `${longitude.toFixed(6)},${latitude.toFixed(6)}`).join(";");
  const params = new URLSearchParams({ alternatives: String(alternatives), geometries: "geojson", overview: "full", steps: "true" });
  const response = await fetch(`https://router.project-osrm.org/route/v1/driving/${coordinates}?${params}`, {
    cache: "no-store",
    headers: { Accept: "application/json", "User-Agent": userAgent },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error("El servicio de rutas no respondió. Intenta nuevamente.");
  const body = await response.json() as { code?: string; routes?: OsrmRoute[]; waypoints?: Array<{ distance?: number }> };
  // A distant snap means the requested compass sector has no nearby road.
  if (points.length > 2 && Number(body.waypoints?.[1]?.distance || 0) > 350) return [];
  return body.code === "Ok" ? (body.routes || []).filter(route => route.geometry?.coordinates?.length) : [];
}

function cardinalPoints(origin: Point, destination: Point, meters: number, fraction = 0.5) {
  const latitude = origin.latitude + (destination.latitude - origin.latitude) * fraction;
  const longitude = origin.longitude + (destination.longitude - origin.longitude) * fraction;
  const latitudeDelta = meters / 111_320;
  const longitudeDelta = meters / (111_320 * Math.cos(latitude * Math.PI / 180));
  return [
    { direction: "Norte", point: { latitude: latitude + latitudeDelta, longitude } },
    { direction: "Sur", point: { latitude: latitude - latitudeDelta, longitude } },
    { direction: "Este", point: { latitude, longitude: longitude + longitudeDelta } },
  ] as const;
}

function isDistinct(candidate: OsrmRoute, selected: OsrmRoute[]) {
  const coordinates = candidate.geometry?.coordinates || [];
  return selected.every(route => {
    const other = route.geometry?.coordinates || [];
    const sampleEvery = Math.max(1, Math.floor(coordinates.length / 24));
    const samples = coordinates.filter((_, index) => index % sampleEvery === 0);
    const distant = samples.filter(([longitude, latitude]) => other.every(([otherLongitude, otherLatitude]) =>
      Math.hypot((longitude - otherLongitude) * 109_000, (latitude - otherLatitude) * 111_320) > 250)).length;
    return samples.length > 0 && distant / samples.length >= 0.12;
  });
}

// A waypoint snapped to a dead-end can make OSRM drive out and back over the
// same street. Such a geometry is not a useful alternative route.
function hasExcessiveBacktrack(route: OsrmRoute) {
  const coordinates = route.geometry?.coordinates || [];
  const key = ([longitude, latitude]: [number, number]) => `${longitude.toFixed(6)},${latitude.toFixed(6)}`;
  const edges = new Set<string>();
  for (let index = 1; index < coordinates.length; index++) {
    edges.add(`${key(coordinates[index - 1])}|${key(coordinates[index])}`);
  }
  let reversedMeters = 0;
  for (let index = 1; index < coordinates.length; index++) {
    const from = coordinates[index - 1];
    const to = coordinates[index];
    if (!edges.has(`${key(to)}|${key(from)}`)) continue;
    reversedMeters += Math.hypot((to[0] - from[0]) * 109_000, (to[1] - from[1]) * 111_320);
    if (reversedMeters > 600) return true;
  }
  return false;
}

export async function fetchCriticalRouteOptions(origin: Point, destination: Point, userAgent: string): Promise<OsrmRoute[]> {
  const primary = await requestRoutes([origin, destination], 3, userAgent);
  if (!primary.length) return [];
  const selected: OsrmRoute[] = [primary[0]];
  const maximumDistance = Math.max((primary[0].distance || 0) * 3, (primary[0].distance || 0) + 5_000);
  const directionUsed = new Set<CardinalDirection>();

  // Sample several positions along the corridor, not just its midpoint.
  // A midpoint in an area without through-roads may create a long dead-end
  // detour even when a nearby connected route exists.
  const search = [
    { fraction: 0.5, radius: 1_500 },
    { fraction: 0.5, radius: 3_000 },
    { fraction: 0.5, radius: 1_300 },
    { fraction: 0.75, radius: 900 },
    { fraction: 0.25, radius: 900 },
    { fraction: 0.25, radius: 2_500 },
    { fraction: 0.75, radius: 1_800 },
    { fraction: 0.25, radius: 1_800 },
    { fraction: 0.5, radius: 5_000 },
  ];
  for (const { fraction, radius } of search) {
    if (directionUsed.size === 4) break;
    const requests = cardinalPoints(origin, destination, radius, fraction).filter(({ direction }) => !directionUsed.has(direction));
    const results = await Promise.allSettled(requests.map(({ point }) => requestRoutes([origin, point, destination], 0, userAgent)));
    const candidates = results.flatMap((result, index) => result.status === "fulfilled"
      ? result.value.map(route => ({ route, direction: requests[index].direction })) : []);
    candidates.sort((a, b) => (a.route.duration || Infinity) - (b.route.duration || Infinity));
    for (const { route, direction } of candidates) {
      if (directionUsed.has(direction) || (route.distance || 0) > maximumDistance || hasExcessiveBacktrack(route) || !isDistinct(route, selected)) continue;
      selected.push({ ...route, direction });
      directionUsed.add(direction);
    }
  }

  return selected;
}
