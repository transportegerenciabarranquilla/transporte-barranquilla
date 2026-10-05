import { gunzipSync, gzipSync } from "node:zlib";

export async function readRangeUpload(request: Request) {
  if (request.headers.get("Content-Type")?.split(";")[0] !== "application/gzip") return request.json();
  const bytes = await request.arrayBuffer();
  if (bytes.byteLength > 4_000_000) throw new Error("El reporte comprimido supera el límite de carga.");
  try {
    return JSON.parse(gunzipSync(Buffer.from(bytes), { maxOutputLength: 64 * 1024 * 1024 }).toString("utf8"));
  } catch {
    throw new Error("El reporte comprimido no es válido o supera el límite de 64 MB. Vuelve a exportarlo e intenta nuevamente.");
  }
}

export function rangeUploadResponse(body: unknown, request: Request) {
  if (request.headers.get("Content-Type")?.split(";")[0] !== "application/gzip") return Response.json(body);
  // The browser transparently decompresses this before response.json().
  return new Response(new Uint8Array(gzipSync(JSON.stringify(body))), {
    headers: { "Content-Type": "application/json", "Content-Encoding": "gzip", "Cache-Control": "no-store" },
  });
}
