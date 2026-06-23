"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Boxes, CalendarDays, PackageCheck, Truck, Users, X } from "lucide-react";
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
  const [selectedDate, setSelectedDate] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/seguimiento", { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error || "No se pudo cargar el panel admin.");
        setSummaries(body.summaries || []);
        setRecords(body.records || []);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "No se pudo cargar el panel admin."))
      .finally(() => setLoading(false));
  }, []);

  const dateRecords = useMemo(() => {
    if (!selectedDate) return records;
    return records.filter((record) => getRecordDate(record) === selectedDate);
  }, [records, selectedDate]);

  const visibleSummaries = useMemo(() => {
    return summaries.map((summary) => {
      const contractorRecords = dateRecords.filter((record) => record.transportista === summary.contractor);
      const cajas = contractorRecords.reduce((total, record) => total + Number(record.cajas || 0), 0);
      const refusalFinal = contractorRecords.reduce((total, record) => total + Number(record.cajasRefusalFinal || 0), 0);

      return {
        contractor: summary.contractor,
        rutas: contractorRecords.length,
        cajas,
        clientes: contractorRecords.reduce((total, record) => total + Number(record.clientes || 0), 0),
        visitados: contractorRecords.reduce((total, record) => total + Number(record.visitados || 0), 0),
        rechazadas: contractorRecords.reduce((total, record) => total + Number(record.cajasRechazadas || 0), 0),
        gestionadas: contractorRecords.reduce((total, record) => total + Number(record.cajasGestionadas || 0), 0),
        refusalFinal,
        refusal: cajas ? Number(((refusalFinal / cajas) * 100).toFixed(2)) : 0,
      };
    });
  }, [dateRecords, summaries]);

  const totals = useMemo(() => {
    const values = dateRecords.reduce(
      (acc, record) => ({
        cajas: acc.cajas + Number(record.cajas || 0),
        clientes: acc.clientes + Number(record.clientes || 0),
        refusalFinal: acc.refusalFinal + Number(record.cajasRefusalFinal || 0),
      }),
      { cajas: 0, clientes: 0, refusalFinal: 0 },
    );

    return {
      ...values,
      refusal: values.cajas ? Number(((values.refusalFinal / values.cajas) * 100).toFixed(2)) : 0,
    };
  }, [dateRecords]);

  const filteredRecords = useMemo(() => {
    if (selectedContractor === "Todas") return dateRecords;
    return dateRecords.filter((record) => record.transportista === selectedContractor);
  }, [dateRecords, selectedContractor]);

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

        <div className="mb-5 flex flex-wrap items-end justify-between gap-3 rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
          <label className="min-w-[220px] flex-1 text-sm font-semibold text-[#10223d]">
            <span className="mb-1 flex items-center gap-2 text-xs uppercase tracking-[0.14em] text-slate-500">
              <CalendarDays size={16} />
              Filtrar por día
            </span>
            <input
              className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 outline-none transition focus:border-[#0f7c58] focus:ring-2 focus:ring-[#0f7c58]/15"
              onChange={(event) => setSelectedDate(event.target.value)}
              type="date"
              value={selectedDate}
            />
          </label>
          <button
            className="flex h-10 items-center gap-2 rounded-md border border-slate-200 px-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-45"
            disabled={!selectedDate && selectedContractor === "Todas"}
            onClick={() => {
              setSelectedDate("");
              setSelectedContractor("Todas");
            }}
            type="button"
          >
            <X size={16} />
            Limpiar filtros
          </button>
        </div>

        <div className="mb-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Metric icon={<Boxes size={21} />} label="Cajas totales" value={totals.cajas.toLocaleString("es-CO")} />
          <Metric icon={<PackageCheck size={21} />} label="Refusal final" value={`${totals.refusalFinal.toLocaleString("es-CO")} cajas`} />
          <Metric icon={<Truck size={21} />} label="% refusal total" value={`${totals.refusal.toLocaleString("es-CO")}%`} />
          <Metric icon={<Users size={21} />} label="Clientes" value={totals.clientes.toLocaleString("es-CO")} />
        </div>

        <div className="mb-5 grid gap-3 md:grid-cols-3">
          {visibleSummaries.map((summary) => (
            <button
              className={`rounded-lg border bg-white p-3 text-left shadow-sm transition hover:-translate-y-0.5 ${
                selectedContractor === summary.contractor ? "border-[#f5bd19] ring-2 ring-[#f5bd19]/25" : "border-slate-200"
              }`}
              key={summary.contractor}
              onClick={() => setSelectedContractor(summary.contractor)}
              type="button"
            >
              <p className="text-sm font-semibold text-[#10223d]">{summary.contractor}</p>
              <p className="mt-2 text-2xl font-semibold text-[#0f7c58]">{summary.cajas.toLocaleString("es-CO")}</p>
              <p className="mt-2 text-xs font-semibold text-red-700">
                Refusal: {summary.refusalFinal.toLocaleString("es-CO")} cajas - {summary.refusal.toLocaleString("es-CO")}%
              </p>
              <p className="mt-1 text-xs text-slate-500">cajas · {summary.rutas} rutas · {summary.visitados}/{summary.clientes} clientes</p>
            </button>
          ))}
        </div>

        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-[#10223d]">Seguimiento individual ({filteredRecords.length})</h2>
          <button
            className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-100"
            onClick={() => setSelectedContractor("Todas")}
            type="button"
          >
            Ver todas
          </button>
        </div>

        <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="max-h-[62vh] overflow-auto">
            <table className="w-full min-w-[1120px]">
              <thead className="sticky top-0 z-10 bg-slate-50 text-[11px] uppercase tracking-[0.08em] text-slate-500 shadow-[0_1px_0_0_rgba(226,232,240,1)]">
                <tr>
                  <th className="px-3 py-2 text-left">Transportista</th>
                  <th className="px-3 py-2 text-left">DT</th>
                  <th className="px-3 py-2 text-left">Vehículo</th>
                  <th className="px-3 py-2 text-left">Responsable</th>
                  <th className="px-3 py-2 text-center">Cajas</th>
                  <th className="px-3 py-2 text-center">Refusal final</th>
                  <th className="px-3 py-2 text-center">% Refusal</th>
                  <th className="px-3 py-2 text-center">Clientes</th>
                  <th className="px-3 py-2 text-center">Visitados</th>
                  <th className="px-3 py-2 text-left">Fecha</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredRecords.map((record, index) => (
                  <tr className="text-xs transition hover:bg-slate-50" key={`${record.transportista}-${record.transporte}-${record.recordId || index}`}>
                    <td className="whitespace-nowrap px-3 py-2 font-semibold text-[#10223d]">{record.transportista}</td>
                    <td className="whitespace-nowrap px-3 py-2">DT {record.transporte}</td>
                    <td className="whitespace-nowrap px-3 py-2">{record.vehiculo}</td>
                    <td className="max-w-[190px] truncate px-3 py-2" title={record.responsable}>{record.responsable}</td>
                    <td className="px-3 py-2 text-center font-semibold">{record.cajas}</td>
                    <td className="px-3 py-2 text-center font-semibold text-red-700">{record.cajasRefusalFinal || 0}</td>
                    <td className="px-3 py-2 text-center">{record.refusal || 0}%</td>
                    <td className="px-3 py-2 text-center">{record.clientes}</td>
                    <td className="px-3 py-2 text-center">{record.visitados}</td>
                    <td className="whitespace-nowrap px-3 py-2">{record.fechaDespacho || record.fechaDt || record.date || "-"}</td>
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

function getRecordDate(record: Vehiculo) {
  const rawDate = record.fechaDespacho || record.fechaDt || record.date || record.createdAt;
  if (!rawDate) return "";

  if (/^\d{4}-\d{2}-\d{2}/.test(rawDate)) return rawDate.slice(0, 10);

  const match = rawDate.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (match) {
    const [, day, month, year] = match;
    const fullYear = year.length === 2 ? `20${year}` : year;
    return `${fullYear}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  const parsed = new Date(rawDate);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString().slice(0, 10);
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
