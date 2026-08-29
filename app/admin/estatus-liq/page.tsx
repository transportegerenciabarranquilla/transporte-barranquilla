"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Clock3, Download, LoaderCircle, RefreshCw, Truck, Upload, X } from "lucide-react";
import { CONTRACTORS } from "../../lib/contractors";
import { normalizeDt } from "../../lib/modulacionStorage";
import type { Vehiculo } from "../../seguimiento/types";

type HourBucket = { hour: number; label: string; count: number };
type StatusLiqRecord = { DT: string | number; "Hora liquidacion": string };
type CrossedRecord = { vehicle: Vehiculo; passedTime: string; actualTime: string; elapsedMinutes: number | null };
type DurationBandKey = "under1" | "oneToTwo" | "twoToFour" | "overFour";

export default function AdminLiquidationStatusPage() {
  const router = useRouter();
  const [records, setRecords] = useState<Vehiculo[]>([]);
  const [statusRecords, setStatusRecords] = useState<StatusLiqRecord[]>([]);
  const [date, setDate] = useState("");
  const [contractor, setContractor] = useState("Logisticos");
  const [hourInterval, setHourInterval] = useState<2 | 3>(2);
  const [detailModal, setDetailModal] = useState<{ title: string; rows: CrossedRecord[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [uploading, setUploading] = useState(false);

  function loadRecords() {
    setLoading(true);
    setError("");
    fetchJson<{ records?: StatusLiqRecord[]; seguimiento?: Vehiculo[] }>("/api/admin/status-liq")
      .then((body) => {
        setRecords(body.seguimiento || []);
        setStatusRecords(body.records || []);
      })
      .catch((caught) => setError(caught instanceof Error ? caught.message : "No se pudo cargar Estatus Liq."))
      .finally(() => setLoading(false));
  }

  useEffect(() => loadRecords(), []);

  async function uploadExcel(file?: File) {
    if (!file) return;
    setUploading(true);
    setError("");
    setMessage("");
    try {
      const formData = new FormData();
      formData.set("file", file);
      const response = await fetch("/api/admin/status-liq", { method: "POST", body: formData });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "No se pudo importar el Excel.");
      setStatusRecords(body.records || []);
      setMessage(`Archivo cargado. ${Number(body.imported || 0)} DT guardados en status-liq.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No se pudo importar el Excel.");
    } finally {
      setUploading(false);
    }
  }

  const liquidatedRecords = useMemo(
    () =>
      records
        .filter((record) => isValidDate(record.liquidadoUpdatedAt))
        .sort((a, b) => String(b.liquidadoUpdatedAt).localeCompare(String(a.liquidadoUpdatedAt))),
    [records],
  );

  const operationalRecords = useMemo(
    () => records.filter((record) => contractor === "Todas" || record.transportista === contractor),
    [contractor, records],
  );

  const availableDates = useMemo(
    () => Array.from(new Set(
      operationalRecords.map(getOperationalDate),
    )).filter(Boolean).sort().reverse(),
    [operationalRecords],
  );

  useEffect(() => {
    if (availableDates.length && !availableDates.includes(date)) setDate(availableDates[0]);
  }, [availableDates, date]);

  const visibleRecords = useMemo(
    () =>
      liquidatedRecords.filter((record) => {
        return (!date || getOperationalDate(record) === date) && (contractor === "Todas" || record.transportista === contractor);
      }),
    [contractor, date, liquidatedRecords],
  );

  const visibleOperationalRecords = useMemo(
    () => operationalRecords.filter((record) => !date || getOperationalDate(record) === date),
    [date, operationalRecords],
  );

  const hours = useMemo(() => buildHourBuckets(visibleRecords, hourInterval), [hourInterval, visibleRecords]);
  const crossedRecords = useMemo(() => crossLiquidationRecords(visibleOperationalRecords, statusRecords), [statusRecords, visibleOperationalRecords]);
  const statusMatchedRecords = useMemo(() => crossedRecords.filter((row) => Boolean(row.actualTime)), [crossedRecords]);
  const durationRecords = useMemo(() => crossedRecords.filter((row): row is CrossedRecord & { elapsedMinutes: number } => row.elapsedMinutes !== null), [crossedRecords]);
  const crossingDiagnostic = useMemo(() => buildCrossingDiagnostic(visibleOperationalRecords, statusRecords), [statusRecords, visibleOperationalRecords]);
  const averageMinutes = durationRecords.length ? durationRecords.reduce((total, row) => total + row.elapsedMinutes, 0) / durationRecords.length : 0;
  const durationBands = useMemo(() => buildDurationBands(durationRecords), [durationRecords]);
  const maxBand = Math.max(1, ...durationBands.map((band) => band.count));
  const maxCount = Math.max(1, ...hours.map((bucket) => bucket.count));
  const peak = hours.reduce((best, bucket) => (bucket.count > best.count ? bucket : best), hours[0]);

  return (
    <main className="min-h-screen bg-[#f3f6fa] px-4 py-5 text-[#10223d] sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-5">
        <header className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <button aria-label="Volver al portal" className="grid h-10 w-10 place-items-center rounded-lg border border-slate-200 text-slate-600 transition hover:bg-slate-50" onClick={() => router.push("/")} type="button">
              <ArrowLeft size={19} />
            </button>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-indigo-600">Módulo administrativo</p>
              <h1 className="mt-1 text-2xl font-semibold">Estatus Liq</h1>
              <p className="mt-1 text-sm text-slate-500">Hora en que cada DT fue pasado a liquidación.</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <a className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-indigo-200 bg-white px-4 text-sm font-semibold text-indigo-700 transition hover:bg-indigo-50" download href="/api/admin/status-liq/template">
              <Download size={17} />
              Descargar plantilla
            </a>
            <label className="inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white transition hover:bg-indigo-700">
              {uploading ? <LoaderCircle className="animate-spin" size={17} /> : <Upload size={17} />}
              Subir Excel diario
              <input accept=".xlsx,.xls" className="hidden" disabled={uploading} onChange={(event) => { void uploadExcel(event.target.files?.[0]); event.target.value = ""; }} type="file" />
            </label>
            <button className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[#10223d] px-4 text-sm font-semibold text-white transition hover:bg-[#1b355b] disabled:opacity-60" disabled={loading} onClick={loadRecords} type="button">
              {loading ? <LoaderCircle className="animate-spin" size={17} /> : <RefreshCw size={17} />} Actualizar
            </button>
          </div>
        </header>

        <section className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-3">
          <label className="text-sm font-semibold text-slate-600">
            Fecha
            <select className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-[#10223d] outline-none focus:border-indigo-400" onChange={(event) => setDate(event.target.value)} value={date}>
              {availableDates.length ? availableDates.map((item) => <option key={item} value={item}>{formatDate(item)}</option>) : <option value="">Sin fechas</option>}
            </select>
          </label>
          <label className="text-sm font-semibold text-slate-600">
            Contratista
            <select className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-[#10223d] outline-none focus:border-indigo-400" onChange={(event) => setContractor(event.target.value)} value={contractor}>
              <option>Todas</option>
              {CONTRACTORS.map((item) => <option key={item}>{item}</option>)}
            </select>
          </label>
          <label className="text-sm font-semibold text-slate-600">
            Agrupar horas
            <select className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-[#10223d] outline-none focus:border-indigo-400" onChange={(event) => setHourInterval(Number(event.target.value) as 2 | 3)} value={hourInterval}>
              <option value={2}>Cada 2 horas</option>
              <option value={3}>Cada 3 horas</option>
            </select>
          </label>
        </section>

        {error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</div> : null}
        {message ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">{message}</div> : null}
        {crossingDiagnostic ? <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900"><p className="font-bold">Los DT cargados no coinciden con los DT visibles de Seguimiento.</p><p className="mt-1">Seguimiento: {crossingDiagnostic.tracking.join(", ")}</p><p className="mt-1">Excel Status Liq: {crossingDiagnostic.status.join(", ")}</p></div> : null}

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label="Pasados a liquidación" value={visibleRecords.length} icon={<Truck size={20} />} />
          <Metric label="Cruzados con status-liq" value={statusMatchedRecords.length} icon={<Truck size={20} />} />
          <Metric label="Promedio para liquidar" value={formatDuration(averageMinutes)} icon={<Clock3 size={20} />} />
          <Metric label="Hora con mayor movimiento" value={peak?.count ? formatHour(peak.hour) : "--"} icon={<Clock3 size={20} />} />
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-amber-600">Tiempo real de liquidación</p>
          <h2 className="mt-1 text-lg font-semibold">Duración desde “Pasado a liquidación” hasta liquidación real</h2>
          <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
            {durationBands.map((band) => <button className="rounded-xl border border-slate-200 p-3 text-left transition hover:border-amber-300 hover:bg-amber-50" key={band.key} onClick={() => setDetailModal({ title: band.label, rows: crossedRecords.filter((row) => row.elapsedMinutes !== null && getDurationBand(row.elapsedMinutes) === band.key) })} type="button"><div className="flex items-end justify-between"><span className="text-xs font-semibold text-slate-500">{band.label}</span><strong className="text-lg">{band.count}</strong></div><div className="mt-2 h-3 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-gradient-to-r from-amber-500 to-yellow-300" style={{ width: `${(band.count / maxBand) * 100}%` }} /></div></button>)}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-indigo-600">Distribución horaria</p>
            <h2 className="mt-1 text-lg font-semibold">DT pasados a liquidación por hora</h2>
          </div>
          <div className="mt-6 flex h-72 items-end gap-2 overflow-x-auto pb-1">
            {hours.map((bucket) => (
              <button className="flex h-full min-w-16 flex-1 flex-col items-center justify-end gap-1 rounded-md transition hover:bg-amber-50" key={bucket.hour} onClick={() => setDetailModal({ title: `Pasados entre ${bucket.label}`, rows: crossedRecords.filter((row) => isInHourBucket(toBogotaParts(row.vehicle.liquidadoUpdatedAt).hour, bucket.hour, hourInterval)) })} title={`${bucket.label}: ${bucket.count} DT`} type="button">
                <span className="text-[10px] font-bold text-slate-600">{bucket.count || ""}</span>
                <div className="w-full max-w-12 rounded-t-md bg-gradient-to-t from-amber-500 to-yellow-300 transition-all" style={{ height: `${bucket.count ? Math.max(8, (bucket.count / maxCount) * 220) : 2}px`, opacity: bucket.count ? 1 : 0.18 }} />
                <span className="whitespace-nowrap text-[9px] font-semibold text-slate-400">{bucket.label}</span>
              </button>
            ))}
          </div>
          <p className="mt-3 text-center text-xs text-slate-400">Hora local de Colombia</p>
        </section>

      </div>
      {detailModal ? <DetailModal detail={detailModal} onClose={() => setDetailModal(null)} /> : null}
    </main>
  );
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | number }) {
  return <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-indigo-50 text-indigo-700">{icon}</span><div><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p><p className="mt-1 text-2xl font-bold text-[#10223d]">{value}</p></div></div></div>;
}

function DetailModal({ detail, onClose }: { detail: { title: string; rows: CrossedRecord[] }; onClose: () => void }) {
  return <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/45 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section aria-modal="true" className="max-h-[85vh] w-full max-w-6xl overflow-hidden rounded-2xl bg-white shadow-2xl" role="dialog"><header className="flex items-center justify-between border-b border-slate-200 px-5 py-4"><div><p className="text-xs font-bold uppercase tracking-[0.14em] text-indigo-600">Detalle de liquidación</p><h2 className="mt-1 text-lg font-semibold">{detail.title} · {detail.rows.length} DT</h2></div><button aria-label="Cerrar detalle" className="grid h-9 w-9 place-items-center rounded-lg text-slate-500 hover:bg-slate-100" onClick={onClose} type="button"><X size={19} /></button></header><div className="max-h-[70vh] overflow-auto"><table className="w-full min-w-[760px] text-sm"><thead className="sticky top-0 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3">Pasado a liq.</th><th className="px-5 py-3">Liquidación real</th><th className="px-5 py-3">Duración</th><th className="px-5 py-3">DT</th><th className="px-5 py-3">Vehículo</th><th className="px-5 py-3">Contratista</th></tr></thead><tbody className="divide-y divide-slate-100">{detail.rows.map((row, index) => <tr key={`${row.vehicle.transporte}-${index}`}><td className="px-5 py-3 font-bold text-indigo-700">{row.passedTime}</td><td className="px-5 py-3 font-bold text-emerald-700">{row.actualTime || "Pendiente"}</td><td className="px-5 py-3 font-semibold">{row.elapsedMinutes === null ? "--" : formatDuration(row.elapsedMinutes)}</td><td className="px-5 py-3 font-semibold">{row.vehicle.transporte || "-"}</td><td className="px-5 py-3">{row.vehicle.vehiculo || "-"}</td><td className="px-5 py-3">{row.vehicle.transportista || "-"}</td></tr>)}{!detail.rows.length ? <tr><td className="px-5 py-10 text-center text-slate-500" colSpan={6}>No hay DT en este rango.</td></tr> : null}</tbody></table></div></section></div>;
}

function buildHourBuckets(records: Vehiculo[], interval: 2 | 3): HourBucket[] {
  const starts = Array.from({ length: 24 / interval }, (_, index) => (6 + index * interval) % 24);
  const counts = new Map(starts.map((hour) => [hour, 0]));
  records.forEach((record) => {
    const hour = toBogotaParts(record.liquidadoUpdatedAt).hour;
    if (hour < 0) return;
    const offset = (hour - 6 + 24) % 24;
    const bucketHour = (6 + Math.floor(offset / interval) * interval) % 24;
    counts.set(bucketHour, (counts.get(bucketHour) || 0) + 1);
  });
  return starts.map((hour) => ({
    hour,
    label: `${formatHourShort(hour)}–${formatHourShort((hour + interval) % 24)}`,
    count: counts.get(hour) || 0,
  }));
}

function isInHourBucket(hour: number, bucketStart: number, interval: 2 | 3) {
  if (hour < 0) return false;
  return (hour - bucketStart + 24) % 24 < interval;
}

function crossLiquidationRecords(vehicles: Vehiculo[], statusRows: StatusLiqRecord[]): CrossedRecord[] {
  const actualTimeByDt = buildLiquidationTimeIndex(statusRows);
  return vehicles.map((vehicle) => {
    const vehicleDt = normalizeDt(vehicle.transporte);
    const actualTime = actualTimeByDt.get(vehicleDt) || actualTimeByDt.get(shortDtKey(vehicleDt)) || "";
    const passed = toBogotaParts(vehicle.liquidadoUpdatedAt);
    if (!actualTime || passed.hour < 0) return { vehicle, passedTime: passed.time, actualTime: "", elapsedMinutes: null };
    const passedMinutes = clockToMinutes(passed.time);
    const actualMinutes = clockToMinutes(actualTime);
    if (passedMinutes < 0 || actualMinutes < 0) return { vehicle, passedTime: passed.time, actualTime, elapsedMinutes: null };
    let elapsedMinutes = actualMinutes - passedMinutes;
    if (elapsedMinutes < 0) elapsedMinutes += 24 * 60;
    return { vehicle, passedTime: passed.time, actualTime, elapsedMinutes };
  }).sort((a, b) => (b.elapsedMinutes ?? -1) - (a.elapsedMinutes ?? -1));
}

function buildCrossingDiagnostic(vehicles: Vehiculo[], statusRows: StatusLiqRecord[]) {
  if (!vehicles.length || !statusRows.length) return null;
  const index = buildLiquidationTimeIndex(statusRows);
  const hasMatch = vehicles.some((vehicle) => {
    const dt = normalizeDt(vehicle.transporte);
    return Boolean(index.get(dt) || index.get(shortDtKey(dt)));
  });
  if (hasMatch) return null;
  return {
    tracking: Array.from(new Set(vehicles.map((vehicle) => normalizeDt(vehicle.transporte)).filter(Boolean))).slice(0, 8),
    status: Array.from(new Set(statusRows.map((row) => normalizeDt(row.DT)).filter(Boolean))).slice(0, 8),
  };
}

function buildLiquidationTimeIndex(statusRows: StatusLiqRecord[]) {
  const index = new Map<string, string>();
  const shortKeyCounts = new Map<string, number>();

  statusRows.forEach((row) => {
    const dt = normalizeDt(row.DT);
    const shortKey = shortDtKey(dt);
    if (shortKey) shortKeyCounts.set(shortKey, (shortKeyCounts.get(shortKey) || 0) + 1);
  });

  statusRows.forEach((row) => {
    const dt = normalizeDt(row.DT);
    const time = normalizeClock(row["Hora liquidacion"]);
    if (!dt || !time) return;
    index.set(dt, time);
    const shortKey = shortDtKey(dt);
    if (shortKey && shortKeyCounts.get(shortKey) === 1) index.set(shortKey, time);
  });

  return index;
}

function shortDtKey(value: string) {
  return value.length > 7 ? value.slice(-7) : value;
}

function buildDurationBands(rows: Array<CrossedRecord & { elapsedMinutes: number }>) {
  const bands = [
    { key: "under1" as const, label: "Menos de 1 h", count: 0 },
    { key: "oneToTwo" as const, label: "1 a 2 h", count: 0 },
    { key: "twoToFour" as const, label: "2 a 4 h", count: 0 },
    { key: "overFour" as const, label: "Más de 4 h", count: 0 },
  ];
  rows.forEach((row) => {
    const index = { under1: 0, oneToTwo: 1, twoToFour: 2, overFour: 3 }[getDurationBand(row.elapsedMinutes)];
    bands[index].count += 1;
  });
  return bands;
}

function getDurationBand(minutes: number): DurationBandKey {
  if (minutes < 60) return "under1";
  if (minutes < 120) return "oneToTwo";
  if (minutes < 240) return "twoToFour";
  return "overFour";
}

function normalizeClock(value: unknown) {
  const match = String(value ?? "").trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!match) return "";
  return `${String(Number(match[1])).padStart(2, "0")}:${match[2]}:${match[3] || "00"}`;
}

function clockToMinutes(value: string) {
  const match = value.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return -1;
  return Number(match[1]) * 60 + Number(match[2]);
}

function formatDuration(minutes: number) {
  if (!Number.isFinite(minutes) || minutes <= 0) return minutes === 0 ? "0 min" : "--";
  const rounded = Math.round(minutes);
  const hours = Math.floor(rounded / 60);
  const remainder = rounded % 60;
  return hours ? `${hours} h ${remainder} min` : `${remainder} min`;
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: "no-store" });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "No se pudo cargar la información.");
  return body as T;
}

function toBogotaParts(value?: string) {
  const parsed = new Date(value || "");
  if (Number.isNaN(parsed.getTime())) return { date: "", time: "--", hour: -1 };
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(parsed);
  const read = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value || "";
  const hour = Number(read("hour"));
  return { date: `${read("year")}-${read("month")}-${read("day")}`, time: `${read("hour")}:${read("minute")}`, hour: Number.isFinite(hour) ? hour : -1 };
}

function isValidDate(value?: string) {
  return Boolean(value && !Number.isNaN(new Date(value).getTime()));
}

function getOperationalDate(record: Vehiculo) {
  const candidate = String(record.fechaDespacho || record.date || record.fechaDt || "").trim();
  const match = candidate.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : toBogotaParts(record.liquidadoUpdatedAt).date;
}

function formatDate(value: string) {
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

function formatHour(hour: number) {
  return `${String(hour).padStart(2, "0")}:00`;
}

function formatHourShort(hour: number) {
  return `${String(hour).padStart(2, "0")}:00`;
}
