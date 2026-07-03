"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, BarChart3, CalendarDays, MessageSquareText, Search, ShieldAlert, Table2, X } from "lucide-react";
import type { Vehiculo } from "../../seguimiento/types";
import { normalizeCajasTotal } from "../../seguimiento/utils";

type AdminRefusalComRow = {
  contractor: string;
  com: string;
  date: string;
  dt: string;
  jefeVentas: string;
  preventista: string;
  reportadas: number;
  gestionadas: number;
  refusalFinal: number;
};

type RefusalComSummary = {
  contractor: string;
  label: string;
  preventista: string;
  reportadas: number;
  gestionadas: number;
  refusalFinal: number;
  registros: number;
  refusal: number;
};

type LateCauseSummary = {
  causal: string;
  comentarios: number;
  contratistas: string[];
  registros: number;
};

export default function AdminGraficasPage() {
  const router = useRouter();
  const today = toDateKey(new Date());
  const [initialFilters] = useState(() => getInitialGraphFilters(today));
  const [records, setRecords] = useState<Vehiculo[]>([]);
  const [refusalRows, setRefusalRows] = useState<AdminRefusalComRow[]>([]);
  const [contractor, setContractor] = useState(initialFilters.contractor);
  const [dateRange, setDateRange] = useState(initialFilters.dateRange);
  const [dtSearch, setDtSearch] = useState(initialFilters.dtSearch);
  const [autoDateRange, setAutoDateRange] = useState(initialFilters.autoDateRange);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/admin/seguimiento", { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error || "No se pudo cargar graficas admin.");
        setRecords(body.records || []);
        setRefusalRows(body.refusalByComRows || []);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "No se pudo cargar graficas admin."))
      .finally(() => setLoading(false));
  }, []);

  const contractors = useMemo(() => {
    return Array.from(new Set(records.map((record) => record.transportista).filter(Boolean))).sort();
  }, [records]);

  const activeDateRange = useMemo(() => {
    if (!autoDateRange || !records.length) return dateRange;
    const dates = records.map(getVehicleDateKey).filter(Boolean).sort();
    return dates.length ? { from: dates[0], to: dates[dates.length - 1] } : dateRange;
  }, [autoDateRange, dateRange, records]);

  const visibleRecords = useMemo(() => {
    const targetDt = normalizeDt(dtSearch);

    return records.filter((record) => {
      const recordDate = getVehicleDateKey(record);
      const matchesDate = isDateInRange(recordDate, activeDateRange);
      const matchesContractor = contractor === "Todas" || record.transportista === contractor;
      const matchesDt = !targetDt || normalizeDt(record.transporte).includes(targetDt);
      return matchesDate && matchesContractor && matchesDt;
    });
  }, [activeDateRange, contractor, dtSearch, records]);

  const visibleRefusalRows = useMemo(() => {
    const targetDt = normalizeDt(dtSearch);

    return refusalRows.filter((row) => {
      const matchesDate = isDateInRange(row.date, activeDateRange);
      const matchesContractor = contractor === "Todas" || row.contractor === contractor;
      const matchesDt = !targetDt || normalizeDt(row.dt).includes(targetDt);
      return matchesDate && matchesContractor && matchesDt;
    });
  }, [activeDateRange, contractor, dtSearch, refusalRows]);

  const refusalByCom = useMemo(() => {
    const groups = new Map<string, RefusalComSummary>();

    visibleRefusalRows.forEach((row) => {
      const preventista = row.preventista?.trim() || "Sin preventista";
      const key = `${row.contractor}:${preventista}`;
      const current = groups.get(key) || {
        contractor: row.contractor,
        label: preventista,
        preventista,
        reportadas: 0,
        gestionadas: 0,
        refusalFinal: 0,
        registros: 0,
        refusal: 0,
      };

      current.reportadas += Number(row.reportadas || 0);
      current.gestionadas += Number(row.gestionadas || 0);
      current.refusalFinal += Number(row.refusalFinal || 0);
      current.registros += 1;
      current.refusal = current.reportadas ? Number(((current.refusalFinal / current.reportadas) * 100).toFixed(2)) : 0;
      groups.set(key, current);
    });

    return Array.from(groups.values()).sort((a, b) => b.refusalFinal - a.refusalFinal);
  }, [visibleRefusalRows]);

  const refusalByJefeVentas = useMemo(() => {
    const groups = new Map<string, RefusalComSummary>();

    visibleRefusalRows.forEach((row) => {
      const jefeVentas = row.jefeVentas?.trim() || "Sin asignacion";
      const key = `${row.contractor}:${jefeVentas}`;
      const current = groups.get(key) || {
        contractor: row.contractor,
        label: jefeVentas,
        preventista: jefeVentas,
        reportadas: 0,
        gestionadas: 0,
        refusalFinal: 0,
        registros: 0,
        refusal: 0,
      };

      current.reportadas += Number(row.reportadas || 0);
      current.gestionadas += Number(row.gestionadas || 0);
      current.refusalFinal += Number(row.refusalFinal || 0);
      current.registros += 1;
      current.refusal = current.reportadas ? Number(((current.refusalFinal / current.reportadas) * 100).toFixed(2)) : 0;
      groups.set(key, current);
    });

    return Array.from(groups.values()).sort((a, b) => b.refusalFinal - a.refusalFinal);
  }, [visibleRefusalRows]);

  const lateCauseRows = useMemo(() => {
    const groups = new Map<string, LateCauseSummary>();

    visibleRecords.forEach((record) => {
      const causal = record.causalSalidaTardia?.trim() || "";
      if (!causal) return;

      const current = groups.get(causal) || {
        causal,
        comentarios: 0,
        contratistas: [],
        registros: 0,
      };

      current.registros += 1;
      if (record.comentarioSalidaTardia?.trim()) current.comentarios += 1;
      if (record.transportista && !current.contratistas.includes(record.transportista)) current.contratistas.push(record.transportista);
      groups.set(causal, current);
    });

    return Array.from(groups.values()).sort((a, b) => b.registros - a.registros || a.causal.localeCompare(b.causal));
  }, [visibleRecords]);

  const lateComments = useMemo(() => {
    return visibleRecords
      .filter((record) => record.causalSalidaTardia || record.comentarioSalidaTardia)
      .map((record) => ({
        causal: record.causalSalidaTardia || "Sin causal",
        comentario: record.comentarioSalidaTardia || "Sin comentario",
        contractor: record.transportista || "Sin contratista",
        date: getVehicleDateKey(record),
        dt: record.transporte || "-",
        placa: record.vehiculo || "-",
      }))
      .sort((a, b) => a.causal.localeCompare(b.causal));
  }, [visibleRecords]);

  const totals = useMemo(() => {
    const cajasSeguimiento = normalizeCajasTotal(visibleRecords.reduce((total, record) => total + Number(record.cajas || 0), 0));
    const gestionadas = visibleRecords.reduce((total, record) => total + Number(record.cajasGestionadas || 0), 0);
    const refusalFinal = visibleRecords.reduce((total, record) => total + Number(record.cajasRefusalFinal || 0), 0);

    return {
      causales: lateCauseRows.length,
      comentarios: lateComments.length,
      gestionadas,
      refusal: cajasSeguimiento ? Number(((refusalFinal / cajasSeguimiento) * 100).toFixed(2)) : 0,
      refusalFinal,
      reportadas: cajasSeguimiento,
      rutas: visibleRecords.length,
    };
  }, [lateCauseRows.length, lateComments.length, visibleRecords]);

  function updateDateRange(nextValue: { from: string; to: string }) {
    setAutoDateRange(false);
    setDateRange(normalizeDateRange(nextValue.from, nextValue.to));
  }

  function clearFilters() {
    setContractor("Todas");
    setAutoDateRange(false);
    setDateRange({ from: today, to: today });
    setDtSearch("");
  }

  function buildFilteredHref(path: string, range: { from: string; to: string }, dt: string, selectedContractor: string) {
    const params = new URLSearchParams();
    if (range.from) params.set("desde", range.from);
    if (range.to) params.set("hasta", range.to);
    if (dt) params.set("dt", dt);
    if (selectedContractor !== "Todas") params.set("contratista", selectedContractor);
    const query = params.toString();
    return query ? `${path}?${query}` : path;
  }

  return (
    <main className="min-h-screen bg-[#f4f7fb] text-slate-900">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-5 py-4 sm:px-8 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <button
              aria-label="Volver a admin"
              className="grid h-10 w-10 place-items-center rounded-md text-[#10223d] transition hover:bg-slate-100"
              onClick={() => router.push("/admin")}
              type="button"
            >
              <ArrowLeft size={19} />
            </button>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#0f7c58]">Graficas admin</p>
              <h1 className="text-2xl font-semibold text-[#10223d]">Refusal por preventista</h1>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              className="inline-flex h-10 items-center gap-2 rounded-md border border-amber-100 bg-amber-50 px-4 text-sm font-semibold text-amber-800 shadow-sm transition hover:bg-amber-100"
              onClick={() => router.push(buildFilteredHref("/admin/graficas/causales", activeDateRange, dtSearch, contractor))}
              type="button"
            >
              <MessageSquareText size={16} />
              Causales
            </button>
            <button
              className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-200 bg-white px-4 text-sm font-semibold text-[#10223d] shadow-sm transition hover:bg-slate-50"
              onClick={() => router.push("/admin")}
              type="button"
            >
              <Table2 size={16} />
              Panel admin
            </button>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-5 py-6 sm:px-8">
        {error ? <div className="mb-5 rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">{error}</div> : null}
        {loading ? <div className="mb-5 rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-500">Cargando graficas...</div> : null}

        <section className="mb-5 rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
          <div className="grid gap-3 lg:grid-cols-[1fr_1fr_1fr_auto]">
            <label className="text-sm font-semibold text-[#10223d]">
              <span className="mb-1 flex items-center gap-2 text-xs uppercase tracking-[0.14em] text-slate-500">
                <CalendarDays size={16} />
                Desde
              </span>
              <input
                className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 outline-none transition focus:border-[#0f7c58] focus:ring-2 focus:ring-[#0f7c58]/15"
                onChange={(event) => updateDateRange({ ...activeDateRange, from: event.target.value })}
                type="date"
                value={activeDateRange.from}
              />
            </label>
            <label className="text-sm font-semibold text-[#10223d]">
              <span className="mb-1 flex items-center gap-2 text-xs uppercase tracking-[0.14em] text-slate-500">
                <CalendarDays size={16} />
                Hasta
              </span>
              <input
                className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 outline-none transition focus:border-[#0f7c58] focus:ring-2 focus:ring-[#0f7c58]/15"
                onChange={(event) => updateDateRange({ ...activeDateRange, to: event.target.value })}
                type="date"
                value={activeDateRange.to}
              />
            </label>
            <label className="text-sm font-semibold text-[#10223d]">
              <span className="mb-1 flex items-center gap-2 text-xs uppercase tracking-[0.14em] text-slate-500">
                <Search size={16} />
                DT
              </span>
              <input
                className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-[#0f7c58] focus:ring-2 focus:ring-[#0f7c58]/15"
                inputMode="numeric"
                onChange={(event) => setDtSearch(event.target.value)}
                placeholder="Ej: 123456"
                type="search"
                value={dtSearch}
              />
            </label>
            <button
              className="mt-6 inline-flex h-10 items-center justify-center gap-2 rounded-md border border-slate-200 px-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-100"
              onClick={clearFilters}
              type="button"
            >
              <X size={16} />
              Limpiar
            </button>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {["Todas", ...contractors].map((item) => (
              <button
                className={`h-9 rounded-md px-3 text-xs font-semibold transition ${
                  contractor === item ? "bg-[#10223d] text-white shadow-sm" : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                }`}
                key={item}
                onClick={() => setContractor(item)}
                type="button"
              >
                {item}
              </button>
            ))}
          </div>
        </section>

        <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric icon={<ShieldAlert size={20} />} label="% refusal" value={`${totals.refusal.toLocaleString("es-CO")}%`} tone="red" />
          <Metric icon={<BarChart3 size={20} />} label="Refusal final" value={totals.refusalFinal.toLocaleString("es-CO")} tone="red" />
          <Metric icon={<MessageSquareText size={20} />} label="Causales" value={totals.causales.toLocaleString("es-CO")} tone="amber" />
          <Metric icon={<Table2 size={20} />} label="Rutas filtradas" value={totals.rutas.toLocaleString("es-CO")} tone="blue" />
        </div>

        <div className="mb-5 grid gap-4 xl:grid-cols-[1fr_1fr_0.75fr]">
          <ChartPanel icon={<BarChart3 size={16} />} title="Refusal por preventista">
            <RefusalComBars data={refusalByCom.slice(0, 12)} emptyText="Sin datos de refusal por preventista para este filtro." />
          </ChartPanel>
          <ChartPanel icon={<ShieldAlert size={16} />} title="Refusal por jefe de ventas">
            <RefusalComBars data={refusalByJefeVentas.slice(0, 12)} emptyText="Sin datos de refusal por jefe de ventas para este filtro." />
          </ChartPanel>
          <ChartPanel icon={<ShieldAlert size={16} />} title="Resumen refusal">
            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
              <MiniStat label="Cajas seguimiento" value={totals.reportadas.toLocaleString("es-CO")} />
              <MiniStat label="Gestionadas" value={totals.gestionadas.toLocaleString("es-CO")} tone="green" />
              <MiniStat label="Final" value={totals.refusalFinal.toLocaleString("es-CO")} tone="red" />
            </div>
          </ChartPanel>
        </div>

      </section>
    </main>
  );
}

function Metric({
  icon,
  label,
  tone,
  value,
}: {
  icon: ReactNode;
  label: string;
  tone: "amber" | "blue" | "red";
  value: string;
}) {
  const toneClass = {
    amber: "bg-amber-50 text-amber-800",
    blue: "bg-blue-50 text-blue-700",
    red: "bg-red-50 text-red-700",
  }[tone];

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className={`mb-3 grid h-10 w-10 place-items-center rounded-md ${toneClass}`}>{icon}</div>
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-[#10223d]">{value}</p>
    </div>
  );
}

function MiniStat({ label, value, tone = "slate" }: { label: string; value: string; tone?: "green" | "red" | "slate" }) {
  const toneClass = {
    green: "text-[#0f7c58]",
    red: "text-red-700",
    slate: "text-[#10223d]",
  }[tone];

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <p className={`mt-1 text-xl font-semibold ${toneClass}`}>{value}</p>
    </div>
  );
}

function ChartPanel({ children, icon, title }: { children: ReactNode; icon: ReactNode; title: string }) {
  return (
    <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-4 py-3 text-[#10223d]">
        <span className="grid h-8 w-8 place-items-center rounded-md bg-[#10223d] text-white">{icon}</span>
        <h2 className="text-sm font-semibold">{title}</h2>
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

function RefusalComBars({ data, emptyText }: { data: RefusalComSummary[]; emptyText: string }) {
  const max = Math.max(...data.map((item) => item.refusalFinal), 1);
  if (!data.length) return <EmptyState text={emptyText} />;

  return (
    <div className="space-y-2">
      {data.map((item, index) => (
        <div className="grid grid-cols-[minmax(142px,220px)_1fr_64px] items-center gap-2" key={`${item.contractor}-${item.label}`}>
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold text-[#10223d]" title={item.label}>{item.label}</p>
            <p className="truncate text-[10px] text-slate-500" title={item.contractor}>{item.contractor}</p>
          </div>
          <div className="h-7 overflow-hidden rounded-sm bg-slate-100">
            <div
              className={index === 0 ? "h-7 rounded-sm bg-gradient-to-r from-red-600 to-orange-400" : "h-7 rounded-sm bg-red-500/65"}
              style={{ width: `${Math.max(6, (item.refusalFinal / max) * 100)}%` }}
              title={`${item.refusalFinal} cajas - ${item.refusal}%`}
            />
          </div>
          <span className="text-right text-xs font-bold text-red-700">{item.refusalFinal.toLocaleString("es-CO")}</span>
        </div>
      ))}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="grid min-h-40 place-items-center rounded-md border border-dashed border-slate-200 bg-slate-50 px-4 text-center text-sm text-slate-500">
      {text}
    </div>
  );
}

function getInitialGraphFilters(today: string) {
  if (typeof window === "undefined") {
    return {
      autoDateRange: true,
      contractor: "Todas",
      dateRange: { from: today, to: today },
      dtSearch: "",
    };
  }

  const params = new URLSearchParams(window.location.search);
  const from = params.get("desde") || params.get("fecha") || "";
  const to = params.get("hasta") || params.get("fecha") || "";
  const dtSearch = params.get("dt") || "";
  const contractor = params.get("contratista") || "Todas";
  const hasDateFilter = Boolean(from || to);

  return {
    autoDateRange: !hasDateFilter,
    contractor,
    dateRange: hasDateFilter ? normalizeDateRange(from || to, to || from) : { from: today, to: today },
    dtSearch,
  };
}

function getVehicleDateKey(record: Vehiculo) {
  return toDateKeyValue(record.fechaDespacho || record.fechaDt || record.date || record.createdAt);
}

function normalizeDateRange(from: string, to: string) {
  const start = from || to || toDateKey(new Date());
  const end = to || from || toDateKey(new Date());
  return start <= end ? { from: start, to: end } : { from: end, to: start };
}

function isDateInRange(dateKey: string, range: { from: string; to: string }) {
  if (!dateKey) return false;
  return dateKey >= range.from && dateKey <= range.to;
}

function toDateKeyValue(value: string | undefined) {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);

  const slashMatch = value.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (slashMatch) {
    const [, day, month, year] = slashMatch;
    const fullYear = year.length === 2 ? `20${year}` : year;
    return `${fullYear}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return toDateKey(parsed);
}

function toDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function normalizeDt(value: unknown) {
  return String(value || "")
    .replace(/^DT-?/i, "")
    .replace(/\D/g, "");
}
