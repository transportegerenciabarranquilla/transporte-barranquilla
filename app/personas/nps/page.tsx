"use client";

import { useEffect, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle2, Database, MapPinned, Navigation, RotateCcw, Search, ShieldCheck, SlidersHorizontal, Upload, X } from "lucide-react";
import type { Map as MapLibreMapInstance, Marker as MapLibreMarker, StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

type Summary = {
  respondentCount: number;
  rawRowCount: number;
  promoters: number;
  passives: number;
  detractors: number;
  nps: number;
  averageScore: number;
};
type Group = Summary & { label: string };
type TrendSeries = { label: string; rows: Group[] };
type Driver = { label: string; count: number; percentage: number };
type ScoreRow = { score: number; count: number; percentage: number };
type Detractor = {
  accountId: string;
  date: string;
  lastAttention?: string;
  lastRr?: string;
  score: number;
  cd: string;
  com: string;
  stratum: string;
  management: string;
  primaryDriver: string;
  secondaryDriver: string;
};
type DetractorClient = { com?: string; nombre?: string };
type NpsData = {
  summary: Summary;
  options: { cds: string[]; years: string[]; managements: string[]; weeks: string[] };
  trends: { annual: TrendSeries[]; years: Group[]; currentMonths: Group[]; months: Group[]; weeks: Group[]; currentDays: Group[]; days: Group[] };
  scoreDistribution: ScoreRow[];
  segments: { cds: Group[]; commercialActivities: Group[]; commercialManagers: Group[]; coms: Group[]; managements: Group[]; populations: Group[]; strata: Group[] };
  drivers: { primary: Driver[]; secondary: Driver[] };
  detractors: Detractor[];
  source: {
    table: string;
    columns: number;
    rawRowCount: number;
    respondentCount: number;
    minDate: string | null;
    maxDate: string | null;
  };
};
type FilterState = { cd: string; year: string; month: string; day: string; week: string; management: string };
type CachedNpsReport = { data: NpsData; filters: FilterState; storedAt: number };

const EMPTY_FILTERS: FilterState = { cd: "", year: "", month: "", day: "", week: "", management: "" };
const MONTHS = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const NPS_REPORT_CACHE_KEY = "people:nps:last-report";
const NPS_REPORT_CACHE_TTL_MS = 30 * 60 * 1_000;

export default function NpsPage() {
  const router = useRouter();
  const [allowed, setAllowed] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState<NpsData | null>(null);
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState("");
  const uploadInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/session/session", { cache: "no-store" })
      .then((response) => response.json())
      .then((body) => {
        if (!body?.session?.isPeople && !body?.session?.isAdmin) throw new Error("Este módulo es exclusivo de People.");
        const cached = readCachedNpsReport();
        if (cached) {
          setFilters(cached.filters);
          setData(cached.data);
        }
        setAllowed(true);
      })
      .catch((caught) => setError(caught instanceof Error ? caught.message : "No se pudo abrir NPS."))
      .finally(() => setCheckingSession(false));
  }, []);

  useEffect(() => {
    if (!allowed) return;
    const controller = new AbortController();
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value) params.set(key, value);
    });

    setFetching(true);
    setError("");
    fetch(`/api/people/nps?${params.toString()}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error || "No se pudo consultar la tabla NPS.");
        const nextData = body as NpsData;
        setData(nextData);
        writeCachedNpsReport({ data: nextData, filters, storedAt: Date.now() });
      })
      .catch((caught) => {
        if (caught instanceof DOMException && caught.name === "AbortError") return;
        setError(caught instanceof Error ? caught.message : "No se pudo consultar NPS.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setFetching(false);
      });

    return () => controller.abort();
  }, [allowed, filters, refreshVersion]);

  async function handleNpsUpload(file?: File) {
    if (!file) return;
    setUploading(true);
    setError("");
    setUploadMessage("");
    try {
      const formData = new FormData();
      formData.set("file", file);
      const response = await fetch("/api/people/nps/upload", { method: "POST", body: formData });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "No se pudo importar el Excel.");
      setUploadMessage(`${formatNumber(body.inserted || 0)} filas nuevas agregadas · ${formatNumber(body.skipped || 0)} ya existían.`);
      window.sessionStorage.removeItem(NPS_REPORT_CACHE_KEY);
      setRefreshVersion((value) => value + 1);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No se pudo importar el Excel.");
    } finally {
      setUploading(false);
      if (uploadInputRef.current) uploadInputRef.current.value = "";
    }
  }

  if (checkingSession) return <LoadingScreen message="Validando acceso a People Intelligence…" />;
  if (allowed && !data && fetching) return <LoadingScreen message="Consultando y consolidando la tabla NPS…" detail="La primera carga puede tardar unos segundos; las siguientes usarán la caché." />;
  if (!allowed) return <Restricted message={error} onBack={() => router.push("/")} />;

  return (
    <main className="min-h-screen bg-[#edf1f4] text-[#16293a]">
      <header className="border-b border-[#17364d] bg-[#0b2235] text-white shadow-sm">
        <div className="mx-auto flex max-w-[1560px] items-center justify-between px-5 py-4 sm:px-8">
          <button aria-label="Volver" className="grid h-10 w-10 place-items-center rounded-lg text-slate-300 transition hover:bg-white/10 hover:text-white" onClick={() => router.push("/")}><ArrowLeft size={20} /></button>
          <div className="text-right"><p className="text-[10px] font-bold uppercase tracking-[.2em] text-[#71b7ba]">People Intelligence</p><h1 className="text-xl font-semibold tracking-tight">NPS Gerencia Barranquilla</h1></div>
        </div>
      </header>

      <section className="mx-auto max-w-[1560px] space-y-5 px-4 py-5 sm:px-8">
        {error ? <Alert onClose={() => setError("")}>{error}</Alert> : null}

        <section className="overflow-hidden rounded-xl border border-slate-300 bg-white shadow-sm">
          <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-4">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-[#e5eff2] text-[#235b66]"><Database size={21} /></span>
              <div><p className="text-[10px] font-bold uppercase tracking-[.16em] text-[#527180]">Repositorio central</p><h2 className="mt-1 text-xl font-semibold text-[#0b2235]">Consolidado histórico NPS</h2><p className="mt-1 text-sm text-slate-500">Todas las cifras visibles se calculan desde Supabase.</p></div>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <span className="inline-flex h-10 items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 text-sm font-semibold text-emerald-700"><CheckCircle2 size={17} />Tabla {data?.source.table || "NPS"} conectada</span>
              <input accept=".xlsx,.xls" className="hidden" onChange={(event) => void handleNpsUpload(event.target.files?.[0])} ref={uploadInputRef} type="file" />
              <button className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#0b2235] px-4 text-sm font-semibold text-white transition hover:bg-[#173f59] disabled:cursor-wait disabled:bg-slate-400" disabled={uploading} onClick={() => uploadInputRef.current?.click()} type="button"><Upload size={16} />{uploading ? "Importando…" : "Subir Excel NPS"}</button>
            </div>
          </div>
          {uploadMessage ? <div className="border-t border-emerald-200 bg-emerald-50 px-5 py-2.5 text-xs font-semibold text-emerald-700">{uploadMessage}</div> : null}
          <div className="grid border-t border-slate-200 bg-[#f7f9fa] sm:grid-cols-4">
            <RepositoryStat label="Filas almacenadas" value={formatNumber(data?.source.rawRowCount || 0)} />
            <RepositoryStat label="Encuestas únicas" value={formatNumber(data?.source.respondentCount || 0)} />
            <RepositoryStat label="Primera encuesta" value={formatDate(data?.source.minDate)} />
            <RepositoryStat label="Última encuesta" value={formatDate(data?.source.maxDate)} />
          </div>
        </section>

        <FilterPanel
          data={data}
          fetching={fetching}
          filters={filters}
          onChange={(key, value) => setFilters((current) => ({ ...current, [key]: value }))}
          onReset={() => setFilters(EMPTY_FILTERS)}
        />

        <nav className="sticky top-3 z-20 flex gap-1 overflow-x-auto rounded-xl border border-slate-300 bg-white/95 p-1.5 shadow-lg shadow-slate-300/30 backdrop-blur">
          <NavLink href="#resumen">Resumen</NavLink><NavLink href="#evolucion">Evolución</NavLink><NavLink href="#causas">Causas</NavLink><NavLink href="#segmentacion">Segmentación</NavLink><NavLink href="#detractores">Detractores</NavLink><NavLink href="#datos">Datos</NavLink>
        </nav>

        <SectionHeader id="resumen" index="01" title="Resumen ejecutivo" description="Indicadores del filtro seleccionado." />
        <SummaryCards summary={data?.summary} />
        <NpsOverview cds={data?.segments.cds || []} summary={data?.summary} years={data?.trends.years || []} />
        <ScoreChart rows={data?.scoreDistribution || []} />

        <SectionHeader id="evolucion" index="02" title="Evolución del servicio" description="Resultados reales por periodo." />
        <div className="grid gap-4 xl:grid-cols-2">
          <AnnualTrendChart eyebrow="Comparativo anual" series={data?.trends.annual || []} title="NPS por año" />
          <TrendChart eyebrow="Evolución del año actual" mode="line" rows={data?.trends.currentMonths || []} title="NPS por mes" />
          <TrendChart eyebrow="Seguimiento semanal" mode="columns" rows={data?.trends.weeks || []} title="NPS por semana" />
          <TrendChart eyebrow="Evolución del mes actual" mode="line" rows={data?.trends.currentDays || []} title="NPS por día" />
        </div>
        <DailyRatingsChart filters={filters} rows={data?.trends.currentDays || []} sourceMaxDate={data?.source.maxDate} />
        <DeliveryExperienceChart series={data?.trends.annual || []} />

        <SectionHeader id="causas" index="03" title="Causas y factores de impacto" description="Drivers registrados en las encuestas filtradas." />
        <div className="grid gap-4 xl:grid-cols-2">
          <DriverChart eyebrow="Factores principales" rows={data?.drivers.primary || []} title="Primary Driver" variant="list" />
          <DriverChart eyebrow="Causas de entrega" rows={data?.drivers.secondary || []} title="Secondary Delivery" variant="grid" />
        </div>
        <DriverContribution rows={data?.drivers.primary || []} />

        <SectionHeader id="segmentacion" index="04" title="Segmentación territorial" description="Comparativos por dimensiones presentes en la tabla NPS." />
        <div className="grid gap-4 xl:grid-cols-2">
          <SegmentBarChart eyebrow="Desempeño comercial" rows={data?.segments.commercialManagers || []} title="NPS por jefe comercial" />
          <ManagementDonut rows={data?.segments.managements || []} />
        </div>
        <div className="grid gap-4 xl:grid-cols-2">
          <SegmentBarChart eyebrow="Segmentación comercial" rows={data?.segments.coms || []} title="NPS por COM" />
          <SegmentBarChart eyebrow="Segmentación geográfica" rows={data?.segments.populations || []} title="NPS por población" />
        </div>
        <SegmentBarChart eyebrow="Actividad comercial" rows={data?.segments.commercialActivities || []} title="NPS por actividad comercial" />

        <SectionHeader id="detractores" index="05" title="Gestión de detractores" description="Últimas encuestas con calificación de 0 a 6." />
        <MonthlyDetractorChart rows={data?.trends.months || []} />
        <DetractorExplorer rows={data?.detractors || []} strata={data?.segments.strata || []} />

        <CdMapPanel rows={data?.segments.cds || []} />
        <SectionHeader id="datos" index="06" title="Gobierno de datos" description="Trazabilidad del origen consultado." />
        <SourceTable data={data} />
      </section>

      <style jsx global>{`
        .nps-filter{display:flex;width:100%;height:48px;align-items:center;gap:8px;border:1px solid #cbd5e1;border-radius:10px;padding-left:12px;color:#64748b;background:#fff;transition:border-color .2s,box-shadow .2s}
        .nps-filter:focus-within{border-color:#20a39e;box-shadow:0 0 0 3px rgba(32,163,158,.12)}
        .nps-filter select{min-width:0;flex:1;border:0;background:transparent;padding:8px 22px 8px 2px;font-size:12px;font-weight:700;color:#172b3a;outline:none}
        .nps-filter span{flex:none;font-size:8px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:#527180}
        .nps-data-table{border-collapse:separate;border-spacing:0}
        .nps-data-table thead th{border-bottom:1px solid #cbd9e3;background:linear-gradient(180deg,#f8fafb 0%,#edf3f6 100%);color:#527180;font-weight:800}
        .nps-data-table tbody tr:nth-child(even){background:#f8fafb}
        .nps-data-table tbody tr:hover{background:#eaf4f4}
        .nps-data-table tbody td{border-bottom:1px solid #e7edf1}
        .nps-chart-bar{transform-origin:bottom;animation:nps-bar-in .65s cubic-bezier(.2,.8,.2,1) both}
        .nps-chart-line{animation:nps-line-in .8s ease-out both}
        .nps-chart-point{transition:r .18s ease,filter .18s ease}
        .nps-chart-point:hover{r:7px;filter:drop-shadow(0 2px 3px rgba(11,34,53,.25))}
        @keyframes nps-bar-in{from{transform:scaleY(.05);opacity:.35}to{transform:scaleY(1);opacity:1}}
        @keyframes nps-line-in{from{opacity:0}to{opacity:1}}
        @media(prefers-reduced-motion:reduce){.nps-chart-bar,.nps-chart-line{animation:none}}
      `}</style>
    </main>
  );
}

function FilterPanel({ data, fetching, filters, onChange, onReset }: {
  data: NpsData | null;
  fetching: boolean;
  filters: FilterState;
  onChange: (key: keyof FilterState, value: string) => void;
  onReset: () => void;
}) {
  return (
    <section className="rounded-xl border border-slate-300 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2"><span className="grid h-8 w-8 place-items-center rounded-lg bg-[#e8f2f3] text-[#176b73]"><SlidersHorizontal size={16} /></span><div><h2 className="text-sm font-semibold text-[#0b2235]">Filtros del informe</h2><p className="text-[10px] text-slate-400">{fetching ? "Actualizando resultados…" : "Todos los resultados y tablas responden a estos filtros"}</p></div></div>
        <button className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-slate-500 transition hover:bg-slate-100" onClick={onReset}><RotateCcw size={14} />Limpiar</button>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <Filter label="CD"><select value={filters.cd} onChange={(event) => onChange("cd", event.target.value)}><option value="">Todos</option>{data?.options.cds.map((value) => <option key={value} value={value}>{value}</option>)}</select></Filter>
        <Filter label="Año"><select value={filters.year} onChange={(event) => onChange("year", event.target.value)}><option value="">Todos</option>{data?.options.years.map((value) => <option key={value} value={value}>{value}</option>)}</select></Filter>
        <Filter label="Mes"><select value={filters.month} onChange={(event) => onChange("month", event.target.value)}><option value="">Todos</option>{MONTHS.map((value, index) => <option key={value} value={index + 1}>{value}</option>)}</select></Filter>
        <Filter label="Día"><select value={filters.day} onChange={(event) => onChange("day", event.target.value)}><option value="">Todos</option>{Array.from({ length: 31 }, (_, index) => <option key={index + 1} value={index + 1}>{index + 1}</option>)}</select></Filter>
        <Filter label="Semana"><select value={filters.week} onChange={(event) => onChange("week", event.target.value)}><option value="">Todas</option>{data?.options.weeks.map((value) => <option key={value} value={value}>{value}</option>)}</select></Filter>
        <Filter label="Gerencia"><select value={filters.management} onChange={(event) => onChange("management", event.target.value)}><option value="">Todas</option>{data?.options.managements.map((value) => <option key={value} value={value}>{value.replace(/^CO /, "")}</option>)}</select></Filter>
      </div>
    </section>
  );
}

function SummaryCards({ summary }: { summary?: Summary }) {
  const total = summary?.respondentCount || 0;
  const items = [
    { label: "NPS actual", value: formatSigned(summary?.nps || 0), detail: "((Promotores − detractores) / encuestados) × 100" },
    { label: "Promotores", value: formatNumber(summary?.promoters || 0), detail: formatPercent(summary?.promoters || 0, total) },
    { label: "Pasivos", value: formatNumber(summary?.passives || 0), detail: formatPercent(summary?.passives || 0, total) },
    { label: "Detractores", value: formatNumber(summary?.detractors || 0), detail: formatPercent(summary?.detractors || 0, total) },
    { label: "Encuestados", value: formatNumber(total), detail: "Encuestas únicas" },
    { label: "Calificación", value: (summary?.averageScore || 0).toLocaleString("es-CO", { minimumFractionDigits: 1 }), detail: "/ 10" },
  ];
  return <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">{items.map((item) => <MetricCard key={item.label} {...item} />)}</section>;
}

function NpsOverview({ cds, summary, years }: { cds: Group[]; summary?: Summary; years: Group[] }) {
  const current = years.at(-1);
  const previous = years.at(-2);
  const delta = current && previous ? current.nps - previous.nps : null;
  const gaugeValue = Math.max(-100, Math.min(100, summary?.nps || 0));
  const gaugeRotation = ((gaugeValue + 100) / 200) * 180;

  return (
    <section className="space-y-4">
      <div className="grid grid-cols-3 gap-4">
        <ChartCard eyebrow="Indicador consolidado" title="Gerencia Barranquilla">
          <div className="mt-3 grid items-center gap-2 sm:grid-cols-[110px_minmax(0,1fr)]">
            <svg aria-label={`NPS global ${formatSigned(gaugeValue)}`} className="mx-auto w-full max-w-28" role="img" viewBox="0 0 250 150">
              <path d="M 25 125 A 100 100 0 0 1 225 125" fill="none" pathLength="100" stroke="#edf2f5" strokeLinecap="round" strokeWidth="28" />
              <path d="M 25 125 A 100 100 0 0 1 225 125" fill="none" pathLength="100" stroke="#dc4b48" strokeDasharray="35 65" strokeLinecap="butt" strokeWidth="28" />
              <path d="M 25 125 A 100 100 0 0 1 225 125" fill="none" pathLength="100" stroke="#efbb32" strokeDasharray="25 75" strokeDashoffset="-35" strokeLinecap="butt" strokeWidth="28" />
              <path d="M 25 125 A 100 100 0 0 1 225 125" fill="none" pathLength="100" stroke="#20ae78" strokeDasharray="40 60" strokeDashoffset="-60" strokeLinecap="butt" strokeWidth="28" />
              <g className="transition-transform duration-700" style={{ transform: `rotate(${gaugeRotation}deg)`, transformBox: "view-box", transformOrigin: "125px 125px" }}><line stroke="#071f33" strokeLinecap="round" strokeWidth="4" x1="125" x2="38" y1="125" y2="125" /></g>
              <circle cx="125" cy="125" fill="#071f33" r="9" stroke="#fff" strokeWidth="4" />
              <text fill="#64748b" fontSize="8" fontWeight="700" textAnchor="middle" x="25" y="148">-100</text><text fill="#64748b" fontSize="8" fontWeight="700" textAnchor="middle" x="125" y="30">0</text><text fill="#64748b" fontSize="8" fontWeight="700" textAnchor="middle" x="225" y="148">+100</text>
            </svg>
            <div className="text-center sm:text-left"><strong className="text-3xl font-semibold tracking-tight text-[#071f33]">{formatSigned(summary?.nps || 0)}</strong><p className="mt-1 text-[8px] font-extrabold uppercase tracking-[.1em] text-slate-400">(Promotores − detractores) / encuestados</p><p className="mt-1 text-[9px] leading-4 text-slate-500">{formatNumber(summary?.respondentCount || 0)} encuestas</p></div>
          </div>
        </ChartCard>
        <CdNpsGauges rows={cds} />
      </div>
      <ChartCard eyebrow="Lectura interanual" title="Resultado YTD">
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-3.5"><p className="text-[8px] font-extrabold uppercase tracking-[.12em] text-emerald-700">Año actual · {current?.label || "—"}</p><strong className="mt-1 block text-3xl font-semibold text-[#071f33]">{current ? formatSigned(current.nps) : "—"}</strong><p className="text-[10px] font-bold text-emerald-700">YTD</p></div>
          <div className="rounded-xl border border-slate-200 bg-[#f8fafb] p-3.5"><p className="text-[8px] font-extrabold uppercase tracking-[.12em] text-slate-500">Año anterior · {previous?.label || "—"}</p><strong className="mt-1 block text-3xl font-semibold text-[#071f33]">{previous ? formatSigned(previous.nps) : "—"}</strong><p className={`text-[10px] font-bold ${delta !== null && delta >= 0 ? "text-emerald-700" : "text-red-600"}`}>{delta === null ? "Sin comparación" : `${formatSigned(delta)} puntos`}</p></div>
        </div>
      </ChartCard>
    </section>
  );
}

function CdNpsGauges({ rows }: { rows: Group[] }) {
  const cards = [
    { key: "galapa", title: "CD Galapa" },
    { key: "arenosa", title: "CD La Arenosa" },
  ].map((card) => ({
    ...card,
    row: rows.find((row) => normalizeTextLabel(row.label).includes(card.key)),
  }));

  return (
    <>
      {cards.map(({ row, title }) => {
        const value = Math.max(-100, Math.min(100, row?.nps || 0));
        const rotation = ((value + 100) / 200) * 180;
        return (
          <ChartCard eyebrow="Desempeño por centro" key={title} title={title}>
            <div className="mt-3 grid items-center gap-2 sm:grid-cols-[110px_minmax(0,1fr)]">
              <svg aria-label={`${title}: NPS ${formatSigned(value)}`} className="mx-auto w-full max-w-28" role="img" viewBox="0 0 250 150">
                <path d="M 25 125 A 100 100 0 0 1 225 125" fill="none" pathLength="100" stroke="#edf2f5" strokeLinecap="round" strokeWidth="28" />
                <path d="M 25 125 A 100 100 0 0 1 225 125" fill="none" pathLength="100" stroke="#dc4b48" strokeDasharray="35 65" strokeWidth="28" />
                <path d="M 25 125 A 100 100 0 0 1 225 125" fill="none" pathLength="100" stroke="#efbb32" strokeDasharray="25 75" strokeDashoffset="-35" strokeWidth="28" />
                <path d="M 25 125 A 100 100 0 0 1 225 125" fill="none" pathLength="100" stroke="#20ae78" strokeDasharray="40 60" strokeDashoffset="-60" strokeWidth="28" />
                <g className="transition-transform duration-700" style={{ transform: `rotate(${rotation}deg)`, transformBox: "view-box", transformOrigin: "125px 125px" }}><line stroke="#071f33" strokeLinecap="round" strokeWidth="4" x1="125" x2="38" y1="125" y2="125" /></g>
                <circle cx="125" cy="125" fill="#071f33" r="9" stroke="#fff" strokeWidth="4" />
                <text fill="#64748b" fontSize="8" fontWeight="700" textAnchor="middle" x="25" y="148">-100</text><text fill="#64748b" fontSize="8" fontWeight="700" textAnchor="middle" x="125" y="30">0</text><text fill="#64748b" fontSize="8" fontWeight="700" textAnchor="middle" x="225" y="148">+100</text>
              </svg>
              <div className="text-center sm:text-left"><strong className="text-3xl font-semibold tracking-tight text-[#071f33]">{row ? formatSigned(row.nps) : "—"}</strong><p className="mt-1 text-[8px] font-extrabold uppercase tracking-[.1em] text-slate-400">NPS del centro</p><p className="mt-1 text-[9px] leading-4 text-slate-500">{row ? `${formatNumber(row.respondentCount)} encuestas` : "Sin datos"}</p></div>
            </div>
          </ChartCard>
        );
      })}
    </>
  );
}

function TrendChart({ eyebrow, mode, rows, title }: { eyebrow: string; mode: "line" | "columns"; rows: Group[]; title: string }) {
  const [pinnedLabel, setPinnedLabel] = useState("");
  const [page, setPage] = useState(0);
  if (!rows.length) return <ChartCard eyebrow={eyebrow} title={title}><EmptyState /></ChartCard>;
  if (mode === "columns") {
    const pageSize = 8;
    const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
    const currentPage = Math.min(page, pageCount - 1);
    const pageRows = rows.slice(currentPage * pageSize, (currentPage + 1) * pageSize);
    const firstVisible = currentPage * pageSize + 1;
    const lastVisible = Math.min((currentPage + 1) * pageSize, rows.length);
    return (
      <ChartCard eyebrow={eyebrow} title={title}>
        <div className="mt-7 flex h-64 w-full min-w-0 items-end gap-3 border-b border-l border-[#cbd9e3] px-4 pt-16">
          {pageRows.map((row) => {
            const height = Math.max(8, ((row.nps + 100) / 200) * 92);
            const color = row.nps >= 80 ? "linear-gradient(180deg,#34d399,#059669)" : row.nps >= 65 ? "linear-gradient(180deg,#fde047,#eab308)" : "linear-gradient(180deg,#fb7185,#dc2626)";
            return (
              <button className="group flex h-full min-w-0 flex-1 flex-col items-center justify-end outline-none" key={row.label} onClick={() => setPinnedLabel(pinnedLabel === row.label ? "" : row.label)}>
                <span className="relative flex w-full max-w-52 items-end justify-center" style={{ height: `${height}%` }}>
                  <ChartTooltip pinned={pinnedLabel === row.label}>{row.label}: NPS {formatSigned(row.nps)} · {formatNumber(row.respondentCount)} encuestas</ChartTooltip>
                  <span className="absolute -top-6 text-[10px] font-extrabold text-[#17364d]">{formatSigned(row.nps)}%</span>
                  <span className={`nps-chart-bar block h-full w-full rounded-t-md transition duration-300 group-hover:brightness-105 ${pinnedLabel === row.label ? "ring-2 ring-[#0b2235] ring-offset-2" : ""}`} style={{ background: color }} />
                </span>
                <span className="mt-2 text-xs font-extrabold text-[#17364d]">{row.label.replace(/^S/, "")}</span>
              </button>
            );
          })}
        </div>
        <div className="mt-3 flex items-center justify-between gap-3">
          <span className="text-[10px] font-semibold text-slate-500">Mostrando {firstVisible}–{lastVisible} de {rows.length} semanas</span>
          <div className="flex items-center gap-2">
            <button className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-[10px] font-bold text-[#25435b] transition hover:border-[#176b73] disabled:cursor-not-allowed disabled:opacity-40" disabled={currentPage === 0} onClick={() => { setPinnedLabel(""); setPage((value) => Math.max(0, value - 1)); }} type="button">Anterior</button>
            <span className="min-w-12 text-center text-[10px] font-extrabold text-[#17364d]">{currentPage + 1}/{pageCount}</span>
            <button className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-[10px] font-bold text-[#25435b] transition hover:border-[#176b73] disabled:cursor-not-allowed disabled:opacity-40" disabled={currentPage >= pageCount - 1} onClick={() => { setPinnedLabel(""); setPage((value) => Math.min(pageCount - 1, value + 1)); }} type="button">Siguiente</button>
          </div>
        </div>
      </ChartCard>
    );
  }

  const width = 720;
  const height = 230;
  const paddingX = 38;
  const paddingY = 28;
  const values = rows.map((row) => row.nps);
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const span = Math.max(10, maximum - minimum);
  const floor = Math.max(-100, minimum - span * 0.2);
  const ceiling = Math.min(100, maximum + span * 0.2);
  const chartSpan = Math.max(1, ceiling - floor);
  const points = rows.map((row, index) => ({
    ...row,
    x: paddingX + (index * (width - paddingX * 2)) / Math.max(1, rows.length - 1),
    y: height - paddingY - ((row.nps - floor) / chartSpan) * (height - paddingY * 2),
  }));
  const path = smoothPath(points);
  const pinned = points.find((point) => point.label === pinnedLabel);

  return (
    <ChartCard eyebrow={eyebrow} title={title}>
      <div className="mt-5 overflow-x-auto">
        <svg aria-label={title} className="min-w-[620px]" role="img" viewBox={`0 0 ${width} ${height + 30}`}>
          {[0, 1, 2, 3, 4].map((line) => {
            const y = paddingY + (line * (height - paddingY * 2)) / 4;
            const value = ceiling - (line * chartSpan) / 4;
            return <g key={line}><line stroke="#d6e1e7" x1={paddingX} x2={width - paddingX} y1={y} y2={y} /><text fill="#71899b" fontSize="9" textAnchor="end" x={paddingX - 8} y={y + 3}>{Math.round(value)}%</text></g>;
          })}
          <path d={`${path} L ${points.at(-1)?.x} ${height - paddingY} L ${points[0].x} ${height - paddingY} Z`} fill="url(#nps-fill)" />
          <defs><linearGradient id="nps-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#159b94" stopOpacity=".14" /><stop offset="1" stopColor="#159b94" stopOpacity="0" /></linearGradient></defs>
          <path className="nps-chart-line" d={path} fill="none" stroke="#139a92" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" />
          {points.map((point) => <g className="cursor-pointer" key={point.label} onClick={() => setPinnedLabel(pinnedLabel === point.label ? "" : point.label)}><circle className="nps-chart-point" cx={point.x} cy={point.y} fill={pinnedLabel === point.label ? "#139a92" : "#fff"} r={pinnedLabel === point.label ? 7 : 5} stroke="#139a92" strokeWidth="3"><title>{`${point.label}: NPS ${formatSigned(point.nps)} · ${formatNumber(point.respondentCount)} encuestas · clic para fijar`}</title></circle><text fill="#139a92" fontSize="9" fontWeight="800" textAnchor="middle" x={point.x} y={Math.max(12, point.y - 10)}>{formatSigned(point.nps)}%</text><text fill="#71899b" fontSize="9" fontWeight="600" textAnchor="middle" x={point.x} y={height + 12}>{point.label}</text></g>)}
          {pinned ? <PinnedSvgTooltip color="#139a92" height={height} onClose={() => setPinnedLabel("")} point={pinned} width={width} /> : null}
        </svg>
      </div>
    </ChartCard>
  );
}

function AnnualTrendChart({ eyebrow, series, title }: { eyebrow: string; series: TrendSeries[]; title: string }) {
  const [pinnedPoint, setPinnedPoint] = useState("");
  const [hoveredMonth, setHoveredMonth] = useState("");
  if (!series.some((item) => item.rows.length)) return <ChartCard eyebrow={eyebrow} title={title}><EmptyState /></ChartCard>;
  const width = 720;
  const height = 230;
  const paddingX = 44;
  const paddingY = 28;
  const colors = ["#159b94", "#e79522"];
  const allValues = series.flatMap((item) => item.rows.map((row) => row.nps));
  const minimum = Math.min(...allValues);
  const maximum = Math.max(...allValues);
  const span = Math.max(10, maximum - minimum);
  const floor = Math.max(-100, Math.floor((minimum - span * .25) / 5) * 5);
  const ceiling = Math.min(100, Math.ceil((maximum + span * .25) / 5) * 5);
  const chartSpan = Math.max(1, ceiling - floor);
  const monthIndex = (label: string) => ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"].indexOf(label);
  const plotted = series.map((item) => ({
    ...item,
    points: item.rows.map((row) => ({
      ...row,
      x: paddingX + (Math.max(0, monthIndex(row.label)) * (width - paddingX * 2)) / 11,
      y: height - paddingY - ((row.nps - floor) / chartSpan) * (height - paddingY * 2),
    })),
  }));
  const pinned = plotted.flatMap((item, seriesIndex) => item.points.map((point) => ({ ...point, color: colors[seriesIndex % colors.length], seriesLabel: item.label })))
    .find((point) => `${point.seriesLabel}:${point.label}` === pinnedPoint);
  const comparisonMonth = hoveredMonth || pinned?.label || "";
  const comparison = comparisonMonth
    ? plotted.flatMap((item, seriesIndex) => {
        const point = item.points.find((candidate) => candidate.label === comparisonMonth);
        return point ? [{ ...point, color: colors[seriesIndex % colors.length], seriesLabel: item.label }] : [];
      })
    : [];

  return (
    <ChartCard eyebrow={eyebrow} title={title}>
      <div className="mt-5 flex flex-wrap gap-5 text-[10px] font-semibold text-[#527180]">
        {series.map((item, index) => <span className="inline-flex items-center gap-2" key={item.label}><i className="h-3 w-3 rounded-full" style={{ background: colors[index % colors.length] }} />{item.label}</span>)}
      </div>
      <div className="mt-2 overflow-x-auto">
        <svg aria-label={`${title}: comparación con el año anterior`} className="min-w-[620px]" role="img" viewBox={`0 0 ${width} ${height + 30}`}>
          <defs><linearGradient id="annual-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#159b94" stopOpacity=".13" /><stop offset="1" stopColor="#159b94" stopOpacity="0" /></linearGradient></defs>
          {[0, 1, 2, 3, 4].map((line) => {
            const y = paddingY + (line * (height - paddingY * 2)) / 4;
            const value = ceiling - (line * chartSpan) / 4;
            return <g key={line}><line stroke="#d6e1e7" x1={paddingX} x2={width - paddingX} y1={y} y2={y} /><text fill="#71899b" fontSize="9" textAnchor="end" x={paddingX - 8} y={y + 3}>{Math.round(value)}%</text></g>;
          })}
          {plotted[0]?.points.length > 1 ? <path d={`${smoothPath(plotted[0].points)} L ${plotted[0].points.at(-1)?.x} ${height - paddingY} L ${plotted[0].points[0].x} ${height - paddingY} Z`} fill="url(#annual-fill)" /> : null}
          {plotted.map((item, seriesIndex) => <g key={item.label}>
            <path className="nps-chart-line" d={smoothPath(item.points)} fill="none" stroke={colors[seriesIndex % colors.length]} strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" />
            {item.points.map((point) => {
              const key = `${item.label}:${point.label}`;
              const active = pinnedPoint === key;
              return <g className="cursor-pointer" key={point.label} onClick={() => setPinnedPoint(active ? "" : key)} onMouseEnter={() => setHoveredMonth(point.label)} onMouseLeave={() => setHoveredMonth("")}><circle className="nps-chart-point" cx={point.x} cy={point.y} fill={active ? colors[seriesIndex % colors.length] : "#fff"} r={active ? 7 : 5} stroke={colors[seriesIndex % colors.length]} strokeWidth="3"><title>{`${item.label} · ${point.label}: NPS ${formatSigned(point.nps)} · ${formatNumber(point.respondentCount)} encuestas · Haz clic para fijar`}</title></circle><text fill={colors[seriesIndex % colors.length]} fontSize="8.5" fontWeight="800" textAnchor="middle" x={point.x} y={Math.max(12, point.y - 10)}>{formatSigned(point.nps)}%</text></g>;
            })}
          </g>)}
          {["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"].map((month, index) => <text fill="#71899b" fontSize="9" fontWeight="600" key={month} textAnchor="middle" x={paddingX + (index * (width - paddingX * 2)) / 11} y={height + 12}>{month}</text>)}
          {comparison.length ? (() => {
            const tooltipWidth = 166;
            const tooltipHeight = 48 + comparison.length * 22;
            const anchorX = comparison[0].x;
            const anchorY = Math.min(...comparison.map((point) => point.y));
            const tooltipX = Math.max(6, Math.min(width - tooltipWidth - 6, anchorX - tooltipWidth / 2));
            const tooltipY = anchorY > tooltipHeight + 22 ? anchorY - tooltipHeight - 14 : anchorY + 18;
            const ordered = [...comparison].sort((a, b) => Number(b.seriesLabel) - Number(a.seriesLabel));
            const difference = ordered.length > 1 ? ordered[0].nps - ordered[1].nps : null;
            return <g className={pinned && !hoveredMonth ? "cursor-pointer" : ""} onClick={() => { if (pinned && !hoveredMonth) setPinnedPoint(""); }}><rect fill="#0b2235" height={tooltipHeight} rx="10" width={tooltipWidth} x={tooltipX} y={tooltipY} /><text fill="#9bb0bf" fontSize="8" fontWeight="800" letterSpacing=".8" x={tooltipX + 12} y={tooltipY + 17}>{comparisonMonth.toUpperCase()} · COMPARATIVO</text>{ordered.map((point, index) => <g key={point.seriesLabel}><circle cx={tooltipX + 15} cy={tooltipY + 34 + index * 22} fill={point.color} r="4" /><text fill="#dce7ed" fontSize="9" fontWeight="700" x={tooltipX + 25} y={tooltipY + 37 + index * 22}>{point.seriesLabel}</text><text fill="#fff" fontSize="13" fontWeight="800" textAnchor="end" x={tooltipX + tooltipWidth - 12} y={tooltipY + 38 + index * 22}>{formatSigned(point.nps)}%</text></g>)}{difference !== null ? <text fill={difference >= 0 ? "#63d6bc" : "#ff9b91"} fontSize="8" fontWeight="800" x={tooltipX + 12} y={tooltipY + tooltipHeight - 8}>DIFERENCIA {formatSigned(difference)} PUNTOS</text> : null}</g>;
          })() : null}
        </svg>
      </div>
    </ChartCard>
  );
}

function smoothPath(points: Array<{ x: number; y: number }>) {
  if (!points.length) return "";
  if (points.length === 1) return `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
  return points.slice(1).reduce((path, point, index) => {
    const previous = points[index];
    const midpoint = (previous.x + point.x) / 2;
    return `${path} C ${midpoint.toFixed(1)} ${previous.y.toFixed(1)}, ${midpoint.toFixed(1)} ${point.y.toFixed(1)}, ${point.x.toFixed(1)} ${point.y.toFixed(1)}`;
  }, `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`);
}

function DeliveryExperienceChart({ series }: { series: TrendSeries[] }) {
  const [pinnedPoint, setPinnedPoint] = useState("");
  const [hoveredMonth, setHoveredMonth] = useState("");
  const colors = ["#159b94", "#e79522"];
  const width = 920;
  const height = 230;
  const paddingX = 45;
  const paddingY = 28;
  const monthIndex = (label: string) => ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"].indexOf(label);
  const plotted = series.map((item) => ({
    ...item,
    points: item.rows.map((row) => ({
      ...row,
      x: paddingX + (Math.max(0, monthIndex(row.label)) * (width - paddingX * 2)) / 11,
      y: height - paddingY - (Math.max(0, Math.min(10, row.averageScore)) / 10) * (height - paddingY * 2),
    })),
  }));
  const pinned = plotted.flatMap((item, seriesIndex) => item.points.map((point) => ({ ...point, color: colors[seriesIndex % colors.length], seriesLabel: item.label })))
    .find((point) => `${point.seriesLabel}:${point.label}` === pinnedPoint);
  const comparisonMonth = hoveredMonth || pinned?.label || "";
  const comparison = comparisonMonth
    ? plotted.flatMap((item, seriesIndex) => {
        const point = item.points.find((candidate) => candidate.label === comparisonMonth);
        return point ? [{ ...point, color: colors[seriesIndex % colors.length], seriesLabel: item.label }] : [];
      })
    : [];

  return (
    <ChartCard eyebrow="Experiencia de entrega" title="Delivery Experience por mes">
      {plotted.some((item) => item.points.length) ? <>
        <div className="mt-5 flex gap-5 text-[10px] font-semibold text-[#527180]">{series.map((item, index) => <span className="inline-flex items-center gap-2" key={item.label}><i className="h-3 w-3 rounded-full" style={{ background: colors[index % colors.length] }} />{item.label}</span>)}</div>
        <div className="mt-2 overflow-x-auto">
          <svg aria-label="Delivery Experience mensual por año" className="min-w-[760px]" role="img" viewBox={`0 0 ${width} ${height + 30}`}>
            {[0, 2.5, 5, 7.5, 10].map((value) => {
              const y = height - paddingY - (value / 10) * (height - paddingY * 2);
              return <g key={value}><line stroke="#d6e1e7" x1={paddingX} x2={width - paddingX} y1={y} y2={y} /><text fill="#71899b" fontSize="9" textAnchor="end" x={paddingX - 8} y={y + 3}>{value.toLocaleString("es-CO")}</text></g>;
            })}
            {plotted.map((item, seriesIndex) => <g key={item.label}><path className="nps-chart-line" d={smoothPath(item.points)} fill="none" stroke={colors[seriesIndex % colors.length]} strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" />{item.points.map((point) => {
              const key = `${item.label}:${point.label}`;
              const active = pinnedPoint === key;
              return <g className="cursor-pointer" key={point.label} onClick={() => setPinnedPoint(active ? "" : key)} onMouseEnter={() => setHoveredMonth(point.label)} onMouseLeave={() => setHoveredMonth("")}><circle className="nps-chart-point" cx={point.x} cy={point.y} fill={active ? colors[seriesIndex % colors.length] : "#fff"} r={active ? 7 : 4.5} stroke={colors[seriesIndex % colors.length]} strokeWidth="3"><title>{`${item.label} · ${point.label}: ${point.averageScore.toLocaleString("es-CO")} / 10 · clic para fijar`}</title></circle><text fill={colors[seriesIndex % colors.length]} fontSize="8.5" fontWeight="800" textAnchor="middle" x={point.x} y={Math.max(12, point.y - 10)}>{point.averageScore.toLocaleString("es-CO")}</text></g>;
            })}</g>)}
            {["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"].map((month, index) => <text fill="#71899b" fontSize="9" fontWeight="600" key={month} textAnchor="middle" x={paddingX + (index * (width - paddingX * 2)) / 11} y={height + 12}>{month}</text>)}
            {comparison.length ? (() => {
              const tooltipWidth = 180;
              const tooltipHeight = 48 + comparison.length * 22;
              const anchorX = comparison[0].x;
              const anchorY = Math.min(...comparison.map((point) => point.y));
              const tooltipX = Math.max(6, Math.min(width - tooltipWidth - 6, anchorX - tooltipWidth / 2));
              const tooltipY = anchorY > tooltipHeight + 22 ? anchorY - tooltipHeight - 14 : anchorY + 18;
              const ordered = [...comparison].sort((a, b) => Number(b.seriesLabel) - Number(a.seriesLabel));
              const difference = ordered.length > 1 ? ordered[0].averageScore - ordered[1].averageScore : null;
              return <g className={pinned && !hoveredMonth ? "cursor-pointer" : ""} onClick={() => { if (pinned && !hoveredMonth) setPinnedPoint(""); }}><rect fill="#0b2235" height={tooltipHeight} rx="10" width={tooltipWidth} x={tooltipX} y={tooltipY} /><text fill="#9bb0bf" fontSize="8" fontWeight="800" letterSpacing=".8" x={tooltipX + 12} y={tooltipY + 17}>{comparisonMonth.toUpperCase()} · COMPARATIVO</text>{ordered.map((point, index) => <g key={point.seriesLabel}><circle cx={tooltipX + 15} cy={tooltipY + 34 + index * 22} fill={point.color} r="4" /><text fill="#dce7ed" fontSize="9" fontWeight="700" x={tooltipX + 25} y={tooltipY + 37 + index * 22}>{point.seriesLabel}</text><text fill="#fff" fontSize="13" fontWeight="800" textAnchor="end" x={tooltipX + tooltipWidth - 12} y={tooltipY + 38 + index * 22}>{point.averageScore.toLocaleString("es-CO", { maximumFractionDigits: 1 })} / 10</text></g>)}{difference !== null ? <text fill={difference >= 0 ? "#63d6bc" : "#ff9b91"} fontSize="8" fontWeight="800" x={tooltipX + 12} y={tooltipY + tooltipHeight - 8}>DIFERENCIA {formatSigned(difference)} PUNTOS</text> : null}</g>;
            })() : null}
          </svg>
        </div>
      </> : <EmptyState />}
    </ChartCard>
  );
}

function DailyRatingsChart({ filters, rows, sourceMaxDate }: { filters: FilterState; rows: Group[]; sourceMaxDate?: string | null }) {
  const [pinnedLabel, setPinnedLabel] = useState("");
  if (!rows.length) return <ChartCard eyebrow="Volumen diario" title="Calificaciones por día"><EmptyState /></ChartCard>;

  const sourceDate = sourceMaxDate ? new Date(`${sourceMaxDate.slice(0, 10)}T12:00:00`) : new Date();
  const year = Number(filters.year) || sourceDate.getFullYear();
  const month = Number(filters.month) || sourceDate.getMonth() + 1;
  const maximum = Math.max(1, ...rows.map((row) => row.respondentCount));
  const weekday = (day: number) => new Intl.DateTimeFormat("es-CO", { weekday: "long", timeZone: "UTC" })
    .format(new Date(Date.UTC(year, month - 1, day)));

  return (
    <ChartCard eyebrow="Volumen diario" title="Calificaciones por día">
      <p className="mt-1 text-xs text-slate-500">Cantidad de encuestas recibidas cada día durante el mes seleccionado.</p>
      <div className="mt-6 flex h-60 items-end gap-2 overflow-x-auto border-b border-l border-slate-300 px-4 pt-14">
        {rows.map((row) => {
          const day = Number(row.label);
          const height = Math.max(3, (row.respondentCount / maximum) * 100);
          const active = pinnedLabel === row.label;
          return (
            <button className="group flex h-full min-w-16 flex-1 flex-col items-center justify-end outline-none" key={row.label} onClick={() => setPinnedLabel(active ? "" : row.label)}>
              <span className="relative flex w-full max-w-20 items-end justify-center" style={{ height: `${height}%` }}>
                <ChartTooltip pinned={active}>{weekday(day)} {day}: {formatNumber(row.respondentCount)} calificaciones · NPS {formatSigned(row.nps)}</ChartTooltip>
                <span className="absolute -top-6 text-[10px] font-extrabold tabular-nums text-[#17364d]">{formatNumber(row.respondentCount)}</span>
                <span className={`nps-chart-bar block h-full w-full rounded-t-md bg-gradient-to-b from-[#d9f41c] to-[#b9d500] transition duration-300 group-hover:brightness-105 ${active ? "ring-2 ring-[#0b2235] ring-offset-2" : ""}`} />
              </span>
              <span className="mt-2 max-w-16 truncate text-[9px] font-bold capitalize text-slate-600">{weekday(day)}</span>
              <span className="text-xs font-extrabold text-[#17364d]">{day}</span>
            </button>
          );
        })}
      </div>
    </ChartCard>
  );
}

function ScoreChart({ rows }: { rows: ScoreRow[] }) {
  const maximum = Math.max(1, ...rows.map((row) => row.count));
  return (
    <ChartCard eyebrow="Volumen de respuestas" title="Distribución de calificaciones">
      <div className="mt-6 flex h-64 items-end gap-3 overflow-x-auto border-b border-l border-slate-300 px-4 pt-14">
        {rows.map((row) => {
          const tone = row.score >= 9 ? "bg-[#258578]" : row.score >= 7 ? "bg-[#d7a138]" : "bg-[#c95850]";
          const height = Math.max(3, (row.count / maximum) * 100);
          return (
            <button className="group flex h-full min-w-12 flex-1 flex-col items-center justify-end outline-none" key={row.score}>
              <span className="relative flex w-full max-w-14 items-end justify-center" style={{ height: `${height}%` }}>
                <ChartTooltip>Score {row.score}: {formatNumber(row.count)} encuestas · {row.percentage.toLocaleString("es-CO")}%</ChartTooltip>
                <span className="absolute -top-5 text-[9px] font-bold text-[#28485d]">{formatNumber(row.count)}</span>
                <span className={`block h-full w-full rounded-t transition duration-300 group-hover:brightness-110 ${tone}`} />
              </span>
              <span className="mt-2 text-[10px] font-bold text-slate-600">{row.score}</span>
            </button>
          );
        })}
      </div>
      <div className="mt-4 flex flex-wrap gap-4 text-[10px] font-semibold text-slate-500"><Legend color="bg-[#c95850]" label="Detractores (0–6)" /><Legend color="bg-[#d7a138]" label="Pasivos (7–8)" /><Legend color="bg-[#258578]" label="Promotores (9–10)" /></div>
    </ChartCard>
  );
}

function DriverChart({ eyebrow, rows, title, variant }: { eyebrow: string; rows: Driver[]; title: string; variant: "list" | "grid" }) {
  const visible = rows.slice(0, variant === "list" ? 6 : 8);
  const maximum = Math.max(1, ...visible.map((row) => row.percentage));
  return (
    <ChartCard eyebrow={eyebrow} title={title}>
      {visible.length ? (
        <div className={variant === "grid" ? "mt-8 grid gap-x-6 gap-y-5 sm:grid-cols-2" : "mt-8 space-y-6"}>
          {visible.map((row, index) => (
            <div className="group px-2" key={row.label}>
              <div className="mb-2 flex items-start justify-between gap-4">
                <span className="text-[13px] font-medium leading-5 text-[#25435b]">{row.label}</span>
                <strong className="shrink-0 text-sm font-extrabold tabular-nums text-[#071f33]">{row.percentage.toLocaleString("es-CO")}%</strong>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-[#edf2f6]">
                <span
                  className="block h-full rounded-full transition-[width,filter] duration-300 group-hover:brightness-110"
                  style={{
                    background: index === 0 && variant === "grid" ? "#df952e" : "#356b8e",
                    width: `${Math.max(3, (row.percentage / maximum) * 96)}%`,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      ) : <EmptyState />}
    </ChartCard>
  );
}

function DriverContribution({ rows }: { rows: Driver[] }) {
  const visible = rows.slice(0, 8);
  const total = visible.reduce((sum, row) => sum + row.percentage, 0);
  return (
    <ChartCard eyebrow="Contribución acumulada" title="% Primary Driver">
      {visible.length ? <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{visible.map((row, index) => {
        const cumulative = visible.slice(0, index + 1).reduce((sum, item) => sum + item.percentage, 0);
        return <div className="group rounded-lg border border-[#d8e2e8] bg-[#f9fbfc] p-3 transition hover:border-[#9ebac7] hover:bg-white" key={row.label}><div className="mb-2 flex items-start justify-between gap-3"><span className="truncate text-[11px] font-semibold text-[#25435b]" title={row.label}>{row.label}</span><strong className="shrink-0 text-xs tabular-nums text-[#071f33]">{row.percentage.toLocaleString("es-CO")}%</strong></div><div className="h-1.5 overflow-hidden rounded-full bg-[#e8eef2]"><span className="nps-chart-bar block h-full rounded-full bg-gradient-to-r from-[#e5a226] to-[#f2c500]" style={{ width: `${Math.max(3, row.percentage)}%` }} /></div><div className="mt-2 flex justify-between gap-2 text-[8px] font-bold uppercase tracking-[.06em] text-slate-400"><span>{formatNumber(row.count)} menciones</span><span>Acum. {cumulative.toLocaleString("es-CO")}%</span></div></div>;
      })}<div className="rounded-lg border border-[#a7d4cf] bg-[#edf8f7] px-4 py-2.5 sm:col-span-2 xl:col-span-4"><div className="flex items-center justify-between gap-4"><span className="text-[10px] font-extrabold uppercase tracking-[.1em] text-[#087f78]">Cobertura de los drivers visibles</span><strong className="text-xl text-[#071f33]">{total.toLocaleString("es-CO")}%</strong></div></div></div> : <EmptyState />}
    </ChartCard>
  );
}

function SegmentBarChart({ eyebrow, onSelect, rows, title }: { eyebrow: string; onSelect?: (row: Group) => void; rows: Group[]; title: string }) {
  const [page, setPage] = useState(0);
  const [pinnedLabel, setPinnedLabel] = useState("");
  const visible = [...rows].sort((a, b) => b.nps - a.nps);
  const pageSize = 8;
  const pageCount = Math.max(1, Math.ceil(visible.length / pageSize));
  const currentPage = Math.min(page, pageCount - 1);
  const pageRows = visible.slice(currentPage * pageSize, (currentPage + 1) * pageSize);
  const firstVisible = visible.length ? currentPage * pageSize + 1 : 0;
  const lastVisible = Math.min((currentPage + 1) * pageSize, visible.length);
  return (
    <ChartCard eyebrow={eyebrow} title={title}>
      {visible.length ? (
        <div className="mt-7 min-w-0 pb-1">
          <div className="mb-3 flex flex-wrap gap-4 text-[9px] font-bold text-slate-500"><Legend color="bg-emerald-500" label="Alto ≥ 75" /><Legend color="bg-yellow-400" label="Medio 60–74,9" /><Legend color="bg-red-500" label="Bajo < 60" /></div>
          <div className="relative flex h-72 w-full min-w-0 items-end gap-2 border-b border-l border-[#cbd9e3] bg-[repeating-linear-gradient(to_bottom,transparent_0,transparent_calc(25%_-_1px),#e4ebef_25%)] px-3 pt-4">
            {pageRows.map((row) => (
              <button className="group relative flex h-full min-w-0 flex-1 flex-col items-center justify-end outline-none" key={row.label} onClick={() => { setPinnedLabel(pinnedLabel === row.label ? "" : row.label); onSelect?.(row); }}>
                <span className="mb-2 text-[9px] font-extrabold tabular-nums text-[#17364d]">{formatSigned(row.nps)}%</span>
                <span
                  className={`nps-chart-bar w-[82%] max-w-20 rounded-t-md transition duration-300 group-hover:-translate-y-1 group-hover:brightness-105 ${pinnedLabel === row.label ? "ring-2 ring-[#0b2235] ring-offset-2" : ""}`}
                  style={{
                    background: row.nps >= 75 ? "linear-gradient(180deg,#34d399,#079669)" : row.nps >= 60 ? "linear-gradient(180deg,#fde047,#eab308)" : "linear-gradient(180deg,#fb7185,#dc2626)",
                    height: `${Math.max(5, ((row.nps + 100) / 200) * 86)}%`,
                  }}
                />
                <span className="mt-2 h-7 w-full overflow-hidden px-1 text-center text-[9px] font-semibold leading-3 text-[#496579]" title={row.label}>{row.label.replace(/^CD /, "")}</span>
                <ChartTooltip pinned={pinnedLabel === row.label}>{row.label}: NPS {formatSigned(row.nps)} · {formatNumber(row.respondentCount)} encuestas</ChartTooltip>
              </button>
            ))}
          </div>
          <div className="mt-3 flex items-center justify-between gap-3">
            <span className="text-[10px] font-semibold text-slate-500">Mostrando {firstVisible}–{lastVisible} de {visible.length}</span>
            <div className="flex items-center gap-2">
              <button className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-[10px] font-bold text-[#25435b] transition hover:border-[#176b73] disabled:cursor-not-allowed disabled:opacity-40" disabled={currentPage === 0} onClick={() => { setPinnedLabel(""); setPage((value) => Math.max(0, value - 1)); }} type="button">Anterior</button>
              <span className="min-w-12 text-center text-[10px] font-extrabold text-[#17364d]">{currentPage + 1}/{pageCount}</span>
              <button className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-[10px] font-bold text-[#25435b] transition hover:border-[#176b73] disabled:cursor-not-allowed disabled:opacity-40" disabled={currentPage >= pageCount - 1} onClick={() => { setPinnedLabel(""); setPage((value) => Math.min(pageCount - 1, value + 1)); }} type="button">Siguiente</button>
            </div>
          </div>
        </div>
      ) : <EmptyState />}
    </ChartCard>
  );
}

function ManagementDonut({ rows }: { rows: Group[] }) {
  const visible = rows.slice(0, 6);
  const colors = ["#315f82", "#177b80", "#bd8b2c", "#77547a", "#4f8e68", "#d46b4d"];
  const totalResponses = visible.reduce((sum, row) => sum + row.respondentCount, 0);
  const globalNps = totalResponses
    ? visible.reduce((sum, row) => sum + row.nps * row.respondentCount, 0) / totalResponses
    : 0;
  const stops = visible.map((row, index) => {
    const start = totalResponses
      ? (visible.slice(0, index).reduce((sum, item) => sum + item.respondentCount, 0) / totalResponses) * 100
      : 0;
    const end = totalResponses ? start + (row.respondentCount / totalResponses) * 100 : 0;
    return `${colors[index % colors.length]} ${start}% ${end}%`;
  }).join(", ");

  return (
    <ChartCard eyebrow="Comparativo organizacional" title="NPS por gerencia">
      {visible.length ? (
        <div className="mt-7 grid min-h-64 items-center gap-7 rounded-xl border border-[#d8e2e8] bg-[#f9fbfc] p-5 sm:grid-cols-[220px_minmax(0,1fr)]">
          <div className="relative mx-auto grid h-44 w-44 place-items-center rounded-full" style={{ background: `conic-gradient(${stops})` }}>
            <div className="grid h-28 w-28 place-items-center rounded-full bg-white text-center shadow-[0_0_0_1px_rgba(203,217,227,.45)]">
              <div><strong className="text-3xl font-semibold text-[#071f33]">{formatSigned(globalNps)}</strong><p className="mt-1 text-[8px] font-extrabold uppercase tracking-[.08em] text-slate-400">NPS global</p></div>
            </div>
          </div>
          <div className="space-y-4">
            {visible.map((row, index) => (
              <div className="grid grid-cols-[12px_minmax(0,1fr)_auto] items-center gap-3 text-xs" key={row.label}>
                <span className="h-3 w-3 rounded-full" style={{ background: colors[index % colors.length] }} />
                <span className="truncate font-medium text-[#25435b]" title={row.label}>{row.label.replace(/^CO /, "")}</span>
                <strong className="tabular-nums text-[#071f33]">{formatSigned(row.nps)}%</strong>
              </div>
            ))}
          </div>
        </div>
      ) : <EmptyState />}
    </ChartCard>
  );
}

function MonthlyDetractorChart({ rows }: { rows: Group[] }) {
  const [pinnedLabel, setPinnedLabel] = useState("");
  const maximum = Math.max(1, ...rows.map((row) => row.detractors));
  const width = 920;
  const height = 270;
  const paddingX = 50;
  const top = 30;
  const bottom = 45;
  const slot = (width - paddingX * 2) / Math.max(1, rows.length);
  const points = rows.map((row, index) => ({
    ...row,
    x: paddingX + slot * index + slot / 2,
    y: top + ((100 - row.nps) / 200) * (height - top - bottom),
  }));
  return (
    <ChartCard eyebrow="Seguimiento de alertas" title="Detractores por mes">
      {rows.length ? <>
        <div className="mt-5 flex gap-5 text-[10px] font-semibold text-[#527180]"><Legend color="bg-[#e5524b]" label="Total detractores" /><Legend color="bg-[#243ba5]" label="NPS" /></div>
        <div className="mt-2 overflow-x-auto">
          <svg aria-label="Detractores y NPS por mes" className="min-w-[760px]" role="img" viewBox={`0 0 ${width} ${height}`}>
            <line stroke="#cbd9e3" x1={paddingX} x2={width - paddingX} y1={height - bottom} y2={height - bottom} />
            {rows.map((row, index) => {
              const barHeight = Math.max(8, (row.detractors / maximum) * (height - top - bottom - 20));
              const x = paddingX + slot * index + slot * .16;
              const barWidth = slot * .68;
              return <g className="cursor-pointer" key={row.label} onClick={() => setPinnedLabel(pinnedLabel === row.label ? "" : row.label)}><rect fill={row.detractors / maximum >= .75 ? "#ef4444" : row.detractors / maximum >= .45 ? "#e79522" : "#22c55e"} height={barHeight} rx="3" stroke={pinnedLabel === row.label ? "#071f33" : "none"} strokeWidth="3" width={barWidth} x={x} y={height - bottom - barHeight}><title>{`${row.label}: ${formatNumber(row.detractors)} detractores · clic para fijar`}</title></rect><text fill="#071f33" fontSize="10" fontWeight="800" textAnchor="middle" x={x + barWidth / 2} y={height - bottom - barHeight - 7}>{formatNumber(row.detractors)}</text><text fill="#17364d" fontSize="10" fontWeight="700" textAnchor="middle" x={x + barWidth / 2} y={height - 25}>{row.label}</text></g>;
            })}
            <path className="nps-chart-line" d={smoothPath(points)} fill="none" stroke="#243ba5" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" />
            {points.map((point) => <g className="cursor-pointer" key={point.label} onClick={() => setPinnedLabel(pinnedLabel === point.label ? "" : point.label)}><circle className="nps-chart-point" cx={point.x} cy={point.y} fill="#243ba5" r={pinnedLabel === point.label ? 7 : 5}><title>{`${point.label}: NPS ${formatSigned(point.nps)} · clic para fijar`}</title></circle><text fill="#17255f" fontSize="9" fontWeight="800" textAnchor="middle" x={point.x} y={Math.max(12, point.y - 10)}>{formatSigned(point.nps)}%</text></g>)}
            {points.find((point) => point.label === pinnedLabel) ? <PinnedSvgTooltip color="#243ba5" height={height} onClose={() => setPinnedLabel("")} point={points.find((point) => point.label === pinnedLabel)!} width={width} /> : null}
          </svg>
        </div>
      </> : <EmptyState />}
    </ChartCard>
  );
}

type CdPoint = Group & { latitude: number; longitude: number };
type ClientCoordinate = { codigo: string; latitude: number; longitude: number; rawLatitude: number; rawLongitude: number };
type MapPoint = { label: string; latitude: number; longitude: number };

const CD_LOCATIONS: Record<string, { latitude: number; longitude: number }> = {
  "CD Galapa": { latitude: 10.92614, longitude: -74.84523 },
  "CD La Arenosa": { latitude: 10.97439, longitude: -74.7721 },
};

const MAP_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    openStreetMap: {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      maxzoom: 19,
      attribution: "© OpenStreetMap contributors",
    },
  },
  layers: [{ id: "open-street-map", type: "raster", source: "openStreetMap" }],
};

function CdMapPanel({ rows }: { rows: Group[] }) {
  const points: CdPoint[] = rows.flatMap((row) => {
    const location = CD_LOCATIONS[row.label];
    return location ? [{ ...row, ...location }] : [];
  });
  const [selectedLabel, setSelectedLabel] = useState("");
  const [clientCode, setClientCode] = useState("");
  const [clientCoordinate, setClientCoordinate] = useState<ClientCoordinate | null>(null);
  const [coordinateError, setCoordinateError] = useState("");
  const [searchingCoordinate, setSearchingCoordinate] = useState(false);
  const selected = points.find((point) => point.label === selectedLabel) || points[0];
  const mapPoint: MapPoint | undefined = clientCoordinate
    ? { label: `Cliente ${clientCoordinate.codigo}`, latitude: clientCoordinate.latitude, longitude: clientCoordinate.longitude }
    : selected;

  async function searchClientCoordinate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const codigo = clientCode.replace(/\D/g, "");
    if (!codigo) return;
    setSearchingCoordinate(true);
    setCoordinateError("");
    try {
      const response = await fetch(`/api/people/coordinates?codigo=${encodeURIComponent(codigo)}`, { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "No se pudieron consultar las coordenadas.");
      if (!body.coordinate) throw new Error(body.hint || "No se encontraron coordenadas para ese cliente.");
      setClientCoordinate(body.coordinate as ClientCoordinate);
    } catch (caught) {
      setClientCoordinate(null);
      setCoordinateError(caught instanceof Error ? caught.message : "No se encontraron coordenadas.");
    } finally {
      setSearchingCoordinate(false);
    }
  }

  return (
    <article className="overflow-hidden rounded-xl border border-slate-300 bg-white shadow-sm">
      <div className="grid gap-4 border-b border-slate-200 px-5 py-4 lg:grid-cols-[minmax(0,1fr)_460px] lg:items-end">
        <div><p className="text-[9px] font-bold uppercase tracking-[.16em] text-[#527180]">Distribución geográfica</p><h2 className="mt-1 text-lg font-semibold text-[#0b2235]">NPS, encuestas y ubicación de clientes</h2><p className="mt-1 text-xs text-slate-500">Selecciona un CD o busca un código de cliente para centrar el mapa.</p></div>
        <form className="flex gap-2" onSubmit={searchClientCoordinate}>
          <label className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-xl border border-[#cbd9e3] bg-[#f8fafb] px-3 focus-within:border-[#159b94] focus-within:ring-2 focus-within:ring-[#159b94]/10"><Search className="shrink-0 text-[#527180]" size={16} /><input aria-label="Código del cliente" className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-[#0b2235] outline-none placeholder:font-normal placeholder:text-slate-400" inputMode="numeric" onChange={(event) => setClientCode(event.target.value.replace(/\D/g, ""))} placeholder="Código del cliente" value={clientCode} /></label>
          <button className="h-11 rounded-xl bg-[#0b2235] px-5 text-xs font-bold text-white transition hover:bg-[#176b73] disabled:cursor-wait disabled:opacity-60" disabled={searchingCoordinate} type="submit">{searchingCoordinate ? "Buscando…" : "Buscar"}</button>
        </form>
        {coordinateError ? <p className="text-xs font-semibold text-red-600 lg:col-start-2">{coordinateError}</p> : null}
      </div>
      {mapPoint ? (
        <div className="grid min-h-[580px] xl:grid-cols-[minmax(0,1fr)_390px]">
          <div className="relative min-h-[520px] overflow-hidden bg-[#dcecf3] xl:min-h-[580px]">
            <CdMap point={mapPoint} />
            <div className="pointer-events-none absolute left-4 top-4 rounded-xl border border-white/70 bg-white/95 px-4 py-3 shadow-lg backdrop-blur">
              <div className="flex items-start gap-3">
                <span className="grid h-9 w-9 place-items-center rounded-lg bg-[#176b73] text-white"><MapPinned size={18} /></span>
                <div>
                  <p className="text-[9px] font-bold uppercase tracking-[.12em] text-[#b36b16]">{clientCoordinate ? "Cliente localizado" : "Centro seleccionado"}</p>
                  <p className="mt-0.5 font-semibold text-[#0b2235]">{mapPoint.label}</p>
                  {!clientCoordinate && selected ? <p className="mt-1 text-xs text-slate-500">{formatNumber(selected.respondentCount)} encuestas · NPS {formatSigned(selected.nps)}</p> : null}
                  <div className="mt-2 flex gap-2 font-mono text-[10px] font-semibold tabular-nums text-[#25435b]">
                    <span className="rounded-md bg-[#eaf2f4] px-2 py-1">Lat: {mapPoint.latitude.toFixed(6)}</span>
                    <span className="rounded-md bg-[#eaf2f4] px-2 py-1">Lon: {mapPoint.longitude.toFixed(6)}</span>
                  </div>
                </div>
              </div>
            </div>
            <a className="absolute bottom-4 left-4 inline-flex items-center gap-1.5 rounded-lg border border-white/70 bg-white/95 px-3 py-2 text-[10px] font-semibold text-[#176b73] shadow-md" href={`https://www.openstreetmap.org/?mlat=${mapPoint.latitude}&mlon=${mapPoint.longitude}#map=16/${mapPoint.latitude}/${mapPoint.longitude}`} rel="noreferrer" target="_blank"><Navigation size={13} />Abrir mapa</a>
          </div>
          <div className="flex min-h-0 flex-col border-t border-slate-200 xl:border-l xl:border-t-0">
            <div className="bg-gradient-to-r from-[#0b2235] to-[#176b73] px-4 py-3.5 text-white"><p className="text-[8px] font-bold uppercase tracking-[.16em] text-white/60">Detalle territorial</p><div className="mt-0.5 flex items-center justify-between gap-3"><h3 className="font-semibold">Encuestas por CD</h3><span className="rounded-md border border-white/20 bg-white/10 px-2 py-1 text-[9px] font-bold">{points.length} centros</span></div></div>
            <div className="grid grid-cols-[minmax(0,1fr)_90px_82px] border-b border-slate-200 bg-[#edf2f5] px-3 py-2.5 text-[9px] font-bold uppercase tracking-[.1em] text-slate-500"><span>CD</span><span className="text-center">Encuestas</span><span className="text-right">NPS</span></div>
            <div className="flex-1 bg-[#f8fafb]">
              {points.map((point) => {
                const active = selected.label === point.label;
                return <button aria-pressed={active && !clientCoordinate} className={`grid w-full grid-cols-[minmax(0,1fr)_90px_82px] items-center border-b px-3 py-3 text-left text-xs transition ${active && !clientCoordinate ? "border-[#9dcfc8] bg-[#dcefed] shadow-[inset_4px_0_0_#176b73]" : "border-slate-100 bg-white hover:bg-[#eef7f6]"}`} key={point.label} onClick={() => { setClientCoordinate(null); setCoordinateError(""); setSelectedLabel(point.label); }}><strong className="text-[#0b2235]">{point.label}</strong><span className="justify-self-center rounded-md border border-slate-200 bg-white px-2 py-1 font-bold tabular-nums text-slate-600">{formatNumber(point.respondentCount)}</span><span className={`justify-self-end rounded-md px-2 py-1 font-bold tabular-nums ${point.nps >= 50 ? "bg-emerald-50 text-emerald-700" : point.nps >= 0 ? "bg-amber-50 text-amber-700" : "bg-red-50 text-red-700"}`}>{formatSigned(point.nps)}</span></button>;
              })}
            </div>
          </div>
        </div>
      ) : <EmptyState />}
    </article>
  );
}

function CdMap({ point }: { point: MapPoint }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMapInstance | null>(null);
  const markerRef = useRef<MapLibreMarker | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const initialPointRef = useRef(point);
  const [mapError, setMapError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function initialize() {
      try {
        const { AttributionControl, Map, Marker, NavigationControl } = await import("maplibre-gl");
        if (cancelled || !containerRef.current) return;
        const initial = initialPointRef.current;
        const map = new Map({
          attributionControl: false,
          center: [initial.longitude, initial.latitude],
          container: containerRef.current,
          maxZoom: 19,
          style: MAP_STYLE,
          transformRequest: (url) => ({ url: clampOpenStreetMapTileUrl(url) }),
          zoom: 12.5,
        });
        map.setMaxZoom(19);
        map.on("error", () => undefined);
        const marker = new Marker({ color: "#176b73", scale: 1.15 }).setLngLat([initial.longitude, initial.latitude]).addTo(map);
        map.addControl(new NavigationControl({ showCompass: false }), "bottom-right");
        map.addControl(new AttributionControl({ compact: true }), "bottom-left");
        mapRef.current = map;
        markerRef.current = marker;
        resizeObserverRef.current = new ResizeObserver(() => map.resize());
        resizeObserverRef.current.observe(containerRef.current);
        requestAnimationFrame(() => map.resize());
      } catch {
        if (!cancelled) setMapError("No se pudo cargar el mapa.");
      }
    }
    void initialize();
    return () => {
      cancelled = true;
      markerRef.current?.remove();
      resizeObserverRef.current?.disconnect();
      mapRef.current?.remove();
      markerRef.current = null;
      resizeObserverRef.current = null;
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    markerRef.current?.setLngLat([point.longitude, point.latitude]);
    mapRef.current?.flyTo({ center: [point.longitude, point.latitude], duration: 1000, essential: true, zoom: point.label.startsWith("Cliente") ? 16 : 13 });
  }, [point]);

  return mapError ? <div className="absolute inset-0 grid place-items-center bg-[#eaf1f4] text-sm font-semibold text-slate-500">{mapError}</div> : <div aria-label={`Mapa de ${point.label}`} className="absolute inset-0 h-full w-full" ref={containerRef} role="img" />;
}

function clampOpenStreetMapTileUrl(url: string) {
  const match = url.match(/^(https:\/\/tile\.openstreetmap\.org\/)(\d+)\/(\d+)\/(\d+)\.png(\?.*)?$/);
  if (!match) return url;
  const zoom = Number(match[2]);
  if (zoom <= 19) return url;
  const scale = 2 ** (zoom - 19);
  const x = Math.floor(Number(match[3]) / scale);
  const y = Math.floor(Number(match[4]) / scale);
  return `${match[1]}19/${x}/${y}.png${match[5] || ""}`;
}

function DetractorExplorer({ rows, strata }: { rows: Detractor[]; strata: Group[] }) {
  const [selection, setSelection] = useState<{ type: "com" | "score" | "stratum"; value: string } | null>(null);
  const [comPage, setComPage] = useState(0);
  const byCom = Array.from(new Set(rows.map((row) => row.com || "Sin COM"))).map((com) => ({
    label: com,
    rows: rows.filter((row) => (row.com || "Sin COM") === com),
  })).sort((a, b) => b.rows.length - a.rows.length);
  const comPageSize = 5;
  const comPageCount = Math.max(1, Math.ceil(byCom.length / comPageSize));
  const currentComPage = Math.min(comPage, comPageCount - 1);
  const visibleComs = byCom.slice(currentComPage * comPageSize, (currentComPage + 1) * comPageSize);
  const firstVisibleCom = byCom.length ? currentComPage * comPageSize + 1 : 0;
  const lastVisibleCom = Math.min((currentComPage + 1) * comPageSize, byCom.length);
  const byScore = Array.from({ length: 7 }, (_, score) => ({
    label: String(score),
    rows: rows.filter((row) => row.score === score),
  })).filter((item) => item.rows.length);
  const maximumCom = Math.max(1, ...byCom.map((item) => item.rows.length));
  const maximumScore = Math.max(1, ...byScore.map((item) => item.rows.length));
  const selectedRows = selection
    ? rows.filter((row) => selection.type === "com"
      ? (row.com || "Sin COM") === selection.value
      : selection.type === "stratum"
        ? (row.stratum || "Sin estrato") === selection.value
        : String(row.score) === selection.value)
    : [];

  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-3">
        <ChartCard eyebrow="Detalle operativo" title="Clientes detractores por COM">
          {byCom.length ? <><div className="mt-7 space-y-3">{visibleComs.map((item, index) => {
            const active = selection?.type === "com" && selection.value === item.label;
            return (
              <button className={`group block w-full rounded-xl border p-3 text-left transition ${active ? "border-[#159b94] bg-[#edf8f7] shadow-[0_0_0_2px_rgba(21,155,148,.10)]" : "border-[#d8e2e8] bg-[#f9fbfc] hover:border-[#aac4d1]"}`} key={`${item.label}:${currentComPage * comPageSize + index}`} onClick={() => setSelection(active ? null : { type: "com", value: item.label })}>
                <span className="mb-2 flex items-center justify-between gap-3 text-xs"><strong className="text-[#17364d]">{item.label}</strong><span className="rounded-md border border-red-200 bg-red-50 px-2 py-1 font-extrabold text-red-600">{item.rows.length}</span></span>
                <span className="block h-2 overflow-hidden rounded-full bg-[#edf2f6]"><i className="block h-full rounded-full bg-[#356b8e] transition-all group-hover:brightness-110" style={{ width: `${Math.max(4, (item.rows.length / maximumCom) * 100)}%` }} /></span>
              </button>
            );
          })}</div><div className="mt-4 flex items-center justify-between gap-2"><span className="text-[9px] font-semibold text-slate-500">{firstVisibleCom}–{lastVisibleCom} de {byCom.length}</span><div className="flex items-center gap-1.5"><button className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-[9px] font-bold text-[#25435b] disabled:opacity-40" disabled={currentComPage === 0} onClick={() => { setSelection(null); setComPage((value) => Math.max(0, value - 1)); }} type="button">Anterior</button><span className="min-w-9 text-center text-[9px] font-extrabold text-[#17364d]">{currentComPage + 1}/{comPageCount}</span><button className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-[9px] font-bold text-[#25435b] disabled:opacity-40" disabled={currentComPage >= comPageCount - 1} onClick={() => { setSelection(null); setComPage((value) => Math.min(comPageCount - 1, value + 1)); }} type="button">Siguiente</button></div></div></> : <EmptyState />}
        </ChartCard>
        <ChartCard eyebrow="Severidad de la experiencia" title="Clientes detractores por score">
          {byScore.length ? <div className="mt-7 flex h-64 items-end gap-3 border-b border-l border-[#cbd9e3] px-4">{byScore.map((item) => {
            const active = selection?.type === "score" && selection.value === item.label;
            return (
              <button className="group relative flex h-full min-w-12 flex-1 flex-col items-center justify-end" key={item.label} onClick={() => setSelection(active ? null : { type: "score", value: item.label })}>
                <span className="mb-2 text-[10px] font-extrabold text-[#17364d]">{item.rows.length}</span>
                <span className={`w-full max-w-16 rounded-t-md transition group-hover:brightness-105 ${active ? "ring-2 ring-[#0b2235] ring-offset-2" : ""}`} style={{ background: "linear-gradient(180deg,#fb7185,#dc2626)", height: `${Math.max(8, (item.rows.length / maximumScore) * 82)}%` }} />
                <span className="mt-2 text-[10px] font-extrabold text-slate-500">Score {item.label}</span>
              </button>
            );
          })}</div> : <EmptyState />}
        </ChartCard>
        <SegmentBarChart eyebrow="Segmentación territorial" onSelect={(row) => setSelection({ type: "stratum", value: row.label })} rows={strata} title="NPS por estrato de zona de negocio" />
      </div>
      {selection ? <DetractorTable rows={selectedRows} selectionLabel={selection.type === "score" ? `Score ${selection.value}` : selection.type === "stratum" ? `Estrato ${selection.value}` : selection.value} /> : <div className="rounded-xl border border-dashed border-[#b9cbd5] bg-white/60 px-5 py-6 text-center text-xs font-semibold text-slate-500">Selecciona un COM, score o estrato para ver los clientes detractores.</div>}
    </div>
  );
}

function DetractorTable({ rows, selectionLabel }: { rows: Detractor[]; selectionLabel: string }) {
  const visible = rows.slice(0, 20);
  const [clients, setClients] = useState<Record<string, DetractorClient>>({});

  useEffect(() => {
    const rowsToEnrich = rows.slice(0, 20);
    if (!rowsToEnrich.length) return;
    const controller = new AbortController();
    const codes = Array.from(new Set(rowsToEnrich.map((row) => normalizeClientCode(row.accountId)).filter(Boolean)));

    Promise.all(codes.map(async (code) => {
        const response = await fetch(`/api/clientes?codigo=${encodeURIComponent(code)}`, { cache: "no-store", signal: controller.signal });
        const body = await response.json().catch(() => ({}));
        return [code, body.cliente || {}] as const;
      })).then((clientRows) => {
      if (controller.signal.aborted) return;
      setClients(Object.fromEntries(clientRows));
    }).catch(() => undefined);

    return () => controller.abort();
  }, [rows]);

  return (
    <article className="overflow-hidden rounded-2xl border border-[#cbd9e3] bg-white shadow-[0_1px_3px_rgba(11,34,53,.10)]">
      <div className="flex items-start gap-4 border-b border-[#d8e2e8] px-5 py-4">
        <div><p className="text-[9px] font-extrabold uppercase tracking-[.18em] text-[#527180]">Detalle operativo seleccionado</p><h2 className="mt-1 text-xl font-semibold tracking-tight text-[#071f33]">Clientes detractores · {selectionLabel}</h2><p className="mt-1 text-[10px] text-slate-400">{visible.length} registros · cruce con clientes y seguimiento operativo</p></div>
      </div>
      <div className="overflow-x-auto">
        <table className="nps-data-table min-w-[1120px] w-full text-left text-xs">
          <thead><tr><Th>Año</Th><Th>Mes</Th><Th>Día</Th><Th>ID cliente</Th><Th>Cliente</Th><Th>COM</Th><Th>Último RR registrado</Th><Th>Última atención</Th><Th right>Score</Th></tr></thead>
          <tbody>
            {visible.map((row) => {
              const date = new Date(row.date);
              const code = normalizeClientCode(row.accountId);
              const client = clients[code];
              return (
                <tr key={`${row.accountId}:${row.date}`}>
                  <Td>{Number.isFinite(date.getTime()) ? date.getUTCFullYear() : "—"}</Td>
                  <Td>{Number.isFinite(date.getTime()) ? date.toLocaleDateString("es-CO", { month: "short", timeZone: "UTC" }).replace(".", "") : "—"}</Td>
                  <Td>{Number.isFinite(date.getTime()) ? date.getUTCDate() : "—"}</Td>
                  <Td strong>{row.accountId}</Td>
                  <Td strong>{client?.nombre || "Sin nombre registrado"}</Td>
                  <Td>{client?.com || "Sin COM"}</Td>
                  <Td>{row.lastRr || "Sin relación cliente–DT"}</Td>
                  <Td>{row.lastAttention ? formatDate(row.lastAttention) : "Sin registro"}</Td>
                  <Td right><span className="rounded-md border border-red-200 bg-red-50 px-3 py-1 font-extrabold text-red-600">{row.score}</span></Td>
                </tr>
              );
            })}
            {!visible.length ? <EmptyRow columns={9} /> : null}
          </tbody>
        </table>
      </div>
    </article>
  );
}

function SourceTable({ data }: { data: NpsData | null }) {
  const source = data?.source;
  return <DataTable title="Origen conectado"><thead><tr><Th>Tabla</Th><Th right>Filas</Th><Th right>Encuestas únicas</Th><Th right>Columnas</Th><Th>Periodo</Th><Th>Estado</Th></tr></thead><tbody><tr><Td strong>{source?.table || "NPS"}</Td><Td right>{formatNumber(source?.rawRowCount || 0)}</Td><Td right>{formatNumber(source?.respondentCount || 0)}</Td><Td right>{source?.columns || 11}</Td><Td>{formatDate(source?.minDate)} – {formatDate(source?.maxDate)}</Td><Td><span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-1 font-bold text-emerald-700"><CheckCircle2 size={13} />Activa</span></Td></tr></tbody></DataTable>;
}

function DataTable({ children, title, wide = false }: { children: ReactNode; title: string; wide?: boolean }) {
  return <article className="overflow-hidden rounded-xl border border-slate-300 bg-white shadow-sm"><div className="border-b border-slate-200 px-5 py-4"><h2 className="text-lg font-semibold text-[#0b2235]">{title}</h2></div><div className="overflow-x-auto"><table className={`nps-data-table w-full text-left text-sm ${wide ? "min-w-[1100px]" : "min-w-[620px]"}`}>{children}</table></div></article>;
}

function Th({ children, right = false }: { children: ReactNode; right?: boolean }) { return <th className={`px-4 py-3 text-[9px] uppercase tracking-[.08em] ${right ? "text-right" : ""}`}>{children}</th>; }
function Td({ children, right = false, strong = false }: { children: ReactNode; right?: boolean; strong?: boolean }) { return <td className={`px-4 py-3 ${right ? "text-right tabular-nums" : ""} ${strong ? "font-semibold text-[#18334a]" : "text-slate-600"}`}>{children}</td>; }
function EmptyRow({ columns }: { columns: number }) { return <tr><td className="px-5 py-10 text-center text-slate-400" colSpan={columns}>No hay datos para los filtros seleccionados.</td></tr>; }
function EmptyState() { return <div className="grid h-56 place-items-center text-sm text-slate-400">No hay datos para los filtros seleccionados.</div>; }
function ChartCard({ children, eyebrow, title }: { children: ReactNode; eyebrow: string; title: string }) { return <article className="rounded-2xl border border-[#cbd9e3] bg-white p-5 shadow-[0_1px_3px_rgba(11,34,53,.10)] sm:p-6"><div><p className="text-[9px] font-extrabold uppercase tracking-[.18em] text-[#527180]">{eyebrow}</p><h2 className="mt-1.5 text-xl font-semibold tracking-tight text-[#071f33]">{title}</h2></div>{children}</article>; }
function ChartTooltip({ children, pinned = false }: { children: ReactNode; pinned?: boolean }) { return <span className={`pointer-events-none absolute left-1/2 top-0 z-30 min-w-max -translate-x-1/2 -translate-y-[110%] rounded-lg bg-[#0b2235] px-3 py-2 text-[9px] font-semibold text-white shadow-xl ${pinned ? "block" : "hidden group-hover:block group-focus:block group-focus-within:block"}`}>{children}<small className="mt-0.5 block text-[7px] font-medium text-[#9bb0bf]">{pinned ? "Fijado · clic para cerrar" : "Clic para fijar"}</small></span>; }
function PinnedSvgTooltip({ color, height, onClose, point, width }: { color: string; height: number; onClose: () => void; point: Group & { x: number; y: number }; width: number }) {
  const tooltipWidth = 138;
  const tooltipHeight = 72;
  const x = Math.max(6, Math.min(width - tooltipWidth - 6, point.x - tooltipWidth / 2));
  const y = point.y > 105 ? point.y - tooltipHeight - 16 : Math.min(height - tooltipHeight, point.y + 16);
  return <g className="cursor-pointer" onClick={onClose}><rect fill="#0b2235" height={tooltipHeight} rx="9" width={tooltipWidth} x={x} y={y} /><circle cx={x + 14} cy={y + 16} fill={color} r="4" /><text fill="#9bb0bf" fontSize="8" fontWeight="800" letterSpacing=".8" x={x + 24} y={y + 19}>{point.label.toUpperCase()}</text><text fill="#fff" fontSize="19" fontWeight="800" x={x + 12} y={y + 44}>{formatSigned(point.nps)}%</text><text fill="#9bb0bf" fontSize="7.5" fontWeight="600" x={x + 12} y={y + 61}>{formatNumber(point.respondentCount)} encuestas · clic para cerrar</text></g>;
}
function Legend({ color, label }: { color: string; label: string }) { return <span className="inline-flex items-center gap-1.5"><i className={`h-2.5 w-2.5 rounded-full ${color}`} />{label}</span>; }
function MetricCard({ detail, label, value }: { detail: string; label: string; value: string }) { return <article className="relative overflow-hidden rounded-xl border border-slate-300 bg-white p-4 shadow-sm"><span className="absolute inset-y-0 left-0 w-1 bg-[#176b73]" /><p className="text-3xl font-semibold text-[#0b2235]">{value}</p><div className="mt-2 flex items-end justify-between gap-2"><p className="text-[9px] font-bold uppercase tracking-[.12em] text-slate-500">{label}</p><p className="text-right text-[10px] font-semibold text-[#258578]">{detail}</p></div></article>; }
function RepositoryStat({ label, value }: { label: string; value: string }) { return <div className="border-b border-slate-200 px-5 py-3 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0"><p className="text-lg font-semibold tabular-nums text-[#0b2235]">{value}</p><p className="text-[9px] font-bold uppercase tracking-[.12em] text-slate-400">{label}</p></div>; }
function Filter({ children, label }: { children: ReactNode; label: string }) { return <label className="nps-filter"><span>{label}</span>{children}</label>; }
function NavLink({ children, href }: { children: ReactNode; href: string }) { return <a className="shrink-0 rounded-lg px-4 py-2 text-xs font-semibold text-slate-500 transition hover:bg-[#e7f1f2] hover:text-[#176b73]" href={href}>{children}</a>; }
function SectionHeader({ description, id, index, title }: { description: string; id: string; index: string; title: string }) { return <div className="scroll-mt-24 pt-4" id={id}><div className="flex items-center gap-4"><span className="grid h-9 w-9 place-items-center rounded-lg bg-[#0b2235] text-xs font-bold text-white">{index}</span><div><h2 className="text-lg font-semibold text-[#0b2235]">{title}</h2><p className="text-xs text-slate-500">{description}</p></div><span className="ml-auto hidden h-px flex-1 bg-gradient-to-r from-slate-300 to-transparent sm:block" /></div></div>; }
function Alert({ children, onClose }: { children: ReactNode; onClose: () => void }) { return <div className="flex items-center justify-between rounded-lg border border-red-200 bg-white px-4 py-3 text-sm font-semibold text-red-700"><span>{children}</span><button aria-label="Cerrar" onClick={onClose}><X size={16} /></button></div>; }
function Restricted({ message, onBack }: { message: string; onBack: () => void }) { return <main className="grid min-h-screen place-items-center bg-[#edf1f4] p-6"><section className="max-w-md rounded-xl border border-slate-300 bg-white p-7 text-center shadow-lg"><ShieldCheck className="mx-auto text-[#b64a43]" size={32} /><h1 className="mt-4 text-xl font-semibold text-[#0b2235]">NPS restringido</h1><p className="mt-2 text-sm text-slate-500">{message}</p><button className="mt-5 rounded-lg bg-[#0b2235] px-5 py-2.5 font-semibold text-white" onClick={onBack}>Volver</button></section></main>; }
function LoadingScreen({ detail, message }: { detail?: string; message: string }) { return <main className="grid min-h-screen place-items-center bg-[#edf1f4] p-6 text-[#16293a]"><section className="w-full max-w-md rounded-2xl border border-slate-300 bg-white p-8 text-center shadow-xl"><span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[#e8f2f3]"><i className="h-7 w-7 animate-spin rounded-full border-4 border-[#9cc9c5] border-t-[#176b73]" /></span><p className="mt-5 text-[10px] font-bold uppercase tracking-[.18em] text-[#176b73]">People Intelligence</p><h1 className="mt-2 text-lg font-semibold text-[#0b2235]">{message}</h1>{detail ? <p className="mt-2 text-sm leading-5 text-slate-500">{detail}</p> : null}</section></main>; }

function formatDate(value?: string | null) {
  if (!value) return "Sin datos";
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat("es-CO", { dateStyle: "medium" }).format(date) : "Sin datos";
}
function formatNumber(value: number) { return value.toLocaleString("es-CO"); }
function formatPercent(value: number, total: number) { return `${(total ? (value / total) * 100 : 0).toLocaleString("es-CO", { maximumFractionDigits: 1 })}%`; }
function formatSigned(value: number) { return `${value > 0 ? "+" : ""}${value.toLocaleString("es-CO", { maximumFractionDigits: 1 })}`; }
function normalizeClientCode(value: string) { return value.replace(/\D/g, "").replace(/^0+/, ""); }
function normalizeTextLabel(value: string) { return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, ""); }
function readCachedNpsReport() {
  try {
    const raw = sessionStorage.getItem(NPS_REPORT_CACHE_KEY);
    if (!raw) return null;
    const cached = JSON.parse(raw) as CachedNpsReport;
    if (!cached?.data || !cached?.filters || Date.now() - cached.storedAt > NPS_REPORT_CACHE_TTL_MS) {
      sessionStorage.removeItem(NPS_REPORT_CACHE_KEY);
      return null;
    }
    return cached;
  } catch {
    return null;
  }
}
function writeCachedNpsReport(report: CachedNpsReport) {
  try {
    sessionStorage.setItem(NPS_REPORT_CACHE_KEY, JSON.stringify(report));
  } catch {
    // El informe sigue funcionando aunque el navegador bloquee sessionStorage.
  }
}
