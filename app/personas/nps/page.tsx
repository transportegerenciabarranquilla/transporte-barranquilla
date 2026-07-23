"use client";

import { useEffect, useRef, useState } from "react";
import type { ChangeEvent, PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle2, Database, FileSpreadsheet, MapPinned, Navigation, RotateCcw, ShieldCheck, SlidersHorizontal, UploadCloud, X } from "lucide-react";
import type { Map as MapLibreMapInstance, Marker as MapLibreMarker, StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

type SheetSummary = { name: string; columns: string[]; rowCount: number };
type NpsImport = { id: string; fileName: string; fileSize: number; sheetCount: number; rowCount: number; sheets: SheetSummary[]; uploadedAt: string; uploadedBy: string };
const CDS = ["Todos los CD", "CD Galapa", "CD La Arenosa"];

export default function NpsPage() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [imports, setImports] = useState<NpsImport[]>([]);
  const [allowed, setAllowed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [cd, setCd] = useState(CDS[0]);
  const [year, setYear] = useState("2026");
  const [month, setMonth] = useState("Todos");
  const [day, setDay] = useState("Todos");
  const [week, setWeek] = useState("Todas");
  const [management, setManagement] = useState("GC Barranquilla");
  const [chief, setChief] = useState("Todos");

  async function loadImports() {
    const response = await fetch(`/api/people/nps?refresh=${Date.now()}`, { cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "No se pudo consultar el consolidado NPS.");
    setImports(data.imports || []);
  }

  useEffect(() => {
    fetch("/api/session/session", { cache: "no-store" }).then((response) => response.json()).then(async (body) => {
      if (!body?.session?.isPeople && !body?.session?.isAdmin) throw new Error("Este módulo es exclusivo de People.");
      setAllowed(true);
      await loadImports();
    }).catch((caught) => setError(caught instanceof Error ? caught.message : "No se pudo abrir NPS.")).finally(() => setLoading(false));
  }, []);

  async function uploadExcel(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setUploading(true); setError(""); setNotice("");
    try {
      const form = new FormData(); form.append("file", file);
      const response = await fetch("/api/people/nps", { method: "POST", body: form });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "No se pudo cargar el Excel.");
      setNotice(`${file.name} quedó guardado en la base de datos.`);
      await loadImports();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "No se pudo cargar el Excel."); }
    finally { setUploading(false); }
  }

  if (loading) return <main className="min-h-screen bg-[#edf1f4]" />;
  if (!allowed) return <Restricted message={error} onBack={() => router.push("/")} />;

  return (
    <main className="min-h-screen bg-[#edf1f4] text-[#16293a]">
      <header className="border-b border-[#17364d] bg-[#0b2235] text-white shadow-sm"><div className="mx-auto flex max-w-[1560px] items-center justify-between px-5 py-4 sm:px-8"><button aria-label="Volver" className="grid h-10 w-10 place-items-center rounded-lg text-slate-300 transition hover:bg-white/10 hover:text-white" onClick={() => router.push("/")}><ArrowLeft size={20} /></button><div className="text-right"><p className="text-[10px] font-bold uppercase tracking-[.2em] text-[#71b7ba]">People Intelligence</p><h1 className="text-xl font-semibold tracking-tight">NPS Gerencia Barranquilla</h1></div></div></header>

      <section className="mx-auto max-w-[1560px] space-y-4 px-4 py-5 sm:px-8">
        {error ? <Alert tone="error" onClose={() => setError("")}>{error}</Alert> : null}
        {notice ? <Alert tone="success" onClose={() => setNotice("")}>{notice}</Alert> : null}
        <div className="flex items-center justify-between rounded-xl border border-[#c9d9df] bg-[#e9f2f4] px-4 py-3 text-sm text-[#235b66]"><span><strong>Vista demostrativa:</strong> los valores visualizados son datos falsos para revisar el diseño.</span><span className="hidden rounded-md bg-white px-2.5 py-1 text-[9px] font-bold uppercase tracking-[.12em] sm:block">Datos de prueba</span></div>

        <section className="overflow-hidden rounded-xl border border-slate-300 bg-white shadow-sm">
          <div className="flex flex-col gap-5 p-5 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex items-start gap-4"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-[#e5eff2] text-[#235b66]"><Database size={21} /></span><div><p className="text-[10px] font-bold uppercase tracking-[.16em] text-[#527180]">Repositorio central</p><h2 className="mt-1 text-xl font-semibold text-[#0b2235]">Consolidado histórico NPS</h2><p className="mt-1 max-w-2xl text-sm leading-5 text-slate-500">Carga el consolidado de los dos años y las actualizaciones posteriores. Cada hoja, columna y fila se conserva en la base de datos sin aplicar cálculos.</p></div></div>
            <div><input ref={inputRef} className="hidden" type="file" accept=".xlsx,.xls" onChange={uploadExcel} /><button disabled={uploading} onClick={() => inputRef.current?.click()} className="inline-flex h-11 items-center gap-2 rounded-lg bg-[#176b73] px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#115861] disabled:cursor-wait disabled:opacity-60"><UploadCloud size={18} />{uploading ? "Guardando…" : "Subir Excel NPS"}</button></div>
          </div>
          <div className="grid border-t border-slate-200 bg-[#f7f9fa] sm:grid-cols-3"><RepositoryStat label="Archivos almacenados" value={String(imports.length)} /><RepositoryStat label="Filas conservadas" value={imports.length ? imports.reduce((total, item) => total + item.rowCount, 0).toLocaleString("es-CO") : "0"} /><RepositoryStat label="Estado del modelo" value="Sin cálculos" /></div>
        </section>

        <section className="rounded-xl border border-slate-300 bg-white p-4 shadow-sm"><div className="mb-3 flex items-center justify-between"><div className="flex items-center gap-2"><span className="grid h-8 w-8 place-items-center rounded-lg bg-[#e8f2f3] text-[#176b73]"><SlidersHorizontal size={16} /></span><div><h2 className="text-sm font-semibold text-[#0b2235]">Filtros del informe</h2><p className="text-[10px] text-slate-400">Segmenta toda la vista demostrativa</p></div></div><button className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-slate-500 transition hover:bg-slate-100" onClick={() => { setCd(CDS[0]); setYear("2026"); setMonth("Todos"); setDay("Todos"); setWeek("Todas"); setManagement("GC Barranquilla"); setChief("Todos"); }}><RotateCcw size={14} />Limpiar</button></div><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7"><Filter label="CD"><select value={cd} onChange={(event) => setCd(event.target.value)}>{CDS.map((item) => <option key={item}>{item}</option>)}</select></Filter><Filter label="Año"><select value={year} onChange={(event) => setYear(event.target.value)}><option>2026</option><option>2025</option></select></Filter><Filter label="Mes"><select value={month} onChange={(event) => setMonth(event.target.value)}>{["Todos", "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio"].map((item) => <option key={item}>{item}</option>)}</select></Filter><Filter label="Día"><select value={day} onChange={(event) => setDay(event.target.value)}>{["Todos", ...Array.from({ length: 31 }, (_, index) => String(index + 1))].map((item) => <option key={item}>{item}</option>)}</select></Filter><Filter label="Semana"><select value={week} onChange={(event) => setWeek(event.target.value)}>{["Todas", "27", "28", "29", "30"].map((item) => <option key={item}>{item}</option>)}</select></Filter><Filter label="Gerencia"><select value={management} onChange={(event) => setManagement(event.target.value)}>{["GC Barranquilla", "GC Cartagena", "GC Cúcuta", "KA Costa"].map((item) => <option key={item}>{item}</option>)}</select></Filter><Filter label="Jefe comercial"><select value={chief} onChange={(event) => setChief(event.target.value)}>{["Todos", "Juan Hernández", "Renzo Tarazona", "Carlos Padilla", "Diannys Díaz"].map((item) => <option key={item}>{item}</option>)}</select></Filter></div></section>

        <nav className="sticky top-3 z-20 flex gap-1 overflow-x-auto rounded-xl border border-slate-300 bg-white/95 p-1.5 shadow-lg shadow-slate-300/30 backdrop-blur"><NavLink href="#resumen">Resumen</NavLink><NavLink href="#evolucion">Evolución</NavLink><NavLink href="#causas">Causas</NavLink><NavLink href="#segmentacion">Segmentación</NavLink><NavLink href="#detractores">Detractores</NavLink><NavLink href="#datos">Datos</NavLink></nav>

        <SectionHeader id="resumen" index="01" title="Resumen ejecutivo" description="Indicadores principales del periodo seleccionado." />
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">{[{ label: "NPS actual", value: "+77", detail: "+4,2 pts" }, { label: "Promotores", value: "396", detail: "84,4%" }, { label: "Pasivos", value: "36", detail: "7,7%" }, { label: "Detractores", value: "37", detail: "7,9%" }, { label: "Encuestados", value: "469", detail: "+12 este mes" }, { label: "Delivery Experience", value: "8,7", detail: "/ 10" }].map((item) => <MetricPlaceholder key={item.label} {...item} />)}</section>

        <SectionHeader id="evolucion" index="02" title="Evolución del servicio" description="Lectura temporal anual, mensual, semanal y diaria." />
        <section className="grid gap-4 xl:grid-cols-2"><ChartFrame title="NPS por año" eyebrow="Comparativo anual" variant="line" /><ChartFrame title="Delivery Experience por año" eyebrow="Comparativo anual de entrega" variant="line" /></section>
        <section className="grid gap-4 xl:grid-cols-2"><ChartFrame title="NPS por semana" eyebrow="Seguimiento semanal" variant="columns" /><ChartFrame title="NPS por día" eyebrow="Evolución diaria" variant="line" /></section>
        <ChartFrame title="Calificaciones por día" eyebrow="Volumen diario" variant="columns" />

        <SectionHeader id="causas" index="03" title="Causas y factores de impacto" description="Estructura para drivers principales y secundarios de la experiencia." />
        <section className="grid gap-4 xl:grid-cols-2"><ChartFrame title="Primary Driver" eyebrow="Factores principales" variant="bars" /><ChartFrame title="Secondary Delivery" eyebrow="Causas de entrega" variant="waterfall" /></section>
        <ChartFrame title="Secondary Sales Representative Service" eyebrow="Servicio del representante" variant="waterfall" />

        <SectionHeader id="segmentacion" index="04" title="Segmentación comercial y territorial" description="Comparativos por responsables, gerencias, clientes y zonas." />
        <section className="grid gap-4 xl:grid-cols-[1.2fr_.8fr]"><RankedChart title="NPS por jefe comercial" eyebrow="Desempeño comercial" columns={8} /><DonutStructure /></section>
        <RankedChart title="NPS por canal o segmento" eyebrow="Segmentación de clientes" columns={18} />
        <RankedChart title="NPS por COM" eyebrow="Clasificación comercial" columns={24} />
        <section className="grid gap-4 xl:grid-cols-2"><RankedChart title="NPS por zona de transporte" eyebrow="Distribución territorial" columns={14} /><RankedChart title="NPS por población" eyebrow="Distribución geográfica" columns={18} /></section>

        <SectionHeader id="detractores" index="05" title="Gestión de detractores" description="Seguimiento mensual y detalle operativo de clientes a gestionar." />
        <ComboChartStructure />
        <DetractorStructure />
        <InteractiveComMap />

        <SectionHeader id="datos" index="06" title="Gobierno de datos" description="Trazabilidad de los consolidados almacenados en la base de datos." />
        <section className="overflow-hidden rounded-xl border border-slate-300 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4"><div><p className="text-[10px] font-bold uppercase tracking-[.16em] text-[#527180]">Trazabilidad</p><h2 className="mt-1 text-lg font-semibold text-[#0b2235]">Archivos guardados en base de datos</h2></div><span className="rounded-md bg-[#e6f1ef] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[.1em] text-[#176b73]">Persistencia activa</span></div>
          {imports.length ? <div className="overflow-x-auto"><table className="nps-data-table w-full min-w-[850px] text-left"><caption className="sr-only">Archivos NPS guardados en la base de datos</caption><thead className="text-[10px] uppercase tracking-[.1em] text-slate-500"><tr><th className="px-5 py-3" scope="col">Archivo</th><th className="px-5 py-3" scope="col">Hojas</th><th className="px-5 py-3 text-right" scope="col">Filas</th><th className="px-5 py-3 text-right" scope="col">Columnas</th><th className="px-5 py-3" scope="col">Cargado</th><th className="px-5 py-3" scope="col">Estado</th></tr></thead><tbody>{imports.map((item) => <tr key={item.id} className="text-sm"><td className="px-5 py-4"><div className="flex items-center gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#e6f1ef]"><FileSpreadsheet className="text-[#176b73]" size={18} /></span><div><p className="font-semibold text-[#18334a]">{item.fileName}</p><p className="mt-0.5 text-xs text-slate-400">{formatBytes(item.fileSize)}</p></div></div></td><td className="max-w-[260px] px-5 py-4 text-slate-600"><span className="block truncate" title={item.sheets.map((sheet) => sheet.name).join(", ")}>{item.sheets.map((sheet) => sheet.name).join(", ")}</span></td><td className="px-5 py-4 text-right"><span className="rounded-md bg-[#edf3f7] px-2 py-1 font-semibold tabular-nums text-[#28485d]">{item.rowCount.toLocaleString("es-CO")}</span></td><td className="px-5 py-4 text-right font-semibold tabular-nums text-slate-600">{item.sheets.reduce((total, sheet) => total + sheet.columns.length, 0)}</td><td className="px-5 py-4 text-slate-600">{formatDate(item.uploadedAt)}</td><td className="px-5 py-4"><span className="inline-flex items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700"><CheckCircle2 size={14} />Guardado</span></td></tr>)}</tbody></table></div> : <div className="grid min-h-44 place-items-center p-6 text-center"><div><FileSpreadsheet className="mx-auto text-slate-300" size={32} /><p className="mt-3 font-semibold text-slate-600">Aún no hay archivos cargados</p><p className="mt-1 text-sm text-slate-400">El primer Excel aparecerá aquí después de guardarse.</p></div></div>}
        </section>
      </section>
      <style jsx global>{`.nps-filter{display:flex;width:100%;height:44px;align-items:center;gap:8px;border:1px solid #cbd5e1;border-radius:8px;padding-left:10px;color:#64748b;background:#fff;transition:border-color .2s,box-shadow .2s}.nps-filter:focus-within{border-color:#20a39e;box-shadow:0 0 0 3px rgba(32,163,158,.12)}.nps-filter select{min-width:0;flex:1;border:0;background:transparent;padding:8px 20px 8px 2px;font-size:12px;font-weight:600;color:#172b3a;outline:none}.nps-filter span{flex:none;font-size:8px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:#527180}.nps-data-table{border-collapse:separate;border-spacing:0}.nps-data-table thead th{border-bottom:1px solid #cbd9e3;background:linear-gradient(180deg,#f8fafb 0%,#edf3f6 100%);color:#527180;font-weight:800}.nps-data-table tbody tr{background:#fff;transition:background .16s ease,box-shadow .16s ease}.nps-data-table tbody tr:nth-child(even){background:#f8fafb}.nps-data-table tbody tr:hover,.nps-data-table tbody tr:focus-within{background:#eaf4f4;box-shadow:inset 3px 0 0 #176b73}.nps-data-table tbody td{border-bottom:1px solid #e7edf1}.nps-data-table tbody tr:last-child td{border-bottom:0}`}</style>
    </main>
  );
}

function NavLink({ children, href }: { children: ReactNode; href: string }) { return <a className="shrink-0 rounded-lg px-4 py-2 text-xs font-semibold text-slate-500 transition hover:bg-[#e7f1f2] hover:text-[#176b73]" href={href}>{children}</a>; }
function SectionHeader({ description, id, index, title }: { description: string; id: string; index: string; title: string }) { return <div className="scroll-mt-24 pt-4" id={id}><div className="flex items-center gap-4"><span className="grid h-9 w-9 place-items-center rounded-lg bg-[#0b2235] text-xs font-bold text-white">{index}</span><div><h2 className="text-lg font-semibold text-[#0b2235]">{title}</h2><p className="text-xs text-slate-500">{description}</p></div><span className="ml-auto hidden h-px flex-1 bg-gradient-to-r from-slate-300 to-transparent sm:block" /></div></div>; }

function ChartFrame({ eyebrow, title, variant }: { eyebrow: string; title: string; variant: "columns" | "line" | "bars" | "waterfall" }) {
  const values = title.includes("Calificaciones") ? [87, 71, 20, 43, 22, 68, 32] : title.includes("semana") ? [71.2, 82.9, 77.1, 93.8] : title.includes("año") ? [73.2, 77] : [67.8, 77.5, 85, 72.7, 95.5, 83.3, 92.3];
  const labels = title.includes("semana") ? ["S27", "S28", "S29", "S30"] : title.includes("año") ? ["2025", "2026"] : ["1", "2", "3", "4", "5", "6", "7"];
  const drivers = [{ label: "Entrega completa", value: 12.7 }, { label: "Servicio del conductor", value: 9.9 }, { label: "Cumplimiento horario", value: 8.1 }, { label: "Estado del producto", value: 5.7 }];
  const secondary = [{ label: "Entrega fuera de tiempo", value: 46.9 }, { label: "Entrega incompleta", value: 15.6 }, { label: "Producto con novedad", value: 12.5 }, { label: "Atención comercial", value: 9.4 }];
  return <article className="rounded-xl border border-slate-300 bg-white p-5 shadow-sm"><div className="flex items-start justify-between gap-3"><div><p className="text-[9px] font-bold uppercase tracking-[.16em] text-[#527180]">{eyebrow}</p><h2 className="mt-1 text-lg font-semibold text-[#0b2235]">{title}</h2></div><DemoBadge /></div>{variant === "line" ? <CssLineChart title={title} /> : variant === "bars" ? <div className="mt-6 space-y-4">{drivers.map((item) => <HorizontalDatum key={item.label} {...item} />)}</div> : variant === "waterfall" ? <div className="mt-6 grid gap-3 sm:grid-cols-2">{secondary.map((item, index) => <button className="group relative rounded-lg border border-slate-200 bg-[#f8fafb] p-3 text-left transition hover:-translate-y-0.5 hover:border-[#79b7b3] hover:shadow-md focus:outline-none focus:ring-2 focus:ring-[#20a39e]/30" key={item.label} type="button"><div className="flex items-start justify-between gap-3"><p className="text-xs font-medium text-slate-600">{item.label}</p><strong className="text-sm text-[#0b2235]">{item.value}%</strong></div><div className="mt-3 h-1.5 rounded bg-slate-100"><span className={`block h-full rounded transition-all duration-300 group-hover:brightness-110 ${index === 0 ? "bg-[#d6973e]" : "bg-[#386f8f]"}`} style={{ width: `${Math.min(100, item.value * 2)}%` }} /></div><HoverTip>{item.label}: {item.value}%</HoverTip></button>)}</div> : <div className="mt-6 flex h-48 items-end gap-3 border-b border-l border-slate-300 px-4 pt-5">{values.map((value, index) => <button className="group relative flex h-full min-w-0 flex-1 flex-col items-center justify-end focus:outline-none" key={index} type="button"><span className="mb-2 text-[10px] font-bold tabular-nums text-[#28485d]">{value}{title.includes("Calificaciones") ? "" : "%"}</span><span className={`w-full max-w-12 origin-bottom rounded-t transition duration-300 group-hover:scale-x-110 group-hover:brightness-110 ${["bg-[#386f8f]", "bg-[#2a9d8f]", "bg-[#e0a23b]", "bg-[#e76f51]"][index % 4]}`} style={{ height: `${Math.max(8, Math.min(100, value))}%` }} /><span className="mt-2 text-[9px] font-semibold text-slate-400">{labels[index] || index + 1}</span><HoverTip>{labels[index] || index + 1}: {value}{title.includes("Calificaciones") ? " respuestas" : "%"}</HoverTip></button>)}</div>}</article>;
}

function CssLineChart({ title }: { title: string }) {
  const annual = title.includes("año");
  const daily = title.includes("día");
  const deliveryAnnual = annual && title.includes("Delivery Experience");
  const labels = annual ? ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"] : daily ? ["1", "4", "7", "10", "13", "16", "20"] : ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul"];
  const primary = deliveryAnnual
    ? [12.7, 14.1, 13.8, 15.7, 21, 17.3, 12.9]
    : annual
      ? [62.3, 66.2, 78.8, 75.1, 78, 73.3, 76.5, 80, 82, 80.5, 74.1, 69]
      : daily
        ? [67.8, 50, 95.5, 75, 50, 62.5, 92.3]
        : [12.7, 14.1, 13.8, 15.7, 21, 17.3, 12.9];
  const secondary = deliveryAnnual
    ? [11.4, 12.8, 13.1, 14.6, 16.8, 16.1, 15.3, 17.2, 17.6, 18.4, 19.2, 20]
    : annual
      ? [52.6, 67.6, 68, 73.9, 77.9, 70.9, 67.8, 80.1, 81.9, 80.5, 74.1, 69]
      : [];
  const datasets = [{ label: annual ? "2026" : "Resultado", color: "#139a92", fill: "rgba(19,154,146,.12)", values: primary }, ...(secondary.length ? [{ label: "2025", color: "#e39b32", fill: "transparent", values: secondary }] : [])];
  return <div className="mt-5"><div className="mb-2 flex items-center gap-4 text-[9px] font-semibold text-slate-500">{datasets.map((dataset) => <span className="flex items-center gap-1.5" key={dataset.label}><i className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: dataset.color }} />{dataset.label}</span>)}</div><CanvasLineChart datasets={datasets} labels={labels} title={title} /></div>;
}

function CanvasLineChart({ datasets, labels, title }: { datasets: Array<{ label: string; color: string; fill: string; values: number[] }>; labels: string[]; title: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  type ActivePoint = { datasetIndex: number; index: number; label: string; period: string; value: number; color: string; x: number; y: number; left: number };
  const geometryRef = useRef<ActivePoint[]>([]);
  const [hovered, setHovered] = useState<ActivePoint | null>(null);
  const [pinned, setPinned] = useState<ActivePoint | null>(null);
  const active = hovered || pinned;
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const draw = () => {
      const width = Math.max(320, Math.floor(canvas.getBoundingClientRect().width)); const height = 270; const ratio = window.devicePixelRatio || 1;
      canvas.width = width * ratio; canvas.height = height * ratio; canvas.style.height = `${height}px`;
      const context = canvas.getContext("2d"); if (!context) return; context.setTransform(ratio, 0, 0, ratio, 0, 0); context.clearRect(0, 0, width, height);
      const padding = { left: 43, right: 18, top: 30, bottom: 34 }; const chartWidth = width - padding.left - padding.right; const chartHeight = height - padding.top - padding.bottom;
      const allValues = datasets.flatMap((dataset) => dataset.values); const minimum = Math.floor((Math.min(...allValues) - 6) / 5) * 5; const maximum = Math.ceil((Math.max(...allValues) + 6) / 5) * 5; const range = maximum - minimum || 1;
      context.font = "10px ui-sans-serif, system-ui"; context.textBaseline = "middle"; context.strokeStyle = "#dce5ea"; context.fillStyle = "#7890a0"; context.lineWidth = 1;
      for (let step = 0; step <= 4; step += 1) { const y = padding.top + (chartHeight / 4) * step; const value = maximum - (range / 4) * step; context.beginPath(); context.moveTo(padding.left, y); context.lineTo(width - padding.right, y); context.stroke(); context.textAlign = "right"; context.fillText(`${Math.round(value)}%`, padding.left - 8, y); }
      labels.forEach((label, index) => { const x = padding.left + (chartWidth / Math.max(1, labels.length - 1)) * index; context.textAlign = index === 0 ? "left" : index === labels.length - 1 ? "right" : "center"; context.fillStyle = "#7890a0"; context.fillText(label, x, height - 12); });
      const trace = (points: Array<{ x: number; y: number }>) => { context.moveTo(points[0].x, points[0].y); for (let index = 0; index < points.length - 1; index += 1) { const current = points[index]; const next = points[index + 1]; const middle = (current.x + next.x) / 2; context.bezierCurveTo(middle, current.y, middle, next.y, next.x, next.y); } };
      const geometry: ActivePoint[] = [];
      datasets.forEach((dataset, datasetIndex) => {
        const points = dataset.values.map((value, index) => ({ x: padding.left + (chartWidth / Math.max(1, labels.length - 1)) * index, y: padding.top + chartHeight - ((value - minimum) / range) * chartHeight, value }));
        if (datasetIndex === 0) { const gradient = context.createLinearGradient(0, padding.top, 0, padding.top + chartHeight); gradient.addColorStop(0, dataset.fill); gradient.addColorStop(1, "rgba(19,154,146,0)"); context.beginPath(); trace(points); context.lineTo(points[points.length - 1].x, padding.top + chartHeight); context.lineTo(points[0].x, padding.top + chartHeight); context.closePath(); context.fillStyle = gradient; context.fill(); }
        context.beginPath(); trace(points); context.strokeStyle = dataset.color; context.lineWidth = datasetIndex === 0 ? 3 : 2.5; context.lineCap = "round"; context.lineJoin = "round"; context.stroke();
        points.forEach((point, index) => { const isActive = active?.datasetIndex === datasetIndex && active.index === index; if (isActive) { context.beginPath(); context.arc(point.x, point.y, 10, 0, Math.PI * 2); context.fillStyle = `${dataset.color}28`; context.fill(); } context.beginPath(); context.arc(point.x, point.y, isActive ? 6 : 4.5, 0, Math.PI * 2); context.fillStyle = isActive ? dataset.color : "#ffffff"; context.fill(); context.lineWidth = 2.5; context.strokeStyle = dataset.color; context.stroke(); if (!active && (datasets.length === 1 || index % 2 === datasetIndex)) { context.font = "bold 9px ui-sans-serif, system-ui"; context.textAlign = "center"; context.fillStyle = dataset.color; context.fillText(`${point.value}%`, point.x, point.y + (datasetIndex === 0 ? -13 : 14)); } geometry.push({ datasetIndex, index, label: dataset.label, period: labels[index] || String(index + 1), value: point.value, color: dataset.color, x: point.x, y: point.y, left: (point.x / width) * 100 }); });
      });
      geometryRef.current = geometry;
    };
    draw(); const observer = new ResizeObserver(draw); observer.observe(canvas); return () => observer.disconnect();
  }, [active, datasets, labels]);
  const nearestPoint = (event: ReactPointerEvent<HTMLCanvasElement>) => { const rect = event.currentTarget.getBoundingClientRect(); const x = event.clientX - rect.left; const y = event.clientY - rect.top; return geometryRef.current.map((point) => ({ point, distance: Math.hypot(point.x - x, point.y - y) })).sort((a, b) => a.distance - b.distance)[0]; };
  const handleMove = (event: ReactPointerEvent<HTMLCanvasElement>) => { const nearest = nearestPoint(event); const next = nearest && nearest.distance <= 22 ? nearest.point : null; setHovered((current) => current?.datasetIndex === next?.datasetIndex && current?.index === next?.index ? current : next); event.currentTarget.style.cursor = next ? "pointer" : "crosshair"; };
  const handleClick = (event: ReactPointerEvent<HTMLCanvasElement>) => { const nearest = nearestPoint(event); if (!nearest || nearest.distance > 22) return; setPinned((current) => current?.datasetIndex === nearest.point.datasetIndex && current.index === nearest.point.index ? null : nearest.point); };
  return <div className="relative"><canvas aria-label={`Gráfica de líneas interactiva: ${title}`} className="block h-[270px] w-full touch-none" onClick={handleClick} onPointerLeave={() => setHovered(null)} onPointerMove={handleMove} ref={canvasRef} role="img" />{active ? <div className="pointer-events-none absolute z-20 min-w-32 -translate-x-1/2 -translate-y-full rounded-lg border border-slate-700 bg-[#0b2235] px-3 py-2 text-white shadow-xl" style={{ left: `${active.left}%`, top: `${Math.max(58, active.y - 8)}px` }}><p className="text-[8px] font-bold uppercase tracking-[.12em] text-slate-400">{active.period} · {active.label}</p><p className="mt-1 text-lg font-semibold">{active.value}%</p><p className="text-[8px] text-slate-400">{pinned ? "Punto seleccionado" : "Haz clic para fijar"}</p></div> : null}</div>;
}

function RankedChart({ columns, eyebrow, title }: { columns: number; eyebrow: string; title: string }) {
  const values = Array.from({ length: columns }, (_, index) => Math.max(38, 96 - index * (58 / Math.max(1, columns - 1))));
  const names = title.includes("jefe") ? ["D. Díaz", "C. Padilla", "R. Tarazona", "A. Heladio", "J. Hernández", "J. Cotrino", "G. Biava", "E. Galindo"] : title.includes("zona") ? ["08A108", "08A204", "08A801", "08B101", "08A703", "08A715", "08A701", "08A711", "08A716", "08A714", "08A713", "08A712", "08A201", "08A107"] : title.includes("población") ? ["Malambo", "Soledad", "Galapa", "Baranoa", "Sabanagrande", "Puerto Col.", "Tubará", "Usiacurí"] : [];
  return <article className="rounded-xl border border-slate-300 bg-white p-5 shadow-sm"><div className="flex items-start justify-between gap-3"><div><p className="text-[9px] font-bold uppercase tracking-[.16em] text-[#527180]">{eyebrow}</p><h2 className="mt-1 text-lg font-semibold text-[#0b2235]">{title}</h2></div><DemoBadge /></div><div className="mt-6 overflow-x-auto pb-2"><div className="flex h-52 min-w-[680px] items-end gap-2 border-b border-l border-slate-300 px-3">{values.map((value, index) => { const name = names[index] || `Grupo ${index + 1}`; return <button className="group relative flex h-full min-w-6 flex-1 flex-col items-center justify-end focus:outline-none" key={index} type="button"><span className="mb-1 text-[8px] font-bold text-[#28485d]">{value.toFixed(0)}%</span><span className="w-full origin-bottom rounded-t transition duration-300 group-hover:scale-x-110 group-hover:saturate-125" style={{ background: performanceGradient(value), height: `${value}%` }} /><span className="mt-2 max-w-16 truncate text-[8px] font-semibold text-slate-500">{name}</span><HoverTip>{name}: {value.toFixed(1)}%</HoverTip></button>; })}</div></div></article>;
}

function performanceGradient(value: number) {
  if (value >= 75) return "linear-gradient(180deg, #34d399 0%, #10b981 48%, #059669 100%)";
  if (value >= 60) return "linear-gradient(180deg, #fde047 0%, #facc15 48%, #eab308 100%)";
  return "linear-gradient(180deg, #ff7b7b 0%, #f05252 48%, #dc2626 100%)";
}

function DonutStructure() {
  const colors = ["bg-[#315b7d]", "bg-[#176b73]", "bg-[#b58a35]", "bg-[#744f73]"];
  return (
    <article className="rounded-xl border border-slate-300 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3"><div><p className="text-[9px] font-bold uppercase tracking-[.16em] text-[#527180]">Comparativo organizacional</p><h2 className="mt-1 text-lg font-semibold text-[#0b2235]">NPS por gerencia</h2></div><DemoBadge /></div>
      <div className="mt-5 grid min-h-60 place-items-center gap-6 rounded-lg border border-slate-200 bg-[#fafbfc] p-6 sm:grid-cols-[1fr_.85fr]">
        <div className="grid h-40 w-40 place-items-center rounded-full" style={{ background: "conic-gradient(#315b7d 0 28%, #176b73 28% 53%, #b58a35 53% 76%, #744f73 76% 100%)" }}><div className="grid h-24 w-24 place-items-center rounded-full bg-white text-center"><span><strong className="text-2xl text-[#0b2235]">+77</strong><small className="block text-[9px] font-bold uppercase text-slate-400">NPS global</small></span></div></div>
        <div className="w-full space-y-2">{[{ label: "GC Barranquilla", value: "77,1%" }, { label: "GC Cartagena", value: "74,8%" }, { label: "GC Cúcuta", value: "81,3%" }, { label: "KA Costa", value: "79,6%" }].map((item, index) => <button className="group relative flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left transition hover:bg-white hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-[#20a39e]/30" key={item.label} type="button"><span className={`h-2.5 w-2.5 rounded-full transition group-hover:scale-150 ${colors[index]}`} /><span className="text-xs font-medium text-slate-600">{item.label}</span><strong className="ml-auto text-xs text-[#0b2235]">{item.value}</strong><HoverTip>{item.label}: NPS {item.value}</HoverTip></button>)}</div>
      </div>
    </article>
  );
}

function ComboChartStructure() {
  const totals: Array<number | null> = [82, 61, 29, 46, 29, 46, 37, null, null, null, null, null];
  const nps: Array<number | null> = [62.3, 67.6, 78.8, 73.9, 77.9, 70.9, 76.5, null, null, null, null, null];
  const months = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
  return <article className="rounded-xl border border-slate-300 bg-white p-5 shadow-sm"><div className="flex items-start justify-between gap-3"><div><p className="text-[9px] font-bold uppercase tracking-[.16em] text-[#527180]">Seguimiento de alertas</p><h2 className="mt-1 text-lg font-semibold text-[#0b2235]">Detractores por mes</h2></div><DemoBadge /></div><div className="mt-6 overflow-x-auto pb-2"><div className="flex h-60 min-w-[1080px] items-end gap-3 border-b border-l border-slate-300 px-4">{totals.map((total, index) => { const month = months[index]; const isFuture = total === null; return <button className={`group relative flex h-full min-w-0 flex-1 flex-col items-center justify-end rounded-t focus:outline-none ${isFuture ? "opacity-75" : ""}`} key={month} type="button"><span className={`mb-1 text-[9px] font-bold ${isFuture ? "text-slate-400" : "text-[#0b2235]"}`}>{isFuture ? "Sin datos" : total}</span><span className={`mb-1 text-[8px] font-semibold ${isFuture ? "text-slate-300" : "text-[#087f78]"}`}>{isFuture ? "Periodo futuro" : `NPS ${nps[index]}%`}</span><span className={`w-full max-w-14 origin-bottom rounded-t transition duration-300 group-hover:scale-x-110 group-hover:saturate-125 ${isFuture ? "border-2 border-dashed border-blue-300 bg-blue-50" : ""}`} style={{ background: isFuture ? undefined : detractorGradient(total), height: isFuture ? "18%" : `${total}%` }} /><span className={`mt-2 text-[9px] font-bold ${isFuture ? "text-slate-400" : "text-slate-600"}`}>{month}</span><HoverTip>{isFuture ? `${month}: periodo futuro sin datos` : `${month}: ${total} detractores · NPS ${nps[index]}%`}</HoverTip></button>; })}</div></div></article>;
}

type ComMapPoint = {
  com: string;
  customers: number;
  latitude: number;
  longitude: number;
  nps: number;
  zone: string;
};

const COM_MAP_POINTS: ComMapPoint[] = [
  { com: "COM5O3", customers: 8, latitude: 10.9878, longitude: -74.7889, nps: 55.6, zone: "Norte Centro Histórico" },
  { com: "COM5O7", customers: 8, latitude: 11.0137, longitude: -74.8278, nps: 100, zone: "Riomar" },
  { com: "COM5P0", customers: 15, latitude: 10.9574, longitude: -74.7911, nps: 66.7, zone: "Centro" },
  { com: "COM5P1", customers: 11, latitude: 10.9412, longitude: -74.7704, nps: 45.5, zone: "Suroriente" },
  { com: "COM5S3", customers: 7, latitude: 10.9236, longitude: -74.7915, nps: 71.4, zone: "Metropolitana" },
  { com: "COM5S4", customers: 6, latitude: 10.9048, longitude: -74.8032, nps: 100, zone: "Soledad norte" },
  { com: "COM5S5", customers: 7, latitude: 10.8856, longitude: -74.7828, nps: 71.4, zone: "Soledad centro" },
  { com: "COM5S6", customers: 11, latitude: 10.8679, longitude: -74.7775, nps: 100, zone: "Soledad sur" },
  { com: "COM5W0", customers: 1, latitude: 10.9932, longitude: -74.8426, nps: 100, zone: "Corredor portuario" },
  { com: "COM5X0", customers: 1, latitude: 10.9701, longitude: -74.8146, nps: 100, zone: "Barranquillita" },
  { com: "COM5Y2", customers: 10, latitude: 10.8351, longitude: -74.7551, nps: 90, zone: "Malambo" },
  { com: "COM5Y9", customers: 10, latitude: 10.8933, longitude: -74.8571, nps: 100, zone: "Galapa" },
  { com: "COM5Z4", customers: 14, latitude: 10.9823, longitude: -74.7515, nps: 78.6, zone: "Las Nieves" },
  { com: "COM5Z5", customers: 10, latitude: 11.0245, longitude: -74.8108, nps: 100, zone: "Villa Santos" },
  { com: "COM694", customers: 8, latitude: 10.7486, longitude: -74.7542, nps: 75, zone: "Sabanagrande" },
  { com: "COM697", customers: 6, latitude: 10.7894, longitude: -74.7608, nps: 83.3, zone: "Palmar de Varela" },
  { com: "COM6EY", customers: 1, latitude: 10.9784, longitude: -74.8037, nps: 100, zone: "El Prado" },
];

const FALLBACK_MAP_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    openStreetMap: {
      type: "raster",
      attribution: "© OpenStreetMap contributors",
      tileSize: 256,
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
    },
  },
  layers: [{ id: "open-street-map", type: "raster", source: "openStreetMap" }],
};

function InteractiveComMap() {
  const [selected, setSelected] = useState<ComMapPoint>(COM_MAP_POINTS[0]);

  function selectPoint(point: ComMapPoint) {
    setSelected(point);
  }

  return (
    <article className="overflow-hidden rounded-xl border border-slate-300 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[9px] font-bold uppercase tracking-[.16em] text-[#527180]">Distribución geográfica</p>
          <h2 className="mt-1 text-lg font-semibold text-[#0b2235]">Clientes detractores y encuestas por COM</h2>
          <p className="mt-1 text-xs text-slate-500">Selecciona una fila para centrar el mapa. Las coordenadas actuales son demostrativas y se reemplazarán por las reales.</p>
        </div>
        <DemoBadge />
      </div>

      <div className="grid min-h-[560px] xl:grid-cols-[minmax(0,1fr)_390px]">
        <div className="relative min-h-[420px] overflow-hidden bg-[#dcecf3]">
          <ComMap point={selected} />
          <div className="pointer-events-none absolute left-4 top-4 max-w-[calc(100%-2rem)] rounded-xl border border-white/70 bg-white/95 px-4 py-3 shadow-lg backdrop-blur">
            <div className="flex items-start gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#176b73] text-white"><MapPinned size={18} /></span>
              <div>
                <p className="text-[9px] font-bold uppercase tracking-[.12em] text-[#b36b16]">Coordenadas demo · No reales</p>
                <p className="mt-0.5 font-semibold text-[#0b2235]">{selected.com} · {selected.zone}</p>
                <p className="mt-1 font-mono text-[10px] text-slate-500">{selected.latitude.toFixed(5)}, {selected.longitude.toFixed(5)}</p>
              </div>
            </div>
          </div>
          <a
            className="absolute bottom-4 left-4 inline-flex items-center gap-1.5 rounded-lg border border-white/70 bg-white/95 px-3 py-2 text-[10px] font-semibold text-[#176b73] shadow-md backdrop-blur transition hover:bg-white"
            href={`https://www.openstreetmap.org/?mlat=${selected.latitude}&mlon=${selected.longitude}#map=15/${selected.latitude}/${selected.longitude}`}
            rel="noreferrer"
            target="_blank"
          >
            <Navigation size={13} />
            Abrir mapa
          </a>
        </div>

        <div className="flex min-h-0 flex-col border-t border-slate-200 xl:border-l xl:border-t-0">
          <div className="bg-gradient-to-r from-[#0b2235] to-[#176b73] px-4 py-3.5 text-white">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[8px] font-bold uppercase tracking-[.16em] text-white/60">Detalle territorial</p>
                <h3 className="mt-0.5 font-semibold">Encuestas por COM</h3>
              </div>
              <span className="rounded-lg border border-white/20 bg-white/10 px-2.5 py-1 text-[10px] font-semibold backdrop-blur">
                {COM_MAP_POINTS.length} zonas
              </span>
            </div>
          </div>
          <div className="grid grid-cols-[minmax(0,1fr)_78px_88px] border-b border-slate-200 bg-[#edf2f5] px-3 py-2.5 text-[9px] font-bold uppercase tracking-[.1em] text-slate-500">
            <span>Zona / COM</span><span className="text-center">Clientes</span><span className="text-right">NPS</span>
          </div>
          <div className="max-h-[470px] flex-1 overflow-y-auto bg-[#f8fafb]">
            {COM_MAP_POINTS.map((point) => {
              const active = selected.com === point.com;
              const npsTone = point.nps >= 80
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : point.nps >= 60
                  ? "border-amber-200 bg-amber-50 text-amber-700"
                  : "border-red-200 bg-red-50 text-red-700";
              return (
                <button
                  aria-pressed={active}
                  className={`group grid w-full grid-cols-[minmax(0,1fr)_78px_88px] items-center border-b px-3 py-2.5 text-left text-xs transition ${
                    active
                      ? "border-[#9dcfc8] bg-[#dcefed] shadow-[inset_4px_0_0_#176b73]"
                      : "border-slate-100 bg-white hover:bg-[#eef7f6]"
                  }`}
                  key={point.com}
                  onClick={() => selectPoint(point)}
                  type="button"
                >
                  <span className="min-w-0">
                    <span className="flex items-center gap-1.5">
                      <i className={`h-2 w-2 shrink-0 rounded-full ${active ? "bg-[#176b73] ring-4 ring-[#176b73]/15" : "bg-slate-300 group-hover:bg-[#3e9b92]"}`} />
                      <strong className="truncate text-[#0b2235]">{point.com}</strong>
                      {active ? <small className="rounded bg-[#176b73] px-1.5 py-0.5 text-[7px] font-bold uppercase tracking-[.08em] text-white">En mapa</small> : null}
                    </span>
                    <small className="ml-3.5 mt-0.5 block truncate text-[9px] text-slate-400">{point.zone}</small>
                  </span>
                  <span className="justify-self-center rounded-md border border-slate-200 bg-white px-2 py-1 font-bold tabular-nums text-slate-600 shadow-sm">
                    {point.customers}
                  </span>
                  <span className={`justify-self-end rounded-md border px-2 py-1 font-bold tabular-nums ${npsTone}`}>
                    {point.nps.toLocaleString("es-CO")}%
                  </span>
                </button>
              );
            })}
          </div>
          <div className="border-t border-slate-300 bg-white px-3 py-3">
            <div className="grid grid-cols-[minmax(0,1fr)_78px_88px] items-center text-xs font-bold text-[#0b2235]">
              <span><small className="block text-[8px] uppercase tracking-[.12em] text-slate-400">Consolidado</small>Total general</span>
              <span className="text-center tabular-nums">431</span>
              <span className="justify-self-end rounded-md bg-[#e6f1ef] px-2 py-1 tabular-nums text-[#176b73]">77,2%</span>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}

function ComMap({ point }: { point: ComMapPoint }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMapInstance | null>(null);
  const markerRef = useRef<MapLibreMarker | null>(null);
  const pointRef = useRef(point);
  const [ready, setReady] = useState(false);
  const [mapError, setMapError] = useState("");

  useEffect(() => {
    pointRef.current = point;
  }, [point]);

  useEffect(() => {
    let cancelled = false;
    let loadTimer: ReturnType<typeof setTimeout> | undefined;
    let resizeTimer: ReturnType<typeof setTimeout> | undefined;
    let resizeFrame: number | undefined;
    let resizeObserver: ResizeObserver | undefined;

    async function initializeMap() {
      try {
        const { AttributionControl, Map, Marker, NavigationControl } = await import("maplibre-gl");
        if (cancelled || !containerRef.current) return;

        const initialPoint = pointRef.current;
        const map = new Map({
          attributionControl: false,
          center: [initialPoint.longitude, initialPoint.latitude],
          container: containerRef.current,
          pitch: 25,
          style: "https://tiles.openfreemap.org/styles/bright",
          zoom: 12.4,
        });
        const marker = new Marker({ color: "#176b73", scale: 1.15 })
          .setLngLat([initialPoint.longitude, initialPoint.latitude])
          .addTo(map);
        let fallbackApplied = false;
        let loaded = false;

        const applyFallbackStyle = () => {
          if (fallbackApplied || loaded || cancelled) return;
          fallbackApplied = true;
          map.setStyle(FALLBACK_MAP_STYLE);
          if (loadTimer) clearTimeout(loadTimer);
          loadTimer = setTimeout(() => {
            if (!cancelled && !loaded) setMapError("No se pudo cargar el mapa base. Revisa la conexión a internet.");
          }, 12000);
        };

        map.addControl(new NavigationControl({ showCompass: false, visualizePitch: true }), "bottom-right");
        map.addControl(new AttributionControl({ compact: true }), "bottom-left");
        map.once("load", () => {
          loaded = true;
          if (!cancelled) {
            map.resize();
            setMapError("");
            setReady(true);
          }
        });
        map.on("error", () => {
          if (cancelled || loaded) return;
          applyFallbackStyle();
        });
        loadTimer = setTimeout(() => {
          applyFallbackStyle();
        }, 7000);

        mapRef.current = map;
        markerRef.current = marker;
        const resizeMap = () => {
          if (resizeFrame) cancelAnimationFrame(resizeFrame);
          resizeFrame = requestAnimationFrame(() => map.resize());
        };
        resizeObserver = new ResizeObserver(resizeMap);
        resizeObserver.observe(containerRef.current);
        resizeMap();
        resizeTimer = setTimeout(resizeMap, 150);
      } catch {
        if (!cancelled) setMapError("No se pudo iniciar el mapa interactivo.");
      }
    }

    void initializeMap();

    return () => {
      cancelled = true;
      if (loadTimer) clearTimeout(loadTimer);
      if (resizeTimer) clearTimeout(resizeTimer);
      if (resizeFrame) cancelAnimationFrame(resizeFrame);
      resizeObserver?.disconnect();
      markerRef.current?.remove();
      mapRef.current?.remove();
      markerRef.current = null;
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const marker = markerRef.current;
    if (!map || !marker) return;

    marker.setLngLat([point.longitude, point.latitude]);
    map.flyTo({
      center: [point.longitude, point.latitude],
      duration: 1150,
      essential: true,
      pitch: 25,
      zoom: 13.2,
    });
  }, [point]);

  return (
    <>
      <div
        aria-label={`Mapa interactivo de ${point.com}, ${point.zone}`}
        className="absolute inset-0 h-full min-h-[420px] w-full"
        ref={containerRef}
        role="img"
      />
      {!ready && !mapError ? (
        <div className="pointer-events-none absolute inset-0 grid place-items-center bg-[#dcecf3]">
          <span className="rounded-lg bg-white/90 px-4 py-2 text-xs font-semibold text-[#176b73] shadow-md">Cargando mapa a color...</span>
        </div>
      ) : null}
      {mapError ? (
        <div className="absolute inset-0 grid place-items-center bg-[#eaf1f4] p-6 text-center">
          <div><MapPinned className="mx-auto text-slate-400" size={30} /><p className="mt-3 text-sm font-semibold text-slate-600">{mapError}</p></div>
        </div>
      ) : null}
    </>
  );
}

function detractorGradient(total: number) {
  if (total > 60) return "linear-gradient(180deg, #ff7b7b 0%, #f05252 48%, #dc2626 100%)";
  if (total > 40) return "linear-gradient(180deg, #fde047 0%, #facc15 48%, #eab308 100%)";
  return "linear-gradient(180deg, #34d399 0%, #10b981 48%, #059669 100%)";
}

function DetractorStructure() {
  const strata = [100, 40, 100, 73, 75.6, 78.6];
  return <section className="grid gap-4 xl:grid-cols-[1.28fr_.62fr_.9fr]"><TableStructure title="Clientes detractores" columns={["Año", "Mes", "Día", "ID cliente", "Cliente", "Score"]} /><TableStructure title="Clientes detractores por COM" columns={["COM", "Recuento"]} /><article className="rounded-xl border border-slate-300 bg-white p-5 shadow-sm"><div className="flex items-start justify-between gap-3"><div><p className="text-[9px] font-bold uppercase tracking-[.16em] text-[#527180]">Segmentación territorial</p><h2 className="mt-1 text-lg font-semibold text-[#0b2235]">NPS por estrato de zona de negocio</h2></div><DemoBadge /></div><div className="mt-5 space-y-4 rounded-lg border border-slate-200 bg-[#fafbfc] p-5">{strata.map((value, index) => <button className="group relative block w-full rounded-md p-1 text-left transition hover:bg-white focus:outline-none focus:ring-2 focus:ring-[#20a39e]/30" key={index} type="button"><div className="mb-1.5 flex items-center justify-between text-[10px] font-semibold text-slate-500"><span>Estrato {6 - index}</span><span>{value}%</span></div><span className="block h-3 rounded bg-slate-100"><i className={`block h-3 rounded-r transition duration-300 group-hover:brightness-110 ${value >= 80 ? "bg-[#258578]" : value >= 70 ? "bg-[#c49a3a]" : "bg-[#b64a43]"}`} style={{ width: `${value}%` }} /></span><HoverTip>Estrato {6 - index}: NPS {value}%</HoverTip></button>)}</div></article></section>;
}

function TableStructure({ columns, title }: { columns: string[]; title: string }) {
  const customerRows = [["2026", "Jul", "1", "14160901", "Donde Ludys", "0"], ["2026", "Jul", "1", "14431501", "Estanco y Eta 2", "0"], ["2026", "Jul", "2", "14401442", "Auto Lavado LA 44", "1"], ["2026", "Jul", "6", "10360540", "Granero López", "1"], ["2026", "Jul", "15", "12121397", "Kiosko Bella Vista", "2"], ["2026", "Jul", "16", "13180165", "Punto Frío La 7", "2"]];
  const comRows = [["COM5P1", "4"], ["COM104", "3"], ["COM5L2", "2"], ["COM5M9", "2"], ["COM5N7", "2"], ["COM192", "1"]];
  const rows = title.includes("por COM") ? comRows : customerRows;
  const isComTable = title.includes("por COM");

  return (
    <article className="overflow-hidden rounded-xl border border-slate-300 bg-white shadow-sm">
      <div className="flex items-start justify-between border-b border-slate-200 px-4 py-3">
        <div>
          <p className="text-[8px] font-bold uppercase tracking-[.16em] text-[#527180]">Detalle operativo</p>
          <h2 className="mt-0.5 text-base font-semibold text-[#0b2235]">{title}</h2>
          <p className="mt-0.5 text-[9px] text-slate-400">{rows.length} registros demostrativos</p>
        </div>
        <DemoBadge />
      </div>
      <div className="overflow-x-auto">
        <table className={`nps-data-table table-fixed w-full text-left ${isComTable ? "min-w-0" : "min-w-[560px]"}`}>
          <caption className="sr-only">{title}</caption>
          <thead className="text-[8px] uppercase tracking-[.07em] text-slate-500">
            <tr>{columns.map((column, index) => <th className={`px-2.5 py-2 ${index === columns.length - 1 ? "text-right" : ""} ${!isComTable && index === 4 ? "w-[30%]" : ""}`} key={column} scope="col">{column}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr className="cursor-pointer" key={rowIndex} tabIndex={0}>
                {row.map((value, index) => {
                  const isLast = index === row.length - 1;
                  const isName = !isComTable && index === row.length - 2;
                  const isPrimary = isComTable && index === 0;
                  return (
                    <td className={`truncate px-2.5 py-2 text-[11px] ${isLast ? "text-right" : ""}`} key={index} title={value}>
                      {isLast ? (
                        <span className="inline-flex min-w-7 justify-center rounded-md border border-red-200 bg-red-50 px-1.5 py-0.5 font-bold tabular-nums text-[#b64a43]">{value}</span>
                      ) : (
                        <span className={`${isName || isPrimary ? "font-semibold text-[#18334a]" : "text-slate-600"} ${index === 3 ? "font-mono text-[10px]" : ""}`}>{value}</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </article>
  );
}

function MetricPlaceholder({ detail, label, value }: { detail: string; label: string; value: string }) { return <article className="relative overflow-hidden rounded-xl border border-slate-300 bg-white p-4 shadow-sm"><span className="absolute inset-y-0 left-0 w-1 bg-[#176b73]" /><p className="text-3xl font-semibold text-[#0b2235]">{value}</p><div className="mt-2 flex items-end justify-between gap-2"><p className="text-[9px] font-bold uppercase tracking-[.12em] text-slate-500">{label}</p><p className="text-[10px] font-semibold text-[#258578]">{detail}</p></div></article>; }
function DemoBadge() { return <span className="rounded-md bg-[#e8f2f3] px-2.5 py-1 text-[9px] font-bold uppercase tracking-[.08em] text-[#176b73]">Demo</span>; }
function HorizontalDatum({ label, value }: { label: string; value: number }) { return <button className="group relative block w-full rounded-lg p-1.5 text-left transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-[#20a39e]/30" type="button"><div className="mb-1.5 flex justify-between text-xs"><span className="font-medium text-slate-600">{label}</span><strong className="text-[#0b2235]">{value}%</strong></div><div className="h-2 rounded bg-slate-100"><span className="block h-2 rounded bg-[#315b7d] transition duration-300 group-hover:brightness-125" style={{ width: `${value * 6}%` }} /></div><HoverTip>{label}: impacto de {value}%</HoverTip></button>; }
function HoverTip({ children }: { children: ReactNode }) { return <span className="pointer-events-none absolute left-1/2 top-0 z-30 hidden min-w-max -translate-x-1/2 -translate-y-[110%] rounded-md bg-[#0b2235] px-2.5 py-1.5 text-[9px] font-semibold text-white shadow-xl group-hover:block group-focus-visible:block">{children}</span>; }
function RepositoryStat({ label, value }: { label: string; value: string }) { return <div className="border-b border-slate-200 px-5 py-3 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0"><p className="text-lg font-semibold tabular-nums text-[#0b2235]">{value}</p><p className="text-[9px] font-bold uppercase tracking-[.12em] text-slate-400">{label}</p></div>; }
function Filter({ children, label }: { children: ReactNode; label: string }) { return <label className="nps-filter"><span>{label}</span>{children}</label>; }
function Alert({ children, onClose, tone }: { children: ReactNode; onClose: () => void; tone: "error" | "success" }) { return <div className={`flex items-center justify-between rounded-lg border bg-white px-4 py-3 text-sm font-semibold ${tone === "error" ? "border-red-200 text-red-700" : "border-emerald-200 text-emerald-700"}`}><span>{children}</span><button aria-label="Cerrar" onClick={onClose}><X size={16} /></button></div>; }
function Restricted({ message, onBack }: { message: string; onBack: () => void }) { return <main className="grid min-h-screen place-items-center bg-[#edf1f4] p-6"><section className="max-w-md rounded-xl border border-slate-300 bg-white p-7 text-center shadow-lg"><ShieldCheck className="mx-auto text-[#b64a43]" size={32} /><h1 className="mt-4 text-xl font-semibold text-[#0b2235]">NPS restringido</h1><p className="mt-2 text-sm text-slate-500">{message}</p><button className="mt-5 rounded-lg bg-[#0b2235] px-5 py-2.5 font-semibold text-white" onClick={onBack}>Volver</button></section></main>; }
function formatBytes(bytes: number) { if (!bytes) return "0 KB"; return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB`; }
function formatDate(value: string) { return new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)); }
