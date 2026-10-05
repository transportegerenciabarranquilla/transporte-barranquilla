import type { Vehiculo } from "../seguimiento/types";
import type { SkinetContext } from "./skinetUnderstanding";

export function skinetRouteAnswer(record: Vehiculo, context: SkinetContext) {
  const label = `DT ${record.transporte} de ${record.transportista} ${context.period}`;
  const rr = `RR: ${record.nombreResponsable || record.responsable || "sin registrar"}`;
  const plate = `Placa: ${record.vehiculo || "sin registrar"}`;
  const status = `Estado: ${record.status || "sin registrar"}`;
  const crew = `Auxiliares: ${[record.nombreAuxiliar1, record.nombreAuxiliar2, record.nombreAuxiliar3].filter(Boolean).join(", ") || "sin registrar"}`;
  const departure = `Salida: ${record.horaSalida || "sin registrar"}`;
  const arrival = `Llegada: ${record.horaLlegada || "sin registrar"}`;
  const fields = { rr, plate, status, crew, departure, arrival };
  return `${label}. ${context.routeField ? fields[context.routeField] : `${rr}. ${plate}. ${status}. ${departure}. ${arrival}`}.`;
}
