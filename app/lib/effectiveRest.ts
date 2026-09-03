export type EffectiveRestSourceRow = {
  identificador?: string;
  nombreCompleto?: string;
  cargo?: string;
  contratista?: string;
  fechaKey?: string;
  entrada?: string;
  salida?: string;
  novedad?: string;
};

export const EFFECTIVE_REST_SECONDS = 10 * 60 * 60 + 10 * 60;

export function normalizeDocument(value: unknown) {
  return String(value || "").replace(/\D/g, "");
}

export function parseClockSeconds(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    const fraction = ((value % 1) + 1) % 1;
    return Math.round(fraction * 86_400) % 86_400;
  }
  const text = String(value || "").trim();
  const numeric = Number(text.replace(",", "."));
  if (/^\d+[.,]\d+$/.test(text) && Number.isFinite(numeric)) {
    return Math.round((((numeric % 1) + 1) % 1) * 86_400) % 86_400;
  }
  const matches = Array.from(text.matchAll(/(\d{1,2})[:.](\d{2})(?::(\d{2}))?\s*(a\.?\s*m\.?|p\.?\s*m\.?)?/gi));
  const match = matches.at(-1);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = Number(match[3] || 0);
  const meridiem = String(match[4] || "").toLowerCase();
  if (meridiem.startsWith("p") && hour < 12) hour += 12;
  if (meridiem.startsWith("a") && hour === 12) hour = 0;
  return hour <= 23 && minute <= 59 && second <= 59 ? hour * 3600 + minute * 60 + second : null;
}

export function effectiveRestEnd(row: EffectiveRestSourceRow) {
  const departure = parseClockSeconds(row.salida);
  if (!row.fechaKey || departure === null) return null;
  const entry = parseClockSeconds(row.entrada);
  const overnightDeparture = entry !== null && departure < entry ? 86_400 : 0;
  const [year, month, day] = row.fechaKey.slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(Date.UTC(year, month - 1, day, 5, 0, 0) + (overnightDeparture + departure + EFFECTIVE_REST_SECONDS) * 1000);
}
