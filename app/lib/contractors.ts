export const CONTRACTOR_BY_EMAIL: Record<string, string> = {
  "logisticos@bavaria-seguimiento.com": "Logisticos",
  "puntocorona@bavaria-seguimiento.com": "Punto Corona",
  "surticervezas@bavaria-seguimiento.com": "Surti Cervezas",
  "logisticos@transporte.com": "Logisticos Arenosa",
  "corona@transporte.com": "Punto Corona Arenosa",
};

export const ADMIN_EMAIL = "admin@bavaria-seguimiento.com";
export const PEOPLE_EMAIL = "people@transporte.com";
export const CONTRACTORS = ["Logisticos", "Punto Corona", "Surti Cervezas", "Logisticos Arenosa", "Punto Corona Arenosa"] as const;

export function isAdminEmail(email: string | null | undefined) {
  return email?.trim().toLowerCase() === ADMIN_EMAIL;
}

export function isPeopleEmail(email: string | null | undefined) {
  return email?.trim().toLowerCase() === PEOPLE_EMAIL;
}

export function contractorForEmail(email: string | null | undefined) {
  if (isAdminEmail(email)) return "Admin";
  if (isPeopleEmail(email)) return "People";
  return CONTRACTOR_BY_EMAIL[email?.trim().toLowerCase() || ""] || null;
}

export function normalizeContractorName(value: string | null | undefined) {
  return (value || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
}

export function contractorLabel(value: string | null | undefined) {
  const normalized = normalizeContractorName(value);
  if (normalized === "logisticos") return "Logisticos";
  if (normalized === "puntocorona" || normalized === "corona") return "Punto Corona";
  if (normalized === "surticervezas") return "Surti Cervezas";
  if (normalized === "logisticosarenosa") return "Logisticos Arenosa";
  if (normalized === "puntocoronaarenosa" || normalized === "coronaarenosa") return "Punto Corona Arenosa";
  return String(value || "").trim();
}

export function isLogisticosContractor(value: string | null | undefined) {
  const normalized = normalizeContractorName(value);
  return normalized === "logisticos" || normalized === "logisticosarenosa";
}

export function isPuntoCoronaContractor(value: string | null | undefined) {
  const normalized = normalizeContractorName(value);
  return normalized === "puntocorona" || normalized === "corona" || normalized === "puntocoronaarenosa" || normalized === "coronaarenosa";
}

export function contractorSiteName(value: string | null | undefined) {
  return normalizeContractorName(value).endsWith("arenosa") ? "Arenosa" : "Galapa";
}
