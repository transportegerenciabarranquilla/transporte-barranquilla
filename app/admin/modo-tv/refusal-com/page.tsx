"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ArrowLeft, CheckCircle2, MapPinCheck, Maximize, Package, RefreshCw, ShieldAlert, Truck, Users, X, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTvData } from "../TvDataCache";
import { ExitTvButton } from "../ExitTvButton";
import type { Vehiculo } from "../../../seguimiento/types";
import { normalizeCajasTotal } from "../../../seguimiento/utils";

type RefusalStats = { cajas: number; reportadas: number; gestionadas: number; final: number; checkins: number; percent: number; max: number };
type SummaryRow = { key?: string; label: string; reportadas: number; gestionadas: number; final: number; percent: number };
const GALAPA = ["Logisticos", "Surti Cervezas"];

export default function RefusalComTvPage() {
  const router = useRouter();
  const { data, updated: cachedUpdated, loading, error, load } = useTvData().seguimiento;
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    const onFullscreen = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onFullscreen);
    return () => document.removeEventListener("fullscreenchange", onFullscreen);
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

  const today = data.today || bogotaToday();
  const fallbackRecords = useMemo(() => {
    const todayRecords = data.records.filter((record) => recordDate(record) === today);
    return todayRecords.length ? todayRecords : data.records.slice(0, 250);
  }, [data.records, today]);
  const activeContractors = useMemo(
    () => Array.from(new Set(fallbackRecords.map((record) => record.transportista).filter((contractor) => contractor && !isExcludedContractor(contractor)))).sort(),
    [fallbackRecords],
  );
  const records = useMemo(
    () => fallbackRecords.filter((record) => !isExcludedContractor(record.transportista) && (activeContractors.includes(record.transportista) || !record.transportista)),
    [activeContractors, fallbackRecords],
  );
  const dailyRefusalRows = useMemo(() => {
    const refusalRows = data.refusalByComRows ?? [];
    const rows = refusalRows.filter((row) => !isExcludedContractor(row.contractor));
    const todayRows = rows.filter((row) => row.date === today || (!row.date && today));
    return todayRows.length ? todayRows : rows.slice(0, 250);
  }, [data.refusalByComRows, today]);
  const general = buildStats(records);
  const contractorStats = activeContractors.length ? activeContractors.map((contractor) => ({ contractor, stats: buildStats(records.filter((record) => record.transportista === contractor)) })) : GALAPA.map((contractor) => ({ contractor, stats: buildStats(records.filter((record) => record.transportista === contractor)) }));
  const salesBosses = summarizeByLabel(dailyRefusalRows, (row) => row.jefeVentas || "Sin jefe de ventas");
  const coms = summarizeByLabel(dailyRefusalRows.filter((row) => row.com?.trim()), (row) => row.com || "");
  const updated = formatBogotaTime(cachedUpdated);

  async function toggleFullscreen() {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  }

  return (
    <main className="h-screen overflow-hidden bg-white text-[#10213b]" data-tv-light>
      <TvLightTheme />
      <section className="relative flex h-screen w-full flex-col overflow-hidden bg-[radial-gradient(circle_at_78%_5%,rgba(34,211,238,.13),transparent_28%),linear-gradient(145deg,#ffffff,#f2f7fb_62%,#eaf3f8)]">
        <div className="pointer-events-none absolute inset-0 opacity-50" style={{ backgroundImage: "linear-gradient(rgba(35,91,137,.08) 1px,transparent 1px),linear-gradient(90deg,rgba(35,91,137,.08) 1px,transparent 1px)", backgroundSize: "36px 36px" }} />

        <header className="relative z-10 flex min-h-20 flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white/95 px-5 py-3 shadow-sm lg:px-7 2xl:min-h-24 2xl:px-9">
          <div className="flex items-center gap-3">
            <button aria-label="Volver al seguimiento TV" className="grid h-11 w-11 place-items-center rounded-lg border border-slate-200 bg-slate-50 text-cyan-700 hover:bg-cyan-50" onClick={() => router.push("/admin/modo-tv")} type="button"><ArrowLeft size={20} /></button>
            <span className="grid h-11 w-11 place-items-center text-rose-500"><ShieldAlert size={31} strokeWidth={1.8} /></span>
            <div>
              <h1 className="text-2xl font-black tracking-tight lg:text-3xl 2xl:text-4xl">Refusal por COM</h1>
              <p className="text-xs font-medium tracking-wide text-slate-500 lg:text-sm 2xl:text-base">Centro de operaciones</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 lg:gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-[9px] font-semibold capitalize text-slate-500 lg:text-[10px] 2xl:text-xs">{formatLongDate(today)}</p>
              <p className="text-sm font-black tabular-nums text-[#10213b] lg:text-base 2xl:text-lg">{updated}</p>
            </div>
            <span className="hidden items-center gap-3 rounded-lg border border-emerald-400/30 bg-emerald-400/10 px-3 py-2 md:inline-flex"><i className="h-2.5 w-2.5 animate-pulse rounded-full bg-emerald-400 shadow-[0_0_12px_#34d399]" /><span><strong className="block text-[10px] text-emerald-700 2xl:text-xs">Operación activa</strong><small className="block text-[8px] text-emerald-600 2xl:text-[10px]">Refresco automático</small></span></span>
            <button className="inline-flex h-11 items-center gap-2 rounded-lg border border-cyan-400/30 bg-cyan-400/10 px-4 text-sm font-bold text-cyan-200 hover:bg-cyan-400/20 2xl:text-base" onClick={() => router.push("/admin/modo-tv")} type="button"><Truck size={19} />Seguimiento</button>
            <button className="inline-flex h-11 items-center gap-2 rounded-lg border border-emerald-400/30 bg-emerald-400/10 px-4 text-sm font-bold text-emerald-700 hover:bg-emerald-400/20 2xl:text-base" onClick={() => router.push("/admin/modo-tv/rango")} type="button"><MapPinCheck size={19} />Entrega en rango</button>
            <ExitTvButton />
            <button aria-label="Actualizar" className="grid h-10 w-10 place-items-center rounded-lg border border-slate-200 bg-slate-50 text-cyan-700 hover:bg-cyan-50" onClick={() => void load()} type="button"><RefreshCw className={loading ? "animate-spin" : ""} size={17} /></button>
            <button aria-label="Pantalla completa" className="grid h-10 w-10 place-items-center rounded-lg border border-rose-400/30 bg-rose-400/10 text-rose-200 hover:bg-rose-400/20" onClick={() => void toggleFullscreen()} type="button">{fullscreen ? <X size={18} /> : <Maximize size={18} />}</button>
          </div>
        </header>

        <div className="relative z-10 flex min-h-0 flex-1 flex-col gap-3 p-4 lg:gap-4 lg:p-5">
          {error && <p className="rounded-lg border border-red-400/30 bg-red-500/15 px-4 py-3 text-sm font-bold text-red-700">{error}</p>}

          <section className="grid shrink-0 grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4 2xl:gap-5">
            <DashboardMetric color="blue" icon={<Package />} label="Cajas seguimiento" value={general.cajas} />
            <DashboardMetric color="red" icon={<XCircle />} label="Rechazadas" value={general.reportadas} />
            <DashboardMetric color="green" icon={<CheckCircle2 />} label="Gestionadas" value={general.gestionadas} />
            <DashboardMetric color="amber" icon={<Users />} label="Checkins" value={general.checkins} />
          </section>

          <section className="grid min-h-0 flex-1 gap-4 overflow-y-auto lg:grid-cols-2 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)_minmax(280px,0.8fr)] xl:overflow-hidden">
            <RefusalGroup accent="cyan" data={salesBosses} title="Jefes de ventas" />
            <RefusalGroup accent="blue" data={coms} title="COM" />
            <GeneralRefusalCard general={general} contractorStats={contractorStats} />
          </section>
        </div>
      </section>
    </main>
  );
}

function RefusalGroup({ accent, data, title }: { accent: "cyan" | "blue"; data: SummaryRow[]; title: string }) {
  const isBoss = accent === "cyan";

  if (!isBoss) return <ComBarChart data={data} />;

  return (
    <section className="flex min-h-[420px] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm xl:min-h-0">
      <header className="flex h-16 shrink-0 items-center justify-between gap-3 border-b border-slate-200 px-4 2xl:h-[72px]">
        <div className="flex min-w-0 items-center gap-3">
          <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg text-white ${isBoss ? "bg-gradient-to-br from-cyan-500 to-cyan-700 shadow-lg shadow-cyan-500/20" : "bg-gradient-to-br from-blue-500 to-blue-700 shadow-lg shadow-blue-500/20"}`}>{isBoss ? <Users size={22} /> : <Package size={22} />}</span>
          <div className="min-w-0"><h2 className="text-lg font-extrabold 2xl:text-xl">{title}</h2><p className="text-xs text-slate-500">Top ofensores por cajas pendientes</p></div>
        </div>
        <span className="rounded-lg border border-cyan-200 bg-cyan-50 px-3 py-1.5 text-sm font-bold tabular-nums text-cyan-700">{data.length}</span>
      </header>
      <div className="min-h-[320px] flex-1 overflow-hidden [container-type:size] xl:min-h-0">
        <table className="h-full w-full table-fixed" style={{ fontSize: `clamp(8px, ${70 / Math.max(data.length, 1)}cqh, 14px)` }}>
          <caption className="sr-only">Ranking de {title} ordenado de mayor a menor por cajas pendientes</caption>
          <thead className="h-10 bg-[#eef4f8] text-[10px] uppercase tracking-wide text-slate-600 2xl:text-xs">
            <tr>
              <th scope="col" className="w-[40%] px-3 py-3 text-left">{isBoss ? "Jefe de ventas" : "COM"}</th>
              <th scope="col" className="w-[15%] px-1 py-0.5 text-right">Report.</th>
              <th scope="col" className="w-[15%] px-1 py-0.5 text-right">Gest.</th>
              <th scope="col" className="w-[15%] px-1 py-0.5 text-right">Pend.</th>
              <th scope="col" className="w-[15%] px-1 py-0.5 text-right">%</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200/70">
            {data.length ? data.map((item, index) => (
              <tr key={item.key ?? item.label} className={`${index % 2 ? "bg-slate-50" : "bg-white"} hover:bg-cyan-50/50`}>
                <th scope="row" className="px-2 py-0.5 text-left font-semibold text-slate-700">
                  <div className="flex items-center gap-2"><span className={`grid h-[1.8em] w-[1.8em] shrink-0 place-items-center rounded-md text-[0.85em] tabular-nums ${index < 3 ? "bg-cyan-100 text-cyan-800" : "bg-slate-100 text-slate-500"}`}>{String(index + 1).padStart(2, "0")}</span><span className="truncate" title={item.label}>{item.label}</span></div>
                </th>
                <td className="px-1 py-0.5 text-right tabular-nums text-slate-600">{item.reportadas.toLocaleString("es-CO")}</td>
                <td className="px-1 py-0.5 text-right tabular-nums text-emerald-700">{item.gestionadas.toLocaleString("es-CO")}</td>
                <td className="px-1 py-0.5 text-right"><span className={`inline-flex justify-center rounded-md border px-1.5 py-0.5 font-black tabular-nums ${item.final > 0 ? "border-red-200 bg-red-50 text-red-600" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>{item.final.toLocaleString("es-CO")}</span></td>
                <td className="px-1 py-0.5 text-right font-semibold tabular-nums text-slate-700">{item.percent.toFixed(2)}%</td>
              </tr>
            )) : <tr><td colSpan={5} className="px-4 py-16 text-center text-sm text-slate-500">Sin registros para mostrar.</td></tr>}
          </tbody>
        </table>
      </div>
      <footer className="shrink-0 border-t border-slate-200 bg-slate-50 px-4 py-3 text-[11px] leading-relaxed text-slate-500">
        Reportadas / Gestionadas / Pendientes<br />% pendiente sobre cajas reportadas
      </footer>
    </section>
  );
}

function ComBarChart({ data }: { data: SummaryRow[] }) {
  const max = Math.max(1, ...data.map((item) => item.final));

  return (
    <section className="flex min-h-[420px] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm xl:min-h-0">
      <header className="flex h-16 shrink-0 items-center justify-between gap-3 border-b border-slate-200 px-4 2xl:h-[72px]">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-blue-500 to-blue-700 text-white shadow-lg shadow-blue-500/20"><Package size={22} /></span>
          <div><h2 className="text-lg font-extrabold 2xl:text-xl">COM</h2><p className="text-xs text-slate-500">Cajas pendientes por COM</p></div>
        </div>
        <span className="rounded-lg border border-cyan-200 bg-cyan-50 px-3 py-1.5 text-sm font-bold tabular-nums text-cyan-700">{data.length}</span>
      </header>
      <div className="min-h-[320px] flex-1 overflow-hidden px-4 py-2 xl:min-h-0">
        {data.length ? <ul className="grid h-full divide-y divide-slate-100" style={{ gridTemplateRows: `repeat(${data.length}, minmax(0, 1fr))` }}>{data.map((item, index) => (
          <li key={item.key ?? item.label} className="grid min-h-0 grid-cols-[62px_minmax(16px,1fr)_44px_52px] items-center gap-2 py-0.5">
            <span className="truncate text-[clamp(9px,1.05vw,13px)] font-bold tabular-nums text-slate-700" title={item.label}>{item.label}</span>
            <div role="img" aria-label={`${item.label}: ${item.final.toLocaleString("es-CO")} cajas pendientes`} className="h-[clamp(5px,1.1vw,10px)] overflow-hidden rounded-full bg-slate-100">
              <div className={`h-full rounded-full bg-gradient-to-r ${index === 0 ? "from-blue-600 to-cyan-500" : "from-blue-400 to-cyan-300"}`} style={{ width: `${Math.max(0, Math.min(100, item.final / max * 100))}%` }} />
            </div>
            <strong className="text-right text-[clamp(10px,1.2vw,15px)] tabular-nums text-blue-700">{item.final.toLocaleString("es-CO")}</strong>
            <span className="text-right text-[clamp(8px,0.9vw,11px)] font-medium tabular-nums text-slate-500">{item.percent.toFixed(2)}%</span>
          </li>
        ))}</ul> : <p className="py-16 text-center text-sm text-slate-500">Sin registros para mostrar.</p>}
      </div>
      <footer className="flex shrink-0 items-center justify-between border-t border-slate-200 bg-slate-50 px-4 py-3 text-[11px] text-slate-500"><span>Ordenado por cajas pendientes</span><span>% pendiente</span></footer>
    </section>
  );
}

function GeneralRefusalCard({ general, contractorStats }: { general: RefusalStats; contractorStats: Array<{ contractor: string; stats: RefusalStats }> }) {
  const controlled = general.percent < 1;
  const targetProgress = Math.min(100, Math.max(0, general.percent * 100));
  return (
    <aside className="flex min-h-[420px] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm xl:min-h-0">
      <header className="flex h-14 shrink-0 flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-gradient-to-r from-white to-emerald-50/40 px-4">
        <div><h2 className="text-base font-bold tracking-tight">Control general</h2><p className="text-[10px] text-slate-500">Logísticos y Surti Cervezas</p></div>
        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ${controlled ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}><span className={`h-1.5 w-1.5 rounded-full ${controlled ? "bg-emerald-500" : "bg-rose-500"}`} />{controlled ? "Controlado" : "Sobre el tope"}</span>
      </header>
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden p-3">
        <div className={`shrink-0 rounded-2xl border p-3 shadow-sm ${controlled ? "border-emerald-100 bg-gradient-to-br from-emerald-50 to-white" : "border-rose-100 bg-gradient-to-br from-rose-50 to-white"}`}>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Refusal total</p>
          <p className={`mt-1 text-[clamp(2.25rem,3.5vw,3.75rem)] font-black leading-none tracking-tight tabular-nums ${controlled ? "text-emerald-700" : "text-rose-700"}`}>{general.percent.toFixed(2)}<span className="ml-1 text-xl">%</span></p>
          <p className="mt-2 text-xs text-slate-500">Sobre {general.cajas.toLocaleString("es-CO")} cajas de seguimiento</p>
          <div className="mt-3 flex justify-between text-xs font-semibold text-slate-600"><span>Tope de referencia</span><span>1,00%</span></div>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-white"><div className={`h-full rounded-full ${controlled ? "bg-emerald-500" : "bg-rose-500"}`} style={{ width: `${targetProgress}%` }} /></div>
        </div>
        <div className="shrink-0 grid grid-cols-2 divide-x divide-slate-100 rounded-xl border border-slate-200 py-2 text-center">
          <div><p className="text-[10px] text-slate-500">Cajas pendientes</p><strong className="mt-0.5 block text-xl tabular-nums">{general.final.toLocaleString("es-CO")}</strong></div>
          <div><p className="text-[10px] text-slate-500">Tope de cajas</p><strong className="mt-0.5 block text-xl tabular-nums">{general.max.toLocaleString("es-CO")}</strong></div>
        </div>
        <div className="min-h-0 flex-1 overflow-hidden">
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Por contratista</h3>
          <div className="grid h-[calc(100%-1.5rem)] gap-1.5" style={{ gridTemplateRows: `repeat(${Math.max(contractorStats.length, 1)}, minmax(0, 1fr))` }}>{contractorStats.map(({ contractor, stats }) => (
            <div key={contractor} className="flex min-h-0 items-center justify-between gap-3 rounded-xl border border-slate-200 bg-gradient-to-r from-slate-50 to-white px-3 py-1.5 shadow-sm">
              <div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-700">{contractor}</p><p className="text-[10px] text-slate-500">{stats.final.toLocaleString("es-CO")} cajas pendientes</p></div>
              <strong className={`shrink-0 text-lg tabular-nums ${stats.percent < 1 ? "text-emerald-600" : "text-rose-600"}`}>{stats.percent.toFixed(2)}%</strong>
            </div>
          ))}</div>
        </div>
      </div>
    </aside>
  );
}

function DashboardMetric({ icon, label, value, color }: { icon: ReactNode; label: string; value: number; color: "blue" | "red" | "green" | "amber" }) {
  const tones = { blue: "from-blue-500 to-blue-700 shadow-blue-500/20", red: "from-rose-500 to-red-700 shadow-red-500/20", green: "from-emerald-400 to-emerald-700 shadow-emerald-500/20", amber: "from-amber-400 to-orange-600 shadow-amber-500/20" };
  return <article className="relative overflow-hidden rounded-lg border border-[#1e456e] bg-gradient-to-br from-[#0b2b51] to-[#071d38] px-4 py-3 shadow-[0_10px_25px_rgba(0,0,0,.18)] 2xl:px-5 2xl:py-4"><div className="flex items-center gap-3"><span className={`grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-gradient-to-br text-white shadow-lg 2xl:h-14 2xl:w-14 ${tones[color]}`}>{icon}</span><div className="min-w-0"><p className="text-sm font-bold text-slate-600 2xl:text-base">{label}</p><strong className="block truncate text-[clamp(2rem,2.8vw,2.8rem)] font-black tabular-nums leading-none tracking-tight text-[#10213b]">{value.toLocaleString("es-CO")}</strong><p className="mt-1 text-[10px] font-medium text-slate-500 2xl:text-xs">Datos del día</p></div></div></article>;
}

function TvLightTheme() {
  return <style jsx global>{`
    [data-tv-light] > section { background: #f4f8fb !important; color: #10213b !important; }
    [data-tv-light] section > header { background: rgba(255,255,255,.97) !important; color: #10213b !important; border-color: #dbe5ef !important; }
    [data-tv-light] > section > header button { background: #f8fafc !important; color: #087d9c !important; border-color: #dbe5ef !important; }
    [data-tv-light] section[class*="rounded"], [data-tv-light] article { background: #fff !important; color: #10213b !important; border-color: #dbe5ef !important; box-shadow: 0 10px 28px rgba(15,39,68,.09) !important; }
    [data-tv-light] div[class*="bg-[#0a274a]"] { background: #fff !important; }
    [data-tv-light] [class*="text-cyan-100"], [data-tv-light] [class*="text-cyan-50"] { color: #64748b !important; }
    [data-tv-light] [class*="text-cyan-200"], [data-tv-light] [class*="text-cyan-300"] { color: #087d9c !important; }
  `}</style>;
}

function summarizeByLabel(rows: Array<{ jefeVentas?: string; com?: string; reportadas: number; gestionadas: number; refusalFinal: number }>, getLabel: (row: { jefeVentas?: string; com?: string; reportadas: number; gestionadas: number; refusalFinal: number }) => string) {
  const groups = new Map<string, SummaryRow>();

  rows.forEach((row) => {
    const label = getLabel(row).trim() || "Sin información";
    const current = groups.get(label) || { label, reportadas: 0, gestionadas: 0, final: 0, percent: 0 };
    current.reportadas += Number(row.reportadas || 0);
    current.gestionadas += Number(row.gestionadas || 0);
    current.final += Number(row.refusalFinal || 0);
    groups.set(label, current);
  });

  return Array.from(groups.values())
    .map((item) => ({ ...item, percent: item.reportadas ? (item.final / item.reportadas) * 100 : 0 }))
    .sort((a, b) => b.final - a.final || b.percent - a.percent);
}

function buildStats(records: Vehiculo[]): RefusalStats {
  const cajas = normalizeCajasTotal(records.reduce((sum, record) => sum + Number(record.cajas || 0), 0));
  const reportadas = normalizeCajasTotal(records.reduce((sum, record) => sum + Number(record.cajasRechazadas ?? record.cajasReportadas ?? 0), 0));
  const gestionadas = normalizeCajasTotal(records.reduce((sum, record) => sum + Number(record.cajasGestionadas || 0), 0));
  const final = normalizeCajasTotal(records.reduce((sum, record) => sum + Number(record.cajasRefusalFinal ?? record.cajasRechazadas ?? 0), 0));
  const max = Math.floor(cajas / 100) || 1;
  const checkins = records.filter((record) => typeof record.cajasCheckin === "number").length;
  return { cajas, reportadas, gestionadas, final, checkins, max, percent: cajas ? (final / cajas) * 100 : 0 };
}

function isExcludedContractor(contractor: string | undefined) {
  return String(contractor || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/gi, "").toLowerCase() === "puntocoronaarenosa";
}

function bogotaToday() { const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date()); const values = Object.fromEntries(parts.map((part) => [part.type, part.value])); return `${values.year}-${values.month}-${values.day}`; }
function recordDate(record: Vehiculo) { const raw = record.fechaDespacho || record.fechaDt || record.date || record.createdAt || ""; if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10); const match = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/); if (!match) return ""; return `${match[3].length === 2 ? `20${match[3]}` : match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`; }
function formatBogotaTime(value: string | undefined) { return value ? new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", hour: "2-digit", minute: "2-digit" }).format(new Date(value)) : "—"; }
function formatLongDate(value: string) { return new Intl.DateTimeFormat("es-CO", { weekday: "short", day: "2-digit", month: "short", year: "numeric" }).format(new Date(`${value}T12:00:00`)); }
