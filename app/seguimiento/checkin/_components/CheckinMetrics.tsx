import { BadgeCheck, Boxes, RotateCcw, Truck, XCircle, type LucideIcon } from "lucide-react";
import type { CheckinTotals } from "../_lib/checkinPage";

export function CheckinMetrics({ totals }: { totals: CheckinTotals }) {
  return (
    <div className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
      <Metric icon={Truck} label="Carros del día" value={totals.vehiculos} />
      <Metric icon={XCircle} label="Cajas moduladas" tone="red" value={totals.moduladas} />
      <Metric icon={RotateCcw} label="Gestionadas" tone="green" value={totals.gestionadas} />
      <Metric icon={Boxes} label="Cajas finales" tone="amber" value={totals.final} />
      <Metric icon={BadgeCheck} label="Checkins realizados" tone="green" value={totals.checkinsRealizados} />
    </div>
  );
}

function Metric({ icon: Icon, label, value, tone = "navy" }: { icon: LucideIcon; label: string; value: number; tone?: "navy" | "red" | "green" | "amber" }) {
  const colors = {
    navy: "bg-[#e9f3ff] text-[#10223d]",
    red: "bg-red-50 text-red-700",
    green: "bg-emerald-50 text-emerald-700",
    amber: "bg-amber-50 text-amber-700",
  };
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <span className={`mb-4 grid h-11 w-11 place-items-center rounded-md ${colors[tone]}`}><Icon size={21} /></span>
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <p className="mt-1 text-3xl font-semibold text-[#10223d]">{value}</p>
    </div>
  );
}
