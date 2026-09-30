import { CONTRACTORS, normalizeContractorName } from "./contractors";

export async function getRangoSession(expectedContractor?: string) {
  const response = await fetch("/api/session/session", { cache: "no-store" });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(response.status === 401
      ? "La sesión terminó. Vuelve al portal e inicia sesión con tu contratista."
      : "No se pudo verificar la sesión. Intenta nuevamente.");
  }
  const session = body.session as { contractor?: string; isAdmin?: boolean; isPeople?: boolean } | null;
  if (!session?.contractor || session.isAdmin || session.isPeople || !CONTRACTORS.includes(session.contractor as typeof CONTRACTORS[number])) {
    throw new Error("La sesión activa no es de una contratista. Si cambiaste de cuenta en otra pestaña, vuelve al portal e inicia sesión con tu contratista.");
  }
  if (expectedContractor && normalizeContractorName(session.contractor) !== normalizeContractorName(expectedContractor)) {
    throw new Error(`La sesión cambió a ${session.contractor}. Vuelve al portal para abrir el reporte de esa cuenta o inicia sesión con ${expectedContractor}.`);
  }
  return session as { contractor: string; isAdmin?: boolean; isPeople?: boolean };
}
