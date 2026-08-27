"use client";

import { ArrowLeft, BarChart3, CheckCircle2, Truck, UserX } from "lucide-react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { DriverAdherenceRow } from "../adherence";

const CACHE_KEY = "zki-driver-adherence-v1";
type StoredAdherence = { date: string; rows: DriverAdherenceRow[] };

export default function ZkiChartsPage() {
  const router = useRouter();
  const [data, setData] = useState<StoredAdherence | null>(null);
  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(CACHE_KEY);
      if (stored) setData(JSON.parse(stored) as StoredAdherence);
    } catch { setData(null); }
  }, []);
  const rows = data?.rows || [];
  const adhered = rows.filter((row) => row.adherent).length;
  const changed = rows.filter((row) => row.status === "Cambió de VH").length;
  const absent = rows.filter((row) => row.status === "Sin asistencia").length;
  const withoutVehicle = rows.filter((row) => row.status === "Sin VH real").length;
  const percent = rows.length ? Math.round(adhered / rows.length * 100) : 0;

  return <main className="min-h-screen bg-[#eef2f5] text-slate-900">
    <header className="border-b border-[#17364d] bg-[#0b2235] text-white"><div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4"><button aria-label="Volver a ZKI" className="grid h-10 w-10 place-items-center rounded-lg hover:bg-white/10" onClick={() => router.push("/personas/zki")} type="button"><ArrowLeft size={20} /></button><div className="text-right"><p className="text-[10px] font-bold uppercase tracking-[.2em] text-amber-300">People Intelligence</p><h1 className="text-xl font-semibold">Gráficas ZKI</h1></div></div></header>
    <section className="mx-auto max-w-6xl space-y-5 px-4 py-6 sm:px-8">
      {!rows.length ? <section className="rounded-2xl border border-amber-300 bg-amber-50 p-8 text-center"><BarChart3 className="mx-auto text-amber-600" size={40} /><h2 className="mt-3 text-xl font-bold">Todavía no hay una planeación cruzada</h2><p className="mt-2 text-sm text-slate-600">Vuelve a Planeación ZKI, pulsa “Planeación de ayer” y carga el Excel.</p></section> : <>
        <section className="grid gap-4 md:grid-cols-[1.25fr_1fr]">
          <article className="flex min-h-72 items-center justify-center gap-8 rounded-2xl border border-amber-300 bg-white p-6 shadow-sm">
            <div aria-label={`${percent}% de conductores salieron en su vehículo planeado`} className="grid h-48 w-48 shrink-0 place-items-center rounded-full" role="img" style={{ background: `conic-gradient(#f59e0b ${percent}%, #e2e8f0 0)` }}><div className="grid h-36 w-36 place-items-center rounded-full bg-white text-center"><div><strong className="text-4xl font-black text-[#0b2235]">{percent}%</strong><span className="mt-1 block text-xs font-bold uppercase text-slate-500">Adherencia</span></div></div></div>
            <div><p className="text-xs font-black uppercase tracking-wider text-amber-700">{data?.date}</p><h2 className="mt-2 text-2xl font-bold text-[#0b2235]">Conductores en su placa</h2><p className="mt-2 max-w-xs text-sm text-slate-600">{adhered} de {rows.length} conductores planeados salieron en el mismo VH registrado en la planeación.</p></div>
          </article>
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-1">
            <Metric icon={<CheckCircle2 size={21} />} label="Cumplieron placa" tone="emerald" value={adhered} />
            <Metric icon={<Truck size={21} />} label="Cambiaron de VH" tone="amber" value={changed} />
            <Metric icon={<UserX size={21} />} label="Sin asistencia" tone="red" value={absent} />
            <Metric icon={<BarChart3 size={21} />} label="Sin VH real" tone="slate" value={withoutVehicle} />
          </div>
        </section>
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="border-b border-slate-200 p-5"><h2 className="font-bold text-[#0b2235]">Detalle de adherencia</h2></div><div className="overflow-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-[#10283d] text-xs uppercase text-white"><tr><th className="px-4 py-3">Conductor</th><th className="px-4 py-3">VH planeado</th><th className="px-4 py-3">VH real</th><th className="px-4 py-3">DT</th><th className="px-4 py-3">Resultado</th></tr></thead><tbody className="divide-y divide-slate-100">{rows.map((row, index) => <tr key={`${row.driverId}-${index}`}><td className="px-4 py-3 font-semibold">{row.driver}</td><td className="px-4 py-3 font-mono font-bold">{row.plannedPlate}</td><td className="px-4 py-3 font-mono font-bold">{row.actualPlate || "—"}</td><td className="px-4 py-3">{row.dt || "—"}</td><td className={`px-4 py-3 font-black ${row.adherent ? "text-emerald-700" : "text-amber-700"}`}>{row.status}</td></tr>)}</tbody></table></div></section>
      </>}
    </section>
  </main>;
}

function Metric({ icon, label, tone, value }: { icon: React.ReactNode; label: string; tone: "emerald" | "amber" | "red" | "slate"; value: number }) {
  const colors = { emerald: "border-emerald-200 bg-emerald-50 text-emerald-800", amber: "border-amber-200 bg-amber-50 text-amber-800", red: "border-red-200 bg-red-50 text-red-800", slate: "border-slate-200 bg-slate-50 text-slate-700" };
  return <article className={`flex items-center justify-between rounded-xl border p-4 ${colors[tone]}`}><span className="flex items-center gap-3 font-bold">{icon}{label}</span><strong className="text-2xl font-black">{value}</strong></article>;
}
