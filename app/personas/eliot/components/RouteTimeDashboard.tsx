"use client";

import Link from "next/link";
import { AlertTriangle, Clock3, Gauge, UserRoundCheck, UserRoundX } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { buildRankings } from "../lib/analytics";
import { buildPostArrivalEntries, type GeoAttendanceSnapshot } from "../lib/postArrivalTime";
import { summarizeRouteTime, type RouteTimeEntry } from "../lib/routeTimeAnalytics";
import { formatDuration } from "../lib/time";
import type { CrewRole, TdRow } from "../lib/types";

const ROLES: Array<{ role: CrewRole; label: string; accent: string; bar: string; icon: string }> = [
  { role: "rr", label: "Responsables RR", accent: "text-rose-600", bar: "bg-rose-500", icon: "bg-rose-50 text-rose-600" },
  { role: "aux", label: "Auxiliares", accent: "text-violet-700", bar: "bg-violet-500", icon: "bg-violet-50 text-violet-700" },
  { role: "conductor", label: "Conductores", accent: "text-amber-700", bar: "bg-amber-500", icon: "bg-amber-50 text-amber-700" },
];

function orderEntries(entries: RouteTimeEntry[], mode: "mejores" | "mayores") {
  return [...entries].sort((a, b) => {
    if (a.averageSeconds === null) return b.averageSeconds === null ? a.name.localeCompare(b.name, "es") : 1;
    if (b.averageSeconds === null) return -1;
    return (mode === "mejores" ? a.averageSeconds - b.averageSeconds : b.averageSeconds - a.averageSeconds) || a.name.localeCompare(b.name, "es");
  });
}

export function RouteTimeDashboard({ rows, operationalDate, snapshotId }: { rows: TdRow[]; operationalDate: string; snapshotId: string }) {
  const [mode, setMode] = useState<"mejores" | "mayores">("mejores");
  const [attendance, setAttendance] = useState<GeoAttendanceSnapshot[]>([]);
  const [attendanceLoading, setAttendanceLoading] = useState(true);
  const [attendanceError, setAttendanceError] = useState("");

  useEffect(() => {
    let active = true;
    fetch("/api/people/attendance-snapshots", { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error || "No se pudieron consultar las marcaciones de GeoVictoria.");
        return body as { snapshots?: GeoAttendanceSnapshot[] };
      })
      .then((body) => { if (active) setAttendance(body.snapshots || []); })
      .catch((reason: unknown) => { if (active) setAttendanceError(reason instanceof Error ? reason.message : "No se pudieron consultar las marcaciones de GeoVictoria."); })
      .finally(() => { if (active) setAttendanceLoading(false); });
    return () => { active = false; };
  }, []);

  const summary = useMemo(() => summarizeRouteTime(rows), [rows]);
  const postArrivalEntries = useMemo(() => buildPostArrivalEntries(rows, attendance), [rows, attendance]);
  const tmlByPerson = useMemo(() => new Map(ROLES.flatMap(({ role }) => buildRankings(rows, role).map((entry) => [entry.key, entry] as const))), [rows]);
  const postArrivalByPerson = useMemo(() => {
    const totals = new Map<string, { seconds: number; count: number }>();
    for (const entry of postArrivalEntries) {
      if (entry.durationSeconds === null) continue;
      const key = `${entry.role}:${entry.document || entry.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim()}`;
      const current = totals.get(key) || { seconds: 0, count: 0 };
      totals.set(key, { seconds: current.seconds + entry.durationSeconds, count: current.count + 1 });
    }
    return new Map([...totals].map(([key, value]) => [key, Math.round(value.seconds / value.count)]));
  }, [postArrivalEntries]);
  const rankings = useMemo(() => ROLES.map(({ role }) => ({ role, entries: orderEntries(summary[role].entries, mode) })), [mode, summary]);
  const alertHref = `/personas/eliot/alertas?${new URLSearchParams({ fecha: operationalDate, corte: snapshotId })}`;

  return (
    <div className="space-y-6">
      {attendanceError ? <p className="rounded-xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-semibold text-red-700">{attendanceError}</p> : null}
      <section className="panel overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/70 px-5 py-3">
          <div><p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">Resumen del corte seleccionado</p><h2 className="mt-0.5 text-base font-black text-[#2d1b4e]">Tiempo en ruta por rol</h2><p className="mt-1 text-xs text-slate-500">Promedios calculados con los tiempos del corte cargado en TML.</p></div>
          <Link className="inline-flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-black text-amber-800 hover:bg-amber-100" href={alertHref}><AlertTriangle size={15} /> Alertas mayores de 45 min</Link>
        </div>
        <div className="grid md:grid-cols-3 md:divide-x md:divide-slate-100">
          {ROLES.map((item) => {
            const roleSummary = summary[item.role];
            return (
              <article className="p-4" key={item.role}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className={`text-[10px] font-black uppercase tracking-[0.12em] ${item.accent}`}>{item.label}</p>
                    <p className="mt-1 text-2xl font-black tracking-tight text-[#2d1b4e]">{roleSummary.averageSeconds === null ? "—" : formatDuration(roleSummary.averageSeconds)}</p>
                    <p className="mt-0.5 text-[10px] text-slate-400">Promedio en ruta del corte</p>
                  </div>
                  <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${item.icon}`}><Gauge size={18} /></span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-lg bg-teal-50 px-2.5 py-1.5 text-[10px] font-black text-teal-700"><UserRoundCheck size={13} /> {roleSummary.measured} con tiempo</span>
                  <span className="inline-flex items-center gap-1.5 rounded-lg bg-red-50 px-2.5 py-1.5 text-[10px] font-black text-red-700"><UserRoundX size={13} /> {roleSummary.pending} pendientes</span>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="panel flex flex-wrap items-center justify-between gap-3 p-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-400">Clasificación por persona</p>
          <p className="mt-1 text-sm font-semibold text-slate-600">Promedio de tiempo en ruta por responsable RR, auxiliar y conductor.</p>
        </div>
        <div className="grid grid-cols-2 rounded-lg bg-slate-100 p-1">
          <button aria-pressed={mode === "mejores"} className={`rounded-md px-3 py-2 text-xs font-black ${mode === "mejores" ? "bg-white text-violet-700 shadow-sm" : "text-slate-500"}`} onClick={() => setMode("mejores")} type="button">10 mejores</button>
          <button aria-pressed={mode === "mayores"} className={`rounded-md px-3 py-2 text-xs font-black ${mode === "mayores" ? "bg-white text-red-700 shadow-sm" : "text-slate-500"}`} onClick={() => setMode("mayores")} type="button">10 mayores tiempos</button>
        </div>
      </section>

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {rankings.map(({ role, entries }) => {
          const meta = ROLES.find((item) => item.role === role)!;
          const visible = entries.filter((entry) => entry.averageSeconds !== null).slice(0, 10);
          const max = Math.max(...visible.map((entry) => entry.averageSeconds ?? 0), 1);
          return (
            <section className="panel overflow-hidden" key={role}>
              <div className="border-b border-slate-200 bg-slate-50/80 px-3 py-2.5">
                <p className={`text-[9px] font-bold uppercase tracking-[0.14em] ${meta.accent}`}>{meta.label}</p>
                <h3 className="mt-0.5 text-sm font-bold text-[#2d1b4e]">Tiempo en ruta · {mode === "mejores" ? "10 mejores" : "10 mayores tiempos"}</h3>
              </div>
              <div className="chart-grid min-h-[305px] space-y-1.5 p-3">
                {visible.map((entry, index) => (
                  <div className="grid grid-cols-[18px_minmax(0,1fr)] gap-1.5" key={entry.key}>
                    <span className="pt-px text-right text-[9px] font-black text-slate-400">{index + 1}</span>
                    <div className="min-w-0">
                      <div className="mb-0.5 flex items-start justify-between gap-1.5 text-[10px] leading-3">
                        <span className="truncate font-bold text-slate-700" title={entry.name}>{entry.name}</span>
                        <span className="shrink-0 font-black text-[#2d1b4e]">{formatDuration(entry.averageSeconds)}</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-slate-100 ring-1 ring-slate-200/70"><div className={`h-full rounded-full ${meta.bar}`} style={{ width: `${Math.max(3, ((entry.averageSeconds ?? 0) / max) * 100)}%` }} /></div>
                      <div className="mt-0.5 flex items-center justify-between gap-1.5 text-[8px] leading-3 text-slate-500">
                        <span>{entry.document ? `CC ${entry.document}` : "Sin cédula"}</span>
                        <span>{entry.routes} ruta{entry.routes === 1 ? "" : "s"}{entry.pending ? ` · ${entry.pending} pendiente${entry.pending === 1 ? "" : "s"}` : ""}</span>
                      </div>
                    </div>
                  </div>
                ))}
                {!visible.length ? <div className="grid min-h-[250px] place-items-center text-center text-xs text-slate-500">No hay tiempos de ruta para este rol y filtro.</div> : null}
              </div>
            </section>
          );
        })}
      </div>

      <section className="panel overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50/80 px-5 py-4">
          <div><p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-violet-700"><Clock3 size={14} /> Listado completo</p><h2 className="mt-1 text-lg font-black text-[#2d1b4e]">TML y tiempo despertino por persona y rol</h2></div>
          <span className="rounded-lg bg-white px-3 py-2 text-xs font-bold text-slate-500 ring-1 ring-slate-200">Orden: {mode === "mejores" ? "menor tiempo" : "mayor tiempo"}</span>
        </div>
        <div className="max-h-[480px] overflow-auto scrollbar-thin">
          <table className="w-full min-w-[700px] text-left text-xs">
            <thead className="sticky top-0 z-10 bg-white text-[10px] uppercase tracking-wider text-slate-400"><tr><th className="px-4 py-3">Rol</th><th className="px-4 py-3">Persona</th><th className="px-4 py-3">Cédula</th><th className="px-4 py-3 text-right">TML</th><th className="px-4 py-3 text-right">Tiempo despertino</th><th className="px-4 py-3 text-right">Promedio en ruta</th></tr></thead>
            <tbody className="divide-y divide-slate-100">{rankings.flatMap(({ role, entries }) => entries.map((entry) => (
              <tr className="hover:bg-slate-50" key={entry.key}><td className="px-4 py-3 font-bold text-slate-600">{ROLES.find((item) => item.role === role)?.label}</td><td className="px-4 py-3 font-bold text-[#2d1b4e]">{entry.name}</td><td className="px-4 py-3 text-slate-500">{entry.document || "—"}</td><td className="px-4 py-3 text-right font-bold tabular-nums text-[#2d1b4e]">{tmlByPerson.get(entry.key)?.missingMarks === tmlByPerson.get(entry.key)?.records ? "Pendiente" : formatDuration(tmlByPerson.get(entry.key)?.averageSeconds ?? null)}</td><td className="px-4 py-3 text-right font-bold tabular-nums text-amber-700">{attendanceLoading ? "Cargando…" : postArrivalByPerson.has(entry.key) ? formatDuration(postArrivalByPerson.get(entry.key)!) : "Pendiente"}</td><td className="px-4 py-3 text-right font-black text-[#2d1b4e]">{entry.averageSeconds === null ? "Pendiente" : formatDuration(entry.averageSeconds)}</td></tr>
            )))}</tbody>
          </table>
          {!rankings.some(({ entries }) => entries.length) ? <p className="px-5 py-8 text-center text-sm text-slate-500">No hay personas para los filtros seleccionados.</p> : null}
        </div>
      </section>

    </div>
  );
}
