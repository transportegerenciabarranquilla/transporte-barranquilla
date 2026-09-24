import type { Vehiculo } from "../seguimiento/types";

export const JORNADA_FIELDS = [
  "horaInicioRelevo", "relevador", "causalDesviado", "investigacionDesvio",
  "comentarioDesvio", "metaRelevo", "clasificacionRelevo", "alertaSifPotencial",
] as const;

export type JornadaChanges = Partial<Pick<Vehiculo, typeof JORNADA_FIELDS[number]>>;

// Los PUT de seguimiento e importaciones no son ediciones de jornada.
// Una vez editada por PATCH, incluso los borrados intencionales se conservan.
export function preserveJornada(incoming: Vehiculo, persisted: Vehiculo): Vehiculo {
  const result = { ...incoming };
  for (const field of JORNADA_FIELDS) {
    const value = persisted[field];
    if (persisted.jornadaUpdatedAt || (value && value !== "-" && value !== "Pendiente")) {
      result[field] = value ?? "";
    }
  }
  result.jornadaUpdatedAt = persisted.jornadaUpdatedAt;
  return result;
}
