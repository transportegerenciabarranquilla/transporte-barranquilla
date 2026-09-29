import "server-only";
import { parseRoutePerformanceRows } from "./routePerformanceImport";
import { supabaseAdminHeaders, supabaseError, supabaseRest } from "./supabaseServer";

export async function readRoutePerformanceFile() {
  const headers = supabaseAdminHeaders();
  if (!headers) throw new Error("Falta configurar la clave de servidor de Supabase para consultar el Excel.");
  const params = new URLSearchParams({ select: "file_name,file_base64,created_at", order: "created_at.desc,id.desc", limit: "1" });
  const response = await fetch(supabaseRest("graficas_route_performance_files", `?${params}`), { headers, cache: "no-store" });
  if (!response.ok) throw new Error(response.status === 404 ? "Falta crear la tabla de Excel. Ejecuta supabase/route_performance_files.sql en Supabase SQL Editor." : await supabaseError(response));
  const stored = ((await response.json()) as Array<{ file_name: string; file_base64: string; created_at: string }>)[0];
  if (!stored) return { rows: [], fileName: "", uploadedAt: "" };
  return { rows: await parseRoutePerformanceFile(Buffer.from(stored.file_base64, "base64")), fileName: stored.file_name, uploadedAt: stored.created_at };
}

export async function parseRoutePerformanceFile(buffer: Buffer) {
  const XLSX = await import("xlsx");
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames.includes("Viajes") ? "Viajes" : workbook.SheetNames[0]];
  if (!sheet) throw new Error("El Excel no contiene una hoja para leer.");
  const cells = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "", raw: true, blankrows: true });
  return parseRoutePerformanceRows(cells);
}
