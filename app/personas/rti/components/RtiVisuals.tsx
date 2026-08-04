import type { ReactNode } from "react";

export function PanelHeader({ children, compact = false }: { children: ReactNode; compact?: boolean }) {
  return (
    <h2 className={`relative isolate overflow-hidden border-b border-cyan-400/40 bg-[linear-gradient(115deg,#020617_0%,#102a43_48%,#071525_100%)] text-center font-extrabold uppercase tracking-[0.12em] text-white shadow-[inset_0_-1px_0_rgba(34,211,238,.3)] before:absolute before:-left-12 before:top-0 before:h-full before:w-40 before:skew-x-[-24deg] before:bg-cyan-400/10 after:absolute after:bottom-0 after:left-1/2 after:h-px after:w-1/3 after:-translate-x-1/2 after:bg-cyan-300 after:shadow-[0_0_14px_2px_rgba(34,211,238,.8)] ${compact ? "px-3 py-2.5 text-[10px]" : "px-4 py-4 text-sm"}`}>
      <span className="relative z-10 drop-shadow-[0_1px_8px_rgba(103,232,249,.25)]">{children}</span>
    </h2>
  );
}

export function FilterSelect({
  allLabel,
  label,
  onChange,
  options,
  value,
  wide = false,
}: {
  allLabel?: string;
  label: string;
  onChange: (value: string) => void;
  options: string[];
  value: string;
  wide?: boolean;
}) {
  return (
    <label className={`flex h-12 w-full items-center gap-2 rounded-[10px] border border-slate-300 bg-white px-3 text-slate-500 transition focus-within:border-[#20a39e] focus-within:ring-[3px] focus-within:ring-[#20a39e]/10 ${wide ? "lg:col-span-1" : ""}`}>
      <span className="shrink-0 text-[8px] font-extrabold uppercase tracking-[0.08em] text-[#527180]">{label}</span>
      <select className="min-w-0 flex-1 bg-transparent py-2 pl-0.5 pr-5 text-xs font-bold text-[#172b3a] outline-none" onChange={(event) => onChange(event.target.value)} value={value}>
        {allLabel ? <option value="">{allLabel}</option> : null}
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </label>
  );
}

export function DateInput({
  label,
  max,
  min,
  onChange,
  value,
}: {
  label: string;
  max?: string;
  min?: string;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <label className="flex h-12 w-full items-center gap-2 rounded-[10px] border border-slate-300 bg-white px-3 transition focus-within:border-[#20a39e] focus-within:ring-[3px] focus-within:ring-[#20a39e]/10">
      <span className="shrink-0 text-[8px] font-extrabold uppercase tracking-[0.08em] text-[#527180]">{label}</span>
      <input
        className="min-w-0 flex-1 bg-transparent py-2 text-xs font-bold text-[#172b3a] outline-none"
        max={max}
        min={min}
        onChange={(event) => onChange(event.target.value)}
        type="date"
        value={value}
      />
    </label>
  );
}

export function MovementBar({ color, max, value }: { color: string; max: number; value: number }) {
  const height = Math.max((Math.abs(value) / max) * 125, value ? 4 : 2);
  return (
    <div className="flex h-full w-10 flex-col items-center justify-end">
      <span className="mb-1.5 rounded-md bg-white px-1.5 py-0.5 text-[8px] font-extrabold text-slate-700 shadow-sm ring-1 ring-slate-200">{formatChartNumber(value)}</span>
      <div className={`w-7 rounded-t-lg shadow-[0_6px_14px_-5px_rgba(15,23,42,.45)] ${color}`} style={{ height: `${height}px` }} />
    </div>
  );
}

export function formatChartNumber(value: number) {
  return new Intl.NumberFormat("es-CO", {
    maximumFractionDigits: 1,
    notation: Math.abs(value) >= 1_000_000 ? "compact" : "standard",
  }).format(value);
}
