// JSON data only. Preserve references down to each unchanged record and field.
export function shareJsonValue<T>(previous: T, incoming: T): T {
  if (previous === incoming) return previous;
  if (!previous || !incoming || typeof previous !== "object" || typeof incoming !== "object") return incoming;
  if (Array.isArray(previous) && Array.isArray(incoming)) {
    const next = incoming.map((value, index) => shareJsonValue(previous[index], value));
    return (next.length === previous.length && next.every((value, index) => value === previous[index]) ? previous : next) as T;
  }
  if (Array.isArray(previous) || Array.isArray(incoming)) return incoming;
  const old = previous as Record<string, unknown>;
  const source = incoming as Record<string, unknown>;
  const next: Record<string, unknown> = {};
  let equal = Object.keys(old).length === Object.keys(source).length;
  for (const key of Object.keys(source)) {
    next[key] = shareJsonValue(old[key], source[key]);
    if (!Object.prototype.hasOwnProperty.call(old, key) || next[key] !== old[key]) equal = false;
  }
  return (equal ? previous : next) as T;
}

export function shareRecordsByKey<T>(previous: T[], incoming: T[], getKey: (record: T) => string): T[] {
  const byKey = new Map(previous.map(record => [getKey(record), record]));
  const next = incoming.map(record => shareJsonValue(byKey.get(getKey(record)), record) as T);
  return next.length === previous.length && next.every((record, index) => record === previous[index]) ? previous : next;
}
