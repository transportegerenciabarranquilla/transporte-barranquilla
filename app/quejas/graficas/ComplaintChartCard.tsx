import type { ReactNode } from "react";
import { BarChart3, PieChart } from "lucide-react";

export default function ComplaintChartCard({ title, circular = false, children }: { title: string; circular?: boolean; children: ReactNode }) {
  const Icon = circular ? PieChart : BarChart3;
  return <section className="flex h-full min-h-[340px] min-w-0 flex-col rounded-xl border border-slate-200 bg-white shadow-sm">
    <header className="flex min-h-14 shrink-0 items-center gap-2.5 rounded-t-xl border-b border-slate-200 bg-slate-50 px-3 py-2">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#10223d] text-white"><Icon size={20} aria-hidden="true" /></span>
      <h2 className="text-sm font-bold text-[#10223d]">{title}</h2>
    </header>
    {children}
  </section>;
}
