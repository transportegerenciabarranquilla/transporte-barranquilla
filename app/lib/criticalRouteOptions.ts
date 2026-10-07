export type CardinalDirection = "Norte" | "Sur" | "Este" | "Oeste";

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
  const body = await response.json() as { code?: string; routes?: OsrmRoute[] };
  return body.code === "Ok" ? (body.routes || []).filter(route => route.geometry?.coordinates?.length) : [];
}

function cardinalPoints(origin: Point, destination: Point, meters: number) {
  const latitude = (origin.latitude + destination.latitude) / 2;
  const longitude = (origin.longitude + destination.longitude) / 2;
  const latitudeDelta = meters / 111_320;
  const longitudeDelta = meters / (111_320 * Math.cos(latitude * Math.PI / 180));
  return [
    { direction: "Norte", point: { latitude: latitude + latitudeDelta, longitude } },
    { direction: "Sur", point: { latitude: latitude - latitudeDelta, longitude } },
    { direction: "Este", point: { latitude, longitude: longitude + longitudeDelta } },
    { direction: "Oeste", point: { latitude, longitude: longitude - longitudeDelta } },
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

export async function fetchCriticalRouteOptions(origin: Point, destination: Point, userAgent: string): Promise<OsrmRoute[]> {
  const primary = await requestRoutes([origin, destination], 3, userAgent);
  if (!primary.length) return [];
  const selected: OsrmRoute[] = [primary[0]];
  const maximumDistance = Math.max((primary[0].distance || 0) * 3, (primary[0].distance || 0) + 5_000);
  const directionUsed = new Set<CardinalDirection>();
  const directAlternatives = primary.slice(1);

  // Request drivable routes through separate compass sectors. Waypoints can
  // snap to the same road, so retain only distinct route geometries.
  for (const radius of [1_500, 3_000, 5_000]) {
    if (selected.length === 4) break;
    const requests = cardinalPoints(origin, destination, radius).filter(({ direction }) => !directionUsed.has(direction));
    const results = await Promise.allSettled(requests.map(({ point }) => requestRoutes([origin, point, destination], 0, userAgent)));
    const candidates = results.flatMap((result, index) => result.status === "fulfilled"
      ? result.value.map(route => ({ route, direction: requests[index].direction })) : []);
    candidates.sort((a, b) => (a.route.duration || Infinity) - (b.route.duration || Infinity));
    for (const { route, direction } of candidates) {
      if (selected.length === 4) break;
      if (directionUsed.has(direction) || (route.distance || 0) > maximumDistance || !isDistinct(route, selected)) continue;
      selected.push({ ...route, direction });
      directionUsed.add(direction);
    }
  }

  // Use other real OSRM alternatives when a compass sector has no road.
  for (const route of directAlternatives) {
    if (selected.length === 4) break;
    if ((route.distance || 0) <= maximumDistance && isDistinct(route, selected)) selected.push(route);
  }
  return selected;
}
