// Compress the JSON report, which is much larger than the original CSV/Excel.
export async function encodeRangeUpload(json: string): Promise<{ body: BodyInit; contentType: string }> {
  const source = new Blob([json], { type: "application/json" });
  if (source.size < 1_000_000) return { body: json, contentType: "application/json" };
  if (typeof CompressionStream === "undefined") {
    throw new Error("Para cargar este reporte grande, actualiza el navegador e intenta nuevamente.");
  }
  const compressed = await new Response(source.stream().pipeThrough(new CompressionStream("gzip"))).blob();
  if (compressed.size > 4_000_000 || source.size > 64 * 1024 * 1024) {
    throw new Error("El reporte supera el límite de carga incluso comprimido. Exporta un archivo con menos fechas e intenta nuevamente.");
  }
  return { body: compressed, contentType: "application/gzip" };
}
