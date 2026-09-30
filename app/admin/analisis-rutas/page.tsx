"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ChartColumn, Home } from "lucide-react";
import DiferenciaKilometros from "../graficas/page1";
import type { PerformanceVehicle } from "../../lib/routePerformanceImport";

export default function AnalisisRutasPage() {
  const [records, setRecords] = useState<PerformanceVehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/admin/seguimiento", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error || "No se pudo cargar Seguimiento para cruzar las rutas.");
        if (!controller.signal.aborted) setRecords(body.records || []);
      })
      .catch((cause) => {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "No se pudo cargar Seguimiento.");
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);

  return <main className="min-h-screen bg-[#f4f7fb] text-[#10223d]">
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-4 px-5 py-5 sm:px-8">
        <div className="flex items-center gap-3">
          <Link href="/" aria-label="Volver al panel de módulos" className="rounded-lg border border-slate-200 p-2.5 hover:bg-slate-50"><ArrowLeft size={20} /></Link>
          <div><p className="text-xs font-semibold uppercase tracking-[.16em] text-emerald-700">Módulo admin</p><h1 className="text-2xl font-semibold">Route Tracking</h1></div>
        </div>
        <nav className="flex gap-3" aria-label="Navegación de Route Tracking">
          <Link href="/admin/graficas" className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium hover:bg-slate-50"><ChartColumn size={17} />Gráficas</Link>
          <Link href="/" className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium hover:bg-slate-50"><Home size={17} />Panel admin</Link>
        </nav>
      </div>
    </header>
    <div className="mx-auto max-w-[1600px] px-4 py-6 sm:px-8">
      <DiferenciaKilometros records={records} recordsLoading={loading} recordsError={error} />
    </div>
  </main>;
}
