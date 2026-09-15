"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { ArrowLeft, CheckCircle2, ClipboardList, Maximize, Package, RefreshCw, TrendingDown, Truck, Users, X, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import type { Vehiculo } from "../../../seguimiento/types";
import { getProgress, getStatus, normalizeCajasTotal } from "../../../seguimiento/utils";

type TvData = { records: Vehiculo[] };
type RefusalStats = {
  cajas: number;
  reportadas: number;
  gestionadas: number;
  final: number;
  checkins: number;
  percent: number;
  max: number;
};

const GALAPA = ["Logisticos", "Surti Cervezas"];

export default function RefusalTvPage() {
  const router = useRouter();
  const [data, setData] = useState<TvData>({ records: [] });
  const [operationalDate, setOperationalDate] = useState("");
  const [updated, setUpdated] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [fullscreen, setFullscreen] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/seguimiento", { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "No se pudo cargar el refusal.");
      setData({ records: body.records || [] });
      setOperationalDate(body.today || "");
      setUpdated(new Date().toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" }));
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No se pudo cargar el refusal.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const interval = window.setInterval(() => void load(), 30_000);
    const onFullscreen = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onFullscreen);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("fullscreenchange", onFullscreen);
    };
  }, [load]);

  const today = operationalDate || bogotaToday();
  const records = data.records.filter((record) => GALAPA.includes(record.transportista) && recordDate(record) === today);
  const stats = buildStats(records);
  const contractorStats = GALAPA.map((contractor) => ({
    contractor,
    stats: buildStats(records.filter((record) => record.transportista === contractor)),
  }));

  async function toggleFullscreen() {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  }

  return (
    <main className="min-h-screen bg-[#edf4f8] text-[#10223d]">
      <header className="border-b border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between gap-4 px-6 py-4 lg:px-10 2xl:px-14 2xl:py-5">
          <div className="flex items-center gap-4">
            <button aria-label="Volver al seguimiento TV" className="grid h-11 w-11 place-items-center rounded-md hover:bg-slate-100" onClick={() => router.push("/admin/modo-tv")} type="button"><ArrowLeft size={24} /></button>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[.18em] text-red-600 2xl:text-sm">Analítica diaria</p>
              <h1 className="text-2xl font-bold lg:text-3xl 2xl:text-4xl">Control refusal · Galapa</h1>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-slate-500 sm:inline">Hoy {formatDate(today)} · Actualizado {updated || "—"}</span>
            <button className="inline-flex h-11 items-center gap-2 rounded-md bg-[#0f7c58] px-4 text-sm font-bold text-white hover:bg-[#0b684a]" onClick={() => router.push("/admin/modo-tv")} type="button"><Truck size={19} />Seguimiento TV</button>
            <button aria-label="Actualizar" className="grid h-11 w-11 place-items-center rounded-md border border-slate-200 bg-white hover:bg-slate-50" onClick={() => void load()} type="button"><RefreshCw className={loading ? "animate-spin" : ""} size={20} /></button>
            <button aria-label="Pantalla completa" className="grid h-11 w-11 place-items-center rounded-md bg-red-600 text-white hover:bg-red-700" onClick={() => void toggleFullscreen()} type="button">{fullscreen ? <X size={21} /> : <Maximize size={21} />}</button>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-[1920px] px-5 py-5 lg:px-8 2xl:px-12 2xl:py-7">
        {error && <p className="mb-5 rounded-lg border border-red-200 bg-red-50 p-4 font-semibold text-red-700">{error}</p>}

        <div className="mb-6 grid grid-cols-2 gap-4 xl:grid-cols-4 2xl:gap-6">
          <Metric icon={<Package />} label="Cajas seguimiento" tone="blue" value={stats.cajas} />
          <Metric icon={<XCircle />} label="Rechazadas" tone="red" value={stats.reportadas} />
          <Metric icon={<CheckCircle2 />} label="Gestionadas" tone="green" value={stats.gestionadas} />
          <Metric icon={<Users />} label="Checkins" tone="amber" value={stats.checkins} />
        </div>

        <div className="grid items-stretch gap-6 xl:grid-cols-[0.92fr_1.08fr] 2xl:gap-8">
          <RefusalSummary general={stats} items={contractorStats} />
          <OffendersTable records={records} />
        </div>
      </section>
    </main>
  );
}

function Metric({ icon, label, value, tone }: { icon: ReactNode; label: string; value: number; tone: "blue" | "red" | "green" | "amber" }) {
  const colors = {
    blue: "border-blue-100 bg-blue-50 text-[#10223d]",
    red: "border-red-100 bg-red-50 text-red-600",
    green: "border-emerald-100 bg-emerald-50 text-emerald-700",
    amber: "border-amber-100 bg-amber-50 text-amber-700",
  };
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm 2xl:p-6">
      <span className={`grid h-12 w-12 place-items-center rounded-lg border ${colors[tone]}`}>{icon}</span>
      <p className="mt-4 text-sm font-semibold text-slate-500 2xl:text-base">{label}</p>
      <strong className="mt-1 block text-3xl font-bold tabular-nums 2xl:text-4xl">{value.toLocaleString("es-CO")}</strong>
    </article>
  );
}

function RefusalSummary({ general, items }: { general: RefusalStats; items: Array<{ contractor: string; stats: RefusalStats }> }) {
  const controlled = general.final <= general.max;
  const circles = [...items, { contractor: "General", stats: general }];
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm 2xl:p-7">
      <div className="flex items-center justify-between gap-4">
        <h2 className="flex items-center gap-2 text-xl font-bold 2xl:text-2xl"><TrendingDown size={22} />Resumen de refusal</h2>
        <span className={`rounded-full border px-4 py-2 text-sm font-bold ${controlled ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-red-200 bg-red-50 text-red-700"}`}>{controlled ? "Controlado" : "Sobre el tope"}</span>
      </div>

      <div className="mt-7 grid grid-cols-3 gap-3 2xl:gap-5">
        {circles.map((item, index) => (
          <RefusalBubble
            accent={index === 0 ? "#06b6d4" : index === 1 ? "#2563eb" : "#0f9f83"}
            key={item.contractor}
            label={item.contractor}
            stats={item.stats}
          />
        ))}
      </div>
      <div className="mt-7 grid grid-cols-3 gap-3 border-t border-slate-100 pt-5 text-center">
        <SummaryMini color="text-amber-700" label="Rechazadas" value={general.reportadas} />
        <SummaryMini color="text-emerald-700" label="Gestionadas" value={general.gestionadas} />
        <SummaryMini color="text-red-700" label="Refusal final" value={general.final} />
      </div>
    </section>
  );
}

function RefusalBubble({ label, stats, accent }: { label: string; stats: RefusalStats; accent: string }) {
  const controlled = stats.final <= stats.max;
  return <div className="flex min-w-0 flex-col items-center gap-3"><div className="grid aspect-square w-full max-w-[185px] place-items-center rounded-full p-3 2xl:max-w-[215px]" style={{ background: `conic-gradient(from -90deg, ${controlled ? accent : "#dc2626"} ${Math.min(100, stats.percent)}%, #e2e8f0 0)` }}><div className="grid h-full w-full place-items-center rounded-full bg-white text-center shadow-inner"><strong className={`text-2xl font-bold tabular-nums 2xl:text-4xl ${controlled ? "text-[#10223d]" : "text-red-600"}`}>{stats.percent.toFixed(2)}%</strong><span className="text-[8px] font-bold uppercase tracking-wider text-slate-400 2xl:text-[10px]">{stats.final.toLocaleString("es-CO")} / {stats.max.toLocaleString("es-CO")} cajas</span></div></div><span className="truncate text-center text-xs font-bold 2xl:text-sm">{label}</span></div>;
}

function SummaryMini({ label, value, color }: { label: string; value: number; color: string }) {
  return <div><p className="text-[9px] font-bold uppercase tracking-wider text-slate-400 2xl:text-[10px]">{label}</p><p className={`mt-1 text-xl font-bold tabular-nums 2xl:text-2xl ${color}`}>{value.toLocaleString("es-CO")}</p></div>;
}

function OffendersTable({ records }: { records: Vehiculo[] }) {
  const rows = [...records]
    .sort((a, b) => refusalBoxes(b) - refusalBoxes(a) || String(a.vehiculo).localeCompare(String(b.vehiculo)))
    .slice(0, 10);

  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <header className="flex items-center justify-between gap-4 px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-gradient-to-br from-[#10223d] to-[#1264ff] text-white shadow-lg shadow-blue-500/20"><ClipboardList size={20} /></span>
          <div className="min-w-0">
            <h2 className="truncate text-base font-bold 2xl:text-lg">Top 10 ofensores · Logisticos y Surti</h2>
            <p className="truncate text-xs text-slate-500">Mayor refusal por ruta y responsable.</p>
          </div>
        </div>
        <span className="shrink-0 rounded-md border border-cyan-100 bg-cyan-50 px-3 py-2 text-sm font-bold text-[#07556b]">{rows.length}</span>
      </header>

      <div className="overflow-auto">
        <table className="w-full table-fixed text-xs 2xl:text-sm">
          <thead className="sticky top-0 z-10 bg-gradient-to-r from-[#10223d] to-[#1264ff] text-[9px] uppercase tracking-wide text-white 2xl:text-[10px]">
            <tr>
              <th className="w-[21%] px-3 py-2.5 text-left">Contratista</th>
              <th className="w-[18%] px-3 py-2.5 text-left">Vehículo</th>
              <th className="w-[34%] px-3 py-2.5 text-left">Responsable</th>
              <th className="w-[16%] px-3 py-2.5 text-left">Status</th>
              <th className="w-[11%] px-3 py-2.5 text-right">Cajas</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {rows.length ? rows.map((record, index) => (
              <tr className={index % 2 ? "bg-slate-50" : "bg-white"} key={record.recordId || `${record.transportista}-${record.transporte}-${record.vehiculo}`}>
                <td className="truncate px-3 py-1.5">
                  <span className={`inline-flex max-w-full truncate rounded-md px-2 py-0.5 font-bold ${record.transportista === "Logisticos" ? "bg-blue-50 text-blue-700" : "bg-violet-50 text-violet-700"}`}>{record.transportista}</span>
                </td>
                <td className="truncate px-3 py-1.5"><span className="inline-flex max-w-full truncate rounded bg-[#e8f7ff] px-2 py-0.5 font-bold text-[#07556b]">{record.vehiculo || `DT ${record.transporte}`}</span></td>
                <td className="truncate px-3 py-1.5 text-slate-600" title={responsible(record)}>{responsible(record)}</td>
                <td className="px-3 py-1.5"><StatusBadge value={getStatus(getProgress(record), record)} /></td>
                <td className="px-3 py-1.5 text-right"><span className="inline-flex min-w-10 justify-center rounded-md border border-red-100 bg-red-50 px-2 py-0.5 font-bold tabular-nums text-red-700">{refusalBoxes(record).toLocaleString("es-CO")}</span></td>
              </tr>
            )) : (
              <tr><td className="px-5 py-16 text-center text-sm font-medium text-slate-500" colSpan={5}>No hay rutas para hoy.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function StatusBadge({ value }: { value: string }) {
  const tone = value === "Finalizado" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : value === "En ruta" ? "border-amber-200 bg-amber-50 text-amber-800" : "border-slate-200 bg-slate-50 text-slate-700";
  return <span className={`inline-flex max-w-full truncate rounded-md border px-2 py-0.5 text-[10px] font-semibold 2xl:text-xs ${tone}`}>{value}</span>;
}

function buildStats(records: Vehiculo[]): RefusalStats {
  const cajas = normalizeCajasTotal(records.reduce((sum, record) => sum + Number(record.cajas || 0), 0));
  const reportadas = normalizeCajasTotal(records.reduce((sum, record) => sum + Number(record.cajasRechazadas ?? record.cajasReportadas ?? 0), 0));
  const gestionadas = normalizeCajasTotal(records.reduce((sum, record) => sum + Number(record.cajasGestionadas || 0), 0));
  const final = normalizeCajasTotal(records.reduce((sum, record) => sum + refusalBoxes(record), 0));
  const checkins = records.filter((record) => typeof record.cajasCheckin === "number").length;
  const max = Math.floor(cajas / 100) || 1;
  return { cajas, reportadas, gestionadas, final, checkins, max, percent: cajas ? (final / cajas) * 100 : 0 };
}

function refusalBoxes(record: Vehiculo) { return normalizeCajasTotal(Number(record.cajasRefusalFinal ?? record.cajasRechazadas ?? 0)); }
function responsible(record: Vehiculo) { return record.nombreResponsable || record.responsable || "Sin responsable"; }
function bogotaToday() { const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date()); const values = Object.fromEntries(parts.map((part) => [part.type, part.value])); return `${values.year}-${values.month}-${values.day}`; }
function recordDate(record: Vehiculo) { const raw = record.fechaDespacho || record.fechaDt || record.date || record.createdAt || ""; if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10); const match = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/); if (!match) return ""; return `${match[3].length === 2 ? `20${match[3]}` : match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`; }
function formatDate(value: string) { return new Date(`${value}T12:00:00`).toLocaleDateString("es-CO"); }
