// Times without a timezone are local BEES times in Colombia.
export function rangeTime(value: unknown): string | null {
  if (value instanceof Date) {
    if (!Number.isFinite(value.getTime())) return null;
    return `${String(value.getHours()).padStart(2, "0")}:${String(value.getMinutes()).padStart(2, "0")}`;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value < 0 || value >= 1) return null;
    const minutes = Math.round(value * 1440) % 1440;
    return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
  }
  const text = String(value ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:?\d{2})$/i.test(text)) {
    const date = new Date(text);
    if (!Number.isFinite(date.getTime())) return null;
    return new Intl.DateTimeFormat("en-GB", { timeZone: "America/Bogota", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(date);
  }
  const match = text.match(/^(?:\d{4}-\d{2}-\d{2}[T ]|\d{1,2}\/\d{1,2}\/\d{4} )?(\d{1,2}):(\d{2})(?::\d{2}(?:\.\d+)?)?\s*([ap])\.?\s*m\.?$/i)
    ?? text.match(/^(?:\d{4}-\d{2}-\d{2}[T ]|\d{1,2}\/\d{1,2}\/\d{4} )?(\d{1,2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  if (minute > 59 || (match[3] ? hour < 1 || hour > 12 : hour > 23)) return null;
  if (match[3]) hour = hour % 12 + (match[3].toLowerCase() === "p" ? 12 : 0);
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export const RANGE_HOURS = Array.from({ length: 24 }, (_, hour) => `${String(hour).padStart(2, "0")}:00–${String(hour).padStart(2, "0")}:59`);

export const RANGE_HOUR_WINDOWS = [
  { value: "6-8", label: "6–8 a. m.", start: 6, end: 8 },
  { value: "8-10", label: "8–10 a. m.", start: 8, end: 10 },
  { value: "10-12", label: "10 a. m.–12 m.", start: 10, end: 12 },
  { value: "12-14", label: "12 m.–2 p. m.", start: 12, end: 14 },
  { value: "14-16", label: "2–4 p. m.", start: 14, end: 16 },
] as const;

export function rangeHour(value: unknown): number | null {
  const time = rangeTime(value);
  return time === null ? null : Number(time.slice(0, 2));
}

export function recordedRangeTime(row: { outOfRadiusRecordedAt?: string; outOfRadiusTime?: string }) {
  return rangeTime(row.outOfRadiusRecordedAt) ?? rangeTime(row.outOfRadiusTime);
}
