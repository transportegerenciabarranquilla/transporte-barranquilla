const MAX_ZOOM = 19;

export async function GET(_request: Request, context: RouteContext<"/api/map-tiles/[z]/[x]/[y]">) {
  const { z: rawZ, x: rawX, y: rawY } = await context.params;
  const z = Number(rawZ);
  const x = Number(rawX);
  const y = Number(rawY);
  const tileLimit = Number.isInteger(z) && z >= 0 && z <= MAX_ZOOM ? 2 ** z : 0;

  if (![z, x, y].every(Number.isInteger) || !tileLimit || x < 0 || y < 0 || x >= tileLimit || y >= tileLimit) {
    return new Response("Tesela inválida", { status: 400 });
  }

  try {
    const upstream = await fetch(`https://tile.openstreetmap.org/${z}/${x}/${y}.png`, {
      cache: "force-cache",
      headers: {
        Accept: "image/png,image/*;q=0.8",
        "User-Agent": "TransporteBarranquilla-RutasCriticas/1.0",
      },
      next: { revalidate: 604800 },
    });

    if (!upstream.ok) {
      return new Response("No se pudo obtener la tesela", { status: 502 });
    }

    return new Response(await upstream.arrayBuffer(), {
      headers: {
        "Cache-Control": "public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400",
        "Content-Type": upstream.headers.get("content-type") || "image/png",
      },
    });
  } catch {
    return new Response("No se pudo conectar con el proveedor del mapa", { status: 502 });
  }
}
