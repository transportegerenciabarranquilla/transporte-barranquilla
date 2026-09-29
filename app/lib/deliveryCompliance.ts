import { matchRoutePerformance, performanceDate, type PerformanceVehicle, type RoutePerformanceRow } from "./routePerformanceImport";
import { routePerformanceContractor } from "./routePerformanceContractors";
import { normalizeContractorName } from "./contractors";

// El cruce usa todos los candidatos antes de filtrar para no convertir una
// placa compartida por varias contratistas en una coincidencia falsa de HL.
export function deliveryComplianceRows(rows: RoutePerformanceRow[], records: PerformanceVehicle[]) {
  const seen = new Set<string>();
  const vehicles = records.filter((record) => {
    const dt = String(record.transporte || "").replace(/\D/g, "");
    if (!dt) return true;
    const date = performanceDate(record.fechaDespacho || record.fechaDt || record.date || record.createdAt);
    const key = `${normalizeContractorName(record.transportista)}:${dt}:${date}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const explicitRows = rows.filter((row) => routePerformanceContractor(row.excelContractor) === "HL Logisticos");
  const unidentifiedRows = rows.filter((row) => !row.excelContractor.trim());
  return [
    ...matchRoutePerformance(explicitRows, vehicles.filter((record) => routePerformanceContractor(record.transportista) === "HL Logisticos")),
    ...matchRoutePerformance(unidentifiedRows, vehicles),
  ]
    .filter((row) => routePerformanceContractor(row.contractor) === "HL Logisticos")
    .map((row) => ({ ...row, contractor: "HL Logisticos" }))
    .sort((a, b) => a.fila - b.fila);
}
