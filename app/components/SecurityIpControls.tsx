"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";

type IpBlock = { ip: string; reason: string; activatedAt: string };

export default function SecurityIpControls() {
  const [records, setRecords] = useState<IpBlock[]>([]);
  const [currentIp, setCurrentIp] = useState<string | null>(null);
  const [ip, setIp] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const load = useCallback(async () => {
    const response = await fetch("/api/security/ip-blocks", { cache: "no-store" });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "No se pudo consultar el bloqueo por IP.");
    setRecords(body.records || []);
    setCurrentIp(body.currentIp || null);
  }, []);
  useEffect(() => {
    void load().catch((cause) => setError(cause.message)).finally(() => setLoading(false));
  }, [load]);

  async function update(target: string, active: boolean) {
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/security/ip-blocks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ip: target, active, reason }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "No se pudo guardar el cambio.");
      await load();
      setMessage(active ? `IP ${body.ip} bloqueada.` : `IP ${body.ip} desbloqueada.`);
      if (active) { setIp(""); setReason(""); }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo guardar el cambio."); }
    finally { setBusy(false); }
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!window.confirm(`¿Bloquear el acceso desde ${ip}? Afectará a todas las personas que compartan esa IP, excepto tu cuenta de seguridad.`)) return;
    void update(ip, true);
  }

  return <section className="mt-3 border-t border-slate-200 pt-3">
    <h2 className="text-sm font-bold text-slate-900">Bloqueo por IP</h2>
    <p className="mt-1 text-xs text-slate-500">Una IP puede ser compartida por varias personas. La cuenta de Saúl conserva acceso para desbloquear.</p>
    <p className="mt-2 text-xs text-slate-600">Tu IP: <strong>{loading ? "Consultando…" : currentIp || "No disponible; configura la IP de confianza del servidor."}</strong></p>
    <form onSubmit={submit} className="mt-3 space-y-2">
      <label className="block text-xs font-semibold text-slate-700">IP a bloquear<input required maxLength={45} value={ip} onChange={(event) => setIp(event.target.value)} placeholder="Ej. 203.0.113.10" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" /></label>
      <label className="block text-xs font-semibold text-slate-700">Motivo (opcional)<input maxLength={300} value={reason} onChange={(event) => setReason(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" /></label>
      <button type="submit" disabled={busy || loading || !currentIp} className="w-full rounded-lg bg-red-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">{busy ? "Guardando…" : "Bloquear esta IP"}</button>
    </form>
    {error && <p role="alert" className="mt-2 text-xs text-red-700">{error}</p>}
    {message && <p role="status" className="mt-2 text-xs text-emerald-700">{message}</p>}
    <h3 className="mt-4 text-xs font-bold text-slate-700">IP bloqueadas ({records.length})</h3>
    <ul className="mt-2 max-h-48 space-y-2 overflow-y-auto">{records.map((record) => <li key={record.ip} className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 p-2"><div className="min-w-0"><p className="break-all font-mono text-xs text-slate-800">{record.ip}</p><p className="break-words text-[11px] text-slate-500">{record.reason}</p></div><button type="button" disabled={busy} onClick={() => void update(record.ip, false)} className="shrink-0 rounded border border-emerald-200 px-2 py-1 text-xs font-semibold text-emerald-700 disabled:opacity-50">Desbloquear</button></li>)}</ul>
    {!loading && !error && !records.length && <p className="text-xs text-slate-500">No hay IP bloqueadas.</p>}
  </section>;
}
