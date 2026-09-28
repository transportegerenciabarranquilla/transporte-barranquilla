import { useEffect, useRef, useState } from "react";
import { CalendarDays, ClipboardList, History, MapPin, Package, X } from "lucide-react";
import type { ClientRangeSummary } from "../lib/clientRangeSummary";

const number = (value: number) => value.toLocaleString("es-CO", { maximumFractionDigits: 2 });
const dateLabel = (value: string) => {
  const parts = value.split("-");
  return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : value || "Sin fecha";
};
const statuses: Record<string, string> = {
  CONCLUDED: "Entregado", DEFINITELY_RETURNED: "Devuelto", NOT_STARTED: "Sin iniciar",
  WAITING_MODULATION: "Esperando modulación", RESCHEDULED: "Reprogramado",
  DELIVERY_STARTED: "Entrega iniciada", PARTIAL_DELIVERY: "Entrega parcial", IMPORTADO: "Visita importada",
};

export default function ClientRangeHistory({ client, from, to, id, onClose }: {
  client: ClientRangeSummary; from: string; to: string; id: string; onClose: () => void;
}) {
  const [view, setView] = useState<"visits" | "modulations">("visits");
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    dialog?.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      dialog?.close();
      document.body.style.overflow = overflow;
      previousFocus?.focus({ preventScroll: true });
    };
  }, []);

  return <dialog ref={dialogRef} id={id} aria-labelledby={`${id}-title`} onCancel={event => { event.preventDefault(); onClose(); }} onClick={event => {
    if (event.target !== event.currentTarget) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose();
  }} className="fixed inset-0 m-auto max-h-[92dvh] w-[calc(100%-2rem)] max-w-3xl overflow-hidden rounded-3xl border-0 bg-white p-0 text-slate-800 shadow-2xl backdrop:bg-slate-950/60 backdrop:backdrop-blur-sm">
    <div className="flex max-h-[92dvh] flex-col">
      <header className="shrink-0 bg-[#10223d] p-5 text-white sm:p-7">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0"><p className="mb-3 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-teal-200"><History size={15} aria-hidden="true" />Historial del cliente</p><h3 id={`${id}-title`} className="break-words text-xl font-bold tracking-tight sm:text-2xl">{client.name}</h3><p className="mt-2 text-xs text-slate-300">{client.code || "Sin código"} · {client.contractor}</p></div>
          <button type="button" autoFocus onClick={onClose} aria-label="Cerrar historial" className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/10 text-white transition hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-teal-300"><X size={18} aria-hidden="true" /></button>
        </div>
        <p className="mt-4 flex items-center gap-2 text-[11px] text-teal-100"><CalendarDays size={14} aria-hidden="true" />{from || to ? `${from ? dateLabel(from) : "Inicio del historial"} → ${to ? dateLabel(to) : "Último registro"}` : "Todo el historial disponible"}</p>
      </header>
      <div className="shrink-0 border-b border-slate-100 bg-white px-5 py-3 sm:px-7">
        <div className="flex gap-2 rounded-xl bg-slate-100 p-1" role="group" aria-label="Tipo de historial">
          <button type="button" aria-pressed={view === "visits"} onClick={() => setView("visits")} className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-2 py-2.5 text-xs font-semibold focus-visible:outline-2 focus-visible:outline-teal-600 ${view === "visits" ? "bg-white text-teal-800 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}><MapPin size={15} aria-hidden="true" />Visitas ({client.visits.length})</button>
          <button type="button" aria-pressed={view === "modulations"} onClick={() => setView("modulations")} className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-2 py-2.5 text-xs font-semibold focus-visible:outline-2 focus-visible:outline-teal-600 ${view === "modulations" ? "bg-white text-indigo-800 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}><ClipboardList size={15} aria-hidden="true" />Modulaciones ({client.modulationHistory.length})</button>
        </div>
      </div>
      <div key={view} className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-slate-50 p-5 sm:p-7" role="region" aria-label={view === "visits" ? `Visitas de ${client.name}` : `Modulaciones de ${client.name}`} tabIndex={0}>
        <p className="mb-4 text-[11px] font-medium text-slate-500">Más recientes primero · {view === "visits" ? "Fecha operativa de la visita" : "Fecha de despacho"}</p>
        {view === "visits" ? <div className="space-y-3">{client.visits.length ? client.visits.map(visit => {
          const volume = (visit.deliveredVolume ?? 0) + (visit.refusedVolume ?? 0);
          const refusal = volume > 0 && visit.deliveredVolume !== null && visit.refusedVolume !== null ? visit.refusedVolume / volume * 100 : null;
          return <article key={visit.key} className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-2"><p className="flex items-center gap-2 text-sm font-bold text-[#10223d]"><CalendarDays size={15} className="text-slate-400" aria-hidden="true" />{dateLabel(visit.date)}</p><span className={`rounded-full px-3 py-1 text-[10px] font-semibold ${visit.withinRadius === null ? "bg-slate-100 text-slate-500" : visit.withinRadius ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>{visit.withinRadius === null ? "Sin validar" : visit.withinRadius ? "Dentro de rango" : "Fuera de rango"}</span></div>
            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs"><span className="font-semibold text-slate-700">DT {visit.dt || "sin registrar"}</span><span className="text-slate-500">{statuses[visit.status] || "Estado no reconocido"}</span></div>
            <dl className="mt-4 grid grid-cols-3 gap-2 border-t border-slate-100 pt-4">
              <div><dt className="text-[10px] text-slate-500">Cajas entregadas</dt><dd className="mt-1 break-words text-base font-bold tabular-nums text-emerald-700">{visit.deliveredVolume === null ? "Sin datos" : number(visit.deliveredVolume)}</dd></div>
              <div><dt className="text-[10px] text-slate-500">Cajas rechazadas</dt><dd className="mt-1 break-words text-base font-bold tabular-nums text-amber-700">{visit.refusedVolume === null ? "Sin datos" : number(visit.refusedVolume)}</dd></div>
              <div><dt className="text-[10px] text-slate-500">Refusal</dt><dd className="mt-1 text-base font-bold tabular-nums text-slate-700">{refusal === null ? "Sin datos" : `${number(refusal)}%`}</dd></div>
            </dl>
          </article>;
        }) : <EmptyHistory label="No hay visitas registradas para este cliente en el período seleccionado." />}</div> : <div className="space-y-3">{client.modulationHistory.length ? client.modulationHistory.map(item => <article key={item.key} className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2"><p className="flex items-center gap-2 text-sm font-bold text-[#10223d]"><CalendarDays size={15} className="text-slate-400" aria-hidden="true" />{dateLabel(item.date)}</p><span className="rounded-full bg-indigo-50 px-3 py-1 text-[10px] font-semibold text-indigo-700">Modulación</span></div>
          <p className="mt-3 text-xs font-semibold text-slate-700">DT {item.dt || "sin registrar"}</p>
          <p className="mt-4 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Causal</p><p className="mt-1 break-words text-sm font-semibold text-indigo-900">{item.causal}</p>
          <p className="mt-4 whitespace-pre-wrap break-words rounded-xl bg-slate-50 p-3 text-xs leading-6 text-slate-600">{item.comment || "Sin comentario registrado"}</p>
        </article>) : <EmptyHistory label="No hay modulaciones registradas para este cliente en el período seleccionado." />}</div>}
      </div>
      <footer className="shrink-0 border-t border-slate-100 px-5 py-3 text-[10px] leading-5 text-slate-500 sm:px-7">{view === "visits" ? "Visitas del cliente en el período seleccionado. Los registros sin rango validado se indican en cada tarjeta." : "Seguimientos del cliente y contratista en el período seleccionado."}</footer>
    </div>
  </dialog>;
}

function EmptyHistory({ label }: { label: string }) {
  return <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-6 py-12 text-center"><Package size={28} className="mx-auto mb-3 text-slate-300" aria-hidden="true" /><p className="text-sm leading-6 text-slate-500">{label}</p></div>;
}
