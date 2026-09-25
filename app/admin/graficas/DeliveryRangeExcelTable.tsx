"use client";

import { useMemo, useState } from "react";
import { deliveryRangeFields, parseDeliveryRangeRows, suggestDeliveryRangeMapping, summarizeDeliveryRange, type DeliveryRangeField, type DeliveryRangeRow } from "../../lib/deliveryRangeImport";

export default function DeliveryRangeExcelTable({ data, fileName, onClear }: { data: unknown[][]; fileName: string; onClear: () => void }) {
  const [mapping, setMapping] = useState(() => suggestDeliveryRangeMapping(data[0] ?? []));
  const [rows, setRows] = useState<DeliveryRangeRow[]>([]);
  const [error, setError] = useState("");
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const summaries = useMemo(() => summarizeDeliveryRange(rows), [rows]);
  const query = search.trim().toLocaleLowerCase("es");
  const filtered = summaries.filter((row) => `${row.rr} ${row.conductor}`.toLocaleLowerCase("es").includes(query));
  const pageSize = 50;
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));

  function confirm() {
    setError("");
    try {
      setRows(parseDeliveryRangeRows(data, mapping));
      setPage(0);
      setSearch("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No se pudieron leer las entregas.");
    }
  }

  return <section aria-label="Entrega en rango por RR y conductor" className="mb-5 space-y-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="text-sm font-bold text-[#10223d]">Entrega en rango por RR y conductor</h2><p className="mt-1 break-all text-xs text-slate-500">{fileName}</p></div>
      <button className="rounded-md border px-3 py-2 text-xs text-slate-600" onClick={onClear} type="button">Limpiar entregas</button>
    </header>
    <p className="text-xs leading-5 text-slate-500">Selecciona las columnas del Excel. Cada fila cuenta como una entrega. El rango admite Sí/No, En rango/Fuera de rango o 1/0. Las celdas vacías cuentan como sin validar. El porcentaje se calcula sobre las entregas con rango validado.</p>
    <div className="grid gap-3 sm:grid-cols-3">
      {(Object.keys(deliveryRangeFields) as DeliveryRangeField[]).map((field) => <label className="text-xs font-semibold text-slate-600" key={field}>{deliveryRangeFields[field]}
        <select className="mt-1 block w-full rounded-md border border-slate-200 bg-white p-2 text-sm" value={mapping[field]} onChange={(event) => { setMapping({ ...mapping, [field]: Number(event.target.value) }); setRows([]); setError(""); setPage(0); }}>
          <option value={-1}>Selecciona columna</option>
          {(data[0] ?? []).map((header, index) => <option key={index} value={index}>{String(header || `Columna ${index + 1}`)} (col. {index + 1})</option>)}
        </select>
      </label>)}
    </div>
    <button className="rounded-md bg-[#10223d] px-3 py-2 text-xs font-semibold text-white" onClick={confirm} type="button">Mostrar tabla de entregas</button>
    {error && <p className="rounded-md bg-red-50 p-3 text-sm text-red-700" role="alert">{error}</p>}
    {rows.length > 0 && <>
      <p className="text-xs text-slate-600" role="status">{rows.length} entregas · {summaries.length} combinaciones de RR y conductor · {rows.filter((row) => row.inRange === null).length} sin validar</p>
      <label className="block text-xs font-semibold text-slate-600">Buscar RR o conductor<input className="mt-1 block w-full rounded-md border border-slate-200 p-2 sm:max-w-sm" value={search} onChange={(event) => { setSearch(event.target.value); setPage(0); }} placeholder="Nombre o código" type="search" /></label>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <caption className="sr-only">Entregas agrupadas por RR y conductor del Excel</caption>
          <thead className="bg-slate-50 text-slate-600"><tr>{["RR / Responsable", "Conductor", "Entregas", "En rango", "Fuera de rango", "Sin validar", "% en rango"].map((label) => <th className="whitespace-nowrap px-3 py-2" key={label} scope="col">{label}</th>)}</tr></thead>
          <tbody className="divide-y divide-slate-100">{filtered.slice(page * pageSize, (page + 1) * pageSize).map((row) => <tr key={row.key}>
            <td className="px-3 py-2 font-semibold">{row.rr}</td><td className="px-3 py-2">{row.conductor}</td><td className="px-3 py-2">{row.total}</td><td className="px-3 py-2 font-semibold text-emerald-700">{row.inRange}</td><td className="px-3 py-2 font-semibold text-red-700">{row.outOfRange}</td><td className="px-3 py-2 text-amber-700">{row.unvalidated}</td><td className="px-3 py-2 font-semibold">{row.percentage === null ? "Sin validar" : `${row.percentage.toLocaleString("es-CO", { maximumFractionDigits: 2 })}%`}</td>
          </tr>)}</tbody>
        </table>
        {!filtered.length && <p className="py-4 text-center text-xs text-slate-500">No hay coincidencias para la búsqueda.</p>}
      </div>
      {pages > 1 && <div className="flex items-center justify-end gap-3 text-xs"><button className="rounded border px-3 py-2 disabled:opacity-40" disabled={page === 0} onClick={() => setPage(page - 1)} type="button">Anterior</button><span>Página {page + 1} de {pages}</span><button className="rounded border px-3 py-2 disabled:opacity-40" disabled={page + 1 >= pages} onClick={() => setPage(page + 1)} type="button">Siguiente</button></div>}
    </>}
  </section>;
}
