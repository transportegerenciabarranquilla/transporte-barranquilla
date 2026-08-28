"use client";

import { ArrowLeft, BarChart3, CheckCircle2, Truck, UserX } from "lucide-react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { DriverAdherenceRow } from "../adherence";

const CACHE_KEY = "zki-driver-adherence-v5-complete-table";
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
  const responsibleAdhered = rows.filter((row) => row.responsibleAdherent).length;
  const auxiliaryAdhered = rows.filter((row) => row.auxiliaryAdherent).length;
  const crewAdhered = rows.filter((row) => row.crewAdherent).length;
  const changedDriver = rows.filter((row) => row.status === "VH salió con otro conductor" || (row.status as string) === "Cambió de VH").length;
  const absent = rows.filter((row) => row.status === "Sin asistencia").length;
  const withoutVehicle = rows.filter((row) => row.status === "Sin VH de salida" || (row.status as string) === "Sin VH real").length;

  return <main className="min-h-screen bg-[#eef2f5] text-slate-900">
    <header className="border-b border-[#17364d] bg-[#0b2235] text-white"><div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4"><button aria-label="Volver a ZKI" className="grid h-10 w-10 place-items-center rounded-lg hover:bg-white/10" onClick={() => router.push("/personas/zki")} type="button"><ArrowLeft size={20} /></button><div className="text-right"><p className="text-[10px] font-bold uppercase tracking-[.2em] text-amber-300">People Intelligence</p><h1 className="text-xl font-semibold">Gráficas ZKI</h1></div></div></header>
    <section className="mx-auto max-w-6xl space-y-5 px-4 py-6 sm:px-8">
      {!rows.length ? <section className="rounded-2xl border border-amber-300 bg-amber-50 p-8 text-center"><BarChart3 className="mx-auto text-amber-600" size={40} /><h2 className="mt-3 text-xl font-bold">Todavía no hay una planeación cruzada</h2><p className="mt-2 text-sm text-slate-600">Vuelve a Planeación ZKI, pulsa “Planeación de ayer” y carga el Excel.</p></section> : <>
        <section className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <AdherenceCircle color="#f59e0b" count={adhered} label="Conductor" total={rows.length} />
            <AdherenceCircle color="#0891b2" count={responsibleAdhered} label="RR" total={rows.length} />
            <AdherenceCircle color="#7c3aed" count={auxiliaryAdhered} label="Auxiliar" total={rows.length} />
            <AdherenceCircle color="#059669" count={crewAdhered} label="Los tres" total={rows.length} />
          </div>
          <p className="text-center text-xs font-black uppercase tracking-wider text-amber-700">Planeación auditada: {data?.date}</p>
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-1">
            <Metric icon={<CheckCircle2 size={21} />} label="Cumplieron placa" tone="emerald" value={adhered} />
            <Metric icon={<Truck size={21} />} label="VH con otro conductor" tone="amber" value={changedDriver} />
            <Metric icon={<UserX size={21} />} label="Sin asistencia" tone="red" value={absent} />
            <Metric icon={<BarChart3 size={21} />} label="Sin VH de salida" tone="slate" value={withoutVehicle} />
          </div>
        </section>
        <CompleteCrewTable rows={rows} />
      </>}
    </section>
  </main>;
}

function Metric({ icon, label, tone, value }: { icon: React.ReactNode; label: string; tone: "emerald" | "amber" | "red" | "slate"; value: number }) {
  const colors = { emerald: "border-emerald-200 bg-emerald-50 text-emerald-800", amber: "border-amber-200 bg-amber-50 text-amber-800", red: "border-red-200 bg-red-50 text-red-800", slate: "border-slate-200 bg-slate-50 text-slate-700" };
  return <article className={`flex items-center justify-between rounded-xl border p-4 ${colors[tone]}`}><span className="flex items-center gap-3 font-bold">{icon}{label}</span><strong className="text-2xl font-black">{value}</strong></article>;
}

function AdherenceCircle({ color, count, label, total }: { color: string; count: number; label: string; total: number }) {
  const percent = total ? Math.round(count / total * 100) : 0;
  return <article className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div aria-label={`${percent}% de adherencia de ${label}`} className="grid h-28 w-28 shrink-0 place-items-center rounded-full" role="img" style={{ background: `conic-gradient(${color} ${percent}%, #e2e8f0 0)` }}><div className="grid h-20 w-20 place-items-center rounded-full bg-white"><strong className="text-2xl font-black text-[#0b2235]">{percent}%</strong></div></div><div><p className="text-lg font-black text-[#0b2235]">{label}</p><p className="mt-1 text-xs font-semibold text-slate-500">{count} de {total} coincidieron</p></div></article>;
}

function CompleteCrewTable({ rows }: { rows: DriverAdherenceRow[] }) {
  return <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><header className="flex items-center justify-between border-b border-slate-200 px-4 py-3"><div><h2 className="font-bold text-[#0b2235]">Detalle de tripulación completa</h2><p className="text-[10px] text-slate-500">Comparación del VH y de cada persona planeada contra la salida.</p></div><span className="rounded-full bg-emerald-100 px-3 py-1 text-[10px] font-black text-emerald-800">{rows.filter((row) => row.crewAdherent).length}/{rows.length} completas</span></header><div className="max-h-[560px] overflow-auto"><table className="w-full min-w-[1500px] table-fixed text-left text-[9px]"><thead className="sticky top-0 z-10 bg-[#10283d] text-[8px] uppercase text-white"><tr><th className="w-[65px] px-2 py-2">Terr.</th><th className="w-[72px] px-2 py-2">VH plan</th><th className="w-[72px] px-2 py-2">VH salida</th><th className="w-[175px] px-2 py-2">Conductor plan</th><th className="w-[175px] px-2 py-2">Conductor salida</th><th className="w-[44px] px-1 py-2 text-center">Cond.</th><th className="w-[175px] px-2 py-2">RR plan</th><th className="w-[175px] px-2 py-2">RR salida</th><th className="w-[40px] px-1 py-2 text-center">RR</th><th className="w-[175px] px-2 py-2">Auxiliar plan</th><th className="w-[175px] px-2 py-2">Auxiliar salida</th><th className="w-[44px] px-1 py-2 text-center">Aux.</th><th className="w-[52px] px-1 py-2 text-center">Total</th><th className="w-[96px] px-2 py-2">DT</th></tr></thead><tbody className="divide-y divide-slate-100">{rows.map((row, index) => { const total = Number(row.adherent) + Number(row.responsibleAdherent) + Number(row.auxiliaryAdherent); return <tr className={row.crewAdherent ? "bg-emerald-50/30" : "bg-amber-50/30"} key={`${row.driverId}-${row.plannedPlate}-${index}`}><CompactCell value={row.territory || String(index + 1)} /><CompactCell mono value={row.plannedPlate} /><CompactCell mono value={row.actualPlate} /><CompactCell strong value={row.driver} /><CompactCell value={row.actualDriver} /><StatusCell ok={row.adherent} /><CompactCell strong value={row.responsible} /><CompactCell value={row.actualResponsible} /><StatusCell ok={row.responsibleAdherent} /><CompactCell strong value={row.auxiliary} /><CompactCell value={row.actualAuxiliary} /><StatusCell ok={row.auxiliaryAdherent} /><td className={`px-1 py-2 text-center font-black ${row.crewAdherent ? "text-emerald-700" : "text-amber-700"}`}>{total}/3</td><CompactCell mono value={row.dt} /></tr>; })}</tbody></table></div></section>;
}

function CompactCell({ mono = false, strong = false, value }: { mono?: boolean; strong?: boolean; value: string }) {
  return <td className={`truncate px-2 py-2 ${mono ? "font-mono" : ""} ${strong ? "font-bold text-[#10283d]" : "text-slate-600"}`} title={value}>{value || "—"}</td>;
}

function StatusCell({ ok }: { ok: boolean }) {
  return <td className={`px-1 py-2 text-center font-black ${ok ? "text-emerald-700" : "text-amber-700"}`}>{ok ? "Sí" : "No"}</td>;
}
