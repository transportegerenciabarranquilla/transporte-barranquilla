"use client";

import Link from "next/link";
import { AlertTriangle, ArrowLeft, Clock3 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { listSnapshots } from "../lib/db";
import { buildPostArrivalEntries, type GeoAttendanceSnapshot } from "../lib/postArrivalTime";
import { formatDuration } from "../lib/time";
import type { TdSnapshot } from "../lib/types";

const ROLE_LABELS = { rr: "Responsable RR", aux: "Auxiliar", conductor: "Conductor" };

export function PostArrivalAlerts({ initialDate, initialSnapshotId }: { initialDate: string; initialSnapshotId: string }) {
  const [snapshots, setSnapshots] = useState<TdSnapshot[]>([]);
  const [attendance, setAttendance] = useState<GeoAttendanceSnapshot[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    Promise.all([
      listSnapshots(),
      fetch("/api/people/attendance-snapshots", { cache: "no-store" }).then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error || "No se pudieron consultar las salidas de GeoVictoria.");
        return (body.snapshots || []) as GeoAttendanceSnapshot[];
      }),
    ]).then(([cuts, geo]) => {
      if (!active) return;
      setSnapshots(cuts);
      setAttendance(geo);
      setSelectedId(cuts.find((cut) => cut.id === initialSnapshotId)?.id || cuts.find((cut) => cut.operationalDate === initialDate)?.id || cuts[0]?.id || "");
    }).catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : "No se pudieron cargar las alertas TML.");
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [initialDate, initialSnapshotId]);

  const selected = snapshots.find((cut) => cut.id === selectedId);
  const entries = useMemo(() => selected ? buildPostArrivalEntries(selected.rows, attendance) : [], [selected, attendance]);
  const alerts = useMemo(() => entries.filter((entry) => entry.durationSeconds !== null && entry.durationSeconds > 45 * 60).sort((a, b) => (b.durationSeconds || 0) - (a.durationSeconds || 0)), [entries]);

  return (
    <main className="min-h-screen bg-[#f4f2fa] px-4 py-6 text-slate-800 sm:px-8 sm:py-9">
      <div className="mx-auto max-w-[1380px] space-y-6">
        <header className="panel flex flex-wrap items-center justify-between gap-4 p-5">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-amber-100 text-amber-700"><AlertTriangle size={22} /></span>
            <div><p className="text-[10px] font-black uppercase tracking-[0.14em] text-amber-700">TML · GeoVictoria</p><h1 className="text-xl font-black text-[#2d1b4e]">Alertas mayores de 45 minutos</h1><p className="mt-1 text-xs text-slate-500">Desde la llegada del vehículo hasta la salida del tripulante en GeoVictoria.</p></div>
          </div>
          <Link className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50" href="/personas/eliot"><ArrowLeft size={15} /> Volver a TML</Link>
        </header>

        {error ? <p className="rounded-xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-semibold text-red-700">{error}</p> : null}
        {loading ? <section className="panel grid min-h-40 place-items-center text-sm text-slate-500">Cargando alertas…</section> : (
          <>
            <section className="panel flex flex-wrap items-center justify-between gap-4 p-5">
              <div className="flex items-center gap-3"><Clock3 className="text-amber-700" size={22} /><div><p className="text-xs font-bold uppercase tracking-wide text-slate-400">Corte seleccionado</p><p className="text-sm font-bold text-[#2d1b4e]">{selected?.operationalDate || "Sin cortes disponibles"}</p></div></div>
              <div className="flex flex-wrap items-center gap-3">
                <label className="text-xs font-bold text-slate-600">Corte <select className="ml-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs" onChange={(event) => setSelectedId(event.target.value)} value={selectedId}>{snapshots.map((cut) => <option key={cut.id} value={cut.id}>{cut.operationalDate} · {cut.fileName}</option>)}</select></label>
                <span className="rounded-xl bg-amber-50 px-4 py-2 text-sm font-black text-amber-800">{alerts.length} {alerts.length === 1 ? "alerta" : "alertas"}</span>
              </div>
            </section>

            <section className="panel overflow-hidden">
              <div className="border-b border-slate-200 bg-slate-50/80 px-5 py-4"><h2 className="text-lg font-black text-[#2d1b4e]">Personas que superaron 45 minutos</h2><p className="mt-1 text-xs text-slate-500">Solo aparecen viajes con llegada del vehículo y salida GeoVictoria válidas.</p></div>
              <div className="max-h-[650px] overflow-auto scrollbar-thin">
                <table className="w-full min-w-[1060px] text-left text-xs">
                  <thead className="sticky top-0 z-10 bg-white text-[10px] uppercase tracking-wider text-slate-400"><tr><th className="px-4 py-3">DT / Viaje</th><th className="px-4 py-3">Placa</th><th className="px-4 py-3">Transportista</th><th className="px-4 py-3">Rol</th><th className="px-4 py-3">Persona</th><th className="px-4 py-3">Cédula</th><th className="px-4 py-3">Llegada vehículo</th><th className="px-4 py-3">Salida GeoVictoria</th><th className="px-4 py-3 text-right">TML</th></tr></thead>
                  <tbody className="divide-y divide-slate-100">{alerts.map((entry) => <tr className="bg-amber-50/40" key={entry.key}><td className="px-4 py-3 font-black text-[#2d1b4e]">{entry.dt || "—"}<span className="block text-[10px] font-normal text-slate-500">Viaje {entry.trip || "—"}</span></td><td className="px-4 py-3 font-semibold">{entry.plate || "—"}</td><td className="px-4 py-3">{entry.carrier || "—"}</td><td className="px-4 py-3">{ROLE_LABELS[entry.role]}</td><td className="px-4 py-3 font-semibold">{entry.name}</td><td className="px-4 py-3">{entry.document || "—"}</td><td className="px-4 py-3 tabular-nums">{entry.arrival}</td><td className="px-4 py-3 tabular-nums">{entry.geoDeparture}</td><td className="px-4 py-3 text-right font-black tabular-nums text-amber-700">{formatDuration(entry.durationSeconds)}</td></tr>)}</tbody>
                </table>
                {!alerts.length ? <p className="px-5 py-10 text-center text-sm text-slate-500">No hay personas con más de 45 minutos en este corte.</p> : null}
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
