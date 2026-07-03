import type { ReactNode } from "react";

export function MetricCard({
  icon,
  label,
  value,
  detail,
}: {
  icon: ReactNode;
  label: string;
  value: string | number;
  detail: string;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white/92 p-4 shadow-[0_14px_36px_rgba(15,23,42,0.07)] transition hover:-translate-y-0.5 hover:shadow-[0_18px_48px_rgba(15,23,42,0.1)]">
      <div className="mb-4 flex items-center justify-between">
        <span className="grid h-10 w-10 place-items-center rounded-md bg-[#10223d] text-white shadow-lg shadow-blue-500/15">{icon}</span>
        <span className="rounded-md border border-emerald-100 bg-emerald-50 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-emerald-700">Activo</span>
      </div>
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <p className="mt-2 truncate text-3xl font-semibold tracking-tight text-[#10223d]">{value}</p>
      <p className="mt-1 text-xs text-slate-400">{detail}</p>
    </div>
  );
}
