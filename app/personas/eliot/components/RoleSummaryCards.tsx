import { Gauge, UserRoundCheck, UserRoundX } from "lucide-react";
import { formatDuration } from "../lib/time";
import type { CrewRole } from "../lib/types";
import type { DashboardSummary } from "../lib/analytics";

const ROLES: Array<{ role: CrewRole; label: string; accent: string; icon: string }> = [
  { role: "rr", label: "Responsables RR", accent: "text-rose-600", icon: "bg-rose-50 text-rose-600" },
  { role: "aux", label: "Auxiliares", accent: "text-violet-700", icon: "bg-violet-50 text-violet-700" },
  { role: "conductor", label: "Conductores", accent: "text-amber-700", icon: "bg-amber-50 text-amber-700" },
];

export function RoleSummaryCards({ summary }: { summary: DashboardSummary }) {
  return (
    <section className="panel overflow-hidden">
      <div className="border-b border-slate-100 bg-slate-50/70 px-5 py-3">
        <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">Resumen del corte seleccionado</p>
        <h2 className="mt-0.5 text-base font-black text-[#2d1b4e]">Promedio y marcaciones por rol</h2>
      </div>
      <div className="grid md:grid-cols-3 md:divide-x md:divide-slate-100">
        {ROLES.map((item) => {
          const marks = summary.marksByRole[item.role];
          return (
            <article className="p-4" key={item.role}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className={`text-[10px] font-black uppercase tracking-[0.12em] ${item.accent}`}>{item.label}</p>
                  <p className="mt-1 text-2xl font-black tracking-tight text-[#2d1b4e]">{formatDuration(summary.averageByRole[item.role])}</p>
                  <p className="mt-0.5 text-[10px] text-slate-400">Promedio TD del corte</p>
                </div>
                <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${item.icon}`}><Gauge size={18} /></span>
              </div>
              <div className="mt-3 flex gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-teal-50 px-2.5 py-1.5 text-[10px] font-black text-teal-700"><UserRoundCheck size={13} /> {marks.marked} marcaron</span>
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-red-50 px-2.5 py-1.5 text-[10px] font-black text-red-700"><UserRoundX size={13} /> {marks.missing} faltan</span>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
