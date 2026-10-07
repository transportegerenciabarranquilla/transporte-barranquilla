import "server-only";
import { routePerformanceContractor } from "./routePerformanceContractors";
import { createRoutePerformanceHistory } from "./routePerformanceHistory";
import { parseRoutePerformanceRows, type RoutePerformanceRow } from "./routePerformanceImport";
import { supabaseAdminHeaders, supabaseError, supabaseRest } from "./supabaseServer";

export async function readRoutePerformanceFile() {
  const headers = supabaseAdminHeaders();
  if (!headers) throw new Error("Falta configurar la clave de servidor de Supabase para consultar el Excel.");
  const rows: RoutePerformanceRow[] = [];
  const history = createRoutePerformanceHistory();
  const files: Array<{ id: string; fileName: string; uploadedAt: string; rowCount: number }> = [];
  // Read bounded pages of original files, including uploads made before this change.
  // Continue until an empty page, even when the server imposes a smaller page size.
  for (let offset = 0; ; ) {
    const params = new URLSearchParams({ select: "id,file_name,file_base64,created_at", order: "created_at.desc,id.desc", limit: "10", offset: String(offset) });
    const response = await fetch(supabaseRest("graficas_route_performance_files", `?${params}`), { headers, cache: "no-store" });
    if (!response.ok) throw new Error(response.status === 404 ? "Falta crear la tabla de Excel. Ejecuta supabase/route_performance_files.sql en Supabase SQL Editor." : await supabaseError(response));
    const stored = (await response.json()) as Array<{ id: string; file_name: string; file_base64: string; created_at: string }>;
    if (!stored.length) break;
    for (const file of stored) {
      if (!history.acceptFile(file.file_name)) continue;
      const parsed = await parseRoutePerformanceFile(Buffer.from(file.file_base64, "base64"));
      const unique = history.addRows(parsed);
      const logisticosRows = unique.filter((row) => !row.excelContractor || routePerformanceContractor(row.excelContractor) === "Logisticos");
      rows.push(...logisticosRows);
      if (logisticosRows.length) files.push({ id: file.id, fileName: file.file_name, uploadedAt: file.created_at, rowCount: logisticosRows.length });
    }
    offset += stored.length;
  }
  return { rows, files, fileName: files[0]?.fileName ?? "", uploadedAt: files[0]?.uploadedAt ?? "" };
}

export async function parseRoutePerformanceFile(buffer: Buffer) {
  const XLSX = await import("xlsx");
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames.includes("Viajes") ? "Viajes" : workbook.SheetNames[0]];
  if (!sheet) throw new Error("El Excel no contiene una hoja para leer.");
  const cells = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "", raw: true, blankrows: true });
  return parseRoutePerformanceRows(cells);
}
