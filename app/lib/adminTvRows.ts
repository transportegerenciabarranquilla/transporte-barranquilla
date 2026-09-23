import { createHash } from "node:crypto";
import { readServerCache } from "./serverCache";
import { supabaseError, supabaseRest } from "./supabaseServer";

// Recupera las páginas en grupos pequeños, sin multiplicar consultas por
// contratista. El total permite evitar la consulta vacía al final.
export async function readAdminTvRows<T>(table: string, params: URLSearchParams, headers: Record<string, string>) {
  const url = supabaseRest(table, `?${params}`);
  const scope = createHash("sha256").update(JSON.stringify(headers)).digest("hex");
  return readServerCache<T[]>(`supabase:admin-seguimiento:tv-v1:${scope}:${url}`, 30_000, async () => {
    async function page(offset: number) {
      const query = new URLSearchParams(params);
      query.set("offset", String(offset));
      const response = await fetch(supabaseRest(table, `?${query}`), {
        headers: offset === 0 ? { ...headers, Prefer: "count=exact" } : headers,
        cache: "no-store",
      });
      if (!response.ok) throw new Error(await supabaseError(response));
      const rows = await response.json() as T[];
      const totalValue = response.headers.get("content-range")?.split("/")[1];
      const total = totalValue && /^\d+$/.test(totalValue) ? Number(totalValue) : null;
      return { rows, total };
    }

    const first = await page(0);
    if (!first.rows.length) return [];
    const rows = [...first.rows];
    // Usar el tamaño realmente recibido: Supabase puede aplicar su propio límite.
    const pageSize = first.rows.length;
    if (first.total !== null) {
      for (let offset = pageSize; offset < first.total; offset += pageSize * 4) {
        const offsets = Array.from({ length: 4 }, (_, index) => offset + index * pageSize)
          .filter((value) => value < first.total!);
        const pages = await Promise.all(offsets.map(page));
        pages.forEach((result) => rows.push(...result.rows));
      }
    } else {
      // Compatibilidad si el servidor no proporciona Content-Range.
      for (let offset = rows.length; ;) {
        const result = await page(offset);
        if (!result.rows.length) break;
        rows.push(...result.rows);
        offset += result.rows.length;
      }
    }
    return rows;
  });
}
