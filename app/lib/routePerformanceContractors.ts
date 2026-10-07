export const ROUTE_PERFORMANCE_CONTRACTORS = ["Logisticos", "Surti Cervezas"] as const;

export function routePerformanceContractor(value: string | null | undefined) {
  const normalized = (value || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
  if (normalized === "surticervezas" || normalized === "surti") return "Surti Cervezas";
  if (normalized === "logisticos") return "Logisticos";
  if (normalized === "hllogisticos" || normalized === "hllogistica" || normalized === "hl") return "HL Logisticos";
  return "";
}
