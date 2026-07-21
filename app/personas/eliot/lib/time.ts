import type { TdStatus } from "./types";

const DAY_SECONDS = 24 * 60 * 60;

export function parseTimeSeconds(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;

  if (typeof value === "number" && Number.isFinite(value)) {
    const fraction = ((value % 1) + 1) % 1;
    return normalizeDaySeconds(Math.round(fraction * DAY_SECONDS));
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.getHours() * 3600 + value.getMinutes() * 60 + value.getSeconds();
  }

  const text = String(value).trim();
  if (!text || /sin\s*marcaci[oó]n|pendiente|#valor/i.test(text)) return null;

  const match = text.match(/(?:^|\s)(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s|$)/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3] || 0);
  if (hours > 23 || minutes > 59 || seconds > 59) return null;
  return hours * 3600 + minutes * 60 + seconds;
}

export function calculateTdSeconds(departure: number | null, arrival: number | null): number | null {
  if (departure === null || arrival === null) return null;
  let difference = departure - arrival;
  if (difference < 0 && Math.abs(difference) >= 12 * 3600) difference += DAY_SECONDS;
  if (difference < 0 || difference > 12 * 3600) return null;
  return difference;
}

export function classifyTd(seconds: number | null): TdStatus {
  if (seconds === null) return "sin-marcacion";
  if (seconds > 60 * 60) return "mal";
  if (seconds > 40 * 60) return "regular";
  return "bien";
}

export function formatDuration(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds)) return "Sin marcación";
  const safe = Math.max(0, Math.round(seconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const remainder = safe % 60;
  return [hours, minutes, remainder].map((value) => String(value).padStart(2, "0")).join(":");
}

export function formatClock(seconds: number | null): string {
  if (seconds === null) return "Sin marcación";
  return formatDuration(seconds);
}

export function formatCountdown(milliseconds: number): string {
  const safe = Math.max(0, milliseconds);
  const totalSeconds = Math.ceil(safe / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map((value) => String(value).padStart(2, "0")).join(":");
}

function normalizeDaySeconds(seconds: number) {
  return seconds >= DAY_SECONDS ? 0 : seconds;
}
