export const CONTRACTOR_BY_EMAIL: Record<string, string> = {
  "logisticos@bavaria-seguimiento.com": "Logisticos",
  "puntocorona@bavaria-seguimiento.com": "Punto Corona",
  "surticervezas@bavaria-seguimiento.com": "Surti Cervezas",
};

export const ADMIN_EMAIL = "admin@bavaria-seguimiento.com";
export const PEOPLE_EMAIL = "people@transporte.com";
export const CONTRACTORS = ["Logisticos", "Punto Corona", "Surti Cervezas"] as const;

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
