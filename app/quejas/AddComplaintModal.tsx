"use client";

import { useEffect, useRef, useState } from "react";
import { LoaderCircle, X } from "lucide-react";
import { complaintIdentityKey, type ComplaintRecord } from "../lib/complaints";

export default function AddComplaintModal({ contractors, onClose, onSaved }: {
  contractors: readonly string[];
  onClose: () => void;
  onSaved: (record: ComplaintRecord) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const savingRef = useRef(false);
  const [form, setForm] = useState(() => ({ id: "", createdDate: new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()), code: "", establishment: "", issue: "", contractor: "", dt: "", orderNumber: "", comments: "" }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [clientResult, setClientResult] = useState<{ code: string; name: string; message: string } | null>(null);
  const [tracking, setTracking] = useState<{ key: string; record?: ComplaintRecord; message: string } | null>(null);
  const trackingKey = JSON.stringify([form.dt, form.createdDate, form.contractor]);
  const currentClient = clientResult?.code === form.code ? clientResult : null;
  const currentTracking = tracking?.key === trackingKey ? tracking : null;
  const clientPending = Boolean(form.code.trim() && !currentClient);
  const trackingPending = Boolean(form.dt.trim() && !currentTracking);
  const establishment = currentClient?.name || form.establishment;

  useEffect(() => {
    dialog.current?.showModal();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, []);

  useEffect(() => {
    if (!form.code.trim()) return;
    const controller = new AbortController();
    const code = form.code;
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/clientes?codigo=${encodeURIComponent(code.replace(/\D/g, ""))}`, { cache: "no-store", signal: controller.signal });
        const body = await response.json();
        if (!response.ok && response.status !== 404) throw new Error();
        const name = String(body?.cliente?.nombre || "").trim();
        if (!controller.signal.aborted) setClientResult({ code, name, message: name ? "Cliente encontrado. Establecimiento completado." : "Cliente no encontrado. Puedes escribir el establecimiento." });
      } catch {
        if (!controller.signal.aborted) setClientResult({ code, name: "", message: "No se pudo consultar el cliente. Puedes escribir el establecimiento." });
      }
    }, 450);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [form.code]);

  useEffect(() => {
    if (!form.dt.trim()) return;
    const controller = new AbortController();
    const key = JSON.stringify([form.dt, form.createdDate, form.contractor]);
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch("/api/complaints", { method: "POST", headers: { "Content-Type": "application/json" }, signal: controller.signal, body: JSON.stringify({ action: "preview", records: [{ dt: form.dt, createdDate: form.createdDate, contractor: form.contractor }] }) });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "No se pudo consultar el DT.");
        if (!controller.signal.aborted) setTracking({ key, record: body.record, message: body.record?.matched ? "DT cruzado con Seguimiento." : "Sin coincidencias para este DT. Puedes guardar la queja y completar el transportista." });
      } catch (caught) {
        if (!controller.signal.aborted) setTracking({ key, message: caught instanceof Error ? caught.message : "No se pudo consultar el DT." });
      }
    }, 450);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [form.dt, form.createdDate, form.contractor]);

  function update(key: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [key]: value, ...(key === "code" ? { establishment: "" } : {}) }));
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (savingRef.current || clientPending || trackingPending) return;
    if (!complaintIdentityKey(form.id)) { setError("El ID debe contener letras o números."); return; }
    if (!form.issue.trim()) { setError("Escribe la novedad."); return; }
    savingRef.current = true;
    setSaving(true); setError("");
    try {
      const response = await fetch("/api/complaints", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "create", records: [{ ...form, establishment }] }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "No se pudo guardar la queja.");
      onSaved(body.records[0]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No se pudo guardar la queja.");
    } finally { savingRef.current = false; setSaving(false); }
  }

  const inputClass = "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-slate-900 disabled:bg-slate-100";
  const crew = currentTracking?.record;
  return <dialog ref={dialog} aria-labelledby="add-complaint-title" onCancel={(event) => { event.preventDefault(); if (!saving) onClose(); }} className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-3xl overflow-y-auto rounded-2xl bg-white p-0 text-slate-900 shadow-2xl backdrop:bg-slate-950/60">
    <form onSubmit={(event) => void save(event)}>
      <header className="flex items-center justify-between border-b border-slate-200 p-5"><div><h2 id="add-complaint-title" className="text-xl font-black text-[#10223d]">Añadir queja</h2><p className="mt-1 text-sm text-slate-500">Registra una queja y consulta sus cruces antes de guardar.</p></div><button aria-label="Cerrar" disabled={saving} onClick={onClose} type="button" className="rounded-lg p-2 hover:bg-slate-100"><X size={20} /></button></header>
      <fieldset disabled={saving} className="grid gap-4 p-5 sm:grid-cols-2">
        <label className="text-sm font-bold">ID *<input autoFocus required className={inputClass} value={form.id} onChange={(event) => update("id", event.target.value)} /></label>
        <label className="text-sm font-bold">Fecha de creación *<input required type="date" className={inputClass} value={form.createdDate} onChange={(event) => update("createdDate", event.target.value)} /></label>
        <label className="text-sm font-bold">Código del cliente<input inputMode="numeric" pattern="[0-9 ]*" className={inputClass} value={form.code} onChange={(event) => update("code", event.target.value)} /><span className="mt-1 block text-xs font-normal text-slate-500" role="status">{clientPending ? "Buscando cliente…" : currentClient?.message}</span></label>
        <label className="text-sm font-bold">Establecimiento<input readOnly={Boolean(currentClient?.name)} className={inputClass} value={establishment} onChange={(event) => update("establishment", event.target.value)} /></label>
        <label className="text-sm font-bold">DT<input inputMode="numeric" className={inputClass} value={form.dt} onChange={(event) => update("dt", event.target.value)} /></label>
        <label className="text-sm font-bold">Transportista<select className={inputClass} value={form.contractor} onChange={(event) => update("contractor", event.target.value)}><option value="">Asignar por cruce del DT</option>{contractors.map((contractor) => <option key={contractor}>{contractor}</option>)}</select></label>
        {form.dt.trim() ? <section aria-live="polite" className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm sm:col-span-2"><p>{trackingPending ? "Consultando Seguimiento…" : currentTracking?.message}</p>{crew?.matched ? <dl className="mt-2 grid gap-2 sm:grid-cols-2">{[["Transportista", crew.contractor], ["Placa", crew.plate], ["Responsable", crew.responsible], ["Conductor", crew.driver], ["Auxiliar", crew.auxiliary]].map(([label, value]) => <div key={label}><dt className="text-xs text-slate-500">{label}</dt><dd className="font-bold">{value || "Sin información"}</dd></div>)}</dl> : null}</section> : null}
        <label className="text-sm font-bold sm:col-span-2">Novedad *<textarea required rows={3} className={inputClass} value={form.issue} onChange={(event) => update("issue", event.target.value)} /></label>
        <label className="text-sm font-bold">Número de pedido<input className={inputClass} value={form.orderNumber} onChange={(event) => update("orderNumber", event.target.value)} /></label>
        <label className="text-sm font-bold">Estado<input readOnly className={inputClass} value="Abierta" /></label>
        <label className="text-sm font-bold sm:col-span-2">Comentarios<textarea maxLength={2000} rows={2} className={inputClass} value={form.comments} onChange={(event) => update("comments", event.target.value)} /></label>
        <div className="rounded-lg bg-slate-100 p-3 text-sm sm:col-span-2"><b>Tiempo para cierre</b><p className="mt-1 text-slate-600">Se calcula automáticamente al guardar según la fecha de creación y la regla de cierre de 48 horas del módulo.</p></div>
      </fieldset>
      {error ? <p role="alert" className="mx-5 mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
      <footer className="flex justify-end gap-3 border-t border-slate-200 p-5"><button disabled={saving} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold disabled:opacity-50" onClick={onClose} type="button">Cancelar</button><button disabled={saving || clientPending || trackingPending} className="inline-flex items-center gap-2 rounded-lg bg-red-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50" type="submit">{saving ? <LoaderCircle size={16} className="animate-spin" /> : null}{saving ? "Guardando…" : "Guardar queja"}</button></footer>
    </form>
  </dialog>;
}
