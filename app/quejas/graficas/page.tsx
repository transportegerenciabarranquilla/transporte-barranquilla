"use client";

import Link from "next/link";
import ComplaintDonutChart from "./ComplaintDonutChart";
import ComplaintChartCard from "./ComplaintChartCard";
import ComplaintRrModal from "./ComplaintRrModal";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, LoaderCircle, Upload } from "lucide-react";

import { type ComplaintRecord } from "../../lib/complaints";
import { complaintUploadContractor, isComplaintsContractor } from "../../lib/contractors";
import { complaintRrGroups, type ComplaintRrTracking } from "../../lib/complaintChartRr";
import { chartDate, complaintChartStatus, complaintClosureTotals, complaintStatusTotals, complaintWeekdays, groupComplaintChart, type ComplaintChartRow } from "../../lib/complaintCharts";

const inputClass = "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800";
const format = (value: number) => value.toLocaleString("es-CO");

function CountChart({ title, values, note, expandable = false, columns = false }: { title: string; values: Array<{ key?: string; label: string; count: number; dts?: string[]; complaints?: ComplaintChartRow[] }>; note?: string; expandable?: boolean; columns?: boolean }) {
  const [showAll, setShowAll] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const selected = values.find(value => (value.key ?? value.label) === selectedKey);
  const total = values.reduce((sum, value) => sum + value.count, 0);
  const maximum = Math.max(1, ...values.map(value => value.count));
  const tick = Math.max(1, Math.ceil(maximum / 4));
  const displayed = expandable && !showAll ? values.slice(0, 10) : values;
  const percentage = (count: number) => `${(total ? count / total * 100 : 0).toLocaleString("es-CO", { maximumFractionDigits: 1 })}%`;
  return <ComplaintChartCard title={title}>
    <div className="px-3 py-2">
      {columns ? <div className="mb-3 ml-7 mt-7">
        <div className="relative h-36 border-b border-slate-200">
          {[0, 1, 2, 3, 4].map(value => <div key={value} aria-hidden="true" className="pointer-events-none absolute inset-x-0 border-t border-dashed border-slate-200" style={{ bottom: `${value * 25}%` }}><span className="absolute right-full -translate-y-1/2 pr-2 text-[10px] tabular-nums text-slate-500">{format(value * tick)}</span></div>)}
          <div className="absolute inset-0 grid grid-cols-7 items-end gap-2">{values.map(value => <div key={value.label} className="flex h-full items-end justify-center"><div role="img" aria-label={`${value.label}: ${format(value.count)} quejas, ${percentage(value.count)}`} title={`${value.label}: ${format(value.count)} quejas (${percentage(value.count)})`} className="relative w-full max-w-12 rounded-t-md bg-[#0d9488]" style={{ height: `${value.count / (tick * 4) * 100}%` }}><span className="absolute -top-6 left-1/2 -translate-x-1/2 text-sm font-bold tabular-nums">{format(value.count)}</span></div></div>)}</div>
        </div>
        <div className="grid grid-cols-7 gap-2 pt-2 text-center text-[10px] sm:text-xs">{values.map(value => <div key={value.label} title={value.label}><span className="font-semibold">{value.label.slice(0, 3)}</span><span className="mt-1 block tabular-nums text-slate-500">{percentage(value.count)}</span></div>)}</div>
      </div> : <div className="max-h-[420px] overflow-y-auto">
        {displayed.map(value => {
          const contents = <>
            <span className="min-w-0"><span className="block truncate text-[13px] font-semibold" title={value.label}>{value.label}</span>{value.dts && <span className="block break-words text-[11px] font-medium leading-4 text-blue-800">{value.dts.length ? `DT: ${value.dts.join(", ")}` : "Sin DT"}</span>}<span className="block text-[11px] leading-4 text-slate-500">{percentage(value.count)} del total{expandable ? " · Ver quejas y clientes" : ""}</span></span>
            <span role="img" aria-label={`${value.label}: ${format(value.count)} quejas`} className="block h-6 overflow-hidden rounded-md bg-slate-100"><span className="block h-full rounded-md bg-[#2563eb]" style={{ width: `${value.count / maximum * 100}%` }} /></span>
            <strong className="text-right text-[13px] tabular-nums text-blue-800">{format(value.count)}</strong>
          </>;
          const rowClass = "grid min-h-[42px] grid-cols-[minmax(0,1fr)_minmax(0,1fr)_2.5rem] items-center gap-3 py-1";
          return expandable ? <button key={value.key ?? value.label} type="button"
            aria-haspopup="dialog" onClick={() => setSelectedKey(value.key ?? value.label)}
            className={rowClass + " w-full cursor-pointer rounded text-left hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-blue-600"}>{contents}</button>
            : <div key={value.label} className={rowClass}>{contents}</div>;
        })}
      </div>}
      <p className="mt-2 border-t border-slate-100 pt-2 text-[11px] leading-4 text-slate-500">{format(total)} quejas · {note}</p>
      {expandable && values.length > 10 && <button type="button" onClick={() => setShowAll(current => !current)} className="mt-2 min-h-8 text-xs font-semibold text-blue-800 hover:underline">{showAll ? "Mostrar las 10 principales" : `Ver todas (${format(values.length)})`}</button>}
    </div>
    {selected?.complaints && <ComplaintRrModal key={selected.key ?? selected.label} group={{ ...selected, complaints: selected.complaints }} onClose={() => setSelectedKey(null)} />}
  </ComplaintChartCard>;
}

export default function ComplaintChartsPage() {
  const [access, setAccess] = useState<"checking" | "allowed" | "denied">("checking");
  const [savedRows, setSavedRows] = useState<ComplaintChartRow[]>([]);
  const [tracking, setTracking] = useState<ComplaintRrTracking[]>([]);
  const [sessionContractor, setSessionContractor] = useState("");
  const [rrLoadError, setRrLoadError] = useState("");
  const [importedRows, setImportedRows] = useState<ComplaintChartRow[] | null>(null);
  const [source, setSource] = useState("Quejas registradas");
  const [loading, setLoading] = useState(true);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [contractor, setContractor] = useState("");
  const [status, setStatus] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const response = await fetch("/api/session/session", { cache: "no-store" });
        const body = await response.json();
        if (!active) return;
        if (!response.ok || !(body.session?.isAdmin || isComplaintsContractor(String(body.session?.contractor || "")))) {
          setAccess("denied"); return;
        }
        setAccess("allowed");
        setSessionContractor(String(body.session?.contractor || ""));
        const [recordsResponse] = await Promise.all([
          fetch("/api/complaints", { cache: "no-store" }),
          fetch("/api/seguimiento", { cache: "no-store" }).then(async response => {
            const data = await response.json();
            if (!response.ok || !Array.isArray(data.records)) throw new Error("No se pudo cargar el seguimiento para cruzar los DT con sus RR.");
            if (active) setTracking(data.records);
          }).catch(caught => { if (active) setRrLoadError(caught instanceof Error ? caught.message : "No se pudo cargar el seguimiento."); }),
        ]);
        const data = await recordsResponse.json();
        if (!recordsResponse.ok) throw new Error(data.error || "No se pudieron consultar las quejas registradas.");
        if (active) setSavedRows((data.records || []).map((record: ComplaintRecord) => ({
          contractor: record.contractor || "Sin transportista", date: chartDate(record.createdDate),
          status: complaintChartStatus(record.status || "Abierta"), issue: record.issue || "Sin novedad", count: 1,
          openedAt: record.createdDate, closedAt: record.closedAt,
          dt: record.dt, rr: record.responsible, rrId: record.responsibleId,
          client: record.establishment, clientCode: record.code, complaintId: record.id,
        })));
      } catch (caught) {
        if (active) setLoadError(caught instanceof Error ? caught.message : "No se pudieron cargar los datos.");
      } finally { if (active) setLoading(false); }
    }
    void load();
    return () => { active = false; };
  }, []);

  function clearFilters() { setContractor(""); setStatus(""); setFrom(""); setTo(""); }

  async function upload(file: File) {
    setReading(true); setError("");
    try {
      if (!/\.(xlsx|xls|csv)$/i.test(file.name)) throw new Error("Selecciona un archivo .xlsx, .xls o .csv.");
      if (file.size > 20 * 1024 * 1024) throw new Error("El archivo supera el límite de 20 MB.");
      const XLSX = await import("xlsx");
      const book = /\.csv$/i.test(file.name)
        ? XLSX.read(await file.text(), { type: "string", raw: true })
        : XLSX.read(await file.arrayBuffer(), { type: "array", cellNF: true });
      if (!book.SheetNames.length) throw new Error("El archivo no tiene hojas.");
      const { importComplaintChartWorkbook } = await import("../../lib/complaintChartExcel");
      const result = importComplaintChartWorkbook(book);
      setImportedRows(result.rows.map(row => ({ ...row, contractor: complaintUploadContractor(row.contractor, sessionContractor) })));
      setSource(`${file.name} · ${result.name}`); clearFilters();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "No se pudo leer el archivo."); }
    finally { setReading(false); }
  }

  const rows = importedRows ?? savedRows;
  const contractors = useMemo(() => [...new Set(rows.map(row => row.contractor))].sort(), [rows]);
  const statuses = useMemo(() => [...new Set(rows.map(row => row.status))].sort(), [rows]);
  const invalidRange = Boolean(from && to && from > to);
  const visible = useMemo(() => rows.filter(row => (!contractor || row.contractor === contractor) && (!status || row.status === status)
    && (!from || row.date >= from) && (!to || Boolean(row.date) && row.date <= to)), [rows, contractor, status, from, to]);
  const summary = complaintStatusTotals(visible);
  const closure = complaintClosureTotals(visible);
  const rrGroups = useMemo(() => complaintRrGroups(visible, tracking), [visible, tracking]);
  const undated = visible.filter(row => !row.date).reduce((sum, row) => sum + row.count, 0);

  if (access === "checking") return <main className="grid min-h-screen place-items-center bg-slate-50"><div role="status">{loadError || "Comprobando acceso…"}<Link href="/quejas" className="ml-3 text-blue-800 underline">Volver a Quejas</Link></div></main>;
  if (access === "denied") return <main className="grid min-h-screen place-items-center bg-slate-50"><div><h1 className="text-xl font-bold">Módulo no disponible</h1><Link href="/quejas" className="text-blue-800 underline">Volver a Quejas</Link></div></main>;

  return <main className="min-h-screen bg-[#eef2f5] text-[#10223d]">
    <header className="bg-[#0b2235] text-white"><div className="mx-auto flex max-w-[1500px] items-center justify-between gap-4 px-5 py-5 sm:px-8">
      <Link href="/quejas" className="inline-flex items-center gap-2 text-sm font-semibold"><ArrowLeft size={20} />Volver a Quejas</Link>
      <h1 className="text-xl font-bold">Gráficas de quejas</h1>
    </div></header>
    <div className="mx-auto max-w-[1500px] space-y-3 px-3 py-4 sm:px-5">
      <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
        <div className="flex flex-wrap items-center justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-widest text-blue-800">Análisis de quejas</p><h2 className="mt-1 text-xl font-bold">Carga tu Excel y consulta las gráficas</h2><p className="mt-2 text-sm text-slate-500">Totales exactos por transportista, estado, novedad y día de la semana.</p></div>
          <label className={`relative inline-flex cursor-pointer items-center gap-2 rounded-lg bg-[#2563eb] px-4 py-3 text-sm font-bold text-white hover:bg-[#1d4ed8] focus-within:ring-2 focus-within:ring-blue-400 focus-within:ring-offset-2 ${reading ? "opacity-50" : ""}`}>
            {reading ? <LoaderCircle size={18} className="animate-spin" /> : <Upload size={18} />}{reading ? "Leyendo…" : "Subir Excel"}
            <input aria-label="Subir Excel para las gráficas" type="file" accept=".xlsx,.xls,.csv" disabled={reading} className="absolute inset-0 w-full cursor-pointer opacity-0" onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void upload(file); }} />
          </label>
        </div>
        <p className="mt-3 text-xs text-slate-500">Las gráficas se generan al subir el archivo. Las fechas de texto ambiguas se leen como día/mes/año.</p>
        {error && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      </section>
      <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
        <div className="flex flex-wrap items-center justify-between gap-3"><p className="break-all text-sm font-semibold">Fuente: {source}</p>{importedRows && <button type="button" onClick={() => { setImportedRows(null); setSource("Quejas registradas"); clearFilters(); }} className="text-sm font-semibold text-blue-800 underline">Ver quejas registradas</button>}</div>
        {loading && !importedRows && <p role="status" className="mt-3 text-sm text-slate-500">Cargando quejas registradas…</p>}
        {loadError && !importedRows && <p role="alert" className="mt-3 text-sm text-red-700">{loadError}</p>}
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          <label className="text-xs font-semibold">Transportista<select className={inputClass} value={contractor} onChange={event => setContractor(event.target.value)}><option value="">Todos los transportistas</option>{contractors.map(item => <option key={item}>{item}</option>)}</select></label>
          <label className="text-xs font-semibold">Estado<select className={inputClass} value={status} onChange={event => setStatus(event.target.value)}><option value="">Todos los estados</option>{statuses.map(item => <option key={item}>{item}</option>)}</select></label>
          <label className="text-xs font-semibold">Desde<input className={inputClass} type="date" value={from} onChange={event => setFrom(event.target.value)} /></label>
          <label className="text-xs font-semibold">Hasta<input className={inputClass} type="date" value={to} onChange={event => setTo(event.target.value)} /></label>
          <button type="button" onClick={clearFilters} className="self-end rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold">Limpiar filtros</button>
        </div>
        {invalidRange && <p role="alert" className="mt-3 text-sm text-red-700">La fecha inicial debe ser anterior o igual a la final.</p>}
      </section>
      <section aria-label="Resumen de quejas" className="space-y-3">
        <div><h2 className="text-xl font-bold">Resumen de quejas</h2><p className="text-sm text-slate-500">Cantidades según la fuente y los filtros seleccionados.</p></div>
        <div className="grid gap-2 grid-cols-2 lg:grid-cols-4">
          {[
            { label: "Total de quejas", count: summary.total, style: "bg-[#0b2235] text-white", detail: "Todos los estados" },
            { label: "Quejas cerradas", count: summary.closed, style: "border border-teal-200 bg-teal-50 text-teal-900", detail: "Estado cerrado registrado" },
            { label: "Quejas abiertas", count: summary.open, style: "border border-blue-200 bg-blue-50 text-blue-900", detail: "Estado abierto registrado" },
            { label: "Sin clasificar", count: summary.unknown, style: "border border-slate-200 bg-white text-slate-700", detail: "Sin estado u otro estado" },
          ].map(item => <article key={item.label} className={`rounded-xl p-3 shadow-sm ${item.style}`}><h3 className="text-sm font-bold uppercase tracking-wide">{item.label}</h3><p className="mt-1 text-2xl font-black tabular-nums">{format(item.count)}</p><p className="mt-2 text-xs">{item.detail}</p></article>)}
        </div>
      </section>
      {!visible.length ? <p className="rounded-2xl bg-white p-10 text-center text-slate-500">No hay datos para graficar. Sube un Excel o ajusta los filtros.</p> : <div className="space-y-3">
        <ComplaintChartCard title="Estado, transportista y cierre en 48 horas" circular>
        <div className="grid flex-1 divide-y divide-slate-200 lg:grid-cols-3 lg:divide-x lg:divide-y-0">
        <ComplaintDonutChart embedded title="Quejas por estado" description="Cada parte del círculo representa un estado. La leyenda muestra su cantidad y porcentaje." values={[
          { label: "Cerradas", count: summary.closed, color: "#0d9488" },
          { label: "Abiertas", count: summary.open, color: "#2563eb" },
          { label: "Sin clasificar", count: summary.unknown, color: "#94a3b8" },
        ]} />
        <ComplaintDonutChart embedded title="Quejas por transportista" description="Distribución del total de quejas entre los transportistas del archivo o registro." values={groupComplaintChart(visible, "contractor")} />
        <ComplaintDonutChart embedded title="Quejas cerradas en 48 horas"
          centerValue={closure.evaluated ? `${closure.percentage.toLocaleString("es-CO", { maximumFractionDigits: 1 })}%` : "—"}
          centerLabel={closure.estimated ? "Estimado en plazo" : "Dentro del plazo"}
          emptyMessage="No hay quejas cerradas con fechas válidas de ingreso y cierre para calcular el porcentaje."
          description={`${format(closure.within48)} de ${format(closure.evaluated)} quejas cerradas evaluables dentro de 48 horas, inclusive. Se excluyen abiertas y sin clasificar. ${format(closure.missing)} cerradas sin fechas válidas o con cierre anterior al ingreso.${closure.estimated ? ` Estimación: ${format(closure.estimated)} quejas tienen fechas sin hora; se considera en plazo una diferencia de hasta 2 días calendario. No permite confirmar 48 horas exactas.` : ""}`}
          values={[
            { label: closure.estimated ? "Hasta 48 h (estimado)" : "Hasta 48 horas", count: closure.within48, color: "#0d9488" },
            { label: closure.estimated ? "Más de 48 h (estimado)" : "Más de 48 horas", count: closure.after48, color: "#f59e0b" },
          ]} />
        </div>
        </ComplaintChartCard>
        <div className="grid items-stretch gap-3 lg:grid-cols-2">
        <CountChart title="Quejas por día de la semana" columns values={complaintWeekdays(visible)} note={`Suma de las fechas seleccionadas para cada día.${undated ? ` ${format(undated)} quejas sin fecha quedan fuera de esta gráfica.` : ""}`} />
        <div className="min-w-0">
          {rrLoadError && <p role="alert" className="mb-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">{rrLoadError}</p>}
          <CountChart title="Quejas por RR" expandable values={rrGroups.values}
            note={rrGroups.unmatched ? `${format(rrGroups.unmatched)} sin RR identificado en el cruce por DT.` : ""} />
        </div>
        </div>
      </div>}
    </div>
  </main>;
}
