"use client";

import Link from "next/link";
import ComplaintTrendCharts from "./ComplaintTrendCharts";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, BarChart3, FileSpreadsheet, LoaderCircle, Upload } from "lucide-react";
import type { WorkBook } from "xlsx";
import type { ComplaintRecord } from "../../lib/complaints";
import { isComplaintsContractor } from "../../lib/contractors";
import { chartDate, complaintWeekdays, groupComplaintChart, parseComplaintChartRows, suggestComplaintChartMapping, type ComplaintChartMapping, type ComplaintChartRow, type ComplaintExcelRow } from "../../lib/complaintCharts";

const inputClass = "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800";
const colors = ["bg-violet-500", "bg-teal-500", "bg-amber-500", "bg-pink-500", "bg-indigo-500", "bg-orange-500", "bg-emerald-500"];
const fields: Array<{ key: keyof ComplaintChartMapping; label: string }> = [
  { key: "contractor", label: "Transportista" }, { key: "date", label: "Fecha de creación" },
  { key: "status", label: "Estado" }, { key: "issue", label: "Novedad" }, { key: "count", label: "Cantidad" },
];
const format = (value: number) => value.toLocaleString("es-CO");

export default function ComplaintChartsPage() {
  const [access, setAccess] = useState<"checking" | "allowed" | "denied">("checking");
  const [savedRows, setSavedRows] = useState<ComplaintChartRow[]>([]);
  const [importedRows, setImportedRows] = useState<ComplaintChartRow[] | null>(null);
  const [source, setSource] = useState("Quejas registradas");
  const [loading, setLoading] = useState(true);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [workbook, setWorkbook] = useState<WorkBook | null>(null);
  const [fileName, setFileName] = useState("");
  const [sheetName, setSheetName] = useState("");
  const [excelRows, setExcelRows] = useState<ComplaintExcelRow[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<ComplaintChartMapping>(suggestComplaintChartMapping([]));
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
        const recordsResponse = await fetch("/api/complaints", { cache: "no-store" });
        const data = await recordsResponse.json();
        if (!recordsResponse.ok) throw new Error(data.error || "No se pudieron consultar las quejas registradas.");
        if (active) setSavedRows((data.records || []).map((record: ComplaintRecord) => ({
          contractor: record.contractor || "Sin transportista", date: chartDate(record.createdDate),
          status: record.status || "Abierta", issue: record.issue || "Sin novedad", count: 1,
        })));
      } catch (caught) {
        if (active) setLoadError(caught instanceof Error ? caught.message : "No se pudieron cargar los datos.");
      } finally { if (active) setLoading(false); }
    }
    void load();
    return () => { active = false; };
  }, []);

  function clearFilters() { setContractor(""); setStatus(""); setFrom(""); setTo(""); }

  async function selectSheet(book: WorkBook, name: string) {
    const XLSX = await import("xlsx");
    const rows = XLSX.utils.sheet_to_json<ComplaintExcelRow>(book.Sheets[name], { defval: "", raw: false, dateNF: "yyyy-mm-dd" });
    if (rows.length > 50_000) throw new Error("La hoja supera el límite de 50.000 filas.");
    const columns = Object.keys(rows[0] || {});
    setSheetName(name); setExcelRows(rows); setHeaders(columns); setMapping(suggestComplaintChartMapping(columns));
    setError(rows.length ? "" : "Esta hoja está vacía. Selecciona otra hoja.");
  }

  async function upload(file: File) {
    setReading(true); setError(""); setWorkbook(null); setExcelRows([]);
    try {
      if (!/\.(xlsx|xls|csv)$/i.test(file.name)) throw new Error("Selecciona un archivo .xlsx, .xls o .csv.");
      if (file.size > 20 * 1024 * 1024) throw new Error("El archivo supera el límite de 20 MB.");
      const XLSX = await import("xlsx");
      const book = /\.csv$/i.test(file.name)
        ? XLSX.read(await file.text(), { type: "string", raw: true })
        : XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
      if (!book.SheetNames.length) throw new Error("El archivo no tiene hojas.");
      await selectSheet(book, book.SheetNames[0]);
      setWorkbook(book); setFileName(file.name);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "No se pudo leer el archivo."); }
    finally { setReading(false); }
  }

  function applyExcel() {
    try {
      const rows = parseComplaintChartRows(excelRows, mapping);
      setImportedRows(rows); setSource(`${fileName} · ${sheetName}`); clearFilters(); setError("");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Revisa las columnas seleccionadas."); }
  }

  const rows = importedRows ?? savedRows;
  const contractors = useMemo(() => [...new Set(rows.map(row => row.contractor))].sort(), [rows]);
  const statuses = useMemo(() => [...new Set(rows.map(row => row.status))].sort(), [rows]);
  const invalidRange = Boolean(from && to && from > to);
  const visible = useMemo(() => rows.filter(row => (!contractor || row.contractor === contractor) && (!status || row.status === status)
    && (!from || row.date >= from) && (!to || Boolean(row.date) && row.date <= to)), [rows, contractor, status, from, to]);
  const total = visible.reduce((sum, row) => sum + row.count, 0);
  const undated = visible.filter(row => !row.date).reduce((sum, row) => sum + row.count, 0);

  if (access === "checking") return <main className="grid min-h-screen place-items-center bg-slate-50"><div role="status">{loadError || "Comprobando acceso…"}<Link href="/quejas" className="ml-3 text-violet-700 underline">Volver a Quejas</Link></div></main>;
  if (access === "denied") return <main className="grid min-h-screen place-items-center bg-slate-50"><div><h1 className="text-xl font-bold">Módulo no disponible</h1><Link href="/quejas" className="text-violet-700 underline">Volver a Quejas</Link></div></main>;

  return <main className="min-h-screen bg-[#eef2f5] text-[#10223d]">
    <header className="bg-[#0b2235] text-white"><div className="mx-auto flex max-w-[1500px] items-center justify-between gap-4 px-5 py-5 sm:px-8">
      <Link href="/quejas" className="inline-flex items-center gap-2 text-sm font-semibold"><ArrowLeft size={20} />Volver a Quejas</Link>
      <h1 className="text-xl font-bold">Gráficas de quejas</h1>
    </div></header>
    <div className="mx-auto max-w-[1500px] space-y-5 px-5 py-6 sm:px-8">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-widest text-violet-700">Análisis de quejas</p><h2 className="mt-1 text-2xl font-bold">Carga tu Excel y consulta las gráficas</h2><p className="mt-2 text-sm text-slate-500">Totales exactos por transportista, estado, novedad y día de la semana.</p></div>
          <label className={`relative inline-flex cursor-pointer items-center gap-2 rounded-lg bg-violet-700 px-4 py-3 text-sm font-bold text-white hover:bg-violet-800 focus-within:ring-2 focus-within:ring-violet-400 focus-within:ring-offset-2 ${reading ? "opacity-50" : ""}`}>
            {reading ? <LoaderCircle size={18} className="animate-spin" /> : <Upload size={18} />}{reading ? "Leyendo…" : "Subir Excel"}
            <input aria-label="Subir Excel para las gráficas" type="file" accept=".xlsx,.xls,.csv" disabled={reading} className="absolute inset-0 w-full cursor-pointer opacity-0" onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void upload(file); }} />
          </label>
        </div>
        <p className="mt-3 text-xs text-slate-500">El archivo se usa para esta consulta en el navegador. Puedes cargar una fila por queja o seleccionar una columna de cantidades enteras. Coloca los encabezados en la primera fila.</p>
        {error && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        {workbook && <div className="mt-5 space-y-4 border-t border-slate-200 pt-4">
          <div className="flex flex-wrap items-end gap-4"><p className="flex items-center gap-2 text-sm font-semibold"><FileSpreadsheet size={18} />{fileName}</p>
            <label className="text-xs font-semibold">Hoja<select className={inputClass} value={sheetName} disabled={reading} onChange={async event => { setReading(true); try { await selectSheet(workbook, event.target.value); } catch (caught) { setExcelRows([]); setError(caught instanceof Error ? caught.message : "No se pudo leer la hoja."); } finally { setReading(false); } }}>{workbook.SheetNames.map(name => <option key={name}>{name}</option>)}</select></label>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">{fields.map(field => <label key={field.key} className="text-xs font-semibold">{field.label}<select className={inputClass} value={mapping[field.key]} onChange={event => setMapping(current => ({ ...current, [field.key]: event.target.value }))}>
            <option value="">{field.key === "count" ? "Una queja por fila" : "Sin columna"}</option>{headers.map(header => <option key={header}>{header}</option>)}
          </select></label>)}</div>
          {excelRows.length > 0 && <div className="max-h-48 overflow-auto rounded-lg border border-slate-200"><table className="w-full text-left text-xs"><caption className="p-2 text-left text-slate-500">Vista previa · {format(excelRows.length)} filas · primeras 5</caption><thead className="bg-slate-100"><tr>{fields.filter(field => mapping[field.key]).map(field => <th className="p-2" key={field.key}>{mapping[field.key]}</th>)}</tr></thead><tbody>{excelRows.slice(0, 5).map((row, index) => <tr key={index} className="border-t border-slate-100">{fields.filter(field => mapping[field.key]).map(field => <td className="max-w-64 truncate p-2" key={field.key}>{row[mapping[field.key]]}</td>)}</tr>)}</tbody></table></div>}
          <button type="button" disabled={reading || !excelRows.length} onClick={applyExcel} className="inline-flex items-center gap-2 rounded-lg bg-violet-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"><BarChart3 size={16} />Generar gráficas</button>
        </div>}
      </section>
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3"><p className="break-all text-sm font-semibold">Fuente: {source}</p>{importedRows && <button type="button" onClick={() => { setImportedRows(null); setSource("Quejas registradas"); clearFilters(); }} className="text-sm font-semibold text-violet-700 underline">Ver quejas registradas</button>}</div>
        {loading && !importedRows && <p role="status" className="mt-3 text-sm text-slate-500">Cargando quejas registradas…</p>}
        {loadError && !importedRows && <p role="alert" className="mt-3 text-sm text-red-700">{loadError}</p>}
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <label className="text-xs font-semibold">Transportista<select className={inputClass} value={contractor} onChange={event => setContractor(event.target.value)}><option value="">Todos los transportistas</option>{contractors.map(item => <option key={item}>{item}</option>)}</select></label>
          <label className="text-xs font-semibold">Estado<select className={inputClass} value={status} onChange={event => setStatus(event.target.value)}><option value="">Todos los estados</option>{statuses.map(item => <option key={item}>{item}</option>)}</select></label>
          <label className="text-xs font-semibold">Desde<input className={inputClass} type="date" value={from} onChange={event => setFrom(event.target.value)} /></label>
          <label className="text-xs font-semibold">Hasta<input className={inputClass} type="date" value={to} onChange={event => setTo(event.target.value)} /></label>
          <button type="button" onClick={clearFilters} className="self-end rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold">Limpiar filtros</button>
        </div>
        {invalidRange && <p role="alert" className="mt-3 text-sm text-red-700">La fecha inicial debe ser anterior o igual a la final.</p>}
      </section>
      <div className="rounded-2xl bg-[#0b2235] px-6 py-5 text-white"><p className="text-xs font-semibold uppercase tracking-wider text-slate-300">Total de quejas con los filtros seleccionados</p><p className="mt-1 text-4xl font-bold tabular-nums">{format(total)}</p></div>
      <ComplaintTrendCharts rows={visible} />
      {!visible.length ? <p className="rounded-2xl bg-white p-10 text-center text-slate-500">No hay datos para graficar. Sube un Excel o ajusta los filtros.</p> : <div className="grid gap-5 lg:grid-cols-2">
        <CountChart title="Quejas por transportista" values={groupComplaintChart(visible, "contractor")} />
        <CountChart title="Quejas por estado" values={groupComplaintChart(visible, "status")} />
        <CountChart title="Quejas por novedad" values={groupComplaintChart(visible, "issue")} />
        <CountChart title="Quejas por día de la semana" values={complaintWeekdays(visible)} note={`Suma de las fechas seleccionadas para cada día.${undated ? ` ${format(undated)} quejas sin fecha quedan fuera de esta gráfica.` : ""}`} />
      </div>}
    </div>
  </main>;
}

function CountChart({ title, values, note }: { title: string; values: Array<{ label: string; count: number }>; note?: string }) {
  const maximum = Math.max(1, ...values.map(value => value.count));
  return <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
    <h2 className="text-lg font-bold">{title}</h2><p className="mt-1 text-xs text-slate-500">Número de quejas{note ? ` · ${note}` : ""}</p>
    <div className="mt-5 max-h-[420px] space-y-4 overflow-y-auto pr-2">{values.map((value, index) => <div key={value.label}>
      <div className="mb-1 flex items-start justify-between gap-3 text-sm"><span className="break-words font-medium">{value.label}</span><span className="shrink-0 font-bold tabular-nums">{format(value.count)}</span></div>
      <div className="h-5 overflow-hidden rounded-md bg-slate-100" role="img" aria-label={`${value.label}: ${format(value.count)} quejas`}><div className={`h-full rounded-md ${colors[index % colors.length]} transition-[width] motion-reduce:transition-none`} style={{ width: `${value.count / maximum * 100}%` }} /></div>
    </div>)}</div>
  </section>;
}
