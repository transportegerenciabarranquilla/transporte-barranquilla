import type { Vehiculo } from "./types";

export function getVehicleRecordKey(item: Pick<Vehiculo, "fechaDespacho" | "transporte" | "vehiculo">) {
  const dt = normalizeRecordPart(item.transporte);
  const placa = normalizeRecordPart(item.vehiculo);
  const fecha = normalizeRecordPart(item.fechaDespacho);

  return `${dt || placa}-${fecha || "sin-fecha"}`;
}

function normalizeRecordPart(value: string | number | undefined) {
  return String(value ?? "")
    .toLowerCase()
    .trim()
    .replace(/^dt-?/i, "")
    .replace(/[^a-z0-9-]/g, "");
}

export function getProgress(item: Vehiculo) {
  return Math.round((item.visitados / item.clientes) * 100);
}

export function getStatus(progress: number) {
  if (progress === 0) return "Cargando";
  if (progress < 100) return "En ruta";
  return "Finalizado";
}

export function progressColor(progress: number) {
  if (progress < 20) return "bg-red-500";
  if (progress < 50) return "bg-orange-500";
  if (progress < 80) return "bg-[#f5bd19]";
  return "bg-[#0f7c58]";
}
