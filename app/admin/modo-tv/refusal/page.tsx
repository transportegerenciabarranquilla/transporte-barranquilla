"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Activity, ArrowLeft, Box, CheckCircle2, ClipboardList, MapPinCheck, Maximize, Package, RefreshCw, Truck, Users, X, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import type { Vehiculo } from "../../../seguimiento/types";
import { getProgress, getStatus, normalizeCajasTotal } from "../../../seguimiento/utils";

type TvData = { records: Vehiculo[] };
type RefusalStats = { cajas: number; reportadas: number; gestionadas: number; final: number; checkins: number; percent: number; max: number };
const GALAPA = ["Logisticos", "Surti Cervezas"];

export default function RefusalTvPage() {
  const router = useRouter();
  const [data, setData] = useState<TvData>({ records: [] });
  const [operationalDate, setOperationalDate] = useState("");
  const [updated, setUpdated] = useState("—");
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
      setUpdated(formatBogotaTime(body.now));
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

  const today = operationalDate || bogotaToday();
  const records = data.records.filter((record) => GALAPA.includes(record.transportista) && recordDate(record) === today);
  const general = buildStats(records);
  const contractorStats = GALAPA.map((contractor) => ({ contractor, stats: buildStats(records.filter((record) => record.transportista === contractor)) }));

  async function toggleFullscreen() {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  }

  return (
    <main className="h-screen overflow-hidden bg-white text-[#10213b]" data-tv-light>
      <TvLightTheme />
      <section className="relative flex h-screen w-full flex-col overflow-hidden bg-[radial-gradient(circle_at_78%_5%,rgba(34,211,238,.13),transparent_28%),linear-gradient(145deg,#ffffff,#f2f7fb_62%,#eaf3f8)]">
        <div className="pointer-events-none absolute inset-0 opacity-50" style={{ backgroundImage: "linear-gradient(rgba(35,91,137,.08) 1px,transparent 1px),linear-gradient(90deg,rgba(35,91,137,.08) 1px,transparent 1px)", backgroundSize: "36px 36px" }} />

        <header className="relative z-10 flex min-h-20 items-center justify-between border-b border-slate-200 bg-white/95 px-5 py-3 shadow-sm lg:px-7 2xl:min-h-24 2xl:px-9">
          <div className="flex items-center gap-3">
            <button aria-label="Volver al seguimiento TV" className="grid h-11 w-11 place-items-center rounded-lg border border-slate-200 bg-slate-50 text-cyan-700 hover:bg-cyan-50" onClick={() => router.push("/admin/modo-tv")} type="button"><ArrowLeft size={20} /></button>
            <span className="grid h-11 w-11 place-items-center text-rose-500"><Box size={31} strokeWidth={1.8} /></span>
            <div>
              <h1 className="text-2xl font-black tracking-tight lg:text-3xl 2xl:text-4xl">Control refusal Galapa</h1>
              <p className="text-xs font-medium tracking-wide text-slate-500 lg:text-sm 2xl:text-base">Centro de operaciones</p>
            </div>
          </div>

          <div className="flex items-center gap-3 lg:gap-5">
            <div className="hidden text-right sm:block">
              <p className="text-[9px] font-semibold capitalize text-slate-500 lg:text-[10px] 2xl:text-xs">{formatLongDate(today)}</p>
              <p className="text-sm font-black tabular-nums text-[#10213b] lg:text-base 2xl:text-lg">{updated}</p>
            </div>
            <span className="hidden items-center gap-3 rounded-lg border border-emerald-400/30 bg-emerald-400/10 px-3 py-2 md:inline-flex"><i className="h-2.5 w-2.5 animate-pulse rounded-full bg-emerald-400 shadow-[0_0_12px_#34d399]" /><span><strong className="block text-[10px] text-emerald-200 2xl:text-xs">Operación activa</strong><small className="block text-[8px] text-emerald-100/65 2xl:text-[10px]">Refresco automático</small></span></span>
            <button className="inline-flex h-11 items-center gap-2 rounded-lg border border-cyan-400/30 bg-cyan-400/10 px-4 text-sm font-bold text-cyan-200 hover:bg-cyan-400/20 2xl:text-base" onClick={() => router.push("/admin/modo-tv")} type="button"><Truck size={19} />Seguimiento</button>
            <button className="inline-flex h-11 items-center gap-2 rounded-lg border border-emerald-400/30 bg-emerald-400/10 px-4 text-sm font-bold text-emerald-700 hover:bg-emerald-400/20 2xl:text-base" onClick={() => router.push("/admin/modo-tv/rango")} type="button"><MapPinCheck size={19} />Entrega en rango</button>
            <button aria-label="Actualizar" className="grid h-10 w-10 place-items-center rounded-lg border border-slate-200 bg-slate-50 text-cyan-700 hover:bg-cyan-50" onClick={() => void load()} type="button"><RefreshCw className={loading ? "animate-spin" : ""} size={17} /></button>
            <button aria-label="Pantalla completa" className="grid h-10 w-10 place-items-center rounded-lg border border-rose-400/30 bg-rose-400/10 text-rose-200 hover:bg-rose-400/20" onClick={() => void toggleFullscreen()} type="button">{fullscreen ? <X size={18} /> : <Maximize size={18} />}</button>
          </div>
        </header>

        <div className="relative z-10 flex min-h-0 flex-1 flex-col gap-3 p-4 lg:gap-4 lg:p-5">
          {error && <p className="rounded-lg border border-red-400/30 bg-red-500/15 px-4 py-3 text-sm font-bold text-red-200">{error}</p>}

          <div className="hidden"><OverallRefusalHero general={general} /></div>

          <section className="grid shrink-0 grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4 2xl:gap-5">
            <DashboardMetric color="blue" icon={<Package />} label="Cajas seguimiento" value={general.cajas} />
            <DashboardMetric color="red" icon={<XCircle />} label="Rechazadas" value={general.reportadas} />
            <DashboardMetric color="green" icon={<CheckCircle2 />} label="Gestionadas" value={general.gestionadas} />
            <DashboardMetric color="amber" icon={<Users />} label="Checkins" value={general.checkins} />
          </section>

          <section className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[0.9fr_1.1fr] 2xl:gap-5">
            <ContractorRiskPanel general={general} items={contractorStats} />
            <OffendersTable records={records} />
          </section>
        </div>
      </section>
    </main>
  );
}

function TvLightTheme() {
  return <style jsx global>{`
    [data-tv-light] > section { background: #f4f8fb !important; color: #10213b !important; }
    [data-tv-light] section > header { background: rgba(255,255,255,.97) !important; color: #10213b !important; border-color: #dbe5ef !important; }
    [data-tv-light] > section > header button { background: #f8fafc !important; color: #087d9c !important; border-color: #dbe5ef !important; }
    [data-tv-light] section[class*="rounded"], [data-tv-light] article { background: #fff !important; color: #10213b !important; border-color: #dbe5ef !important; box-shadow: 0 10px 28px rgba(15,39,68,.09) !important; }
    [data-tv-light] div[class*="bg-[#0a274a]"], [data-tv-light] div[class*="bg-[#092644]"], [data-tv-light] div[class*="bg-[#071d38]"] { background: #fff !important; }
    [data-tv-light] [class*="text-cyan-100"], [data-tv-light] [class*="text-cyan-50"] { color: #64748b !important; }
    [data-tv-light] [class*="text-cyan-200"], [data-tv-light] [class*="text-cyan-300"] { color: #087d9c !important; }
    [data-tv-light] section[class*="rounded"] strong[class*="text-white"] { color: #10213b !important; }
    [data-tv-light] table thead { background: #eef4f8 !important; color: #334155 !important; }
    [data-tv-light] table tbody { color: #334155 !important; }
    [data-tv-light] table tbody tr { background: #fff !important; border-color: #e2e8f0 !important; }
    [data-tv-light] table tbody tr:nth-child(even) { background: #f8fafc !important; }
  `}</style>;
}

function DashboardMetric({ icon, label, value, color }: { icon: ReactNode; label: string; value: number; color: "blue" | "red" | "green" | "amber" }) {
  const tones = { blue: "from-blue-500 to-blue-700 shadow-blue-500/20", red: "from-rose-500 to-red-700 shadow-red-500/20", green: "from-emerald-400 to-emerald-700 shadow-emerald-500/20", amber: "from-amber-400 to-orange-600 shadow-amber-500/20" };
  return <article className="relative overflow-hidden rounded-lg border border-[#1e456e] bg-gradient-to-br from-[#0b2b51] to-[#071d38] px-4 py-3 shadow-[0_10px_25px_rgba(0,0,0,.18)] 2xl:px-5 2xl:py-4"><div className="flex items-center gap-3"><span className={`grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-gradient-to-br text-white shadow-lg 2xl:h-14 2xl:w-14 ${tones[color]}`}>{icon}</span><div className="min-w-0"><p className="text-sm font-bold text-slate-600 2xl:text-base">{label}</p><strong className="block truncate text-[clamp(2rem,2.8vw,2.8rem)] font-black tabular-nums leading-none tracking-tight text-[#10213b]">{value.toLocaleString("es-CO")}</strong><p className="mt-1 text-[10px] font-medium text-slate-500 2xl:text-xs">Datos del día</p></div></div></article>;
}

function OverallRefusalHero({ general }: { general: RefusalStats }) {
  const controlled = general.percent < 1;
  const fill = Math.min(100, general.percent * 100);
  const managedPercent = general.reportadas ? Math.min(100, (general.gestionadas / general.reportadas) * 100) : 0;
  const ringColor = controlled ? "#d4a017" : "#fb7185";

  return (
    <section className={`relative h-[clamp(165px,21vh,200px)] shrink-0 overflow-hidden rounded-xl border bg-[linear-gradient(100deg,#08254a_0%,#07305a_47%,#061a35_100%)] shadow-[inset_0_1px_rgba(255,255,255,.04),0_16px_40px_rgba(0,0,0,.22)] ${controlled ? "border-[#1f4d7c]" : "border-rose-500/45"}`}>
      <div className={`absolute -right-20 -top-36 h-96 w-96 rounded-full blur-3xl ${controlled ? "bg-emerald-400/10" : "bg-rose-500/10"}`} />
      <div className="relative z-10 grid h-full grid-cols-[150px_1fr_auto] items-center gap-6 px-7 py-3 lg:grid-cols-[180px_1fr_310px] 2xl:grid-cols-[205px_1fr_390px] 2xl:gap-8 2xl:px-9">
        <div className="grid aspect-square w-[clamp(140px,19vh,195px)] place-items-center rounded-full p-[clamp(11px,1.5vh,16px)]" style={{ background: `conic-gradient(from -90deg,${ringColor} ${fill}%,#174a7a 0)`, boxShadow: `0 0 38px ${ringColor}30` }}>
          <div className="grid h-full w-full place-items-center rounded-full bg-[#0a274a] text-center shadow-inner">
            <div><strong className={`block text-[clamp(1.8rem,4vh,3rem)] font-black tabular-nums ${controlled ? "text-amber-600" : "text-rose-600"}`}>{general.percent.toFixed(2)}%</strong><span className="text-[8px] font-black uppercase tracking-[.2em] text-cyan-100/55 2xl:text-[10px]">Refusal general</span></div>
          </div>
        </div>

        <div className="min-w-0 max-w-xl">
          <div className="flex items-center gap-3"><h2 className="text-lg font-extrabold 2xl:text-2xl">Control general de refusal</h2><span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[9px] font-black uppercase tracking-wider ${controlled ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300" : "border-rose-400/35 bg-rose-500/15 text-rose-300"}`}><i className={`h-2 w-2 rounded-full ${controlled ? "bg-emerald-400" : "animate-pulse bg-rose-500"}`} />{controlled ? "Controlado" : "Sobre el tope"}</span></div>
          <p className="mt-2 text-xs text-cyan-100/65 2xl:text-sm"><strong className="text-white">{general.final.toLocaleString("es-CO")}</strong> cajas finales sobre un máximo recomendado de <strong className="text-amber-300">{general.max.toLocaleString("es-CO")}</strong></p>
          <div className="mt-4 max-w-lg"><div className="mb-1.5 flex justify-between text-[9px] font-bold uppercase tracking-wide text-cyan-100/55"><span>Uso del límite diario</span><span>{fill.toFixed(0)}%</span></div><div className="h-3 overflow-hidden rounded-full bg-[#0a4f8e]"><div className={`h-full rounded-full ${controlled ? "bg-gradient-to-r from-emerald-400 to-amber-300" : "bg-gradient-to-r from-amber-400 to-rose-500 shadow-[0_0_16px_rgba(244,63,94,.55)]"}`} style={{ width: `${fill}%` }} /></div></div>
        </div>

        <div className="hidden h-[72%] grid-cols-2 gap-2 border-l border-[#245079] pl-6 lg:grid">
          <HeroDatum color="text-amber-600" label="Reportadas" value={general.reportadas} />
          <HeroDatum color="text-emerald-600" label="Gestionadas" value={general.gestionadas} />
          <HeroDatum color="text-rose-600" label="Refusal final" value={general.final} />
          <div className="flex flex-col justify-center rounded-lg border border-[#245079] bg-[#071d38]/70 px-4"><span className="text-[9px] font-bold uppercase tracking-wider text-cyan-100/50">Gestión</span><strong className="text-xl font-black tabular-nums text-cyan-200 2xl:text-2xl">{managedPercent.toFixed(1)}%</strong></div>
        </div>
      </div>
    </section>
  );
}

function HeroDatum({ label, value, color }: { label: string; value: number; color: string }) {
  return <div className="flex flex-col justify-center rounded-lg border border-[#245079] bg-[#071d38]/70 px-4"><span className="text-[9px] font-bold uppercase tracking-wider text-cyan-100/50">{label}</span><strong className={`text-xl font-black tabular-nums 2xl:text-2xl ${color}`}>{value.toLocaleString("es-CO")}</strong></div>;
}

function ContractorRiskPanel({ general, items }: { general: RefusalStats; items: Array<{ contractor: string; stats: RefusalStats }> }) {
  const controlled = general.percent < 1;
  const circles = [...items, { contractor: "General", stats: general }];
  return (
    <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-[#1d4165] bg-[#071a32]/95 shadow-[0_14px_35px_rgba(0,0,0,.22)]">
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-[#1c3f61] px-5 2xl:h-14">
        <h2 className="flex items-center gap-2 text-base font-extrabold 2xl:text-lg"><Activity className="text-cyan-600" size={20} />Resumen de refusal</h2>
        <div className="flex items-center gap-2"><span className="rounded-full border border-[#294765] bg-[#0a203b] px-3 py-1.5 text-[10px] font-bold text-cyan-100/70 2xl:text-xs">META &lt; 1%</span><span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[10px] font-black uppercase tracking-wider 2xl:text-xs ${controlled ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300" : "border-red-400/40 bg-red-500/15 text-red-300"}`}><i className={`h-2.5 w-2.5 rounded-full ${controlled ? "bg-emerald-400" : "animate-pulse bg-red-500"}`} />{controlled ? "Controlado" : "Sobre el tope"}</span></div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-3 items-center gap-2 px-3 py-3 2xl:gap-4 2xl:px-5">
        {circles.map((item, index) => <RefusalBubble accent={index === 0 ? "#22d3ee" : index === 1 ? "#3b82f6" : "#d4a017"} key={item.contractor} label={item.contractor} stats={item.stats} />)}
      </div>
      <footer className="grid h-16 shrink-0 grid-cols-3 items-center border-t border-slate-200 bg-slate-50/70 text-center 2xl:h-20">
        <SummaryMini color="text-amber-600" label="Rechazadas" value={general.reportadas} />
        <SummaryMini color="text-emerald-600" label="Gestionadas" value={general.gestionadas} />
        <SummaryMini color="text-rose-600" label="Refusal final" value={general.final} />
      </footer>
    </section>
  );
}

function RefusalBubble({ label, stats, accent }: { label: string; stats: RefusalStats; accent: string }) {
  const controlled = stats.percent < 1;
  const circleColor = controlled ? accent : "#ef4444";
  const fill = Math.min(100, stats.percent * 100);
  const risk = stats.percent >= 1 ? { label: "Crítico", color: "text-rose-600", dot: "animate-pulse bg-rose-500" } : stats.percent >= 0.75 ? { label: "Atención", color: "text-amber-600", dot: "bg-amber-400" } : { label: "Estable", color: "text-emerald-600", dot: "bg-emerald-400" };
  const isGeneral = label === "General";
  const contractorTone = isGeneral ? "border-amber-200 bg-amber-50 text-amber-700" : label === "Logisticos" ? "border-cyan-200 bg-cyan-50 text-cyan-700" : "border-blue-200 bg-blue-50 text-blue-700";

  return (
    <div className="flex min-w-0 flex-col items-center justify-center gap-2">
      <div className={`grid aspect-square w-[clamp(160px,11vw,210px)] shrink-0 place-items-center rounded-full p-3.5 ${isGeneral ? "ring-2 ring-amber-300/25" : ""}`} style={{ background: `conic-gradient(from -90deg,${circleColor} ${fill}%,#dbe7f1 0)`, boxShadow: `0 10px 30px ${circleColor}28` }}>
        <div className="grid h-full w-full place-items-center rounded-full bg-white text-center shadow-inner">
          <div><strong className={`block text-[clamp(1.8rem,2.7vw,2.8rem)] font-black tabular-nums ${isGeneral && controlled ? "text-amber-600" : controlled ? "text-[#10213b]" : "text-rose-600"}`}>{stats.percent.toFixed(2)}%</strong><span className="text-[9px] font-bold uppercase tracking-wider text-slate-500 2xl:text-[11px]">{stats.final.toLocaleString("es-CO")} / {stats.max.toLocaleString("es-CO")} cajas</span></div>
        </div>
      </div>
      <span className={`inline-flex max-w-full truncate rounded-full border px-3 py-1 text-[11px] font-extrabold 2xl:text-sm ${contractorTone}`}>{label}</span>
      <span className={`inline-flex items-center gap-1.5 text-[9px] font-black uppercase tracking-wider 2xl:text-[11px] ${risk.color}`}><i className={`h-2 w-2 rounded-full ${risk.dot}`} />{risk.label}</span>
    </div>
  );
}

function SummaryMini({ label, value, color }: { label: string; value: number; color: string }) {
  return <div><p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 2xl:text-xs">{label}</p><p className={`mt-0.5 text-2xl font-black tabular-nums 2xl:text-3xl ${color}`}>{value.toLocaleString("es-CO")}</p></div>;
}

function OffendersTable({ records }: { records: Vehiculo[] }) {
  const rows = [...records].sort((a, b) => refusalBoxes(b) - refusalBoxes(a) || String(a.vehiculo).localeCompare(String(b.vehiculo))).slice(0, 10);
  return (
    <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-[#1d4165] bg-[#071a32]/95 shadow-[0_14px_35px_rgba(0,0,0,.22)]">
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-[#1c3f61] px-5 2xl:h-[72px]">
        <div className="flex min-w-0 items-center gap-3"><span className="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-blue-500 to-blue-700 text-white shadow-lg shadow-blue-500/20 2xl:h-14 2xl:w-14"><ClipboardList size={25} /></span><div className="min-w-0"><h2 className="truncate text-xl font-extrabold 2xl:text-2xl">Top 10 ofensores · Logisticos y Surti</h2><p className="truncate text-sm font-medium text-slate-500 2xl:text-base">Mayor refusal por ruta y responsable</p></div></div>
        <span className="rounded-lg border border-cyan-300 bg-cyan-50 px-4 py-2 text-sm font-black text-cyan-700 2xl:text-base">{rows.length}</span>
      </header>
      <div className="min-h-0 flex-1 overflow-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <table className="w-full table-fixed text-sm 2xl:text-base">
          <thead className="sticky top-0 z-10 bg-[#0d3159] text-xs uppercase tracking-wide text-cyan-50/80 2xl:text-sm">
            <tr><th className="w-[21%] px-4 py-3 text-left">Contratista</th><th className="w-[18%] px-4 py-3 text-left">Vehículo</th><th className="w-[34%] px-4 py-3 text-left">Responsable</th><th className="w-[16%] px-4 py-3 text-left">Status</th><th className="w-[11%] px-4 py-3 text-right">Cajas</th></tr>
          </thead>
          <tbody className="divide-y divide-[#173b5e]">
            {rows.length ? rows.map((record, index) => (
              <tr className={index % 2 ? "bg-[#081d36]" : "bg-[#0a2340]"} key={record.recordId || `${record.transportista}-${record.transporte}-${record.vehiculo}`}>
                <td className="truncate px-4 py-2.5"><span className={`inline-flex max-w-full truncate rounded-md px-3 py-1.5 font-bold ${record.transportista === "Logisticos" ? "bg-cyan-50 text-cyan-700" : "bg-blue-50 text-blue-700"}`}>{record.transportista}</span></td>
                <td className="truncate px-4 py-2.5 font-extrabold text-cyan-700">{record.vehiculo || `DT ${record.transporte}`}</td>
                <td className="truncate px-4 py-2.5 font-medium text-slate-700" title={responsible(record)}>{responsible(record)}</td>
                <td className="px-4 py-2.5"><StatusBadge value={getStatus(getProgress(record), record)} /></td>
                <td className="px-4 py-2.5 text-right"><span className="inline-flex min-w-12 justify-center rounded-md border border-red-200 bg-red-50 px-3 py-1.5 font-black tabular-nums text-red-600">{refusalBoxes(record).toLocaleString("es-CO")}</span></td>
              </tr>
            )) : <tr><td className="px-5 py-16 text-center text-xs font-medium text-cyan-100/50" colSpan={5}>No hay rutas para hoy.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function StatusBadge({ value }: { value: string }) {
  const tone = value === "Finalizado" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : value === "En ruta" ? "border-amber-200 bg-amber-50 text-amber-700" : "border-slate-200 bg-slate-50 text-slate-600";
  return <span className={`inline-flex max-w-full truncate rounded-md border px-3 py-1.5 text-xs font-bold 2xl:text-base ${tone}`}>{value}</span>;
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
function formatBogotaTime(value: string | undefined) { return value ? new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", hour: "2-digit", minute: "2-digit" }).format(new Date(value)) : "—"; }
function formatLongDate(value: string) { return new Intl.DateTimeFormat("es-CO", { weekday: "short", day: "2-digit", month: "short", year: "numeric" }).format(new Date(`${value}T12:00:00`)); }
