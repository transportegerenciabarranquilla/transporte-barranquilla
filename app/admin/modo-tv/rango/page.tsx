"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ArrowLeft, CheckCircle2, MapPinCheck, Maximize, RefreshCw, Truck, X, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTvData } from "../TvDataCache";
import { ExitTvButton } from "../ExitTvButton";
import type { PuntoCoronaRouteReport } from "../../../lib/puntoCoronaRoutesStorage";

type TvReport = { id: string; contractor: string; operationalDate: string; kind: PuntoCoronaRouteReport["kind"]; uploadedAt?: string; updatedAt: string; summary: PuntoCoronaRouteReport["summary"] };
type RangeStats = { visits: number; inRange: number; outOfRange: number; percent: number };

export default function RangoTvPage() {
  const router = useRouter();
  const { data, updated: cachedUpdated, loading, error, load } = useTvData().rango;
  const updated = formatBogotaTime(cachedUpdated);
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    const onFullscreen = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onFullscreen);
    return () => {
      document.removeEventListener("fullscreenchange", onFullscreen);
    };
  }, []);

  useEffect(() => {
    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
    };
  }, []);

  const today = bogotaToday();
  const reports = useMemo(() => preferredReports(data.reports.filter((report) => report.operationalDate === today)), [data.reports, today]);
  const contractors = useMemo(
    () => Array.from(new Set(reports.map((report) => report.contractor))).sort((a, b) => {
      const difference = statsFor(reports.find((report) => report.contractor === a)!).percent - statsFor(reports.find((report) => report.contractor === b)!).percent;
      return difference || a.localeCompare(b, "es");
    }),
    [reports],
  );
  const general = reports.reduce((total, report) => addStats(total, statsFor(report)), emptyStats());
  const lastUpload = useMemo(() => getLastUpload(data.reports.filter((report) => report.operationalDate === today)), [data.reports, today]);

  async function toggleFullscreen() {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  }

  return (
    <main className="h-screen overflow-hidden bg-[#f4f8fb] text-[#10213b]">
      <section className="relative flex h-screen w-full flex-col overflow-hidden bg-[radial-gradient(circle_at_78%_5%,rgba(16,185,129,.12),transparent_28%),linear-gradient(145deg,#ffffff,#f2f7fb_62%,#eaf3f8)]">
        <div className="pointer-events-none absolute inset-0 opacity-50" style={{ backgroundImage: "linear-gradient(rgba(35,91,137,.08) 1px,transparent 1px),linear-gradient(90deg,rgba(35,91,137,.08) 1px,transparent 1px)", backgroundSize: "36px 36px" }} />
        <header className="relative z-10 flex min-h-20 items-center justify-between border-b border-slate-200 bg-white/95 px-5 py-3 shadow-sm lg:px-7 2xl:min-h-24 2xl:px-9">
          <div className="flex items-center gap-3">
            <button aria-label="Volver al seguimiento TV" className="grid h-11 w-11 place-items-center rounded-lg border border-slate-200 bg-slate-50 text-cyan-700 hover:bg-cyan-50" onClick={() => router.push("/admin/modo-tv")} type="button"><ArrowLeft size={20} /></button>
            <span className="grid h-11 w-11 place-items-center rounded-lg bg-emerald-50 text-emerald-600"><MapPinCheck size={29} /></span>
            <div><h1 className="text-2xl font-black tracking-tight lg:text-3xl 2xl:text-4xl">Entrega en rango TV</h1><p className="text-xs font-medium tracking-wide text-slate-500 lg:text-sm 2xl:text-base">Control de visitas del día</p></div>
          </div>
          <div className="flex items-center gap-3 lg:gap-5">
            <div className="hidden text-right sm:block"><p className="text-[9px] font-semibold capitalize text-slate-500 lg:text-[10px] 2xl:text-xs">{formatLongDate(today)}</p><p className="text-sm font-black tabular-nums text-[#10213b] lg:text-base 2xl:text-lg">Actualizado {updated}</p></div>
            <span className="hidden items-center gap-2 rounded-lg border border-emerald-400/30 bg-emerald-50 px-3 py-2 md:inline-flex"><i className="h-2.5 w-2.5 animate-pulse rounded-full bg-emerald-400" /><strong className="text-[10px] text-emerald-700 2xl:text-xs">En vivo</strong></span>
            <button className="inline-flex h-11 items-center gap-2 rounded-lg border border-cyan-300 bg-cyan-50 px-4 text-sm font-bold text-cyan-700 hover:bg-cyan-100 2xl:text-base" onClick={() => router.push("/admin/modo-tv")} type="button"><Truck size={19} />Seguimiento</button>
            <button className="inline-flex h-11 items-center gap-2 rounded-lg border border-rose-300 bg-rose-50 px-4 text-sm font-bold text-rose-700 hover:bg-rose-100 2xl:text-base" onClick={() => router.push("/admin/modo-tv/refusal")} type="button"><XCircle size={19} />Refusal</button>
            <ExitTvButton />
            <button aria-label="Actualizar" className="grid h-10 w-10 place-items-center rounded-lg border border-slate-200 bg-slate-50 text-emerald-700 hover:bg-emerald-50" onClick={() => void load()} type="button"><RefreshCw className={loading ? "animate-spin" : ""} size={17} /></button>
            <button aria-label="Pantalla completa" className="grid h-10 w-10 place-items-center rounded-lg border border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100" onClick={() => void toggleFullscreen()} type="button">{fullscreen ? <X size={18} /> : <Maximize size={18} />}</button>
          </div>
        </header>

        <div className="relative z-10 flex min-h-0 flex-1 flex-col gap-4 p-4 lg:p-5">
          {error ? <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</p> : null}
          <section className="grid shrink-0 grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4 2xl:gap-5">
            <DashboardMetric color="blue" icon={<MapPinCheck />} label="Visitas evaluadas" value={general.visits} />
            <DashboardMetric color="green" icon={<CheckCircle2 />} label="En rango" value={general.inRange} />
            <DashboardMetric color="red" icon={<XCircle />} label="Fuera de rango" value={general.outOfRange} />
            <DashboardMetric color="amber" icon={<MapPinCheck />} label="% entrega" value={`${general.percent.toFixed(1)}%`} />
          </section>
          <section className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[.9fr_1.1fr] 2xl:gap-5">
            <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_10px_28px_rgba(15,39,68,.09)]">
              <header className="flex h-14 shrink-0 items-center justify-between border-b border-slate-200 px-5"><h2 className="flex items-center gap-2 text-lg font-extrabold"><MapPinCheck className="text-emerald-600" size={21} />Resumen por contratista</h2><span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700">{contractors.length}</span></header>
              <div className="grid min-h-0 flex-1 grid-cols-3 items-center gap-2 p-3 2xl:gap-4 2xl:p-4">{contractors.length ? contractors.map((contractor) => <RangeBubble key={contractor} label={contractor} stats={statsFor(reports.find((report) => report.contractor === contractor)!)} uploadedAt={getLastUpload(data.reports.filter((report) => report.operationalDate === today && report.contractor === contractor))} />) : <p className="col-span-3 text-center text-sm text-slate-500">No hay reportes de rango para hoy.</p>}{reports.length > 1 ? <RangeBubble label="General" stats={general} uploadedAt={lastUpload} /> : null}</div>
            </section>
            <RangeTable reports={reports} />
          </section>
        </div>
      </section>
    </main>
  );
}

function DashboardMetric({ icon, label, value, color }: { icon: ReactNode; label: string; value: number | string; color: "blue" | "green" | "red" | "amber" }) {
  const tones = { blue: "from-blue-500 to-blue-700", green: "from-emerald-400 to-emerald-700", red: "from-rose-500 to-red-700", amber: "from-amber-400 to-orange-600" };
  return <article className="relative overflow-hidden rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-[0_10px_25px_rgba(15,39,68,.08)] 2xl:px-5 2xl:py-4"><div className="flex items-center gap-3"><span className={`grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-gradient-to-br text-white shadow-lg ${tones[color]}`}>{icon}</span><div className="min-w-0"><p className="text-sm font-bold text-slate-600 2xl:text-base">{label}</p><strong className="block truncate text-[clamp(2rem,2.8vw,2.8rem)] font-black tabular-nums leading-none tracking-tight text-[#10213b]">{typeof value === "number" ? value.toLocaleString("es-CO") : value}</strong><p className="mt-1 text-[10px] font-medium text-slate-500 2xl:text-xs">Datos del día</p></div></div></article>;
}

function RangeBubble({ label, stats, uploadedAt }: { label: string; stats: RangeStats; uploadedAt?: string }) {
  const percent = Math.min(100, stats.percent);
  const critical = stats.percent < 50;
  const warning = stats.percent < 90;
  const color = critical ? "#ef4444" : warning ? "#f59e0b" : "#10b981";
  const tone = critical ? "border-red-200 bg-red-50 text-red-700" : warning ? "border-amber-200 bg-amber-50 text-amber-700" : "border-emerald-200 bg-emerald-50 text-emerald-700";
  const status = critical ? "Crítico" : warning ? "Atención" : "Estable";
  return <div className="flex min-w-0 flex-col items-center justify-center gap-2"><div className="grid aspect-square w-[clamp(115px,10vw,175px)] place-items-center rounded-full p-3" style={{ background: `conic-gradient(from -90deg,${color} ${percent}%,#dbe7f1 0)`, boxShadow: `0 10px 30px ${color}28` }}><div className="grid h-full w-full place-items-center rounded-full bg-white text-center shadow-inner"><div><strong className="block text-[clamp(1.45rem,2.35vw,2.45rem)] font-black tabular-nums" style={{ color }}>{stats.percent.toFixed(1)}%</strong><span className="text-[8px] font-bold uppercase tracking-wider text-slate-500 2xl:text-[10px]">{stats.inRange} / {stats.visits}</span></div></div></div><span className={`inline-flex max-w-full truncate rounded-full border px-2.5 py-1 text-[10px] font-extrabold 2xl:text-sm ${tone}`}>{label}</span><span className={`text-[9px] font-black uppercase tracking-wider 2xl:text-[10px] ${critical ? "text-red-700" : warning ? "text-amber-700" : "text-emerald-700"}`}><i className={`mr-1.5 inline-block h-2 w-2 rounded-full ${critical ? "bg-red-500" : warning ? "bg-amber-400" : "bg-emerald-400"}`} />{status}</span><span className="text-[9px] font-semibold text-slate-500 2xl:text-[10px]">Último archivo: <strong className="text-[#10223d]">{formatUploadTime(uploadedAt || "")}</strong></span></div>;
}

function RangeTable({ reports }: { reports: TvReport[] }) {
  const rows = reports.flatMap((report) => report.summary.crews.map((crew) => ({ ...crew, contractor: report.contractor }))).sort((a, b) => a.deliveryRangePercent - b.deliveryRangePercent || b.outOfRange - a.outOfRange || a.dt.localeCompare(b.dt, "es"));
  return <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_10px_28px_rgba(15,39,68,.09)]"><header className="flex h-14 shrink-0 items-center justify-between border-b border-slate-200 px-5"><div><h2 className="text-lg font-extrabold">Detalle de entrega</h2><p className="text-xs text-slate-500">Tripulaciones y porcentaje en rango</p></div><span className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm font-black text-emerald-700">{rows.length}</span></header><div className="min-h-0 flex-1 overflow-auto"><table className="w-full min-w-[760px] table-fixed text-sm 2xl:text-base"><thead className="sticky top-0 z-10 bg-slate-100 text-xs uppercase tracking-wide text-slate-500"><tr><th className="w-[18%] px-4 py-3 text-left">Contratista</th><th className="w-[21%] px-4 py-3 text-left">DT</th><th className="w-[23%] px-4 py-3 text-left">RR</th><th className="w-[13%] px-4 py-3 text-right">Visitas</th><th className="w-[13%] px-4 py-3 text-right">En rango</th><th className="w-[12%] px-4 py-3 text-right">% entrega</th></tr></thead><tbody className="divide-y divide-slate-100">{rows.length ? rows.map((row) => <tr key={`${row.contractor}-${row.key}`}><td className="truncate px-4 py-3 font-bold text-slate-700">{row.contractor}</td><td className="truncate px-4 py-3 font-extrabold text-cyan-700">{row.dt || "Sin DT"}</td><td className="truncate px-4 py-3 font-semibold text-slate-700" title={row.driverName || "Sin RR"}>{row.driverName || "Sin RR"}</td><td className="px-4 py-3 text-right font-semibold">{row.totalStarted.toLocaleString("es-CO")}</td><td className="px-4 py-3 text-right font-semibold text-emerald-700">{row.inRange.toLocaleString("es-CO")}</td><td className={`px-4 py-3 text-right font-black ${row.deliveryRangePercent >= 90 ? "text-emerald-700" : "text-amber-700"}`}>{row.deliveryRangePercent.toFixed(1)}%</td></tr>) : <tr><td className="px-5 py-16 text-center text-sm text-slate-500" colSpan={6}>No hay tripulaciones para hoy.</td></tr>}</tbody></table></div></section>;
}

function emptyStats(): RangeStats { return { visits: 0, inRange: 0, outOfRange: 0, percent: 0 }; }
function statsFor(report: TvReport): RangeStats { const visits = Number(report.summary.startedRows || 0); const inRange = Number(report.summary.inRange || 0); const outOfRange = Number(report.summary.outOfRange || 0); return { visits, inRange, outOfRange, percent: visits ? (inRange / visits) * 100 : 0 }; }
function addStats(left: RangeStats, right: RangeStats): RangeStats { const visits = left.visits + right.visits; return { visits, inRange: left.inRange + right.inRange, outOfRange: left.outOfRange + right.outOfRange, percent: visits ? ((left.inRange + right.inRange) / visits) * 100 : 0 }; }
function preferredReports(reports: TvReport[]) { const byContractor = new Map<string, TvReport>(); reports.forEach((report) => { const current = byContractor.get(report.contractor); if (!current || (report.kind === "closure" && current.kind !== "closure") || report.updatedAt > current.updatedAt) byContractor.set(report.contractor, report); }); return Array.from(byContractor.values()); }
function bogotaToday() { const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date()); const values = Object.fromEntries(parts.map((part) => [part.type, part.value])); return `${values.year}-${values.month}-${values.day}`; }
function formatBogotaTime(value: string) { return value ? new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", hour: "2-digit", minute: "2-digit" }).format(new Date(value)) : "—"; }
function formatLongDate(value: string) { return new Intl.DateTimeFormat("es-CO", { weekday: "short", day: "2-digit", month: "short", year: "numeric" }).format(new Date(`${value}T12:00:00`)); }
function getLastUpload(reports: TvReport[]) { return reports.map((report) => report.uploadedAt || report.updatedAt).filter(Boolean).sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] || ""; }
function formatUploadTime(value: string) { if (!value) return "Sin archivo"; const date = new Date(value); if (Number.isNaN(date.getTime())) return "Sin hora"; return new Intl.DateTimeFormat("es-CO", { hour: "2-digit", minute: "2-digit", timeZone: "America/Bogota" }).format(date); }
