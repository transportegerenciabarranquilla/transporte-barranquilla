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
    <div className="tech-card metric-glow rounded-lg p-5">
      <div className="mb-5 flex items-center justify-between">
        <span className="grid h-11 w-11 place-items-center rounded-md bg-gradient-to-br from-[#10223d] to-[#1264ff] text-white shadow-lg shadow-blue-500/20">{icon}</span>
        <span className="relative h-2.5 w-2.5 rounded-full bg-[#11a36a]">
          <span className="absolute inset-0 animate-ping rounded-full bg-[#11a36a]/40" />
        </span>
      </div>
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <p className="mt-2 text-3xl font-semibold tracking-tight text-[#10223d]">{value}</p>
      <p className="mt-1 text-xs text-slate-400">{detail}</p>
    </div>
  );
}
