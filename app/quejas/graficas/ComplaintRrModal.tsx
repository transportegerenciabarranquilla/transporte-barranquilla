"use client";

import { useEffect, useId, useRef } from "react";
import { X } from "lucide-react";
import { normalizeComplaintDt } from "../../lib/complaints";
import type { ComplaintChartRow } from "../../lib/complaintCharts";

const format = (value: number) => value.toLocaleString("es-CO");

type Group = { label: string; count: number; dts?: string[]; complaints: ComplaintChartRow[] };

export default function ComplaintRrModal({ group, onClose }: { group: Group; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = dialogRef.current;
    const overflow = document.body.style.overflow;
    dialog?.showModal();
    document.body.style.overflow = "hidden";
    return () => { dialog?.close(); document.body.style.overflow = overflow; };
  }, []);

  return <dialog ref={dialogRef} aria-labelledby={titleId}
    onCancel={event => { event.preventDefault(); onClose(); }}
    onClick={event => { if (event.target === event.currentTarget) onClose(); }}
    className="m-auto max-h-[85dvh] w-[calc(100%-2rem)] max-w-5xl overflow-hidden rounded-2xl border border-slate-200 bg-white p-0 text-[#10223d] shadow-2xl backdrop:bg-slate-950/60 backdrop:backdrop-blur-sm">
    <div className="flex max-h-[85dvh] flex-col">
      <header className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-200 bg-slate-50 px-5 py-4">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-widest text-blue-800">Quejas y clientes del RR</p>
          <h2 id={titleId} className="mt-1 text-lg font-bold">{group.label}</h2>
          <p className="mt-1 break-words text-xs text-slate-600">{group.dts?.length ? "DT: " + group.dts.join(", ") : "Sin DT"}</p>
          <p className="mt-2 text-sm font-semibold">{format(group.count)} quejas</p>
        </div>
        <button type="button" autoFocus aria-label="Cerrar detalle de quejas" onClick={onClose} className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-blue-600"><X size={20} /></button>
      </header>
      <div className="min-h-0 overflow-auto">
              <table className="w-full min-w-[580px] text-left text-xs">
                <thead className="bg-blue-50 text-[10px] uppercase text-slate-600"><tr>{["DT / Ticket", "Cliente", "Queja", "Fecha / Estado", "Cantidad"].map(label => <th key={label} className="px-3 py-2">{label}</th>)}</tr></thead>
                <tbody className="divide-y divide-blue-100">{group.complaints.map((row, index) => <tr key={`${row.complaintId || "row"}-${index}`}>
                  <td className="px-3 py-2 align-top"><span className="block font-semibold">{normalizeComplaintDt(row.dt) || "Sin DT"}</span>{row.complaintId && <span className="mt-1 block text-slate-500">Ticket: {row.complaintId}</span>}</td>
                  <td className="px-3 py-2 align-top"><span className="block font-semibold">{row.client || "Sin nombre de cliente"}</span>{row.clientCode && <span className="mt-1 block text-slate-500">{row.clientCode}</span>}</td>
                  <td className="min-w-52 whitespace-normal px-3 py-2 align-top leading-relaxed">{row.issue}</td>
                  <td className="px-3 py-2 align-top"><span className="block whitespace-nowrap">{row.date ? row.date.split("-").reverse().join("/") : "Sin fecha"}</span><span className="mt-1 block text-slate-500">{row.status}</span></td>
                  <td className="px-3 py-2 align-top font-semibold tabular-nums">{format(row.count)}</td>
                </tr>)}</tbody>
              </table>
      </div>
    </div>
  </dialog>;
}
