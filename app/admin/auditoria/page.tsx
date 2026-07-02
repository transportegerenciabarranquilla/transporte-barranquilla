"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, CalendarDays, History, MonitorSmartphone, RefreshCw, Search, ShieldAlert } from "lucide-react";
import { CONTRACTORS } from "../../lib/contractors";
import type { AuditLogRecord } from "../../lib/auditLog";

const ACTION_LABELS: Record<string, string> = {
  asistencia_guardada: "Asistencia guardada",
  checkin_guardado: "Check-in guardado",
  cierre_punto_corona: "Cierre Rango",
  cierre_punto_corona_quitado: "Cierre quitado",
  modulacion_guardada: "Modulacion guardada",
  punto_corona_archivo_subido: "Archivo Rango",
  seguimiento_guardado: "Seguimiento guardado",
};

export default function AuditoriaAdminPage() {
  const router = useRouter();
  const [records, setRecords] = useState<AuditLogRecord[]>([]);
  const [contractor, setContractor] = useState("Todas");
  const [action, setAction] = useState("");
  const [date, setDate] = useState("");
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void loadAuditLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contractor, action, date]);

  const visibleRecords = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return records;

    return records.filter((record) => {
      const details = JSON.stringify(record.details || {});
      return `${record.contractor} ${record.userEmail} ${record.device} ${record.ipAddress} ${record.recordId} ${details}`
        .toLowerCase()
        .includes(term);
    });
  }, [records, search]);

  async function loadAuditLogs() {
    setLoading(true);
    setError("");

    try {
      const params = new URLSearchParams();
      if (contractor !== "Todas") params.set("contractor", contractor);
      if (action) params.set("action", action);
      if (date) params.set("date", date);
      const response = await fetch(`/api/admin/audit-logs?${params.toString()}`, { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "No se pudo cargar la auditoria.");
      setRecords(body.records || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar la auditoria.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#f4f7fb] text-slate-900">
      <header className="border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 sm:px-8">
          <button
            className="flex h-9 items-center gap-2 rounded-md px-3 text-sm font-semibold text-[#10223d] transition hover:bg-slate-100"
            onClick={() => router.push("/admin")}
            type="button"
          >
            <ArrowLeft size={18} />
            Admin
          </button>
          <span className="rounded-md bg-[#10223d] px-3 py-2 text-sm font-semibold text-white">Auditoria</span>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-5 py-8 sm:px-8 lg:py-10">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#0f7c58]">Control admin</p>
            <h1 className="mt-2 text-3xl font-semibold text-[#10223d]">Ultimos movimientos</h1>
            <p className="mt-2 text-sm text-slate-500">Consulta subidas, ediciones y cierres de todas las contratistas.</p>
          </div>
          <button
            className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            onClick={loadAuditLogs}
            type="button"
          >
            <RefreshCw className="h-4 w-4" />
            Actualizar
          </button>
        </div>

        {error ? <div className="mb-5 rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">{error}</div> : null}

        <div className="mb-5 grid gap-3 rounded-lg border border-slate-200 bg-white p-3 shadow-sm lg:grid-cols-[1fr_1fr_1fr_1.2fr]">
          <label className="text-sm font-semibold text-[#10223d]">
            <span className="mb-1 block text-xs uppercase tracking-[0.14em] text-slate-500">Contratista</span>
            <select className="h-10 w-full rounded-md border border-slate-200 bg-white px-3" onChange={(event) => setContractor(event.target.value)} value={contractor}>
              <option value="Todas">Todas</option>
              {CONTRACTORS.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
          </label>
          <label className="text-sm font-semibold text-[#10223d]">
            <span className="mb-1 block text-xs uppercase tracking-[0.14em] text-slate-500">Accion</span>
            <select className="h-10 w-full rounded-md border border-slate-200 bg-white px-3" onChange={(event) => setAction(event.target.value)} value={action}>
              <option value="">Todas</option>
              {Object.entries(ACTION_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
          <label className="text-sm font-semibold text-[#10223d]">
            <span className="mb-1 flex items-center gap-2 text-xs uppercase tracking-[0.14em] text-slate-500">
              <CalendarDays size={15} />
              Fecha
            </span>
            <input className="h-10 w-full rounded-md border border-slate-200 bg-white px-3" onChange={(event) => setDate(event.target.value)} type="date" value={date} />
          </label>
          <label className="text-sm font-semibold text-[#10223d]">
            <span className="mb-1 flex items-center gap-2 text-xs uppercase tracking-[0.14em] text-slate-500">
              <Search size={15} />
              Buscar
            </span>
            <input className="h-10 w-full rounded-md border border-slate-200 bg-white px-3" onChange={(event) => setSearch(event.target.value)} placeholder="Email, DT, dispositivo..." type="search" value={search} />
          </label>
        </div>

        <div className="mb-5 grid gap-3 md:grid-cols-3">
          <MiniCard icon={<History />} label="Movimientos" value={visibleRecords.length} />
          <MiniCard icon={<ShieldAlert />} label="Contratistas" value={new Set(visibleRecords.map((record) => record.contractor)).size} />
          <MiniCard icon={<MonitorSmartphone />} label="Dispositivos" value={new Set(visibleRecords.map((record) => record.device)).size} />
        </div>

        <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3">
            <h2 className="text-lg font-semibold text-[#10223d]">Registro de actividad</h2>
            {loading ? <span className="text-sm font-semibold text-slate-500">Cargando...</span> : <span className="text-sm font-semibold text-slate-500">{visibleRecords.length} registros</span>}
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100 text-sm">
              <thead className="bg-white text-left text-xs uppercase tracking-[0.12em] text-slate-500">
                <tr>
                  <th className="px-4 py-3">Fecha</th>
                  <th className="px-4 py-3">Contratista</th>
                  <th className="px-4 py-3">Accion</th>
                  <th className="px-4 py-3">Usuario</th>
                  <th className="px-4 py-3">Dispositivo</th>
                  <th className="px-4 py-3">Detalle</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visibleRecords.length ? (
                  visibleRecords.map((record) => (
                    <tr className="hover:bg-slate-50" key={record.id}>
                      <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-700">{formatDateTime(record.createdAt)}</td>
                      <td className="whitespace-nowrap px-4 py-3 font-semibold text-[#10223d]">{record.contractor}</td>
                      <td className="whitespace-nowrap px-4 py-3">{ACTION_LABELS[record.action] || record.action}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-600">{record.userEmail || "Sin usuario"}</td>
                      <td className="min-w-44 px-4 py-3 text-slate-600">
                        <p className="font-medium">{record.device || "Sin dispositivo"}</p>
                        <p className="text-xs text-slate-400">{record.ipAddress || "Sin IP"}</p>
                      </td>
                      <td className="min-w-72 px-4 py-3 text-slate-600">{formatDetails(record)}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="px-4 py-8 text-center text-sm text-slate-500" colSpan={6}>Sin movimientos para los filtros seleccionados.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </section>
    </main>
  );
}

function MiniCard({ icon, label, value }: { icon: ReactNode; label: string; value: number }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-md bg-cyan-50 text-[#07556b] [&>svg]:h-5 [&>svg]:w-5">{icon}</span>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</p>
          <p className="text-2xl font-semibold text-[#10223d]">{value}</p>
        </div>
      </div>
    </div>
  );
}

function formatDetails(record: AuditLogRecord) {
  const details = record.details || {};
  const parts = [
    details.archivo ? `Archivo: ${details.archivo}` : "",
    details.records ? `Registros: ${details.records}` : "",
    details.dts ? `DT: ${Array.isArray(details.dts) ? details.dts.slice(0, 4).join(", ") : details.dts}` : "",
    details.clientes ? `Clientes: ${Array.isArray(details.clientes) ? details.clientes.slice(0, 4).join(", ") : details.clientes}` : "",
    details.fecha ? `Fecha: ${details.fecha}` : "",
    record.recordId ? `ID: ${record.recordId}` : "",
  ].filter(Boolean);

  return parts.join(" | ") || "Sin detalle";
}

function formatDateTime(value: string) {
  if (!value) return "-";
  return new Date(value).toLocaleString("es-CO", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}
