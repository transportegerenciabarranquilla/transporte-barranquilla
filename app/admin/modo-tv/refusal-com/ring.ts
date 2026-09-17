export function getVisibleRingPercent(value: number, minVisiblePercent = 6) {
  if (!Number.isFinite(value)) return 0;

  const safeValue = Math.min(100, Math.max(0, value));
  if (safeValue === 0) return 0;

  return Math.max(minVisiblePercent, safeValue);
}
