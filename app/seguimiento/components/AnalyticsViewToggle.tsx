"use client";

import { BarChart3, FileDown, ShieldAlert, Table2 } from "lucide-react";
import { useRouter } from "next/navigation";

type AnalyticsView = "seguimiento" | "refusal" | "refusal-com";

export function AnalyticsViewToggle({ active }: { active: AnalyticsView }) {
  const router = useRouter();

  return (
    <div className="inline-flex rounded-md border border-slate-200 bg-white p-1 shadow-sm">
      <button
        className={`inline-flex h-8 items-center gap-1.5 rounded px-2.5 text-xs font-semibold transition ${
          active === "seguimiento" ? "bg-[#10223d] text-white shadow-sm" : "text-slate-600 hover:bg-slate-100"
        }`}
        onClick={() => router.push("/seguimiento/graficas")}
        type="button"
      >
        <BarChart3 size={17} />
        Seguimiento
      </button>
      <button
        className={`inline-flex h-8 items-center gap-1.5 rounded px-2.5 text-xs font-semibold transition ${
          active === "refusal" ? "bg-[#10223d] text-white shadow-sm" : "text-slate-600 hover:bg-slate-100"
        }`}
        onClick={() => router.push("/seguimiento/refusal")}
        type="button"
      >
        <ShieldAlert size={17} />
        Refusal
      </button>
      <button
        className={`inline-flex h-8 items-center gap-1.5 rounded px-2.5 text-xs font-semibold transition ${
          active === "refusal-com" ? "bg-[#10223d] text-white shadow-sm" : "text-slate-600 hover:bg-slate-100"
        }`}
        onClick={() => router.push("/seguimiento/graficas/refusal-com")}
        type="button"
      >
        <Table2 size={17} />
        refusal-com
      </button>
      <button
        aria-label="Descargar reporte PDF"
        className="inline-flex h-8 items-center gap-1.5 rounded px-2.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-100"
        onClick={() => router.push("/seguimiento/graficas/reporte-pdf")}
        type="button"
      >
        <FileDown size={17} />
        PDF
      </button>
    </div>
  );
}
