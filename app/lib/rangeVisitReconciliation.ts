import type { PuntoCoronaRouteRow } from "./puntoCoronaRoutesStorage";

// Una reprogramación anterior no debe seguir como cliente fuera de rango
// cuando otra visita del mismo cliente, DT y fecha ya confirma la cercanía.
export function reconcileRangeVisits(rows: PuntoCoronaRouteRow[]) {
  const key = (row: PuntoCoronaRouteRow) => row.pocExternalId && row.dt && row.tourDate
    ? JSON.stringify([row.dt.replace(/\D/g, ""), row.tourDate, row.pocExternalId.trim()])
    : null;
  const confirmed = new Set(rows.filter(row => row.withinRadius === true && row.status !== "NOT_STARTED").map(key).filter(Boolean));
  const superseded: PuntoCoronaRouteRow[] = [];
  const active = rows.filter(row => {
    const identity = key(row);
    if (identity && confirmed.has(identity) && row.withinRadius !== true && ["RESCHEDULED", "NOT_STARTED"].includes(row.status)) {
      superseded.push(row);
      return false;
    }
    return true;
  });
  return { rows: active, superseded };
}
