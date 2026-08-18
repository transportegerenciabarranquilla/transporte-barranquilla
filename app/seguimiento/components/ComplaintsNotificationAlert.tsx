import { BellRing, X } from "lucide-react";
import type { ComplaintRecord } from "../../lib/complaints";

export function ComplaintsNotificationAlert({ complaints, contractorName, onClose }: { complaints: ComplaintRecord[]; contractorName?: string; onClose: () => void }) {
  if (!complaints.length) return null;
  const latest = complaints[0];
  const operation = contractorName?.trim() || latest.contractor?.trim() || "La operacion";
  return (
    <section className="relative mb-6 rounded-lg border border-red-200 bg-red-50 p-5 shadow-sm sm:p-6">
      <button aria-label="Cerrar alerta de quejas" className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-lg text-red-500 hover:bg-red-100" onClick={onClose} type="button"><X size={16} /></button>
      <div className="flex items-start gap-3 pr-10">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-md bg-red-700 text-white"><BellRing size={20} /></span>
        <div>
          <p className="text-xs font-black uppercase tracking-[.16em] text-red-700">Nueva alerta de quejas</p>
          <h2 className="mt-1 text-xl font-black text-[#10223d]">{operation} tiene {complaints.length} {complaints.length === 1 ? "queja acumulada" : "quejas acumuladas"}</h2>
          <p className="mt-2 text-sm text-slate-600">Ultima novedad: {latest.dt ? `DT ${latest.dt}` : latest.establishment || `Codigo ${latest.code}`}{latest.plate ? ` · Placa ${latest.plate}` : ""} · {latest.issue || "Sin descripcion"}.</p>
        </div>
      </div>
    </section>
  );
}
