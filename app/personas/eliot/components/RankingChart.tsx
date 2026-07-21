"use client";

import { AlertTriangle } from "lucide-react";
import { formatDuration } from "../lib/time";
import type { CrewRole, RankingEntry } from "../lib/types";

const ROLE_META: Record<CrewRole, { label: string; accent: string; bar: string }> = {
  rr: { label: "Responsables RR", accent: "text-rose-600", bar: "bg-rose-500" },
  aux: { label: "Auxiliares", accent: "text-violet-700", bar: "bg-violet-500" },
  conductor: { label: "Conductores", accent: "text-amber-700", bar: "bg-amber-500" },
};

export function RankingChart({ entries, role, mode }: { entries: RankingEntry[]; role: CrewRole; mode: "mejores" | "offenders" }) {
  const visible = entries.slice(0, 10);
  const max = Math.max(...visible.map((entry) => entry.averageSeconds), 1);
  const meta = ROLE_META[role];

  return (
    <section className="panel overflow-hidden">
      <div className="border-b border-slate-200 bg-slate-50/80 px-3 py-2.5">
        <p className={`text-[9px] font-bold uppercase tracking-[0.14em] ${meta.accent}`}>{meta.label}</p>
        <h2 className="mt-0.5 text-sm font-bold text-[#2d1b4e]">Promedio TD · {mode === "mejores" ? "10 mejores" : "10 offenders"}</h2>
      </div>
      <div className="chart-grid min-h-[305px] space-y-1.5 p-3">
        {visible.map((entry, index) => {
          const width = Math.max(3, (entry.averageSeconds / max) * 100);
          return (
            <div className="grid grid-cols-[18px_minmax(0,1fr)] gap-1.5" key={entry.key}>
              <span className="pt-px text-right text-[9px] font-black text-slate-400">{index + 1}</span>
              <div className="min-w-0">
                <div className="mb-0.5 flex items-start justify-between gap-1.5 text-[10px] leading-3">
                  <span className="truncate font-bold text-slate-700" title={entry.name}>{entry.name}</span>
                  <span className="shrink-0 font-black text-[#2d1b4e]">{formatDuration(entry.averageSeconds)}</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-slate-100 ring-1 ring-slate-200/70">
                  <div className={`h-full rounded-full ${entry.status === "sin-marcacion" ? "bg-red-500" : meta.bar}`} style={{ width: `${width}%` }} />
                </div>
                <div className="mt-0.5 flex items-center justify-between gap-1.5 text-[8px] leading-3 text-slate-500">
                  <span>{entry.document ? `CC ${entry.document}` : "Sin cédula"}</span>
                  {entry.missingMarks ? <span className="inline-flex items-center gap-1 font-bold text-red-600"><AlertTriangle size={11} /> {entry.missingMarks} sin marca</span> : <span>{entry.records} registro{entry.records === 1 ? "" : "s"}</span>}
                </div>
              </div>
            </div>
          );
        })}
        {!visible.length ? <div className="grid min-h-[250px] place-items-center text-center text-xs text-slate-500">No hay personas válidas para este rol y filtro.</div> : null}
      </div>
    </section>
  );
}
