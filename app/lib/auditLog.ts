import type { getAuthenticatedSession } from "./authServer";
import { supabaseAdminHeaders, supabaseError, supabaseRest, supabaseUserHeaders } from "./supabaseServer";

export type AuditAction =
  | "asistencia_guardada"
  | "checkin_guardado"
  | "cierre_punto_corona"
  | "cierre_punto_corona_quitado"
  | "modulacion_eliminada"
  | "modulacion_guardada"
  | "punto_corona_archivo_subido"
  | "seguimiento_guardado";

export type AuditLogRecord = {
  id: string;
  action: AuditAction | string;
  module: string;
  contractor: string;
  userEmail: string;
  ipAddress: string;
  userAgent: string;
  device: string;
  recordId: string;
  details: Record<string, unknown>;
  createdAt: string;
};

type Session = Awaited<ReturnType<typeof getAuthenticatedSession>>;

export async function writeAuditLog({
  action,
  contractor,
  details = {},
  module,
  recordId = "",
  request,
  session,
}: {
  action: AuditAction;
  contractor: string;
  details?: Record<string, unknown>;
  module: string;
  recordId?: string;
  request: Request;
  session: Session;
}) {
  const userAgent = request.headers.get("user-agent") || "";
  const ipAddress = getIpAddress(request);
  const createdAt = new Date().toISOString();
  const row = {
    audit_id: `${createdAt}-${crypto.randomUUID()}`,
    action,
    module,
    contractor,
    user_email: session?.email || "publico",
    ip_address: ipAddress,
    user_agent: userAgent,
    device: getDeviceLabel(userAgent),
    record_id: recordId,
    details,
    created_at: createdAt,
  };
  const headers = supabaseAdminHeaders({ Prefer: "return=minimal" }) || (session ? supabaseUserHeaders(session.accessToken, { Prefer: "return=minimal" }) : null);
  if (!headers) return;

  const response = await fetch(supabaseRest("audit_logs"), {
    method: "POST",
    headers,
    body: JSON.stringify(row),
    cache: "no-store",
  });

  if (!response.ok) {
    console.error("No se pudo guardar auditoria", await supabaseError(response));
  }
}

export function fromAuditRow(row: AuditRow): AuditLogRecord {
  return {
    id: readString(row.audit_id),
    action: readString(row.action),
    module: readString(row.module),
    contractor: readString(row.contractor),
    userEmail: readString(row.user_email),
    ipAddress: readString(row.ip_address),
    userAgent: readString(row.user_agent),
    device: readString(row.device),
    recordId: readString(row.record_id),
    details: typeof row.details === "object" && row.details ? row.details as Record<string, unknown> : {},
    createdAt: readString(row.created_at),
  };
}

type AuditRow = {
  audit_id?: unknown;
  action?: unknown;
  module?: unknown;
  contractor?: unknown;
  user_email?: unknown;
  ip_address?: unknown;
  user_agent?: unknown;
  device?: unknown;
  record_id?: unknown;
  details?: unknown;
  created_at?: unknown;
};

function getIpAddress(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip") || "";
}

function getDeviceLabel(userAgent: string) {
  const value = userAgent.toLowerCase();
  const os = value.includes("iphone")
    ? "iPhone"
    : value.includes("ipad")
      ? "iPad"
      : value.includes("android")
        ? "Android"
        : value.includes("windows")
          ? "Windows"
          : value.includes("mac os")
            ? "Mac"
            : "Dispositivo";
  const browser = value.includes("edg/")
    ? "Edge"
    : value.includes("chrome/")
      ? "Chrome"
      : value.includes("safari/")
        ? "Safari"
        : value.includes("firefox/")
          ? "Firefox"
          : "Navegador";

  return `${os} ${browser}`;
}

function readString(value: unknown) {
  return String(value ?? "").trim();
}
