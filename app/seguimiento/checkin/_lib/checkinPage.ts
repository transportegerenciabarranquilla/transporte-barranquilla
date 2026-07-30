import type { CheckinCajasRegistro } from "../../../lib/checkinStorage";
import { getLocalDateKey, normalizeDt, summarizeModulaciones } from "../../../lib/modulacionStorage";
import type { Vehiculo } from "../../types";

export type CheckinRow = {
  vehicle: Vehiculo;
  checkin?: CheckinCajasRegistro;
  resumen: ReturnType<typeof summarizeModulaciones>;
  key: string;
};

export type CheckinTotals = {
  vehiculos: number;
  moduladas: number;
  gestionadas: number;
  checkinsRealizados: number;
  final: number;
};

export function calculateCheckinTotals(rows: CheckinRow[]): CheckinTotals {
  return rows.reduce(
    (acc, row) => ({
      vehiculos: acc.vehiculos + 1,
      moduladas: acc.moduladas + row.resumen.cajasRechazadas,
      gestionadas: acc.gestionadas + row.resumen.cajasGestionadas,
      checkinsRealizados: acc.checkinsRealizados + (row.checkin ? 1 : 0),
      final: acc.final + row.resumen.cajasPendientes,
    }),
    { vehiculos: 0, moduladas: 0, gestionadas: 0, checkinsRealizados: 0, final: 0 },
  );
}

export function hasDeparture(vehicle: Vehiculo) {
  const salida = (vehicle.horaSalida || "").trim().toLowerCase();
  return salida !== "" && salida !== "pendiente" && salida !== "-";
}

export function isVehicleForDate(vehicle: Vehiculo, dateKey: string) {
  return toDateKey(vehicle.fechaDespacho || vehicle.date || vehicle.createdAt) === dateKey;
}

export function areEquivalentCheckins(left: CheckinCajasRegistro[], right: CheckinCajasRegistro[]) {
  if (left.length !== right.length) return false;
  const serialize = (records: CheckinCajasRegistro[]) =>
    [...records]
      .map((record) => ({ dt: normalizeDt(record.dt), totalCajas: Number(record.totalCajas || 0) }))
      .sort((a, b) => a.dt.localeCompare(b.dt))
      .map((record) => `${record.dt}:${record.totalCajas}`)
      .join("|");
  return serialize(left) === serialize(right);
}

function toDateKey(value: string | undefined) {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  if (value.includes("/")) {
    const [day, month, year] = value.split("/").map(Number);
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value.slice(0, 10);
  return getLocalDateKey(parsed);
}
