"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, CheckCircle2, ClipboardList, LoaderCircle, RefreshCw, Truck, X, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import hlLogisticaLogo from "../imagenes/logo hl.jpeg";
import surtiLogo from "../imagenes/logo surti.jpeg";
import logisticosLogo from "../imagenes/logisticos logo.webp";
import { normalizeContractorName } from "../lib/contractors";
import type { Vehiculo } from "../seguimiento/types";

type PlateCheck = { capacidad: number | null; placa: string; ok: boolean; error?: string };

const SECOND_TRIP_STATUSES = ["Cargando", "Retornando", "Contando", "En ruta" , "En muelle" , "pendiente"] as const;

export default function SegundosViajesPage() {
  const router = useRouter();
  const [records, setRecords] = useState<Vehiculo[]>([]);
  const [contractor, setContractor] = useState("");
  const [logoUnavailable, setLogoUnavailable] = useState(false);
  const contractorLogo = contractor === "hllogisticos"
    ? { src: hlLogisticaLogo, alt: "HL Logísticos" }
    : contractor === "surticervezas"
      ? { src: surtiLogo, alt: "Surti Cervezas" }
      : contractor === "logisticos"
        ? { src: logisticosLogo, alt: "Logísticos" }
        : null;
  const pageTitle = contractor === "logisticos"
    ? "Segundos viajes Logísticos"
    : contractorLogo ? `Segundos viajes de ${contractorLogo.alt}` : "Segundos viajes";
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [selected, setSelected] = useState<Vehiculo | null>(null);
  const [plate, setPlate] = useState("");
  const [dt, setDt] = useState("");
  const [previousPlate, setPreviousPlate] = useState("");
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingStatus, setSavingStatus] = useState<string | null>(null);
  const [check, setCheck] = useState<PlateCheck | null>(null);
  const mutationVersion = useRef(0);
  const pendingWrites = useRef(0);

  const load = useCallback(async () => {
    if (pendingWrites.current) return;
    const version = mutationVersion.current;
    try {
      const response = await fetch("/api/seguimiento", { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (version !== mutationVersion.current) return;
      if (!response.ok) throw new Error(body.error || "No se pudo cargar los segundos viajes.");
      setRecords(Array.isArray(body.records) ? body.records : []);
      setError("");
    } catch (caught) {
      if (version !== mutationVersion.current) return;
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

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/session/session", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) return;
        const body = await response.json();
        if (!controller.signal.aborted) {
          setContractor(normalizeContractorName(body.session?.contractor));
          setLogoUnavailable(false);
        }
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);

  const today = bogotaToday();
  const trips = useMemo(
    () => records.filter((record) => isSecondTrip(record.viaje) && recordDate(record) === today),
    [records, today],
  );

  function openPlateChange(record: Vehiculo) {
    setSuccess("");
    setSelected(record);
    setDt(record.transporte || "");
    setPreviousPlate(record.vehiculoAnterior || record.vehiculo || "");
    setPlate(record.vehiculoAnterior ? record.vehiculo : "");
    setCheck(null);
    setError("");
  }

  function closePlateChange() {
    if (checking || saving) return;
    setSelected(null);
    setCheck(null);
  }

  async function validatePlate() {
    const normalized = (plate.trim() || previousPlate.trim()).toUpperCase();
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
    if (!selected || saving || checking) return;
    const normalizedDt = dt.trim();
    const previous = previousPlate.trim().toUpperCase();
    const next = plate.trim().toUpperCase();
    const effectivePlate = next || previous;
    const needsValidation = effectivePlate !== selected.vehiculo || Boolean(next && !selected.vehiculoAnterior);
    if (!normalizedDt || !previous) {
      setError("Ingresa el DT y la placa anterior.");
      return;
    }
    if (needsValidation && (!check?.ok || check.placa !== effectivePlate)) {
      setError("Valida la capacidad de la placa antes de guardar.");
      return;
    }
    setSaving(true);
    mutationVersion.current += 1;
    pendingWrites.current += 1;
    setError("");
    try {
      const response = await fetch("/api/seguimiento", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recordId: selected.recordId,
          changes: {
            transporte: normalizedDt,
            vehiculo: effectivePlate,
            vehiculoAnterior: next ? previous : "",
            ...(check?.ok && check.placa === effectivePlate ? { capacidad: check.capacidad, validadorPeso: "validado" } : {}),
          }
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "No se pudieron guardar el DT y las placas.");
      if (!body.record || body.record.recordId !== selected.recordId) throw new Error("No se confirmó el registro guardado. Intenta nuevamente.");
      setRecords((current) => current.map((record) => record.recordId === selected.recordId ? body.record : record));
      setSuccess(`DT ${body.record.transporte}: cambios de DT y placas guardados correctamente.`);
      setSelected(null);
      setCheck(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No se pudieron guardar el DT y las placas.");
    } finally {
      pendingWrites.current -= 1;
      setSaving(false);
    }
  }

  async function updateStatus(record: Vehiculo, status: string) {
    if (!record.recordId || !SECOND_TRIP_STATUSES.includes(status as (typeof SECOND_TRIP_STATUSES)[number])) return;

    setSavingStatus(record.recordId);
    mutationVersion.current += 1;
    pendingWrites.current += 1;
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
      pendingWrites.current -= 1;
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
            <div><p className="text-[10px] font-black uppercase tracking-[.18em] text-orange-600">Operación diaria</p><h1 className="text-2xl font-black tracking-tight lg:text-3xl">{pageTitle}</h1><p className="text-sm text-slate-500">DT de viaje 11 · {formatDate(today)}</p></div>
          </div>
          <button aria-label="Actualizar" className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 bg-white text-orange-600 shadow-sm hover:bg-orange-50" onClick={() => void load()} type="button"><RefreshCw className={loading ? "animate-spin" : ""} size={18} /></button>
        </header>

        {error ? <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</div> : null}
        {success ? <div role="status" className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">{success}</div> : null}
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-gradient-to-r from-orange-50 to-white px-5 py-4">
            <div className="flex min-w-0 items-center gap-3 sm:gap-4">
              {contractorLogo && !logoUnavailable ? (
                <Image
                  src={contractorLogo.src}
                  alt={contractorLogo.alt}
                  width={96}
                  height={90}
                  unoptimized
                  onError={() => setLogoUnavailable(true)}
                  className="h-16 w-[68px] shrink-0 rounded-lg bg-white object-contain p-1 sm:h-[90px] sm:w-24"
                />
              ) : null}
              <div className="min-w-0">
                <h2 className="flex items-center gap-2 text-lg font-black">
                  {!contractorLogo || logoUnavailable ? <ClipboardList className="shrink-0 text-orange-600" size={20} /> : null}
                  {contractorLogo ? pageTitle : "DT pendientes de segundo viaje"}
                </h2>
                <p className="mt-0.5 text-xs text-slate-500">Solo se muestran registros identificados como viaje 11.</p>
              </div>
            </div>
            <span className="shrink-0 rounded-full bg-orange-100 px-3 py-1 text-sm font-black text-orange-700">{trips.length}</span>
          </div>
          <div className="overflow-x-auto"><table className="w-full min-w-[820px] text-left text-sm"><thead className="bg-[#10223d] text-[10px] font-black uppercase tracking-[.12em] text-white"><tr><th className="px-5 py-3">DT</th><th className="px-5 py-3">Placa anterior</th><th className="px-5 py-3">Placa nueva</th><th className="px-5 py-3 text-right">Clientes</th><th className="px-5 py-3 text-right">Acción</th></tr></thead><tbody className="divide-y divide-slate-100">{loading ? <tr><td className="px-5 py-12 text-center text-slate-500" colSpan={5}>Cargando segundos viajes...</td></tr> : trips.length ? trips.map((record) => {
            const weightAccepted = isWeightAccepted(record);
            return <tr className={weightAccepted ? "bg-emerald-50/90 hover:bg-emerald-100/80" : "hover:bg-orange-50/40"} key={record.recordId || `${record.transporte}-${record.fechaDespacho}`}><td className="px-5 py-4 font-black text-[#10223d]"><div className="flex flex-wrap items-center gap-2"><span>DT {record.transporte || "Sin DT"}</span>{weightAccepted ? <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-white px-2 py-1 text-[10px] font-black uppercase tracking-wide text-emerald-700"><CheckCircle2 size={12} /></span> : null}</div></td><td className="px-5 py-4 font-bold text-slate-600">{record.vehiculoAnterior || record.vehiculo || "Sin placa"}</td><td className={`px-5 py-4 font-black ${weightAccepted ? "text-emerald-700" : "text-cyan-700"}`}>{record.vehiculoAnterior ? record.vehiculo || "Sin placa" : "Pendiente"}</td><td className="px-5 py-4 text-right font-black text-[#10223d]">{Number(record.clientes || 0).toLocaleString("es-CO")}</td><td className="px-5 py-4 text-right"><button className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-black text-white shadow-sm ${weightAccepted ? "bg-emerald-600 hover:bg-emerald-700" : "bg-orange-600 hover:bg-orange-700"}`} onClick={() => openPlateChange(record)} type="button"><Truck size={15} />Editar DT y placas</button><select aria-label={`Estado del DT ${record.transporte}`} className={`ml-2 h-8 rounded-lg border px-2 text-xs font-black ${statusSelectClass(record.status)}`} disabled={savingStatus === record.recordId} onChange={(event) => void updateStatus(record, event.target.value)} value={SECOND_TRIP_STATUSES.includes(record.status as (typeof SECOND_TRIP_STATUSES)[number]) ? record.status : "Cargando"}>{SECOND_TRIP_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}</select></td></tr>;
          }) : <tr><td className="px-5 py-14 text-center text-sm text-slate-500" colSpan={5}>No hay segundos viajes registrados para hoy.</td></tr>}</tbody></table></div>
        </section>
      </section>

      {selected ? (
        <div aria-modal="true" aria-labelledby="edit-trip-title" className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-slate-950/55 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) closePlateChange(); }} role="dialog">
          <section className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div><h2 id="edit-trip-title" className="text-xl font-black text-[#10223d]">Editar DT y placas</h2><p className="mt-1 text-sm text-slate-500">Peso del DT: {formatNumber(selected.peso)} kg</p></div>
              <button aria-label="Cerrar" disabled={checking || saving} onClick={closePlateChange} type="button"><X size={18} /></button>
            </div>
            <fieldset disabled={checking || saving} className="mt-4 space-y-3 disabled:opacity-60">
              <label className="block text-sm font-bold">DT<input autoFocus className="mt-1 w-full rounded-lg border border-slate-300 p-3" maxLength={80} value={dt} onChange={(event) => setDt(event.target.value)} /></label>
              <label className="block text-sm font-bold">Placa anterior<input className={`mt-1 w-full rounded-lg border p-3 uppercase ${!plate.trim() && check?.ok && check.placa === previousPlate.trim().toUpperCase() ? "border-emerald-500 bg-emerald-50 font-black text-emerald-700" : "border-slate-300"}`} maxLength={80} value={previousPlate} onChange={(event) => { setPreviousPlate(event.target.value.toUpperCase()); setCheck(null); }} /></label>
              <label className="block text-sm font-bold">Placa nueva (opcional)<input className={`mt-1 w-full rounded-lg border p-3 uppercase ${check?.ok && check.placa === plate.trim().toUpperCase() ? "border-emerald-500 bg-emerald-50 font-black text-emerald-700" : "border-slate-300"}`} maxLength={80} placeholder="Pendiente" value={plate} onChange={(event) => { setPlate(event.target.value.toUpperCase()); setCheck(null); }} /></label>
            </fieldset>
            <p className="mt-3 text-xs text-slate-500">Puedes guardar solo el DT. Si cambias la placa que hará el viaje, valida su capacidad antes de guardar.</p>
            <button className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-orange-200 bg-orange-50 p-3 text-sm font-bold text-orange-700 disabled:opacity-50" disabled={checking || saving} onClick={() => void validatePlate()} type="button">{checking ? <LoaderCircle className="animate-spin" size={17} /> : <CheckCircle2 size={17} />}Validar capacidad</button>
            {check ? <div className={`mt-3 rounded-xl p-3 text-sm ${check.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>{check.ok ? <>Placa validada: capacidad {formatNumber(check.capacidad || 0)} kg</> : <p className="flex gap-2"><XCircle size={18} />{check.error}</p>}</div> : null}
            {error ? <p role="alert" className="mt-3 text-sm font-bold text-red-700">{error}</p> : null}
            <button className="mt-4 w-full rounded-xl bg-[#10223d] p-3 text-sm font-black text-white disabled:opacity-40" disabled={saving || checking || !dt.trim() || !previousPlate.trim()} onClick={() => void savePlateChange()} type="button">{saving ? "Guardando..." : "Guardar cambios"}</button>
          </section>
        </div>
      ) : null}
    </main>
  );
}   
function isSecondTrip(value: string) { return /^(?:viaje\s*)?11(?:\D.*)?$/i.test(String(value || "").trim()); }
function isWeightAccepted(record: Vehiculo) { return /aceptad|validad/i.test(String(record.validadorPeso || "")); }
function recordDate(record: Vehiculo) { const raw = String(record.fechaDespacho || record.fechaDt || record.date || record.createdAt || ""); if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10); const match = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/); if (!match) return ""; return `${match[3].length === 2 ? `20${match[3]}` : match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`; }
function bogotaToday() { const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date()); const values = Object.fromEntries(parts.map((part) => [part.type, part.value])); return `${values.year}-${values.month}-${values.day}`; }
function formatDate(value: string) { const [year, month, day] = value.split("-"); return year && month && day ? `${day}/${month}/${year}` : value; }
function formatNumber(value: unknown) { return Number(value || 0).toLocaleString("es-CO", { maximumFractionDigits: 2 }); }
function statusSelectClass(status: string) { return status === "En ruta" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : status === "Retornando" ? "border-indigo-200 bg-indigo-50 text-indigo-700" : status === "Contando" ? "border-cyan-200 bg-cyan-50 text-cyan-700" : "border-amber-200 bg-amber-50 text-amber-700"; }
