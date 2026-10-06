"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, BarChart3, RefreshCw } from "lucide-react";
import { RR_TRIP_START_DATE, rrTripsToday, rrTripWorkweek, type RrTripPerson } from "../../lib/rrTripAverage";

type Report = { people: RrTripPerson[]; sourceRows: number };
const integer = new Intl.NumberFormat("es-CO");

export default function PromedioRrPage() {
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [date, setDate] = useState(RR_TRIP_START_DATE);
  useEffect(() => { setDate(rrTripsToday() < RR_TRIP_START_DATE ? RR_TRIP_START_DATE : rrTripsToday()); }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/admin/promedio-rr", { cache: "no-store", signal: controller.signal })
      .then(async response => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error || "No se pudieron cargar los viajes.");
        if (!controller.signal.aborted) { setReport(body as Report); setError(""); }
      })
      .catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "No se pudieron cargar los viajes."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [refresh]);

  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(date) && date >= RR_TRIP_START_DATE;
  const weekDates = useMemo(() => validDate ? rrTripWorkweek(date) : [], [date, validDate]);
  const rows = useMemo(() => (report?.people || []).map(person => {
    const byDate = new Map(person.days.map(day => [day.date, day]));
    return { name: person.name, cc: person.cc, weekdays: weekDates.map(day => ({ date: day, hasRoute: byDate.has(day), planned: byDate.get(day)?.planned ?? null })) };
  }), [report, weekDates]);
  const weekdayNames = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes"];

  return <main className="min-h-screen bg-[#eef3f8] text-[#10223d]">
    <header className="border-b border-slate-200 bg-white"><div className="mx-auto flex max-w-7xl items-center gap-4 px-5 py-5 sm:px-8">
      <Link href="/" aria-label="Volver al panel" className="rounded-lg border border-slate-200 p-2.5 hover:bg-slate-50"><ArrowLeft size={19} /></Link>
      <div><p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-700">Administración · Seguimiento</p><h1 className="mt-1 text-2xl font-bold">Promedio RR</h1></div>
    </div></header>
    <div className="mx-auto max-w-7xl space-y-5 px-4 py-6 sm:px-8">
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div><h2 className="flex items-center gap-2 text-lg font-bold"><BarChart3 size={20} className="text-blue-700" />Clientes planeados por persona</h2><p className="mt-1 text-sm text-slate-600">Consulta la semana de lunes a viernes. Solo se incluyen datos desde el 06/10/2026.</p></div>
          <button type="button" onClick={() => { setLoading(true); setRefresh(value => value + 1); }} disabled={loading} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold hover:bg-slate-50 disabled:opacity-50"><RefreshCw size={16} className={loading ? "animate-spin" : ""} />Actualizar datos</button>
        </div>
        <label className="mt-5 block w-fit text-xs font-semibold text-slate-600">Selecciona un día de la semana<input type="date" required min={RR_TRIP_START_DATE} value={date} onChange={event => setDate(event.target.value)} className="mt-1 block rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" /></label>
        {!validDate && <p role="alert" className="mt-2 text-sm text-red-700">Selecciona una fecha desde el 06/10/2026.</p>}
      </section>
      {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">{error}</p>}
      {loading && !report ? <p role="status" className="rounded-xl bg-white p-8 text-center text-sm text-slate-600">Cargando clientes planeados de Seguimiento…</p> : report && validDate && <>
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 p-5"><h2 className="font-bold">Clientes planeados de lunes a viernes</h2><p className="mt-1 text-xs text-slate-500">Cada cifra suma los clientes programados de las rutas de esa persona en el día indicado. Una ruta compartida cuenta para cada integrante. «Sin registros» indica que no hay rutas ese día; «Sin dato», que la ruta no tiene clientes planeados registrados; «—», un día anterior al 06/10/2026.</p></div>
          <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-[#10223d] text-xs uppercase tracking-wide text-white"><tr>
              <th scope="col" className="px-4 py-3">Persona</th>
              {weekDates.map((day, index) => <th scope="col" className="px-4 py-3 text-center" key={day}><span className="block">{weekdayNames[index]}</span><span className="block text-[10px] font-normal normal-case text-slate-300">{day.split("-").reverse().join("/")}</span></th>)}
            </tr></thead>
            <tbody className="divide-y divide-slate-100">{rows.map(row => <tr key={row.cc} className="even:bg-slate-50/70">
              <th scope="row" className="px-4 py-4 font-semibold">{row.name}</th>
              {row.weekdays.map(day => <td className="px-4 py-4 text-center tabular-nums" key={day.date}>{day.date < RR_TRIP_START_DATE ? "—" : !day.hasRoute ? "Sin registros" : day.planned == null ? "Sin dato" : <><strong className="block text-lg text-blue-800">{integer.format(day.planned)}</strong><span className="text-[11px] text-slate-500">clientes planeados</span></>}</td>)}
            </tr>)}</tbody>
          </table></div>
        </section>
      </>}
    </div>
  </main>;
}
