export type OsrmRoute = {
  distance?: number;
  duration?: number;
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

function detourPoints(origin: Point, destination: Point): Point[] {
  const latitude = (origin.latitude + destination.latitude) / 2;
  const longitude = (origin.longitude + destination.longitude) / 2;
  const metersPerLongitude = 111_320 * Math.cos(latitude * Math.PI / 180);
  const east = (destination.longitude - origin.longitude) * metersPerLongitude;
  const north = (destination.latitude - origin.latitude) * 111_320;
  const length = Math.hypot(east, north);
  if (length < 2_000) return [];
  return [1_200, -1_200, 2_000, -2_000].map(offset => ({
    longitude: longitude - north / length * offset / metersPerLongitude,
    latitude: latitude + east / length * offset / 111_320,
  }));
}

function isDistinct(candidate: OsrmRoute, selected: OsrmRoute[]) {
  const coordinates = candidate.geometry?.coordinates || [];
  return selected.every(route => {
    if (Math.abs((candidate.distance || 0) - (route.distance || 0)) < 350) return false;
    const other = route.geometry?.coordinates || [];
    const sampleEvery = Math.max(1, Math.floor(coordinates.length / 12));
    return coordinates.some(([longitude, latitude], index) => index % sampleEvery === 0 && other.every(([otherLongitude, otherLatitude]) =>
      Math.hypot((longitude - otherLongitude) * 109_000, (latitude - otherLatitude) * 111_320) > 250));
  });
}

export async function fetchCriticalRouteOptions(origin: Point, destination: Point, userAgent: string): Promise<OsrmRoute[]> {
  const primary = await requestRoutes([origin, destination], 3, userAgent);
  if (!primary.length) return [];
  const selected = [primary[0]];
  const maximumDistance = (primary[0].distance || 0) * 1.75;
  for (const route of primary.slice(1)) {
    if ((route.distance || 0) <= maximumDistance && isDistinct(route, selected)) selected.push(route);
  }
  if (selected.length >= 2) return selected.slice(0, 3);

  const points = detourPoints(origin, destination);
  for (let offset = 0; offset < points.length && selected.length < 3; offset += 2) {
    const detours = await Promise.allSettled(points.slice(offset, offset + 2).map(point => requestRoutes([origin, point, destination], 0, userAgent)));
    const candidates = detours.flatMap(result => result.status === "fulfilled" ? result.value : [])
      .filter(route => (route.distance || 0) <= maximumDistance)
      .sort((left, right) => (left.duration || 0) - (right.duration || 0));
    for (const route of candidates) {
      if (isDistinct(route, selected)) selected.push(route);
      if (selected.length >= 3) break;
    }
  }
  return selected;
}
