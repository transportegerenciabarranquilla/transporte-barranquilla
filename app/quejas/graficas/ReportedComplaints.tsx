"use client";

import { useRef, useState } from "react";
import ComplaintChartCard from "./ComplaintChartCard";

const format = (value: number) => value.toLocaleString("es-CO");

export default function ReportedComplaints({ values }: { values: Array<{ label: string; count: number }> }) {
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const pageSize = 4;
  const total = values.reduce((sum, value) => sum + value.count, 0);
  const pages = Math.max(1, Math.ceil(values.length / pageSize));
  const current = Math.min(page, pages - 1);
  const displayed = values.slice(current * pageSize, (current + 1) * pageSize);
  return <ComplaintChartCard title="Quejas reportadas">
    <div className="flex flex-1 flex-col px-3 py-2">
      <div className="flex items-center justify-between pb-1 text-[11px] font-semibold text-slate-500"><span>Descripción · pulsa para leer</span><span>Cantidad</span></div>
      <div className="flex-1 divide-y divide-slate-100">
        {displayed.map(value => <button key={value.label} type="button" onClick={() => { setSelected(value.label); dialog.current?.showModal(); }} className="grid min-h-12 w-full grid-cols-[minmax(0,1fr)_3.5rem] items-center gap-3 rounded py-1.5 text-left hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-slate-500">
          <span className="line-clamp-2 text-[13px] font-medium leading-4 text-slate-800">{value.label}</span>
          <span className="text-right"><strong className="block text-sm tabular-nums text-slate-800">{format(value.count)}</strong><span className="text-[11px] tabular-nums text-slate-500">{(total ? value.count / total * 100 : 0).toLocaleString("es-CO", { maximumFractionDigits: 1 })}%</span></span>
        </button>)}
      </div>
      <footer className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2 text-xs text-slate-600">
        <span>{format(total)} quejas · {format(values.length)} descripciones</span>
        <nav aria-label="Páginas de quejas" className="flex items-center gap-2">
          <button type="button" disabled={current === 0} onClick={() => setPage(current - 1)} className="min-h-8 rounded border border-slate-200 px-2 hover:bg-slate-50 disabled:opacity-40">Anterior</button>
          <span aria-live="polite" className="tabular-nums">{current + 1}/{pages}</span>
          <button type="button" disabled={current === pages - 1} onClick={() => setPage(current + 1)} className="min-h-8 rounded border border-slate-200 px-2 hover:bg-slate-50 disabled:opacity-40">Ver más</button>
        </nav>
      </footer>
    </div>
    <dialog ref={dialog} aria-label="Descripción completa de la queja" className="fixed inset-0 m-auto max-h-[85vh] w-[calc(100%-2rem)] max-w-xl rounded-xl border border-slate-200 p-5 text-slate-800 shadow-xl backdrop:bg-slate-950/40">
      <h3 className="font-bold">Detalle de la queja</h3><p className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed">{selected}</p>
      <form method="dialog" className="mt-4 text-right"><button className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-white">Cerrar</button></form>
    </dialog>
  </ComplaintChartCard>;
}
