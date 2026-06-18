"use client";

import { BarChart3, ShieldAlert } from "lucide-react";
import { useRouter } from "next/navigation";

type AnalyticsView = "seguimiento" | "refusal";

export function AnalyticsViewToggle({ active }: { active: AnalyticsView }) {
  const router = useRouter();

  return (
    <div className="inline-flex rounded-md border border-slate-200 bg-white p-1 shadow-sm">
      <button
        className={`inline-flex h-10 items-center gap-2 rounded px-3 text-sm font-semibold transition ${
          active === "seguimiento" ? "bg-[#10223d] text-white shadow-sm" : "text-slate-600 hover:bg-slate-100"
        }`}
        onClick={() => router.push("/seguimiento/graficas")}
        type="button"
      >
        <BarChart3 size={17} />
        Seguimiento
      </button>
      <button
        className={`inline-flex h-10 items-center gap-2 rounded px-3 text-sm font-semibold transition ${
          active === "refusal" ? "bg-[#10223d] text-white shadow-sm" : "text-slate-600 hover:bg-slate-100"
        }`}
        onClick={() => router.push("/seguimiento/refusal")}
        type="button"
      >
        <ShieldAlert size={17} />
        Refusal
      </button>
    </div>
  );
}
