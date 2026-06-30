"use client";

import { BarChart3, FileDown, ShieldAlert, Table2 } from "lucide-react";
import { useRouter } from "next/navigation";

type AnalyticsView = "seguimiento" | "refusal" | "refusal-com";

export function AnalyticsViewToggle({ active }: { active: AnalyticsView }) {
  const router = useRouter();

  function href(path: string) {
    if (typeof window === "undefined") return path;

    const params = new URLSearchParams(window.location.search);
    const nextParams = new URLSearchParams();
    ["fecha", "desde", "hasta"].forEach((key) => {
      const value = params.get(key);
      if (value) nextParams.set(key, value);
    });

    const query = nextParams.toString();
    return query ? `${path}?${query}` : path;
  }

  const activeClass = "bg-gradient-to-r from-[#10223d] to-[#1264ff] text-white shadow-sm";
  const idleClass = "text-slate-600 hover:bg-cyan-50 hover:text-[#07556b]";

  return (
    <div className="inline-flex rounded-md border border-slate-200 bg-white/90 p-1 shadow-sm backdrop-blur">
      <button
        className={`inline-flex h-8 items-center gap-1.5 rounded px-2.5 text-xs font-semibold transition ${
          active === "seguimiento" ? activeClass : idleClass
        }`}
        onClick={() => router.push(href("/seguimiento/graficas"))}
        type="button"
      >
        <BarChart3 size={17} />
        Seguimiento
      </button>
      <button
        className={`inline-flex h-8 items-center gap-1.5 rounded px-2.5 text-xs font-semibold transition ${
          active === "refusal" ? activeClass : idleClass
        }`}
        onClick={() => router.push(href("/seguimiento/refusal"))}
        type="button"
      >
        <ShieldAlert size={17} />
        Refusal
      </button>
      <button
        className={`inline-flex h-8 items-center gap-1.5 rounded px-2.5 text-xs font-semibold transition ${
          active === "refusal-com" ? activeClass : idleClass
        }`}
        onClick={() => router.push(href("/seguimiento/graficas/refusal-com"))}
        type="button"
      >
        <Table2 size={17} />
        refusal-com
      </button>
      <button
        aria-label="Descargar reporte PDF"
        className={`inline-flex h-8 items-center gap-1.5 rounded px-2.5 text-xs font-semibold transition ${idleClass}`}
        onClick={() => router.push(href("/seguimiento/graficas/reporte-pdf"))}
        type="button"
      >
        <FileDown size={17} />
        PDF
      </button>
    </div>
  );
}
