export const RANGE_REASONS = [
  "Apoyo de ingreso",
  "Reubicación",
  "Cambio de Coordenadas",
  "Reconstrucción",
  "Multiparada",
  "Segunda Visita",
  "Mala practicas",
] as const;

export function isRangeReason(value: unknown): value is (typeof RANGE_REASONS)[number] {
  return typeof value === "string" && RANGE_REASONS.some((reason) => reason === value);
}
