export type ComplaintRecord = {
  id: string;
  closingTime: string;
  createdDate: string;
  code: string;
  establishment: string;
  orderNumber: string;
  comments: string;
  issue: string;
  dt: string;
  contractor: string;
  plate: string;
  responsible: string;
  responsibleId: string;
  driver: string;
  driverId: string;
  auxiliary: string;
  auxiliaryId: string;
  uploadedBy: string;
  uploadedAt: string;
  matched: boolean;
  status: string;
  evidence?: { path: string; name: string; type: string; uploadedAt: string; uploadedBy: string };
  closedAt?: string;
  closedBy?: string;
};

export const COMPLAINT_TEMPLATE_COLUMNS = ["id", "tiempo para cierre", "fecha creacion", "Codigo", "establecimiento", "novedad", "transportista", "estado", "dt"] as const;

export function normalizeComplaintDt(value: unknown) {
  const digits = String(value ?? "").replace(/\D/g, "").replace(/^0+/, "");
  return digits.length > 10 && digits.startsWith("10") ? digits.slice(-10) : digits;
}

export function complaintIdentityKey(value: unknown) {
  return String(value ?? "").trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
}

export function complaintDateKey(value: unknown) {
  if (value instanceof Date && Number.isFinite(value.getTime())) return localDateKey(value);
  const text = String(value ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  const match = text.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})/);
  if (match) return `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? "" : localDateKey(parsed);
}

export function complaintClosingDeadline(uploadedAt: string) {
  const startedAt = new Date(uploadedAt).getTime();
  return Number.isFinite(startedAt) ? new Date(startedAt + 48 * 60 * 60 * 1000).toISOString() : "";
}

function localDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
