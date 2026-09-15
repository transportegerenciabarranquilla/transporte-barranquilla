"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { ArrowLeft, Box, Boxes, ClipboardList, Maximize, RefreshCw, ShieldAlert, Truck, Users, X } from "lucide-react";
import { useRouter } from "next/navigation";
import type { Vehiculo } from "../../seguimiento/types";
import { getProgress, getStatus, normalizeCajasTotal } from "../../seguimiento/utils";

type Summary = { contractor: string; rutas: number; cajas: number; clientes: number; visitados: number };
type ModulationRow = { contractor: string; date: string; modulationBoxes: number };
type TvData = { records: Vehiculo[]; modulationRacocimi2: ModulationRow[] };
const GALAPA = ["Logisticos", "Surti Cervezas"];

export default function AdminModoTvPage() {
  const router = useRouter();
  const [data, setData] = useState<TvData>({ records: [], modulationRacocimi2: [] });
  const [operationalDate, setOperationalDate] = useState("");
  const [updated, setUpdated] = useState("—");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [fullscreen, setFullscreen] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/seguimiento", { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "No se pudo cargar el seguimiento.");
      setData({ records: body.records || [], modulationRacocimi2: body.modulationRacocimi2 || [] });
      setOperationalDate(body.today || "");
      setUpdated(formatBogotaTime(body.now));
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No se pudo cargar el seguimiento.");
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
  const modules = data.modulationRacocimi2.filter((row) => GALAPA.includes(row.contractor) && row.date === today);
  const summaries = useMemo(
    () => GALAPA.map((contractor) => summaryFor(contractor, records.filter((record) => record.transportista === contractor))),
    [records],
  );
  const total = summaries.reduce(
    (acc, item) => ({ rutas: acc.rutas + item.rutas, cajas: acc.cajas + item.cajas, clientes: acc.clientes + item.clientes, visitados: acc.visitados + item.visitados }),
    { rutas: 0, cajas: 0, clientes: 0, visitados: 0 },
  );
  const progress = total.clientes ? (total.visitados / total.clientes) * 100 : 0;
  const delayed = records.filter((record) => getProgress(record) < 50 && getStatus(getProgress(record), record) === "En ruta").length;

  async function toggleFullscreen() {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  }

  return (
    <main className="h-screen overflow-hidden bg-[#030912] text-white">
      <section className="relative flex h-screen w-full flex-col overflow-hidden bg-[radial-gradient(circle_at_72%_7%,rgba(20,84,153,.22),transparent_26%),linear-gradient(145deg,#081a31,#061326_62%,#071a2f)]">
        <div className="pointer-events-none absolute inset-0 opacity-20" style={{ backgroundImage: "linear-gradient(rgba(62,112,163,.13) 1px,transparent 1px),linear-gradient(90deg,rgba(62,112,163,.13) 1px,transparent 1px)", backgroundSize: "36px 36px" }} />

        <header className="relative z-10 flex min-h-20 items-center justify-between border-b border-[#193451] bg-[#07172b]/92 px-5 py-3 lg:px-7 2xl:min-h-24 2xl:px-9">
          <div className="flex items-center gap-3">
            <button aria-label="Volver al admin" className="grid h-11 w-11 place-items-center rounded-lg border border-[#294765] bg-[#0a203b] text-cyan-300 transition hover:bg-[#102b4d]" onClick={() => router.push("/admin")} type="button"><ArrowLeft size={20} /></button>
            <span className="grid h-11 w-11 place-items-center text-rose-500"><Box size={31} strokeWidth={1.8} /></span>
            <div>
              <h1 className="text-xl font-extrabold tracking-tight lg:text-2xl 2xl:text-3xl">Seguimiento Galapa</h1>
              <p className="text-[10px] font-medium tracking-wide text-cyan-100/75 lg:text-xs 2xl:text-sm">Centro de operaciones</p>
            </div>
          </div>

          <div className="flex items-center gap-3 lg:gap-5">
            <div className="hidden text-right sm:block">
              <p className="text-[9px] font-semibold capitalize text-slate-300 lg:text-[10px] 2xl:text-xs">{formatLongDate(today)}</p>
              <p className="text-sm font-black tabular-nums text-white lg:text-base 2xl:text-lg">{updated}</p>
            </div>
            <span className="hidden items-center gap-3 rounded-lg border border-emerald-400/30 bg-emerald-400/10 px-3 py-2 md:inline-flex">
              <i className="h-2.5 w-2.5 animate-pulse rounded-full bg-emerald-400 shadow-[0_0_12px_#34d399]" />
              <span><strong className="block text-[10px] text-emerald-200 2xl:text-xs">Operación activa</strong><small className="block text-[8px] text-emerald-100/65 2xl:text-[10px]">Todo en marcha</small></span>
            </span>
            <button className="inline-flex h-10 items-center gap-2 rounded-lg border border-red-400/30 bg-red-500/10 px-3 text-xs font-bold text-red-200 hover:bg-red-500/20 2xl:text-sm" onClick={() => router.push("/admin/modo-tv/refusal")} type="button"><ShieldAlert size={17} />Refusal</button>
            <button aria-label="Actualizar" className="grid h-10 w-10 place-items-center rounded-lg border border-[#294765] bg-[#0a203b] text-cyan-200 hover:bg-[#102b4d]" onClick={() => void load()} type="button"><RefreshCw className={loading ? "animate-spin" : ""} size={17} /></button>
            <button aria-label="Pantalla completa" className="grid h-10 w-10 place-items-center rounded-lg border border-cyan-400/30 bg-cyan-400/10 text-cyan-200 hover:bg-cyan-400/20" onClick={() => void toggleFullscreen()} type="button">{fullscreen ? <X size={18} /> : <Maximize size={18} />}</button>
          </div>
        </header>

        <div className="relative z-10 flex min-h-0 flex-1 flex-col gap-3 p-4 lg:gap-4 lg:p-5">
          {error && <p className="rounded-lg border border-red-400/30 bg-red-500/15 px-4 py-3 text-sm font-bold text-red-200">{error}</p>}

          <section className="relative h-[clamp(175px,24vh,230px)] shrink-0 overflow-hidden rounded-xl border border-[#1f4d7c] bg-[linear-gradient(100deg,#08254a_0%,#07305a_47%,#061a35_100%)] shadow-[inset_0_1px_rgba(255,255,255,.04),0_16px_40px_rgba(0,0,0,.22)]">
            <div className="absolute inset-y-0 right-0 w-[48%] opacity-50">
              <OperationsScene />
            </div>
            <div className="relative z-10 grid h-full grid-cols-[145px_1fr] items-center gap-5 px-6 py-2 lg:grid-cols-[175px_1fr] lg:px-8 2xl:grid-cols-[200px_1fr] 2xl:gap-7">
              <ProgressDonut value={progress} />
              <div className="max-w-md 2xl:max-w-xl">
                <p className="text-base font-extrabold 2xl:text-xl">Avance general</p>
                <p className="mt-2 text-xs text-cyan-100/75 2xl:text-sm">{total.clientes.toLocaleString("es-CO")} clientes</p>
                <p className="text-xs font-bold text-emerald-300 2xl:text-sm">{total.visitados.toLocaleString("es-CO")} completados</p>
                <div className="mt-4 h-3 max-w-sm overflow-hidden rounded-full bg-[#0a4f8e] 2xl:h-4 2xl:max-w-lg">
                  <div className="h-full rounded-full bg-gradient-to-r from-emerald-400 via-emerald-300 to-cyan-300 shadow-[0_0_15px_rgba(52,211,153,.55)]" style={{ width: `${Math.min(100, progress)}%` }} />
                </div>
              </div>
            </div>
            <div className="absolute bottom-8 right-8 z-10 hidden max-w-[180px] text-xs leading-5 text-cyan-50/80 xl:block 2xl:right-14 2xl:max-w-[230px] 2xl:text-sm">
              Personas que<br />mueven posibilidades
              <i className="mt-2 block h-0.5 w-12 bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,.55)]" />
            </div>
          </section>

          <section className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4 2xl:gap-5">
            <DashboardMetric color="green" detail="En operación" icon={<Truck />} label="Vehículos" value={total.rutas.toLocaleString("es-CO")} />
            <DashboardMetric color="cyan" detail="Completados" icon={<Users />} label="Clientes" value={`${total.visitados.toLocaleString("es-CO")}/${total.clientes.toLocaleString("es-CO")}`} />
            <DashboardMetric color="amber" detail="Por atender" icon={<ClipboardList />} label="Pendientes" value={delayed.toLocaleString("es-CO")} />
            <DashboardMetric color="violet" detail="Procesadas" icon={<Boxes />} label="Cajas" value={total.cajas.toLocaleString("es-CO")} />
          </section>

          <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-[#1d4165] bg-[#071a32]/95 shadow-[0_14px_35px_rgba(0,0,0,.22)]">
            <header className="flex h-11 items-center gap-2 border-b border-[#1c3f61] px-5 text-sm font-extrabold 2xl:h-14 2xl:text-base"><Users className="text-cyan-300" size={18} />Contratistas</header>
            <div className="grid min-h-0 flex-1 gap-3 p-3 lg:grid-cols-[1fr_1fr_250px] 2xl:grid-cols-[1fr_1fr_310px] 2xl:gap-5 2xl:p-4">
              {summaries.map((summary, index) => (
                <ContractorCard
                  accent={index === 0 ? "#22d3ee" : "#3b82f6"}
                  key={summary.contractor}
                  modules={modules.filter((row) => row.contractor === summary.contractor)}
                  records={records.filter((record) => record.transportista === summary.contractor)}
                  summary={summary}
                />
              ))}
              <div className="hidden items-center justify-center border-l border-[#1d4165] px-7 lg:flex">
                <div className="flex items-start gap-4">
                  <span className="mt-1 flex items-end gap-1 text-blue-300"><i className="h-3 w-1 rounded-sm bg-blue-400" /><i className="h-6 w-1 rounded-sm bg-blue-300" /><i className="h-9 w-1 rounded-sm bg-blue-200" /></span>
                  <div><p className="text-sm font-semibold leading-5 text-cyan-50 2xl:text-base">Logística<br />que conecta<br />resultados</p><i className="mt-3 block h-0.5 w-12 bg-rose-500" /></div>
                </div>
              </div>
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}

function ProgressDonut({ value }: { value: number }) {
  const safe = Math.min(100, Math.max(0, value));
  return <div className="grid aspect-square w-[clamp(135px,18vh,190px)] place-items-center rounded-full p-[clamp(12px,1.5vh,17px)]" style={{ background: `conic-gradient(from -90deg,#34d399 ${safe}%,#174a7a 0)`, boxShadow: "0 0 35px rgba(16,185,129,.14)" }}><div className="grid h-full w-full place-items-center rounded-full bg-[#0a274a] shadow-inner"><strong className="text-[clamp(1.9rem,4vh,3rem)] font-black tabular-nums">{safe.toFixed(1)}%</strong></div></div>;
}

function DashboardMetric({ icon, label, value, detail, color }: { icon: ReactNode; label: string; value: string; detail: string; color: "green" | "cyan" | "amber" | "violet" }) {
  const tones = { green: "from-emerald-500 to-emerald-700 shadow-emerald-500/20", cyan: "from-cyan-400 to-blue-600 shadow-cyan-500/20", amber: "from-amber-400 to-orange-600 shadow-amber-500/20", violet: "from-violet-500 to-blue-700 shadow-violet-500/20" };
  return <article className="relative overflow-hidden rounded-lg border border-[#1e456e] bg-gradient-to-br from-[#0b2b51] to-[#071d38] px-4 py-3 shadow-[0_10px_25px_rgba(0,0,0,.18)] 2xl:px-5 2xl:py-4"><div className="flex items-start gap-3"><span className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-gradient-to-br text-white shadow-lg 2xl:h-12 2xl:w-12 ${tones[color]}`}>{icon}</span><div className="min-w-0"><p className="text-xs font-semibold text-cyan-50/85 2xl:text-sm">{label}</p><strong className="block truncate text-3xl font-black tabular-nums tracking-tight 2xl:text-4xl">{value}</strong><p className="text-[9px] text-cyan-100/60 2xl:text-xs">{detail}</p></div></div><i className="absolute bottom-0 left-0 h-0.5 w-full bg-gradient-to-r from-transparent via-cyan-400/35 to-transparent" /></article>;
}

function ContractorCard({ summary, records, modules, accent }: { summary: Summary; records: Vehiculo[]; modules: ModulationRow[]; accent: string }) {
  const statuses = records.map((record) => getStatus(getProgress(record), record));
  const inRoute = statuses.filter((status) => status === "En ruta").length;
  const completed = statuses.filter((status) => status === "Finalizado").length;
  const pending = statuses.filter((status) => !["En ruta", "Finalizado"].includes(status)).length;
  const incidents = records.filter((record) => getProgress(record) < 50 && getStatus(getProgress(record), record) === "En ruta").length;
  const boxes = normalizeCajasTotal(modules.reduce((sum, row) => sum + Number(row.modulationBoxes || 0), 0));
  const progress = summary.clientes ? (summary.visitados / summary.clientes) * 100 : 0;

  return <article className="flex min-h-0 items-center gap-4 rounded-lg border border-[#1c4b78] bg-gradient-to-br from-[#0a315b] to-[#061d38] p-4 shadow-[inset_0_1px_rgba(255,255,255,.04)] 2xl:gap-6"><div className="shrink-0"><div className="grid h-28 w-28 place-items-center rounded-full p-2.5 2xl:h-32 2xl:w-32" style={{ background: `conic-gradient(from -90deg,${accent} ${progress}%,#174a7a 0)`, boxShadow: `0 0 25px ${accent}22` }}><div className="grid h-full w-full place-items-center rounded-full bg-[#092644] text-center"><strong className="text-3xl font-black tabular-nums 2xl:text-4xl">{inRoute}</strong><span className="text-[8px] font-bold uppercase tracking-widest text-cyan-200">En ruta</span></div></div></div><div className="min-w-0 flex-1"><p className="truncate text-sm font-extrabold 2xl:text-base">{summary.contractor}</p><div className="mt-3 space-y-2 text-[10px] 2xl:text-xs"><ContractorLine color="bg-emerald-400" label="Completadas" value={completed} /><ContractorLine color="bg-amber-400" label="Pendientes" value={pending} /><ContractorLine color="bg-rose-500" label="Incidencias" value={incidents} /></div><div className="mt-3 border-t border-[#20517d] pt-2 text-[9px] text-cyan-100/55 2xl:text-[10px]">{summary.visitados}/{summary.clientes} clientes · {boxes.toLocaleString("es-CO")} moduladas</div></div></article>;
}

function ContractorLine({ color, label, value }: { color: string; label: string; value: number }) {
  return <div className="flex items-center gap-2"><i className={`h-2 w-2 rounded-full ${color}`} /><strong className="w-5 text-right tabular-nums">{value}</strong><span className="text-cyan-100/65">{label}</span></div>;
}

function OperationsScene() {
  return <div className="relative h-full w-full overflow-hidden bg-[linear-gradient(90deg,rgba(6,26,53,0),rgba(5,21,42,.72))]"><div className="absolute bottom-7 right-12 h-24 w-[54%] border border-blue-300/10 bg-[#17395b]/35 [clip-path:polygon(12%_20%,100%_0,100%_100%,0_100%,0_42%)]" /><div className="absolute bottom-7 right-[37%] h-16 w-20 border border-cyan-200/10 bg-[#1b456e]/35" /><Truck className="absolute bottom-8 right-[23%] text-cyan-100/15" size={86} strokeWidth={1} /><div className="absolute bottom-7 left-0 right-0 h-px bg-cyan-200/15" /><div className="absolute inset-0 bg-[radial-gradient(circle_at_60%_48%,rgba(59,130,246,.20),transparent_24%)]" /></div>;
}

function summaryFor(contractor: string, records: Vehiculo[]): Summary {
  return { contractor, rutas: records.length, cajas: normalizeCajasTotal(records.reduce((sum, record) => sum + Number(record.cajas || 0), 0)), clientes: records.reduce((sum, record) => sum + Number(record.clientes || 0), 0), visitados: records.reduce((sum, record) => sum + Number(record.visitados || 0), 0) };
}
function bogotaToday() { const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date()); const values = Object.fromEntries(parts.map((part) => [part.type, part.value])); return `${values.year}-${values.month}-${values.day}`; }
function recordDate(record: Vehiculo) { const raw = record.fechaDespacho || record.fechaDt || record.date || record.createdAt || ""; if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10); const match = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/); if (!match) return ""; return `${match[3].length === 2 ? `20${match[3]}` : match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`; }
function formatBogotaTime(value: string | undefined) { return value ? new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", hour: "2-digit", minute: "2-digit" }).format(new Date(value)) : "—"; }
function formatLongDate(value: string) { return new Intl.DateTimeFormat("es-CO", { weekday: "short", day: "2-digit", month: "short", year: "numeric" }).format(new Date(`${value}T12:00:00`)); }
