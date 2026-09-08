function readOptionalNumber(value: unknown) {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function calculatePendingRefusalBoxes(rejected: unknown, managed: unknown, checkin?: unknown) {
  const checkinValue = readOptionalNumber(checkin);
  if (checkinValue !== null) return Math.max(checkinValue, 0);
  return Math.max((readOptionalNumber(rejected) ?? 0) - (readOptionalNumber(managed) ?? 0), 0);
}
