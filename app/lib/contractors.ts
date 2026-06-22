export const CONTRACTOR_BY_EMAIL: Record<string, string> = {
  "logisticos@bavaria-seguimiento.com": "Logisticos",
  "puntocorona@bavaria-seguimiento.com": "Punto Corona",
  "surticervezas@bavaria-seguimiento.com": "Surti Cervezas",
};

export function contractorForEmail(email: string | null | undefined) {
  return CONTRACTOR_BY_EMAIL[email?.trim().toLowerCase() || ""] || null;
}

export function normalizeContractorName(value: string | null | undefined) {
  return (value || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
}
