"use client";

import { useEffect, useMemo, useState } from "react";
import { compareModulaciones, type ComparisonCheckin } from "../../lib/modulacionComparison";
import { normalizeContractorName } from "../../lib/contractors";
import { getLocalDateKey, type ModulacionRegistro } from "../../lib/modulacionStorage";

export default function ModulacionComparison({ contractor }: { contractor: string }) {
  const [data, setData] = useState<{ checkins: ComparisonCheckin[]; modulations: ModulacionRegistro[] } | null>(null);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [from, setFrom] = useState(getLocalDateKey);
  const [to, setTo] = useState(getLocalDateKey);
  const [search, setSearch] = useState("");
  const [onlyMissing, setOnlyMissing] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const [checkins, modulations] = await Promise.all(["/api/checkins", "/api/modulaciones"].map(async (url) => {
          const response = await fetch(url, { cache: "no-store", signal: controller.signal });
          const body = await response.json();
          if (!response.ok || !Array.isArray(body.records)) throw new Error(body.error || "No se pudo cargar la comparación.");
          return body.records;
        }));
        if (!controller.signal.aborted) { setData({ checkins, modulations }); setError(""); }
      } catch (caught) {
        if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : "No se pudo cargar la comparación.");
      }
    }
    void load();
    return () => controller.abort();
  }, [revision]);

  const rows = useMemo(() => data ? compareModulaciones(data.checkins, data.modulations).filter(row =>
    (!contractor || normalizeContractorName(row.contractor) === normalizeContractorName(contractor))
    && (!from || row.date >= from) && (!to || row.date <= to)
    && (!search.trim() || `${row.dt} ${row.people}`.toLowerCase().includes(search.trim().toLowerCase()))
  ) : [], [data, contractor, from, to, search]);
  const missing = rows.filter(row => row.missing).length;
  const withModulation = rows.filter(row => row.count > 0).length;
  const zero = rows.length - missing - withModulation;
  const visible = onlyMissing ? rows.filter(row => row.missing) : rows;
  const max = Math.max(1, ...visible.flatMap(row => [row.modulated, row.checkin]));
  const field = "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm";

  return <section className="mb-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm" aria-label="Comparación de modulación con check-in">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 className="text-lg font-bold">Modulación vs. check-in por DT</h2>
        <p className="mt-1 text-sm text-slate-600">Compara cajas por DT y contratista. Las fechas corresponden al check-in en Colombia; se incluyen todas las modulaciones del mismo DT.</p>
        <p className="mt-1 text-xs text-slate-500">Estos filtros son propios de la comparación. Se usa el último check-in registrado por DT.</p></div>
      <button type="button" className={field} onClick={() => setRevision(value => value + 1)}>Actualizar</button>
    </div>
    <div className="my-4 flex flex-wrap items-end gap-3">
      <label className="grid gap-1 text-sm">Desde<input className={field} type="date" value={from} max={to || undefined} onChange={event => setFrom(event.target.value)} /></label>
      <label className="grid gap-1 text-sm">Hasta<input className={field} type="date" value={to} min={from || undefined} onChange={event => setTo(event.target.value)} /></label>
      <label className="grid gap-1 text-sm">DT o persona que moduló<input className={field} value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar…" /></label>
      <button type="button" className={field} onClick={() => { setFrom(""); setTo(""); }}>Todas las fechas</button>
      <label className="flex items-center gap-2 py-2 text-sm"><input type="checkbox" checked={onlyMissing} onChange={event => setOnlyMissing(event.target.checked)} />Solo con cajas y sin modulación</label>
    </div>
    {error ? <p role="alert" className="rounded-lg bg-red-50 p-3 text-red-700">{error} Usa Actualizar para reintentar.</p> : !data ? <p role="status">Cargando check-in y modulaciones…</p> : <>
      <div className="grid gap-3 sm:grid-cols-3">
        {([{ label: "DT con modulación", count: withModulation, color: "bg-emerald-500" }, { label: "Con cajas y sin modulación", count: missing, color: "bg-red-500" }, { label: "Sin modulación y check-in en cero", count: zero, color: "bg-slate-400" }]).map(item => <div key={item.label} className="rounded-lg bg-slate-50 p-3">
          <p className="text-sm">{item.label}</p><p className="text-xl font-bold">{item.count} <span className="text-sm font-normal">({rows.length ? (100 * item.count / rows.length).toFixed(1) : "0"} %)</span></p>
          <div className="mt-2 h-2 overflow-hidden rounded bg-slate-200"><div className={`h-full ${item.color}`} style={{ width: `${rows.length ? 100 * item.count / rows.length : 0}%` }} /></div>
        </div>)}
      </div>
      <p className="my-4 text-sm text-slate-600">{rows.length} DT con check-in · <span className="font-semibold text-violet-700">Morado: cajas moduladas</span> · <span className="font-semibold text-cyan-700">Azul: cajas check-in</span></p>
      <div className="max-h-[600px] overflow-auto"><table className="w-full text-left text-sm">
        <thead className="sticky top-0 bg-slate-100"><tr>{["DT / Contratista", "Fecha check-in", "Persona que moduló", "Comparación de cajas", "Estado"].map(label => <th className="p-3" key={label}>{label}</th>)}</tr></thead>
        <tbody>{visible.map(row => <tr key={row.id} className={row.missing ? "border-t bg-red-50" : "border-t"}>
          <td className="p-3 font-semibold">{row.dt}<div className="text-xs font-normal">{row.contractor}</div></td>
          <td className="whitespace-nowrap p-3">{row.date}</td><td className="p-3">{row.people || "Sin persona registrada"}</td>
          <td className="min-w-64 p-3">{[{ label: "Moduladas", value: row.modulated, color: "bg-violet-500" }, { label: "Check-in", value: row.checkin, color: "bg-cyan-500" }].map(bar => <div key={bar.label} className="mb-2"><div className="flex justify-between gap-3 text-xs"><span>{bar.label}</span><strong>{bar.value}</strong></div><div className="h-2 rounded bg-slate-100"><div className={`h-2 rounded ${bar.color}`} style={{ width: `${bar.value / max * 100}%` }} /></div></div>)}<p className="text-xs text-slate-500">{row.count} modulaciones · {row.managed} cajas gestionadas</p></td>
          <td className="p-3 font-semibold">{row.missing ? "Con cajas, sin modulación" : row.count ? "Con modulación" : "Check-in en cero"}</td>
        </tr>)}</tbody>
      </table></div>
      {!visible.length && <p className="py-6 text-center text-slate-500">No hay DT con check-in para estos filtros.</p>}
    </>}
  </section>;
}
