"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Boxes, PackageCheck, Truck, Users } from "lucide-react";
import type { Vehiculo } from "../seguimiento/types";

type Summary = {
  contractor: string;
  rutas: number;
  cajas: number;
  clientes: number;
  visitados: number;
  rechazadas: number;
  gestionadas: number;
  refusalFinal: number;
  refusal: number;
};

export default function AdminPage() {
  const router = useRouter();
  const [summaries, setSummaries] = useState<Summary[]>([]);
  const [records, setRecords] = useState<Vehiculo[]>([]);
  const [selectedContractor, setSelectedContractor] = useState("Todas");
  const [totalCajas, setTotalCajas] = useState(0);
  const [totalRefusalFinal, setTotalRefusalFinal] = useState(0);
  const [totalRefusal, setTotalRefusal] = useState(0);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/seguimiento", { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error || "No se pudo cargar el panel admin.");
        setSummaries(body.summaries || []);
        setRecords(body.records || []);
        setTotalCajas(body.totalCajas || 0);
        setTotalRefusalFinal(body.totalRefusalFinal || 0);
        setTotalRefusal(body.totalRefusal || 0);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "No se pudo cargar el panel admin."))
      .finally(() => setLoading(false));
  }, []);

  const filteredRecords = useMemo(() => {
    if (selectedContractor === "Todas") return records;
    return records.filter((record) => record.transportista === selectedContractor);
  }, [records, selectedContractor]);

  return (
    <main className="min-h-screen bg-[#f4f7fb] text-slate-900">
      <header className="border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 sm:px-8">
          <button
            className="flex h-9 items-center gap-2 rounded-md px-3 text-sm font-semibold text-[#10223d] transition hover:bg-slate-100"
            onClick={() => router.push("/")}
            type="button"
          >
            <ArrowLeft size={18} />
            Portal
          </button>
          <span className="rounded-md bg-[#10223d] px-3 py-2 text-sm font-semibold text-white">Administrador</span>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-5 py-8 sm:px-8 lg:py-10">
        <div className="mb-6">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#0f7c58]">Vista global</p>
          <h1 className="mt-2 text-3xl font-semibold text-[#10223d]">Seguimiento de transportistas</h1>
          <p className="mt-2 text-sm text-slate-500">Total general e información individual de Logisticos, Punto Corona y Surti Cervezas.</p>
        </div>

        {error ? <div className="mb-5 rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">{error}</div> : null}
        {loading ? <div className="mb-5 rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-500">Cargando panel...</div> : null}

        <div className="mb-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Metric icon={<Boxes size={21} />} label="Cajas totales" value={totalCajas.toLocaleString("es-CO")} />
          <Metric icon={<PackageCheck size={21} />} label="Refusal final" value={`${totalRefusalFinal.toLocaleString("es-CO")} cajas`} />
          <Metric icon={<Truck size={21} />} label="% refusal total" value={`${totalRefusal.toLocaleString("es-CO")}%`} />
          <Metric icon={<Users size={21} />} label="Clientes" value={summaries.reduce((total, item) => total + item.clientes, 0).toLocaleString("es-CO")} />
        </div>

        <div className="mb-6 grid gap-4 md:grid-cols-3">
          {summaries.map((summary) => (
            <button
              className={`rounded-lg border bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 ${
                selectedContractor === summary.contractor ? "border-[#f5bd19] ring-2 ring-[#f5bd19]/25" : "border-slate-200"
              }`}
              key={summary.contractor}
              onClick={() => setSelectedContractor(summary.contractor)}
              type="button"
            >
              <p className="text-sm font-semibold text-[#10223d]">{summary.contractor}</p>
              <p className="mt-3 text-3xl font-semibold text-[#0f7c58]">{summary.cajas.toLocaleString("es-CO")}</p>
              <p className="mt-3 text-xs font-semibold text-red-700">
                Refusal: {summary.refusalFinal.toLocaleString("es-CO")} cajas - {summary.refusal.toLocaleString("es-CO")}%
              </p>
              <p className="mt-1 text-xs text-slate-500">cajas · {summary.rutas} rutas · {summary.visitados}/{summary.clientes} clientes</p>
            </button>
          ))}
        </div>

        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-[#10223d]">Seguimiento individual</h2>
          <button
            className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-100"
            onClick={() => setSelectedContractor("Todas")}
            type="button"
          >
            Ver todas
          </button>
        </div>

        <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1120px]">
              <thead className="bg-slate-50 text-xs uppercase tracking-[0.12em] text-slate-500">
                <tr>
                  <th className="px-4 py-3 text-left">Transportista</th>
                  <th className="px-4 py-3 text-left">DT</th>
                  <th className="px-4 py-3 text-left">Vehículo</th>
                  <th className="px-4 py-3 text-left">Responsable</th>
                  <th className="px-4 py-3 text-center">Cajas</th>
                  <th className="px-4 py-3 text-center">Refusal final</th>
                  <th className="px-4 py-3 text-center">% Refusal</th>
                  <th className="px-4 py-3 text-center">Clientes</th>
                  <th className="px-4 py-3 text-center">Visitados</th>
                  <th className="px-4 py-3 text-left">Fecha</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredRecords.map((record, index) => (
                  <tr className="text-sm" key={`${record.transportista}-${record.transporte}-${record.recordId || index}`}>
                    <td className="px-4 py-2.5 font-semibold text-[#10223d]">{record.transportista}</td>
                    <td className="px-4 py-2.5">DT {record.transporte}</td>
                    <td className="px-4 py-2.5">{record.vehiculo}</td>
                    <td className="px-4 py-2.5">{record.responsable}</td>
                    <td className="px-4 py-2.5 text-center font-semibold">{record.cajas}</td>
                    <td className="px-4 py-2.5 text-center font-semibold text-red-700">{record.cajasRefusalFinal || 0}</td>
                    <td className="px-4 py-2.5 text-center">{record.refusal || 0}%</td>
                    <td className="px-4 py-2.5 text-center">{record.clientes}</td>
                    <td className="px-4 py-2.5 text-center">{record.visitados}</td>
                    <td className="px-4 py-2.5">{record.fechaDespacho || record.fechaDt || "-"}</td>
                  </tr>
                ))}
                {!filteredRecords.length ? (
                  <tr>
                    <td className="px-5 py-10 text-center text-sm text-slate-500" colSpan={10}>
                      No hay seguimiento para este filtro.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      </section>
    </main>
  );
}

function Metric({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 inline-grid h-10 w-10 place-items-center rounded-md bg-[#e9f3ff] text-[#10223d]">{icon}</div>
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-[#10223d]">{value}</p>
    </div>
  );
}
