"use client";

import { Fragment, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Truck } from "lucide-react";
import { FOXTROT_RANGE_LIMIT_METERS, getFoxtrotCrewKey, normalizeDt, summarizeFoxtrotCrews, type FoxtrotRow } from "./foxtrot";

const pageSize = 15;

export default function CrewRangeTable({ rows }: { rows: FoxtrotRow[] }) {
  const [page, setPage] = useState(0);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const summaries = summarizeFoxtrotCrews(rows);
  const pages = Math.max(1, Math.ceil(summaries.length / pageSize));
  const current = Math.min(page, pages - 1);
  const start = current * pageSize;

  if (!summaries.length) return null;

  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <header className="border-b border-slate-200 px-4 py-3">
        <h3 className="text-base font-semibold text-[#10223d]">Detalle por tripulación</h3>
        <p className="mt-0.5 text-xs text-slate-500">Rango de entrega calculado con las visitas válidas de Foxtrot.</p>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[920px] table-fixed text-left text-xs">
          <caption className="sr-only">Detalle de entrega en rango por tripulación.</caption>
          <colgroup><col className="w-[15%]" /><col className="w-[26%]" /><col className="w-[19%]" /><col className="w-[10%]" /><col className="w-[10%]" /><col className="w-[10%]" /><col className="w-[10%]" /></colgroup>
          <thead className="bg-[#10223d] text-[10px] font-semibold uppercase tracking-wider text-white">
            <tr>
              <th scope="col" className="px-3 py-2">DT</th>
              <th scope="col" className="px-3 py-2">Tripulación</th>
              <th scope="col" className="px-3 py-2">Contratista</th>
              <th scope="col" className="px-2 py-2 text-center">Visitas</th>
              <th scope="col" className="px-2 py-2 text-center">En rango</th>
              <th scope="col" className="px-2 py-2 text-center">Fuera</th>
              <th scope="col" className="px-3 py-2 text-right">% entrega</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {summaries.slice(start, start + pageSize).map(summary => {
              const unresolved = summary.contractor.startsWith("DT ");
              const expanded = expandedKey === summary.key;
              const clients = rows
                .filter(row => row.inRange === false && getFoxtrotCrewKey(row) === summary.key)
                .sort((a, b) => (b.meters || 0) - (a.meters || 0));
              return (
                <Fragment key={summary.key}>
                <tr className={`${expanded ? "bg-blue-50" : "even:bg-slate-50/80"} hover:bg-blue-50/60`}>
                  <td className="px-3 py-1.5"><button type="button" aria-expanded={expanded} onClick={() => setExpandedKey(expanded ? null : summary.key)} className="inline-flex items-center gap-1.5 whitespace-nowrap rounded font-mono font-semibold text-[#10223d] outline-none focus-visible:ring-2 focus-visible:ring-blue-500"><span className="grid h-6 w-6 place-items-center rounded bg-blue-700 text-white"><Truck size={12} /></span>{normalizeDt(summary.dt)}{expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</button></td>
                  <td className="px-3 py-1.5 font-medium leading-4 text-slate-700">{summary.rr}</td>
                  <td className="px-3 py-1.5">{unresolved ? <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 ring-1 ring-inset ring-amber-200">Sin cruce</span> : <span className="font-medium text-slate-600">{summary.contractor}</span>}</td>
                  <td className="px-2 py-1.5 text-center"><Count value={summary.total} /></td>
                  <td className="px-2 py-1.5 text-center"><Count value={summary.inRange} tone="green" /></td>
                  <td className="px-2 py-1.5 text-center"><Count value={summary.outOfRange} tone="red" /></td>
                  <td className="whitespace-nowrap px-3 py-1.5 text-right font-bold tabular-nums text-[#10223d]">{summary.deliveryPercent.toFixed(2)}%</td>
                </tr>
                {expanded && <tr className="bg-blue-50/60">
                  <td colSpan={7} className="border-t border-blue-100 px-4 py-3">
                    <div className="overflow-hidden rounded-lg border border-blue-100 bg-white">
                      <div className="flex items-center justify-between gap-3 border-b border-blue-100 bg-blue-50 px-3 py-2">
                        <p className="text-xs font-semibold text-[#10223d]">Clientes fuera de rango del DT {normalizeDt(summary.dt)}</p>
                        <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-bold tabular-nums text-red-700">{clients.length} cliente{clients.length === 1 ? "" : "s"}</span>
                      </div>
                      {clients.length ? <div className="max-h-64 overflow-auto">
                        <table className="w-full min-w-[560px] text-xs">
                          <thead className="sticky top-0 bg-white text-[10px] uppercase tracking-wider text-slate-500 shadow-sm">
                            <tr><th className="px-3 py-2 text-left">Cliente</th><th className="px-3 py-2 text-left">Código</th><th className="px-3 py-2 text-right">Al cliente</th><th className="px-3 py-2 text-right">Fuera de rango</th></tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {clients.map((client, index) => <tr key={`${client.code}:${index}`} className="even:bg-slate-50/70"><td className="px-3 py-2 font-medium text-slate-800">{client.name}</td><td className="px-3 py-2 font-mono text-slate-500">{client.code}</td><td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-slate-600">{formatMeters(client.meters || 0)} m</td><td className="whitespace-nowrap px-3 py-2 text-right font-bold tabular-nums text-red-700">+{formatMeters((client.meters || 0) - FOXTROT_RANGE_LIMIT_METERS)} m</td></tr>)}
                          </tbody>
                        </table>
                      </div> : <p className="px-3 py-5 text-center text-xs text-slate-500">Esta tripulación no tiene clientes fuera de rango.</p>}
                    </div>
                  </td>
                </tr>}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      <footer className="flex items-center justify-between border-t border-slate-200 bg-slate-50/60 px-4 py-2 text-xs text-slate-500">
        <span className="tabular-nums">{start + 1}–{Math.min(start + pageSize, summaries.length)} de {summaries.length} tripulaciones</span>
        <div className="flex items-center gap-3">
          <span className="tabular-nums">{current + 1} / {pages}</span>
          <button type="button" aria-label="Página anterior" disabled={current === 0} onClick={() => setPage(current - 1)} className="rounded-md border border-slate-200 bg-white p-1.5 text-slate-700 hover:bg-slate-100 disabled:opacity-30"><ChevronLeft size={15} /></button>
          <button type="button" aria-label="Página siguiente" disabled={current >= pages - 1} onClick={() => setPage(current + 1)} className="rounded-md border border-slate-200 bg-white p-1.5 text-slate-700 hover:bg-slate-100 disabled:opacity-30"><ChevronRight size={15} /></button>
        </div>
      </footer>
    </section>
  );
}

function formatMeters(value: number) {
  return value.toLocaleString("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function Count({ value, tone = "slate" }: { value: number; tone?: "slate" | "green" | "red" }) {
  const colors = { slate: "text-slate-800", green: "text-emerald-700", red: "text-red-700" }[tone];
  return <span className={`inline-flex min-w-9 justify-center rounded border border-slate-200 bg-white px-1.5 py-0.5 font-bold tabular-nums ${colors}`}>{value.toLocaleString("es-CO")}</span>;
}
