import { useMemo, useState, type ReactNode } from "react";
import { FileSpreadsheet, Upload, X } from "lucide-react";
import { compareRangeClients, detectComparisonSheet } from "../lib/clientRangeComparison";
import type { ClientRangeSummary } from "../lib/clientRangeSummary";
import { contractorLabel, normalizeContractorName } from "../lib/contractors";

const format = (value: number) => value.toLocaleString("es-CO", { maximumFractionDigits: 2 });
const percent = (value: number | null) => value === null ? "Sin datos" : `${format(value)}%`;
const PAGE_SIZE = 20;

export default function ClientRangeComparison({ rows, loading, incomplete, from, to, children }: {
  rows: ClientRangeSummary[]; loading: boolean; incomplete: boolean; from: string; to: string; children: ReactNode;
}) {
  const [file, setFile] = useState<string | null>(null);
  const [imported, setImported] = useState<ReturnType<typeof detectComparisonSheet> | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const comparisons = useMemo(() => compareRangeClients(imported?.clients || [], rows, value => normalizeContractorName(contractorLabel(value))), [imported, rows]);
  const visible = comparisons.filter(item => (status === "all" || (status === "found" ? item.status !== "missing" : item.status === status)) && `${item.client.code} ${item.client.name} ${item.matches.map(row => row.name).join(" ")}`.toLocaleLowerCase("es-CO").includes(search.trim().toLocaleLowerCase("es-CO")));
  const pages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const currentPage = Math.min(page, pages);
  const ready = !loading && !incomplete;
  const found = comparisons.filter(item => item.matches.length > 0).length;
  const multiple = comparisons.filter(item => item.matches.length > 1).length;

  async function upload(uploaded?: File) {
    if (!uploaded) return;
    setBusy(true); setError(""); setImported(null); setFile(null); setSearch(""); setStatus("all");
    try {
      if (!/\.(xlsx|xls|csv)$/i.test(uploaded.name)) throw new Error("Selecciona un archivo .xlsx, .xls o .csv.");
      if (uploaded.size > 10 * 1024 * 1024) throw new Error("El archivo debe pesar máximo 10 MB.");
      const XLSX = await import("xlsx");
      const book = /\.csv$/i.test(uploaded.name) ? XLSX.read(await uploaded.text(), { type: "string", raw: true, sheetRows: 50_022 }) : XLSX.read(await uploaded.arrayBuffer(), { type: "array", sheetRows: 50_022 });
      if (!book.SheetNames.length) throw new Error("El archivo no contiene hojas.");
      const detected = detectComparisonSheet(book.SheetNames.map(name => ({ name, rows: XLSX.utils.sheet_to_json<string[]>(book.Sheets[name], { header: 1, raw: false, defval: "", blankrows: true }) })));
      setImported(detected); setFile(uploaded.name); setPage(1);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "No se pudo abrir el archivo."); }
    finally { setBusy(false); }
  }

  return <section className="space-y-4" aria-label="Filtros y comparación de clientes">
    <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_230px]">
      {children}
      <div className="flex flex-col justify-center gap-3 rounded-2xl border border-teal-200 bg-teal-50/60 p-4">
        <div><h3 className="flex items-center gap-2 text-sm font-semibold text-[#10223d]"><FileSpreadsheet size={17} className="text-teal-700" aria-hidden="true" />Comparar con Excel</h3><p className="mt-1 text-[11px] text-slate-500">Cruza tu lista por código de cliente.</p></div>
        <label className={`inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-xl bg-teal-700 px-4 text-xs font-semibold text-white hover:bg-teal-800 focus-within:ring-2 focus-within:ring-teal-500 focus-within:ring-offset-2 ${busy ? "opacity-50" : ""}`}><Upload size={16} aria-hidden="true" />{busy ? "Leyendo archivo…" : file ? "Cambiar Excel" : "Cargar Excel"}<input type="file" className="sr-only" aria-label="Cargar Excel para comparar clientes" accept=".xlsx,.xls,.csv" disabled={busy} onChange={event => { void upload(event.target.files?.[0]); event.target.value = ""; }} /></label>
      </div>
    </div>
    {(busy || file || error) && <div className="overflow-hidden rounded-2xl border border-teal-200 bg-white shadow-sm">
      <header className="flex items-start justify-between gap-4 border-b border-slate-100 p-5">
        <div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-wider text-teal-700">Comparación automática</p><h3 className="mt-1 text-lg font-bold text-[#10223d]">Tu Excel frente a los registros de la app</h3>{file && <p className="mt-2 break-words text-xs text-slate-500">{file} · Hoja utilizada: {imported?.sheetName}</p>}</div>
        {file && <button type="button" aria-label="Quitar Excel de comparación" onClick={() => { setFile(null); setImported(null); setError(""); }} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X size={18} aria-hidden="true" /></button>}
      </header>
      <div className="space-y-5 p-5">
        {error && <p role="alert" className="rounded-xl bg-rose-50 p-4 text-sm leading-6 text-rose-700">{error}</p>}
        {busy && <p role="status" className="rounded-xl bg-teal-50 p-4 text-sm text-teal-800">Leyendo el Excel e identificando los clientes automáticamente…</p>}
        {imported && <>
          <p className="text-xs leading-5 text-slate-500">Buscamos cada código del Excel en la app. Período: {from || "inicio del historial"} hasta {to || "último registro"}. Se aplican los filtros de contratista y DT de la consulta.</p>
          {!ready ? <p role="status" className="rounded-xl bg-amber-50 p-4 text-sm text-amber-800">{loading ? "El archivo ya está listo. Esperando los datos de la app para mostrar los resultados…" : "La consulta de la app está incompleta. Reintenta la carga de datos para completar la comparación."}</p> : <>
            <div className="grid gap-3 sm:grid-cols-3">{[
              {key:"all",label:"Clientes en tu archivo",value:comparisons.length,detail:"Ver todos",color:"text-slate-800"},
              {key:"found",label:"Encontrados en la app",value:found,detail:"Tienen registros en esta consulta",color:"text-teal-700"},
              {key:"missing",label:"Sin registros en la consulta",value:comparisons.length-found,detail:"Revisar código o ampliar las fechas",color:"text-amber-700"},
            ].map(item => <button type="button" key={item.key} aria-pressed={status === item.key} onClick={() => {setStatus(item.key);setPage(1);}} className={`rounded-xl border p-4 text-left transition focus-visible:outline-2 focus-visible:outline-teal-600 ${status === item.key ? "border-teal-500 bg-teal-50/60 ring-1 ring-teal-500" : "border-slate-200 bg-white hover:bg-slate-50"}`}><p className={`text-3xl font-bold tabular-nums ${item.color}`}>{format(item.value)}</p><p className="mt-2 text-sm font-semibold text-slate-700">{item.label}</p><p className="mt-1 text-[11px] text-slate-500">{item.detail}</p></button>)}</div>
            <div className="flex flex-wrap items-end justify-between gap-3"><label className="min-w-0 flex-1 text-xs font-semibold text-slate-600">Buscar un cliente de tu archivo<input type="search" value={search} onChange={event => {setSearch(event.target.value);setPage(1);}} className="mt-2 h-10 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100" placeholder="Nombre o código del cliente" /></label>{multiple > 0 && <button type="button" aria-pressed={status === "multiple"} onClick={() => {setStatus(status === "multiple" ? "all" : "multiple");setPage(1);}} className={`h-10 rounded-xl border px-3 text-xs font-semibold ${status === "multiple" ? "border-indigo-400 bg-indigo-50 text-indigo-700" : "border-slate-200 text-slate-600"}`}>{multiple} en varias contratistas</button>}</div>
            <div role="region" aria-label="Resultados de comparación de Excel" className="max-h-[680px] space-y-3 overflow-y-auto pr-1" tabIndex={0}>
              {visible.slice((currentPage-1)*PAGE_SIZE,currentPage*PAGE_SIZE).map(item => <article key={item.client.sourceRows[0]} className="overflow-hidden rounded-xl border border-slate-200">
                <header className="flex flex-wrap items-start justify-between gap-3 bg-slate-50 px-4 py-3"><div><h4 className="text-sm font-bold text-[#10223d]">{item.client.name || item.matches[0]?.name || "Cliente sin nombre"}</h4><p className="mt-1 text-xs text-slate-500">Código <strong className="font-semibold text-slate-700">{item.client.code}</strong>{item.client.contractor ? ` · ${item.client.contractor}` : ""}</p></div><span className={`rounded-full px-3 py-1 text-[11px] font-semibold ${item.matches.length ? "bg-teal-100 text-teal-800" : "bg-amber-100 text-amber-800"}`}>{item.matches.length ? "Encontrado" : "Sin registros"}</span></header>
                {item.matches.length ? <div className="divide-y divide-slate-100">{item.matches.map(match => <div key={match.key} className="p-4">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><p className="text-xs font-semibold text-teal-800">{match.contractor}</p><p className="text-[11px] text-slate-500">Nombre en la app: {match.name}</p></div>
                  <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">{[
                    ["Atenciones",format(match.attentions),"text-slate-800"],
                    ["Fuera de rango",format(match.outside),"text-rose-700"],
                    ["Dentro de rango",format(match.inside),"text-emerald-700"],
                    ["Refusal",percent(match.refusal),"text-amber-700"],
                  ].map(([label,value,color]) => <div key={label} className="rounded-lg bg-slate-50 p-3"><dt className="text-[10px] text-slate-500">{label}</dt><dd className={`mt-1 text-lg font-bold tabular-nums ${color}`}>{value}</dd></div>)}</dl>
                  <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500"><span>Fuera de rango: <strong>{percent(match.outsidePercent)}</strong></span><span>Modulaciones: <strong>{format(match.modulations)}</strong></span><span>Cajas entregadas: <strong>{format(match.deliveredVolume)}</strong></span><span>Cajas rechazadas: <strong>{format(match.refusedVolume)}</strong></span></p>
                </div>)}</div> : <p className="p-4 text-xs leading-6 text-slate-600">No hay registros para este código con los filtros actuales. Revisa el código en el Excel o amplía el período de consulta.</p>}
              </article>)}
              {!visible.length && <p className="rounded-xl bg-slate-50 p-8 text-center text-sm text-slate-500">No hay clientes que coincidan con esta búsqueda.</p>}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500"><span>{format(visible.length)} clientes · {PAGE_SIZE} por página</span><nav aria-label="Páginas de comparación" className="flex items-center gap-3"><button type="button" disabled={currentPage === 1} onClick={() => setPage(currentPage-1)} className="rounded-lg border px-3 py-2 disabled:opacity-40">Anterior</button><span>{currentPage} / {pages}</span><button type="button" disabled={currentPage === pages} onClick={() => setPage(currentPage+1)} className="rounded-lg border px-3 py-2 disabled:opacity-40">Siguiente</button></nav></div>
          </>}
          {(imported.duplicates > 0 || imported.skipped > 0) && <p className="border-t border-slate-100 pt-3 text-[11px] text-slate-500">Limpieza automática del archivo: {imported.duplicates} filas repetidas agrupadas y {imported.skipped} filas sin código omitidas.</p>}
        </>}
      </div>
    </div>}
  </section>;
}
