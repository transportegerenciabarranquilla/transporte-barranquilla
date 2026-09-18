export function dedupeUpsertRows<T extends { record_id: string; updated_at?: string }>(rows: T[]) {
  const byId = new Map<string, T>();

  for (const row of rows) {
    const rowId = String(row.record_id || "").trim();
    if (!rowId) continue;

    const current = byId.get(rowId);
    if (!current) {
      byId.set(rowId, row);
      continue;
    }

    const currentTime = Date.parse(String(current.updated_at || ""));
    const incomingTime = Date.parse(String(row.updated_at || ""));
    const shouldReplace = Number.isFinite(incomingTime) && (!Number.isFinite(currentTime) || incomingTime >= currentTime);

    if (shouldReplace) byId.set(rowId, row);
  }

  return Array.from(byId.values());
}
