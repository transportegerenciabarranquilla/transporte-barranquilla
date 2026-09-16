"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, CheckCircle2, ClipboardList, LoaderCircle, RefreshCw, Truck, X, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import type { Vehiculo } from "../seguimiento/types";

type PlateCheck = { capacidad: number | null; placa: string; ok: boolean; error?: string };

const SECOND_TRIP_STATUSES = ["Cargando", "Retornando", "Contando", "En ruta"] as const;

export default function SegundosViajesPage() {
  const router = useRouter();
  const [records, setRecords] = useState<Vehiculo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<Vehiculo | null>(null);
  const [plate, setPlate] = useState("");
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingStatus, setSavingStatus] = useState<string | null>(null);
  const [check, setCheck] = useState<PlateCheck | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/seguimiento", { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "No se pudo cargar los segundos viajes.");
      setRecords(Array.isArray(body.records) ? body.records : []);
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No se pudo cargar los segundos viajes.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const interval = window.setInterval(() => void load(), 30_000);
    return () => window.clearInterval(interval);
  }, [load]);

  const today = bogotaToday();
  const trips = useMemo(
    () => records.filter((record) => isSecondTrip(record.viaje) && recordDate(record) === today),
    [records, today],
  );

  useEffect(() => {
    const panels = Array.from(document.querySelectorAll("section"));
    const statusPanel = panels.find((panel) => panel.querySelector("h2")?.textContent?.trim() === "Estado de los segundos viajes");
    if (!statusPanel) return;

    const actionButtons = Array.from(document.querySelectorAll("button")).filter((button) => button.textContent?.includes("Cambio de placa"));
    const statusSelects = Array.from(statusPanel.querySelectorAll("select"));
    actionButtons.forEach((button, index) => {
      const select = statusSelects[index];
      const cell = button.parentElement;
      if (!select || !cell || cell.contains(select)) return;
      cell.classList.add("flex", "items-center", "justify-end", "gap-2");
      cell.appendChild(select);
    });
    if (statusSelects.length && statusSelects.every((select) => select.parentElement !== statusPanel)) statusPanel.classList.add("hidden");
  }, [trips]);

  function openPlateChange(record: Vehiculo) {
    setSelected(record);
    setPlate("");
    setCheck(null);
    setError("");
  }

  function closePlateChange() {
    if (checking || saving) return;
    setSelected(null);
    setCheck(null);
  }

  async function validatePlate() {
    const normalized = plate.trim().toUpperCase();
    if (!selected || !normalized) {
      setCheck({ capacidad: null, placa: normalized, ok: false, error: "Ingresa una placa." });
      return;
    }

    setChecking(true);
    setCheck(null);
    try {
      const response = await fetch(`/api/capacidad-carga?placa=${encodeURIComponent(normalized)}`, { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      const capacidad = Number(body.capacidad);
      if (!response.ok || !Number.isFinite(capacidad) || capacidad <= 0) {
        setCheck({ capacidad: null, placa: normalized, ok: false, error: "No encontramos la capacidad de esa placa." });
        return;
      }

      const peso = Number(selected.peso || 0);
      setCheck({ capacidad, placa: normalized, ok: capacidad >= peso, error: capacidad >= peso ? undefined : `La placa soporta ${formatNumber(capacidad)} kg y el DT pesa ${formatNumber(peso)} kg.` });
    } catch {
      setCheck({ capacidad: null, placa: normalized, ok: false, error: "No se pudo consultar la capacidad de la placa." });
    } finally {
      setChecking(false);
    }
  }

  async function savePlateChange() {
    if (!selected || !check?.ok || saving) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/seguimiento", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recordId: selected.recordId,
          changes: { vehiculo: check.placa, vehiculoAnterior: selected.vehiculoAnterior || selected.vehiculo, capacidad: check.capacidad, validadorPeso: "Validado por cambio de placa" },
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "No se pudo guardar el cambio de placa.");
      setRecords((current) => current.map((record) => record.recordId === selected.recordId ? { ...record, vehiculo: check.placa, vehiculoAnterior: record.vehiculoAnterior || record.vehiculo, capacidad: check.capacidad || record.capacidad, validadorPeso: "Validado por cambio de placa" } : record));
      setSelected(null);
      setCheck(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No se pudo guardar el cambio de placa.");
    } finally {
      setSaving(false);
    }
  }

  async function updateStatus(record: Vehiculo, status: string) {
    if (!record.recordId || !SECOND_TRIP_STATUSES.includes(status as (typeof SECOND_TRIP_STATUSES)[number])) return;

    setSavingStatus(record.recordId);
    setError("");
    try {
      const response = await fetch("/api/seguimiento", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recordId: record.recordId, changes: { status } }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "No se pudo guardar el estado.");
      setRecords((current) => current.map((item) => item.recordId === record.recordId ? { ...item, status } : item));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No se pudo guardar el estado.");
    } finally {
      setSavingStatus(null);
    }
  }

  return (
    <main className="min-h-screen bg-[#f4f8fb] text-[#10223d]">
      <section className="mx-auto min-h-screen max-w-6xl px-4 py-5 lg:px-8 lg:py-8">
        <header className="mb-5 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button aria-label="Volver al portal" className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 bg-white text-[#10223d] shadow-sm hover:bg-slate-50" onClick={() => router.push("/")} type="button"><ArrowLeft size={19} /></button>
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-orange-100 text-orange-600"><Truck size={24} /></span>
            <div><p className="text-[10px] font-black uppercase tracking-[.18em] text-orange-600">Operación diaria</p><h1 className="text-2xl font-black tracking-tight lg:text-3xl">Segundos viajes</h1><p className="text-sm text-slate-500">DT de viaje 11 · {formatDate(today)}</p></div>
          </div>
          <button aria-label="Actualizar" className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 bg-white text-orange-600 shadow-sm hover:bg-orange-50" onClick={() => void load()} type="button"><RefreshCw className={loading ? "animate-spin" : ""} size={18} /></button>
        </header>

        {error ? <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</div> : null}
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-200 bg-gradient-to-r from-orange-50 to-white px-5 py-4"><div><h2 className="flex items-center gap-2 text-lg font-black"><ClipboardList className="text-orange-600" size={20} />DT pendientes de segundo viaje</h2><p className="mt-0.5 text-xs text-slate-500">Solo se muestran registros identificados como viaje 11.</p></div><span className="rounded-full bg-orange-100 px-3 py-1 text-sm font-black text-orange-700">{trips.length}</span></div>
          <div className="overflow-x-auto"><table className="w-full min-w-[980px] text-left text-sm"><thead className="bg-[#10223d] text-[10px] font-black uppercase tracking-[.12em] text-white"><tr><th className="px-5 py-3">DT</th><th className="px-5 py-3 text-right">Peso DT</th><th className="px-5 py-3">Placa anterior</th><th className="px-5 py-3">Placa nueva</th><th className="px-5 py-3 text-right">Clientes</th><th className="px-5 py-3 text-right">Acción</th></tr></thead><tbody className="divide-y divide-slate-100">{loading ? <tr><td className="px-5 py-12 text-center text-slate-500" colSpan={6}>Cargando segundos viajes...</td></tr> : trips.length ? trips.map((record) => <tr className="hover:bg-orange-50/40" key={record.recordId || `${record.transporte}-${record.fechaDespacho}`}><td className="px-5 py-4 font-black text-[#10223d]">DT {record.transporte || "Sin DT"}</td><td className="px-5 py-4 text-right font-black text-orange-700">{formatNumber(record.peso)} kg</td><td className="px-5 py-4 font-bold text-slate-600">{record.vehiculoAnterior || record.vehiculo || "Sin placa"}</td><td className="px-5 py-4 font-black text-cyan-700">{record.vehiculoAnterior ? record.vehiculo || "Sin placa" : "Pendiente"}</td><td className="px-5 py-4 text-right font-black text-[#10223d]">{Number(record.clientes || 0).toLocaleString("es-CO")}</td><td className="px-5 py-4 text-right"><button className="inline-flex items-center gap-2 rounded-lg bg-orange-600 px-3 py-2 text-xs font-black text-white shadow-sm hover:bg-orange-700" onClick={() => openPlateChange(record)} type="button"><Truck size={15} />Cambio de placa</button></td></tr>) : <tr><td className="px-5 py-14 text-center text-sm text-slate-500" colSpan={6}>No hay segundos viajes registrados para hoy.</td></tr>}</tbody></table></div>
        </section>
      </section>

      {selected ? <div aria-modal="true" className="fixed inset-0 z-50 grid place-items-center bg-slate-950/55 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) closePlateChange(); }} role="dialog"><section className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl"><div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[.16em] text-orange-600">Cambio de placa</p><h2 className="mt-1 text-xl font-black text-[#10223d]">DT {selected.transporte}</h2><p className="mt-1 text-sm text-slate-500">Peso del DT: <strong className="text-orange-700">{formatNumber(selected.peso)} kg</strong></p></div><button aria-label="Cerrar" className="grid h-9 w-9 place-items-center rounded-lg text-slate-500 hover:bg-slate-100" onClick={closePlateChange} type="button"><X size={18} /></button></div><label className="mt-5 block text-xs font-black uppercase tracking-[.12em] text-slate-500">Nueva placa<input autoFocus className="mt-2 h-12 w-full rounded-xl border border-slate-200 px-4 text-lg font-black uppercase text-[#10223d] outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/15" onChange={(event) => { setPlate(event.target.value.toUpperCase()); setCheck(null); }} onKeyDown={(event) => { if (event.key === "Enter") void validatePlate(); }} placeholder="Ej: ABC123" value={plate} /></label><button className="mt-3 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-orange-200 bg-orange-50 text-sm font-black text-orange-700 hover:bg-orange-100 disabled:opacity-50" disabled={checking || saving} onClick={() => void validatePlate()} type="button">{checking ? <LoaderCircle className="animate-spin" size={17} /> : <CheckCircle2 size={17} />}Validar capacidad</button>{check ? <div className={`mt-4 rounded-xl border p-4 ${check.ok ? "border-emerald-200 bg-emerald-50" : "border-red-200 bg-red-50"}`}>{check.ok ? <p className="flex items-center gap-2 text-sm font-black text-emerald-700"><CheckCircle2 size={18} />Placa válida · capacidad {formatNumber(check.capacidad || 0)} kg</p> : <p className="flex items-start gap-2 text-sm font-bold text-red-700"><XCircle className="mt-0.5 shrink-0" size={18} />{check.error}</p>}</div> : null}<button className="mt-4 h-11 w-full rounded-xl bg-[#10223d] text-sm font-black text-white hover:bg-[#1d3a61] disabled:cursor-not-allowed disabled:opacity-40" disabled={!check?.ok || saving} onClick={() => void savePlateChange()} type="button">{saving ? "Guardando..." : "Guardar cambio de placa"}</button></section></div> : null}
      <section className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="border-b border-slate-200 bg-slate-50 px-5 py-3"><h2 className="text-sm font-black text-[#10223d]">Estado de los segundos viajes</h2><p className="mt-0.5 text-xs text-slate-500">Selecciona el estado operativo de cada DT.</p></div><div className="grid gap-2 p-4 sm:grid-cols-2 lg:grid-cols-4">{trips.map((record) => <label className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-3 py-2" key={`status-${record.recordId || record.transporte}`}><span className="text-xs font-black text-[#10223d]">DT {record.transporte || "Sin DT"}</span><select aria-label={`Estado del DT ${record.transporte || "sin número"}`} className={`h-8 rounded-lg border px-2 text-xs font-black outline-none focus:ring-2 focus:ring-orange-500/20 ${statusSelectClass(record.status)}`} disabled={savingStatus === record.recordId} onChange={(event) => void updateStatus(record, event.target.value)} value={SECOND_TRIP_STATUSES.includes(record.status as (typeof SECOND_TRIP_STATUSES)[number]) ? record.status : "Cargando"}>{SECOND_TRIP_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}</select></label>)}</div></section>
    </main>
  );
}

function isSecondTrip(value: string) { return /^(?:viaje\s*)?11(?:\D.*)?$/i.test(String(value || "").trim()); }
function recordDate(record: Vehiculo) { const raw = String(record.fechaDespacho || record.fechaDt || record.date || record.createdAt || ""); if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10); const match = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/); if (!match) return ""; return `${match[3].length === 2 ? `20${match[3]}` : match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`; }
function bogotaToday() { const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date()); const values = Object.fromEntries(parts.map((part) => [part.type, part.value])); return `${values.year}-${values.month}-${values.day}`; }
function formatDate(value: string) { const [year, month, day] = value.split("-"); return year && month && day ? `${day}/${month}/${year}` : value; }
function formatNumber(value: unknown) { return Number(value || 0).toLocaleString("es-CO", { maximumFractionDigits: 2 }); }
function statusSelectClass(status: string) { return status === "En ruta" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : status === "Retornando" ? "border-indigo-200 bg-indigo-50 text-indigo-700" : status === "Contando" ? "border-cyan-200 bg-cyan-50 text-cyan-700" : "border-amber-200 bg-amber-50 text-amber-700"; }
