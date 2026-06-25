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

export function getStatus(progress: number, item?: Pick<Vehiculo, "status" | "horaLlegada" | "recargue">) {
  if (hasRecargueValue(item?.recargue)) return "Recargue";
  if (item?.status && ROUTE_STATUSES.includes(item.status)) return item.status;
  if (hasTimeValue(item?.horaLlegada)) return "Finalizado";
  if (progress === 0) return "Cargando";
  if (progress < 100) return "En ruta";
  return "Finalizado";
}

export function hasTimeValue(value: string | undefined) {
  return Boolean(value && value !== "Pendiente" && value !== "-");
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

export function calculateRouteTime(vehicle: Pick<Vehiculo, "horaSalida" | "horaLlegada" | "tiempoRuta">, now = new Date()) {
  const startSeconds = parseTimeToSeconds(vehicle.horaSalida);
  if (startSeconds === null) return vehicle.tiempoRuta || "Pendiente";

  const arrivalSeconds = parseTimeToSeconds(vehicle.horaLlegada);
  const endSeconds = arrivalSeconds ?? now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
  let elapsedSeconds = endSeconds - startSeconds;

  if (elapsedSeconds < 0) elapsedSeconds += 24 * 3600;

  return formatRouteDuration(elapsedSeconds);
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

function formatRouteDuration(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}
