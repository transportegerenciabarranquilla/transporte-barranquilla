"use client";

import { Fragment, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, UserRound } from "lucide-react";
import { getFoxtrotRrKey, normalizeDt, summarizeFoxtrotRrs, type FoxtrotRow } from "./foxtrot";

const pageSize = 15;

export default function RrRangeTable({ rows }: { rows: FoxtrotRow[] }) {
  const [page, setPage] = useState(0);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const summaries = summarizeFoxtrotRrs(rows);
  const pages = Math.max(1, Math.ceil(summaries.length / pageSize));
  const current = Math.min(page, pages - 1);
  const start = current * pageSize;

  if (!summaries.length) return null;

  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <header className="border-b border-slate-200 px-4 py-3">
        <h3 className="text-base font-semibold text-[#10223d]">Resumen por RR</h3>
        <p className="mt-0.5 text-xs text-slate-500">Agrupa todos los clientes atendidos por el mismo RR, sin importar el DT.</p>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] table-fixed text-left text-xs">
          <caption className="sr-only">Resumen de entrega en rango por RR.</caption>
          <colgroup><col className="w-[28%]" /><col className="w-[20%]" /><col className="w-[10%]" /><col className="w-[10%]" /><col className="w-[10%]" /><col className="w-[11%]" /><col className="w-[11%]" /></colgroup>
          <thead className="bg-[#10223d] text-[10px] font-semibold uppercase tracking-wider text-white">
            <tr><th className="px-3 py-2">RR</th><th className="px-3 py-2">Contratista</th><th className="px-2 py-2 text-center">Clientes</th><th className="px-2 py-2 text-center">En rango</th><th className="px-2 py-2 text-center">Fuera</th><th className="px-2 py-2 text-center">Sin distancia</th><th className="px-3 py-2 text-right">% entrega</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {summaries.slice(start, start + pageSize).map(summary => {
              const expanded = expandedKey === summary.key;
              const clients = rows.filter(row => getFoxtrotRrKey(row) === summary.key).sort((a, b) => a.name.localeCompare(b.name));
              return <Fragment key={summary.key}>
                <tr className={`${expanded ? "bg-amber-50" : "even:bg-slate-50/80"} hover:bg-amber-50/70`}>
                  <td className="px-3 py-1.5"><button type="button" aria-expanded={expanded} onClick={() => setExpandedKey(expanded ? null : summary.key)} className="inline-flex items-center gap-2 rounded text-left font-semibold text-[#10223d] outline-none focus-visible:ring-2 focus-visible:ring-amber-500"><span className="grid h-6 w-6 shrink-0 place-items-center rounded bg-amber-400 text-[#10223d]"><UserRound size={13} /></span><span>{summary.rr}</span>{expanded ? <ChevronUp className="shrink-0" size={14} /> : <ChevronDown className="shrink-0" size={14} />}</button></td>
                  <td className="px-3 py-1.5 text-slate-600">{summary.contractors.join(", ")}</td>
                  <td className="px-2 py-1.5 text-center"><Count value={summary.total} /></td>
                  <td className="px-2 py-1.5 text-center"><Count value={summary.inRange} tone="green" /></td>
                  <td className="px-2 py-1.5 text-center"><Count value={summary.outOfRange} tone="red" /></td>
                  <td className="px-2 py-1.5 text-center"><Count value={summary.unvalidated} tone="amber" /></td>
                  <td className="whitespace-nowrap px-3 py-1.5 text-right font-bold tabular-nums text-[#10223d]">{summary.deliveryPercent.toFixed(2)}%</td>
                </tr>
                {expanded && <tr className="bg-amber-50/50"><td colSpan={7} className="border-t border-amber-100 px-4 py-3">
                  <div className="overflow-hidden rounded-lg border border-amber-100 bg-white">
                    <div className="flex items-center justify-between border-b border-amber-100 bg-amber-50 px-3 py-2"><p className="text-xs font-semibold text-[#10223d]">Clientes atendidos por {summary.rr}</p><span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-bold tabular-nums text-slate-700">{clients.length} clientes</span></div>
                    <div className="max-h-72 overflow-auto">
                      <table className="w-full min-w-[680px] text-xs">
                        <thead className="sticky top-0 bg-white text-[10px] uppercase tracking-wider text-slate-500 shadow-sm"><tr><th className="px-3 py-2 text-left">Cliente</th><th className="px-3 py-2 text-left">Código</th><th className="px-3 py-2 text-left">DT</th><th className="px-3 py-2 text-center">Rango</th><th className="px-3 py-2 text-right">Distancia</th></tr></thead>
                        <tbody className="divide-y divide-slate-100">{clients.map((client, index) => <tr key={`${client.code}:${client.dt}:${index}`} className="even:bg-slate-50/70"><td className="px-3 py-2 font-medium text-slate-800">{client.name}</td><td className="px-3 py-2 font-mono text-slate-500">{client.code}</td><td className="px-3 py-2 font-mono text-slate-600">{normalizeDt(client.dt)}</td><td className="px-3 py-2 text-center"><RangeStatus value={client.inRange} /></td><td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-slate-600">{client.meters === null ? "—" : `${formatMeters(client.meters)} m`}</td></tr>)}</tbody>
                      </table>
                    </div>
                  </div>
                </td></tr>}
              </Fragment>;
            })}
          </tbody>
        </table>
      </div>
      <footer className="flex items-center justify-between border-t border-slate-200 bg-slate-50/60 px-4 py-2 text-xs text-slate-500"><span className="tabular-nums">{start + 1}–{Math.min(start + pageSize, summaries.length)} de {summaries.length} RR</span><div className="flex items-center gap-3"><span className="tabular-nums">{current + 1} / {pages}</span><button type="button" aria-label="Página anterior de RR" disabled={current === 0} onClick={() => setPage(current - 1)} className="rounded-md border border-slate-200 bg-white p-1.5 disabled:opacity-30"><ChevronLeft size={15} /></button><button type="button" aria-label="Página siguiente de RR" disabled={current >= pages - 1} onClick={() => setPage(current + 1)} className="rounded-md border border-slate-200 bg-white p-1.5 disabled:opacity-30"><ChevronRight size={15} /></button></div></footer>
    </section>
  );
}

function Count({ value, tone = "slate" }: { value: number; tone?: "slate" | "green" | "red" | "amber" }) {
  const colors = { slate: "text-slate-800", green: "text-emerald-700", red: "text-red-700", amber: "text-amber-700" }[tone];
  return <span className={`inline-flex min-w-9 justify-center rounded border border-slate-200 bg-white px-1.5 py-0.5 font-bold tabular-nums ${colors}`}>{value.toLocaleString("es-CO")}</span>;
}

function RangeStatus({ value }: { value: boolean | null }) {
  if (value === null) return <span className="rounded bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-500">Sin distancia</span>;
  return <span className={`rounded px-2 py-1 text-[10px] font-semibold ${value ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>{value ? "En rango" : "Fuera"}</span>;
}

function formatMeters(value: number) {
  return value.toLocaleString("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
