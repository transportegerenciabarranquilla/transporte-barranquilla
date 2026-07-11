import type { Vehiculo } from "./types";

export const ROUTE_STATUSES = ["Pendiente por salir", "En ruta", "Pernoctado", "Cargando", "Cambio de fecha", "Recargue", "Retornando", "Finalizado"];

export function getVehicleRecordKey(item: Pick<Vehiculo, "fechaDespacho" | "transporte" | "vehiculo">) {
  const dt = normalizeRecordPart(item.transporte);
  const placa = normalizeRecordPart(item.vehiculo);
  const fecha = normalizeRecordPart(item.fechaDespacho);

  return `${dt || placa}-${fecha || "sin-fecha"}`;
}

export function getVehicleUiKey(item: Pick<Vehiculo, "recordId" | "fechaDespacho" | "transporte" | "vehiculo">) {
  return item.recordId || getVehicleRecordKey(item);
}

function normalizeRecordPart(value: string | number | undefined) {
  return String(value ?? "")
    .toLowerCase()
    .trim()
    .replace(/^dt-?/i, "")
    .replace(/[^a-z0-9-]/g, "");
}

export function getProgress(item: Vehiculo) {
  if (!item.clientes) return 0;
  return Math.round((item.visitados / item.clientes) * 100);
}

export function getPlannedProgress(
  vehicle: Pick<Vehiculo, "clientes" | "visitados" | "horaSalida" | "horaLlegada" | "tiempoRuta" | "tiempoPlaneado" | "status">,
  now: Date,
) {
  const clientes = Number(vehicle.clientes || 0);
  const plannedSeconds = parseDurationToSeconds(getPlannedTimeInputValue(vehicle.tiempoPlaneado));
  if (!clientes || !plannedSeconds) {
    return {
      expected: 0,
      expectedVisited: 0,
      isBehind: false,
      label: "Sin plan",
    };
  }

  const elapsedSeconds = parseDurationToSeconds(calculateRouteTime(vehicle, now));
  if (elapsedSeconds === null) {
    return {
      expected: 0,
      expectedVisited: 0,
      isBehind: false,
      label: "0.0%",
    };
  }

  const expected = Math.min(100, Number(((elapsedSeconds / plannedSeconds) * 100).toFixed(1)));
  const expectedVisited = Math.min(clientes, Math.ceil((expected / 100) * clientes));
  const visitados = Number(vehicle.visitados || 0);
  const progress = Math.min(100, (visitados / clientes) * 100);

  return {
    expected,
    expectedVisited,
    isBehind: progress < expected,
    label: `${expected.toFixed(1)}%`,
  };
}

export function getPlannedTimeInputValue(value: string | number | undefined) {
  const rawValue = String(value ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(rawValue) ? "" : rawValue;
}

export function normalizeCajasTotal(value: number) {
  return roundOperationalTotal(value);
}

export function normalizeHlTotal(value: number) {
  return roundOperationalTotal(value);
}

export function normalizeCajasValue(value: number) {
  return normalizeScaledOperationalValue(value, 20_000);
}

export function normalizeHlValue(value: number) {
  return normalizeScaledOperationalValue(value, 20_000);
}

export function normalizePuntoCoronaVolumeValue(value: number) {
  return normalizeScaledOperationalValue(value, 20_000);
}

function roundOperationalTotal(value: number) {
  return Number.isFinite(value) ? Math.round(value) : 0;
}

function normalizeScaledOperationalValue(value: number, threshold: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.abs(value) >= threshold ? value / 1000 : value;
}

export function getStatus(progress: number, item?: Pick<Vehiculo, "status" | "horaLlegada" | "recargue">) {
  if (hasTimeValue(item?.horaLlegada)) return "Finalizado";
  if (item?.status === "Finalizado") return "Finalizado";
  if (item?.status && ROUTE_STATUSES.includes(item.status)) return item.status;
  if (hasRecargueValue(item?.recargue)) return "Recargue";
  if (progress === 0) return "Cargando";
  if (progress < 100) return "En ruta";
  return "Finalizado";
}

export function hasTimeValue(value: string | undefined) {
  return Boolean(value && value !== "Pendiente" && value !== "-");
}

export function isLateDepartureTime(value: string | undefined) {
  const seconds = parseTimeToSeconds(value);
  return seconds !== null && seconds > 7 * 3600 + 30 * 60;
}

export function hasRecargueValue(value: string | undefined) {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  return Boolean(normalized && !["no", "sin", "sin recargue", "pendiente", "-", "0"].includes(normalized));
}

export function isVehicleScheduledForDate(item: Pick<Vehiculo, "fechaDespacho">, dateKey: string) {
  return toDateKey(item.fechaDespacho) === dateKey;
}

export function toDateKey(value: string | undefined) {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  if (value.includes("/")) {
    const [day, month, year] = value.split("/").map(Number);
    if (!day || !month || !year) return "";
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(parsed.getDate()).padStart(2, "0")}`;
}

export function calculateRouteTime(vehicle: Pick<Vehiculo, "horaSalida" | "horaLlegada" | "tiempoRuta" | "status">, now = new Date()) {
  if (isRouteClockBlockedStatus(vehicle.status) && !hasTimeValue(vehicle.horaLlegada)) return "Pendiente";

  const startSeconds = parseTimeToSeconds(vehicle.horaSalida);
  if (startSeconds === null) return vehicle.tiempoRuta || "Pendiente";

  const arrivalSeconds = parseTimeToSeconds(vehicle.horaLlegada);
  const endSeconds = arrivalSeconds ?? now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
  let elapsedSeconds = endSeconds - startSeconds;

  if (elapsedSeconds < 0) elapsedSeconds += 24 * 3600;

  return formatRouteDuration(elapsedSeconds);
}

export function isRouteClockBlockedStatus(status: string | undefined) {
  return ["Pendiente por salir", "Cargando", "Cambio de fecha", "Pernoctado"].includes(status || "");
}

export function progressColor(progress: number) {
  if (progress < 20) return "bg-red-500";
  if (progress < 50) return "bg-orange-500";
  if (progress < 80) return "bg-[#f5bd19]";
  return "bg-[#0f7c58]";
}

function parseTimeToSeconds(value: string | undefined) {
  if (!hasTimeValue(value)) return null;

  const match = value?.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3] ?? 0);

  if (hours > 23 || minutes > 59 || seconds > 59) return null;

  return hours * 3600 + minutes * 60 + seconds;
}

export function parseDurationToSeconds(value: string | number | undefined) {
  const rawValue = String(value ?? "").trim();
  if (!rawValue || rawValue === "Pendiente" || rawValue === "-" || /^\d{4}-\d{2}-\d{2}$/.test(rawValue)) return null;

  const numericValue = Number(rawValue.replace(",", "."));
  if (Number.isFinite(numericValue) && numericValue > 0) {
    return numericValue > 0 && numericValue < 1 ? Math.round(numericValue * 24 * 3600) : Math.round(numericValue * 3600);
  }

  const timeMatch = rawValue.match(/^(\d{1,3}):([0-5]\d)(?::([0-5]\d))?$/);
  if (timeMatch) {
    return Number(timeMatch[1]) * 3600 + Number(timeMatch[2]) * 60 + Number(timeMatch[3] ?? 0);
  }

  const normalized = rawValue.toLowerCase();
  const hours = normalized.match(/(\d+(?:[.,]\d+)?)\s*h/);
  const minutes = normalized.match(/(\d+(?:[.,]\d+)?)\s*m/);
  const totalSeconds =
    (hours ? Number(hours[1].replace(",", ".")) * 3600 : 0) +
    (minutes ? Number(minutes[1].replace(",", ".")) * 60 : 0);

  return totalSeconds > 0 ? Math.round(totalSeconds) : null;
}

function formatRouteDuration(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}
