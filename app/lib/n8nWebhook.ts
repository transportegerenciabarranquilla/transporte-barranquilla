type N8nEvent = { event: string; date: string; contractor: string; records: unknown[]; summary: Record<string, unknown>; emailHtml: string };
function escapeHtml(value: unknown) { return String(value ?? "sin dato").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char] || char)); }
export async function notifyN8n(event: N8nEvent) {
  const url = process.env.N8N_WEBHOOK_URL?.trim(); const secret = process.env.N8N_WEBHOOK_SECRET?.trim();
  if (!url || !secret) return;
  try {
    const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", "x-webhook-secret": secret }, body: JSON.stringify(event), cache: "no-store", signal: AbortSignal.timeout(8000) });
    if (!response.ok) console.error(`No se pudo enviar la modulación a n8n: HTTP ${response.status}.`);
  } catch (error) {
    console.error("No se pudo enviar la modulación a n8n.", error);
  }
}
export { escapeHtml };
