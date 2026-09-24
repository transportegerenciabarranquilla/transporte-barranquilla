import { normalizeContractorName } from "./contractors";
import { supabaseRest } from "./supabaseServer";

/** Never use a privileged ON CONFLICT UPDATE with a browser-supplied global ID.
 * Updates include the persisted owner in the WHERE clause. New IDs use INSERT
 * without upsert, so a concurrent insertion cannot turn into an ownership change.
 * Batches are not transactional; callers must invalidate caches after any write.
 */
export async function scopedWrite(
  table: string,
  idColumn: string,
  rows: Array<Record<string, unknown> & { contractor: string }>,
  headers: Record<string, string>,
  options: { legacyOwnerField?: "transportista"; expectedVersions?: Map<string, string | null> } = {},
) {
  if (rows.some((row) => typeof row[idColumn] !== "string" || !String(row[idColumn]).trim() || String(row[idColumn]).length > 500)) {
    return Response.json({ error: "Identificador de registro inválido." }, { status: 400 });
  }
  const unique = [...new Map(rows.map((row) => [row[idColumn], row])).values()];
  const existing = new Map<string, { contractor: string | null; owner: string }>();
  for (let offset = 0; offset < unique.length; offset += 50) {
    const batch = unique.slice(offset, offset + 50);
    const params = new URLSearchParams({
      select: `${idColumn},contractor${options.legacyOwnerField ? ",data" : ""}`,
      [idColumn]: `in.(${batch.map((row) => JSON.stringify(row[idColumn])).join(",")})`,
      limit: "50",
    });
    const response = await fetch(supabaseRest(table, `?${params}`), { headers, cache: "no-store" });
    if (!response.ok) return Response.json({ error: "No se pudo verificar la propiedad de los registros." }, { status: 503 });
    const found = await response.json() as Array<Record<string, unknown>>;
    for (const row of found) {
      const incoming = batch.find((item) => item[idColumn] === row[idColumn]);
      // Solo usar el propietario histórico persistido cuando contractor es NULL.
      // Nunca aceptar el transportista enviado por el cliente como prueba.
      const legacyData = row.data as Record<string, unknown> | null | undefined;
      const owner = row.contractor === null && options.legacyOwnerField
        ? legacyData?.[options.legacyOwnerField]
        : row.contractor;
      if (!incoming || typeof owner !== "string" || !owner || normalizeContractorName(owner) !== normalizeContractorName(incoming.contractor)) {
        return Response.json({ error: "No puedes modificar registros de otra contratista." }, { status: 403 });
      }
      existing.set(String(row[idColumn]), { contractor: row.contractor === null ? null : String(row.contractor), owner });
      if (options.expectedVersions && !options.expectedVersions.has(String(row[idColumn]))) {
        return Response.json({ error: "Una ruta cambió durante el guardado. Recarga antes de reintentar." }, { status: 409 });
      }
    }
  }
  const newRows = unique.filter((row) => !existing.has(String(row[idColumn])));
  if (options.expectedVersions && newRows.some((row) => options.expectedVersions!.has(String(row[idColumn])))) {
    return Response.json({ error: "Una ruta se eliminó durante el guardado. Recarga antes de reintentar." }, { status: 409 });
  }
  if (newRows.length) {
    const inserted = await fetch(supabaseRest(table), {
      method: "POST", headers: { ...headers, Prefer: "return=minimal" },
      body: JSON.stringify(newRows), cache: "no-store",
    });
    if (!inserted.ok) return Response.json({ error: "No se pudieron insertar los registros. Recarga antes de reintentar." }, { status: inserted.status === 409 ? 409 : 502 });
  }
  const updates = unique.filter((row) => existing.has(String(row[idColumn])));
  for (let offset = 0; offset < updates.length; offset += 10) {
    const results = await Promise.all(updates.slice(offset, offset + 10).map(async (row) => {
      const stored = existing.get(String(row[idColumn]))!;
      const params = new URLSearchParams({
        [idColumn]: `eq.${row[idColumn]}`,
        contractor: stored.contractor === null ? "is.null" : `eq.${stored.contractor}`,
        select: idColumn,
      });
      if (stored.contractor === null && options.legacyOwnerField) {
        params.set(`data->>${options.legacyOwnerField}`, `eq.${stored.owner}`);
      }
      if (options.expectedVersions) {
        const version = options.expectedVersions.get(String(row[idColumn]));
        params.set("updated_at", version == null ? "is.null" : `eq.${version}`);
      }
      const response = await fetch(supabaseRest(table, `?${params}`), {
        method: "PATCH", headers: { ...headers, Prefer: "return=representation" },
        body: JSON.stringify(row), cache: "no-store",
      });
      if (!response.ok) return false;
      const saved = await response.json();
      return Array.isArray(saved) && saved.length === 1;
    }));
    if (results.some((ok) => !ok)) return Response.json({ error: "No se confirmó toda la actualización. Recarga antes de reintentar." }, { status: 409 });
  }
  return null;
}
