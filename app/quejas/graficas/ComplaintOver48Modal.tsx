"use client";

import { X } from "lucide-react";
import { type ComplaintChartRow } from "../../lib/complaintCharts";

export default function ComplaintOver48Modal({ rows, estimated, onClose }: { rows: ComplaintChartRow[]; estimated: boolean; onClose: () => void }) {
  return <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/65 p-4" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section aria-modal="true" aria-labelledby="over48-title" className="flex max-h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl" role="dialog">
      <header className="flex items-start justify-between gap-4 border-b border-slate-200 p-5">
        <div><h2 className="text-xl font-black" id="over48-title">Quejas cerradas en más de 48 horas</h2><p className="mt-1 text-sm text-slate-500">{rows.length} casos · causal, DT y personal responsable</p>{estimated && <p className="mt-1 text-xs text-amber-800">Las fechas sin hora se clasifican por días calendario; el tiempo exacto de 48 horas es estimado.</p>}</div>
        <button aria-label="Cerrar detalle" className="rounded-lg p-2 hover:bg-slate-100" onClick={onClose} type="button"><X size={20} /></button>
      </header>
      <div className="overflow-auto p-4">
        <table className="w-full min-w-[950px] border-collapse text-left text-xs">
          <thead className="sticky top-0 bg-[#10223d] text-white"><tr>{["Ticket", "Cliente", "Ingreso", "Cierre", "Causal", "Novedad", "DT", "Personal (RR)", "Transportista"].map(label => <th className="px-3 py-3" key={label}>{label}</th>)}</tr></thead>
          <tbody className="divide-y divide-slate-100">{rows.map((row, index) => <tr className="align-top even:bg-slate-50" key={`${row.contractor}-${row.complaintId || index}`}>
            <td className="px-3 py-3 font-bold">{row.complaintId || "—"}</td><td className="px-3 py-3">{row.client || "—"}</td>
            <td className="whitespace-nowrap px-3 py-3">{row.openedAt || row.date || "—"}</td><td className="whitespace-nowrap px-3 py-3">{row.closedAt || "—"}</td>
            <td className="min-w-48 px-3 py-3 font-semibold text-amber-900">{row.causal || "Sin causal registrada"}</td>
            <td className="max-w-72 px-3 py-3"><span className="line-clamp-3" title={row.issue}>{row.issue || "—"}</span></td>
            <td className="whitespace-nowrap px-3 py-3">{row.dt || "Sin DT"}</td><td className="min-w-40 px-3 py-3">{row.rr || "Sin personal registrado"}</td>
            <td className="px-3 py-3">{row.contractor}</td>
          </tr>)}</tbody>
        </table>
      </div>
    </section>
  </div>;
}
