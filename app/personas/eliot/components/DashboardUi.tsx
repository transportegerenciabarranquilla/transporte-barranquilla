"use client";

import {
  CalendarDays,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Clock3,
  FileSpreadsheet,
  Filter,
  Gauge,
  History,
  Info,
  Search,
  Trash2,
  Truck,
  Upload,
  UserRoundCheck,
  UserRoundX,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { groupRowsByPlate, type DashboardFilters, type DashboardSummary } from "../lib/analytics";
import { formatClock, formatDuration } from "../lib/time";
import type { CrewRole, RankingEntry, TdRow, TdSnapshot, TdStatus } from "../lib/types";

const ROLE_LABELS: Record<CrewRole, string> = { rr: "RR", aux: "Auxiliar", conductor: "Conductor" };

export function DashboardFiltersPanel({
  activeDate,
  availableDates,
  carriers,
  dateSnapshots,
  filters,
  onChange,
  onDateChange,
  onSnapshotChange,
  plates,
  selectedSnapshot,
}: {
  activeDate: string;
  availableDates: string[];
  carriers: string[];
  dateSnapshots: TdSnapshot[];
  filters: DashboardFilters;
  onChange: (filters: DashboardFilters) => void;
  onDateChange: (date: string) => void;
  onSnapshotChange: (snapshot: TdSnapshot) => void;
  plates: string[];
  selectedSnapshot: TdSnapshot;
}) {
  const hasFilters = filters.query || filters.carrier !== "todos" || filters.plate !== "todas" || filters.status !== "todos";
  return (
    <section className="panel p-4">
      <div className="mb-3 flex items-center gap-2 text-xs font-black uppercase tracking-[0.12em] text-slate-500"><Filter size={15} /> Filtros del tablero</div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:items-end">
        <Field label="Fecha" icon={<CalendarDays size={13} />}>
          <select className="field" onChange={(event) => onDateChange(event.target.value)} value={activeDate}>{availableDates.map((date) => <option key={date} value={date}>{formatDate(date)}</option>)}</select>
        </Field>
        <Field label="Corte" icon={<Clock3 size={13} />}>
          <select className="field" onChange={(event) => { const snapshot = dateSnapshots.find((item) => item.id === event.target.value); if (snapshot) onSnapshotChange(snapshot); }} value={selectedSnapshot.id}>{dateSnapshots.map((snapshot) => <option key={snapshot.id} value={snapshot.id}>{formatTime(snapshot.uploadedAt)} · {snapshot.fileName}</option>)}</select>
        </Field>
        <Field label="Transportista">
          <select className="field" onChange={(event) => onChange({ ...filters, carrier: event.target.value })} value={filters.carrier}><option value="todos">Todos</option>{carriers.map((carrier) => <option key={carrier} value={carrier}>{carrier}</option>)}</select>
        </Field>
        <Field label="Placa">
          <select className="field" onChange={(event) => onChange({ ...filters, plate: event.target.value })} value={filters.plate}><option value="todas">Todas</option>{plates.map((plate) => <option key={plate} value={plate}>{plate}</option>)}</select>
        </Field>
        <Field label="Clasificación">
          <select className="field" onChange={(event) => onChange({ ...filters, status: event.target.value as DashboardFilters["status"] })} value={filters.status}>
            <option value="todos">Todas</option><option value="bien">Bien · hasta 40 min</option><option value="regular">Regular · más de 40 hasta 60 min</option><option value="mal">Mal · más de 60 min</option><option value="sin-marcacion">Sin marcación</option>
          </select>
        </Field>
        <Field label="Buscar" icon={<Search size={13} />}>
          <input className="field" onChange={(event) => onChange({ ...filters, query: event.target.value })} placeholder="Nombre, cédula, DT o placa" type="search" value={filters.query} />
        </Field>
        <button className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 text-xs font-bold text-slate-500 hover:bg-slate-50 disabled:opacity-35" disabled={!hasFilters} onClick={() => onChange({ query: "", carrier: "todos", plate: "todas", status: "todos" })} type="button"><X size={14} /> Limpiar filtros</button>
      </div>
    </section>
  );
}

export function SummaryCards({ summary, rows }: { summary: DashboardSummary; rows: TdRow[] }) {
  const [expandedMinute, setExpandedMinute] = useState<number | null>(null);
  const [visibleCount, setVisibleCount] = useState(10);
  const roleCards: Array<{ role: CrewRole; label: string; tone: string }> = [
    { role: "rr", label: "Promedio RR", tone: "bg-rose-50 text-[#d95749]" },
    { role: "aux", label: "Promedio auxiliar", tone: "bg-violet-50 text-violet-700" },
    { role: "conductor", label: "Promedio conductor", tone: "bg-amber-50 text-amber-700" },
  ];
  const departureGroups = useMemo(() => {
    const groups = new Map<number, TdRow[]>();
    rows.forEach((row) => {
      if (row.departureSeconds === null) return;
      const minute = Math.floor(row.departureSeconds / 60);
      groups.set(minute, [...(groups.get(minute) ?? []), row]);
    });
    return Array.from(groups.entries())
      .sort(([a], [b]) => a - b)
      .map(([minute, groupRows]) => ({
        minute,
        rows: groupRows,
        plates: Array.from(new Set(groupRows.map((row) => row.plate).filter(Boolean))),
        averages: Object.fromEntries(
          (["rr", "aux", "conductor"] as CrewRole[]).map((role) => {
            const members = groupRows.map((row) => row.crew[role]).filter((member) => member.validPerson);
            const average = members.length
              ? Math.round(members.reduce((sum, member) => sum + (member.tdSeconds ?? 0), 0) / members.length)
              : 0;
            return [role, average];
          }),
        ) as Record<CrewRole, number>,
      }));
  }, [rows]);
  const missingDeparture = rows.filter((row) => row.departureSeconds === null).length;

  return (
    <div className="space-y-4">
      <section className="grid gap-4 md:grid-cols-3">
        {roleCards.map((card) => {
          const marks = summary.marksByRole[card.role];
          return (
            <article className="panel p-5" key={card.role}>
              <div className={`grid h-10 w-10 place-items-center rounded-xl ${card.tone}`}><Gauge size={20} /></div>
              <p className="mt-4 text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">{card.label}</p>
              <p className="mt-1 text-2xl font-black text-[#2d1b4e]">{formatDuration(summary.averageByRole[card.role])}</p>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <span className="flex items-center gap-1.5 rounded-lg bg-teal-50 px-2.5 py-2 font-bold text-teal-700"><UserRoundCheck size={15} /> {marks.marked} marcaron</span>
                <span className="flex items-center gap-1.5 rounded-lg bg-red-50 px-2.5 py-2 font-bold text-red-700"><UserRoundX size={15} /> {marks.missing} faltan</span>
              </div>
            </article>
          );
        })}
      </section>

      <section className="panel overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50/80 px-5 py-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-violet-700">Salidas agrupadas</p>
            <h2 className="mt-0.5 text-base font-black text-[#2d1b4e]">Promedio TD por hora de salida</h2>
          </div>
          <span className="rounded-lg bg-white px-3 py-1.5 text-[10px] font-bold text-slate-500 ring-1 ring-slate-200">
            {departureGroups.length} horas · {missingDeparture} sin hora
          </span>
        </div>
        <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">
          {departureGroups.slice(0, visibleCount).map((group) => {
            const expanded = expandedMinute === group.minute;
            const vehicleCount = group.plates.length || group.rows.length;
            return (
              <article className="overflow-hidden rounded-xl border border-slate-200 bg-white" key={group.minute}>
                <button
                  className="flex w-full items-center justify-between gap-3 p-3 text-left hover:bg-violet-50/40"
                  onClick={() => setExpandedMinute(expanded ? null : group.minute)}
                  type="button"
                >
                  <span>
                    <span className="block text-lg font-black text-[#2d1b4e]">{formatClock(group.minute * 60).slice(0, 5)}</span>
                    <span className="mt-0.5 block text-[10px] font-bold text-slate-500">{vehicleCount} carro{vehicleCount === 1 ? "" : "s"}</span>
                  </span>
                  <span className="grid grid-cols-3 gap-2 text-right text-[9px] text-slate-500">
                    <span><b className="block text-slate-700">RR</b>{formatDuration(group.averages.rr).slice(0, 5)}</span>
                    <span><b className="block text-slate-700">Aux</b>{formatDuration(group.averages.aux).slice(0, 5)}</span>
                    <span><b className="block text-slate-700">Cond.</b>{formatDuration(group.averages.conductor).slice(0, 5)}</span>
                  </span>
                  {expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                </button>
                {expanded ? (
                  <div className="space-y-1.5 border-t border-slate-100 bg-slate-50 p-3">
                    {group.rows.map((row) => (
                      <div className="flex items-center justify-between gap-2 rounded-lg bg-white px-2.5 py-2 text-[10px] ring-1 ring-slate-200" key={row.id}>
                        <span className="font-black text-[#2d1b4e]">{row.plate || "Sin placa"}</span>
                        <span className="text-slate-500">DT {row.dt || "—"} · Viaje {row.trip || "—"}</span>
                      </div>
                    ))}
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
        {departureGroups.length > visibleCount ? (
          <div className="border-t border-slate-100 px-4 py-3 text-center">
            <button className="rounded-lg bg-violet-50 px-4 py-2 text-xs font-black text-violet-700 hover:bg-violet-100" onClick={() => setVisibleCount((count) => count + 5)} type="button">Ver 5 horas más</button>
          </div>
        ) : null}
      </section>
    </div>
  );
}

export function WarningsSummary({ warnings, rowCount }: { warnings: string[]; rowCount: number }) {
  const [showDetails, setShowDetails] = useState(false);
  const categories = [
    {
      label: "Tripulantes sin asignar",
      count: warnings.filter((warning) => /sin persona asignada/i.test(warning)).length,
      detail: "No participan en los rankings hasta tener nombre y cédula.",
      tone: "bg-violet-50 text-violet-700",
    },
    {
      label: "Marcaciones faltantes",
      count: warnings.filter((warning) => /sin marcación/i.test(warning)).length,
      detail: "Se muestran como caso crítico y TD cero.",
      tone: "bg-rose-50 text-rose-700",
    },
    {
      label: "Salidas pendientes",
      count: warnings.filter((warning) => /hora de salida inválida|hora de salida.*pendiente/i.test(warning)).length,
      detail: "No permiten calcular el TD de esa ruta.",
      tone: "bg-amber-50 text-amber-700",
    },
  ];
  const categorized = categories.reduce((sum, category) => sum + category.count, 0);
  const other = warnings.length - categorized;

  return (
    <section className="panel overflow-hidden border-violet-100">
      <div className="flex flex-col gap-3 border-b border-slate-100 bg-violet-50/40 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-violet-100 text-violet-700"><Info size={17} /></span>
          <div>
            <h2 className="text-sm font-black text-[#2d1b4e]">Datos pendientes del archivo</h2>
            <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-600">
              El corte se procesó con {rowCount} rutas. Estos casos explican qué información venía vacía o pendiente y cómo afecta los cálculos.
            </p>
          </div>
        </div>
        <span className="shrink-0 rounded-lg bg-white px-3 py-1.5 text-[10px] font-black text-violet-700 ring-1 ring-violet-100">{warnings.length} casos detectados</span>
      </div>

      <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
        {categories.map((category) => (
          <article className={`rounded-xl p-3 ${category.tone}`} key={category.label}>
            <p className="text-2xl font-black">{category.count}</p>
            <p className="mt-1 text-[10px] font-black uppercase tracking-wide">{category.label}</p>
            <p className="mt-1 text-[10px] leading-4 opacity-80">{category.detail}</p>
          </article>
        ))}
        <article className="rounded-xl bg-slate-50 p-3 text-slate-600">
          <p className="text-2xl font-black">{other}</p>
          <p className="mt-1 text-[10px] font-black uppercase tracking-wide">Otros casos</p>
          <p className="mt-1 text-[10px] leading-4 opacity-80">Observaciones que no pertenecen a las categorías anteriores.</p>
        </article>
      </div>

      <div className="border-t border-slate-100 px-4 py-3">
        <button className="inline-flex items-center gap-1.5 text-[10px] font-black text-violet-700 hover:text-violet-900" onClick={() => setShowDetails((value) => !value)} type="button">
          {showDetails ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          {showDetails ? "Ocultar filas" : "Ver filas con novedades"}
        </button>
        {showDetails ? (
          <div className="mt-3 grid gap-2 text-[11px] text-slate-600 md:grid-cols-2">
            {warnings.slice(0, 12).map((warning) => <p className="rounded-lg bg-slate-50 px-3 py-2" key={warning}>{warning}</p>)}
            {warnings.length > 12 ? <p className="px-3 py-2 font-bold text-violet-700">Se muestran 12 de {warnings.length} casos.</p> : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}

export function RankingsTable({ rankings, mode }: { rankings: Record<CrewRole, RankingEntry[]>; mode: "mejores" | "offenders" }) {
  const rows = useMemo(() => (Object.keys(rankings) as CrewRole[]).flatMap((role) => rankings[role].map((entry, index) => ({ ...entry, position: index + 1 }))), [rankings]);
  return (
    <section className="panel overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50/80 px-5 py-4"><div><p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Listado completo</p><h2 className="mt-1 text-lg font-black text-[#2d1b4e]">Promedios por persona y rol</h2></div><span className="rounded-lg bg-white px-3 py-2 text-xs font-bold text-slate-500 ring-1 ring-slate-200">Orden: {mode === "mejores" ? "menor TD" : "sin marcación / mayor TD"}</span></div>
      <div className="max-h-[480px] overflow-auto scrollbar-thin">
        <table className="w-full min-w-[880px] text-left text-xs">
          <thead className="sticky top-0 z-10 bg-white text-[10px] uppercase tracking-wider text-slate-400"><tr><th className="px-4 py-3">Pos.</th><th className="px-4 py-3">Rol</th><th className="px-4 py-3">Persona</th><th className="px-4 py-3">Cédula</th><th className="px-4 py-3">Placas</th><th className="px-4 py-3 text-right">Registros</th><th className="px-4 py-3 text-right">Sin marca</th><th className="px-4 py-3 text-right">Promedio TD</th><th className="px-4 py-3">Estado</th></tr></thead>
          <tbody className="divide-y divide-slate-100">{rows.map((row) => <tr className="hover:bg-slate-50" key={row.key}><td className="px-4 py-3 font-black text-slate-400">#{row.position}</td><td className="px-4 py-3 font-bold text-slate-600">{ROLE_LABELS[row.role]}</td><td className="px-4 py-3 font-bold text-[#2d1b4e]">{row.name}</td><td className="px-4 py-3 text-slate-500">{row.document || "—"}</td><td className="max-w-[220px] truncate px-4 py-3 text-slate-500" title={row.plates.join(", ")}>{row.plates.join(", ") || "—"}</td><td className="px-4 py-3 text-right">{row.records}</td><td className="px-4 py-3 text-right font-bold text-red-600">{row.missingMarks}</td><td className="px-4 py-3 text-right font-black text-[#2d1b4e]">{formatDuration(row.averageSeconds)}</td><td className="px-4 py-3"><StatusPill status={row.status} /></td></tr>)}</tbody>
        </table>
      </div>
    </section>
  );
}

export function PlateCrewTable({ rows }: { rows: TdRow[] }) {
  const groups = useMemo(() => groupRowsByPlate(rows), [rows]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [visibleCount, setVisibleCount] = useState(10);
  const visibleGroups = groups.slice(0, visibleCount);

  function toggle(plate: string) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(plate)) next.delete(plate);
      else next.add(plate);
      return next;
    });
  }

  return (
    <section className="panel overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50/80 px-5 py-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-amber-700">Detalle operativo</p>
          <h2 className="mt-0.5 text-base font-black text-[#2d1b4e]">Tripulaciones por placa</h2>
        </div>
        <span className="rounded-lg bg-white px-3 py-1.5 text-[10px] font-bold text-slate-500 ring-1 ring-slate-200">
          {Math.min(visibleCount, groups.length)} de {groups.length} placas
        </span>
      </div>

      {groups.length ? (
        <>
          <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">
            {visibleGroups.map(([plate, plateRows]) => {
              const preview = plateRows[0];
              const isExpanded = expanded.has(plate);
              return (
                <article className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm" key={plate}>
                  <button className="flex w-full items-center justify-between gap-2 text-left" onClick={() => toggle(plate)} type="button">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-amber-50 text-amber-700"><Truck size={15} /></span>
                      <span className="min-w-0">
                        <strong className="block truncate text-xs text-[#2d1b4e]">{plate}</strong>
                        <small className="block truncate text-[9px] text-slate-500">{plateRows.length} DT · {preview?.carrier}</small>
                      </span>
                    </span>
                    {isExpanded ? <ChevronDown className="shrink-0 text-slate-400" size={15} /> : <ChevronRight className="shrink-0 text-slate-400" size={15} />}
                  </button>

                  <div className="mt-3 space-y-1.5">
                    {(["rr", "aux", "conductor"] as CrewRole[]).map((role) => {
                      const member = preview.crew[role];
                      return (
                        <div className={`grid grid-cols-[58px_minmax(0,1fr)_auto] items-center gap-2 rounded-md px-2 py-1.5 ${STATUS_ROW_STYLES[member.status]}`} key={role}>
                          <span className="text-[8px] font-black uppercase tracking-wide text-slate-400">{ROLE_LABELS[role]}</span>
                          <span className="truncate text-[10px] font-bold text-slate-700" title={member.name}>{member.name || "Sin asignar"}</span>
                          <span className="flex items-center gap-1.5">
                            <span className={`text-[9px] font-black ${STATUS_TEXT_STYLES[member.status]}`}>{formatDuration(member.tdSeconds)}</span>
                            <StatusPill status={member.status} />
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  {isExpanded ? (
                    <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">
                      {plateRows.map((row) => (
                        <div className="rounded-lg border border-slate-100 bg-slate-50/70 p-2.5" key={row.id}>
                          <div className="flex items-center justify-between gap-2 text-[9px]">
                            <strong className="text-[#2d1b4e]">DT {row.dt || "—"} · Viaje {row.trip || "—"}</strong>
                            <span className="text-slate-500">Salida {formatClock(row.departureSeconds)}</span>
                          </div>
                          <div className="mt-2 space-y-1">
                            {(["rr", "aux", "conductor"] as CrewRole[]).map((role) => {
                              const member = row.crew[role];
                              return (
                                <div className="grid grid-cols-[52px_minmax(0,1fr)_auto] items-center gap-2 text-[9px]" key={role}>
                                  <span className="font-black uppercase text-slate-400">{ROLE_LABELS[role]}</span>
                                  <span className="truncate text-slate-600" title={member.name}>{member.name || "Sin asignar"} · {formatClock(member.arrivalSeconds)}</span>
                                  <StatusPill status={member.status} />
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>

          <div className="flex items-center justify-center gap-2 border-t border-slate-100 px-4 py-3">
            {visibleCount < groups.length ? (
              <button className="rounded-lg bg-[#2d1b4e] px-4 py-2 text-[10px] font-black text-white hover:bg-[#44266f]" onClick={() => setVisibleCount((count) => count + 5)} type="button">
                Ver 5 más
              </button>
            ) : null}
            {visibleCount > 10 ? (
              <button className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-[10px] font-bold text-slate-500 hover:bg-slate-50" onClick={() => setVisibleCount(10)} type="button">
                Mostrar solo 10
              </button>
            ) : null}
          </div>
        </>
      ) : (
        <div className="grid min-h-32 place-items-center p-5 text-center text-sm text-slate-500">No hay placas para los filtros actuales.</div>
      )}
    </section>
  );
}

export function HistoryPanel({ snapshots, selectedId, onSelect, onDelete }: { snapshots: TdSnapshot[]; selectedId: string; onSelect: (snapshot: TdSnapshot) => void; onDelete: (snapshot: TdSnapshot) => void }) {
  return (
    <section className="panel overflow-hidden">
      <div className="flex items-center gap-3 border-b border-slate-200 bg-slate-50/80 px-5 py-4"><History className="text-cyan-700" size={19} /><div><p className="text-xs font-bold uppercase tracking-[0.14em] text-cyan-700">Almacenamiento local</p><h2 className="mt-1 text-lg font-black text-[#2d1b4e]">Historial de cortes</h2></div></div>
      <div className="max-h-80 divide-y divide-slate-100 overflow-auto scrollbar-thin">{snapshots.map((snapshot) => <div className={`flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between ${snapshot.id === selectedId ? "bg-violet-50/70" : ""}`} key={snapshot.id}><button className="min-w-0 text-left" onClick={() => onSelect(snapshot)} type="button"><p className="truncate text-sm font-black text-[#2d1b4e]">{snapshot.fileName}</p><p className="mt-1 text-xs text-slate-500">{formatDate(snapshot.operationalDate)} · {formatDateTime(snapshot.uploadedAt)} · {snapshot.rows.length} rutas · {snapshot.warnings.length} advertencias</p></button><div className="flex shrink-0 gap-2"><button className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50" onClick={() => onSelect(snapshot)} type="button">Ver corte</button><button aria-label="Eliminar corte" className="grid h-9 w-9 place-items-center rounded-lg border border-red-100 bg-white text-red-500 hover:bg-red-50" onClick={() => onDelete(snapshot)} type="button"><Trash2 size={15} /></button></div></div>)}</div>
    </section>
  );
}

export function EmptyDashboard({ onUpload }: { onUpload: () => void }) {
  return <section className="panel grid min-h-[470px] place-items-center px-6 py-14 text-center"><div><span className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-rose-50 text-[#ed6a5a]"><FileSpreadsheet size={29} /></span><p className="mt-5 text-xs font-black uppercase tracking-[0.16em] text-[#d95749]">Primer corte</p><h2 className="mt-2 text-2xl font-black text-[#2d1b4e]">Carga Plantilla TD.xlsx</h2><p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-slate-500">Se validará la hoja DATA ASISTENCIA, se recalcularán los TD y se crearán los rankings sin alterar el archivo original.</p><button className="mt-7 inline-flex h-11 items-center gap-2 rounded-xl bg-[#ed6a5a] px-6 text-sm font-black text-white shadow-lg shadow-rose-100 hover:bg-[#d95749]" onClick={onUpload} type="button"><Upload size={17} /> Seleccionar Excel</button></div></section>;
}

function StatusPill({ status }: { status: TdStatus }) {
  const labels: Record<TdStatus, string> = { bien: "Bien", regular: "Regular", mal: "Mal", "sin-marcacion": "Sin marca" };
  const styles: Record<TdStatus, string> = { bien: "bg-emerald-50 text-emerald-700 ring-emerald-100", regular: "bg-amber-50 text-amber-700 ring-amber-100", mal: "bg-red-50 text-red-700 ring-red-100", "sin-marcacion": "bg-slate-100 text-slate-600 ring-slate-200" };
  return <span className={`inline-flex whitespace-nowrap rounded-md px-2 py-1 text-[9px] font-black uppercase tracking-wide ring-1 ${styles[status]}`}>{labels[status]}</span>;
}

const STATUS_ROW_STYLES: Record<TdStatus, string> = {
  bien: "bg-emerald-50/80",
  regular: "bg-amber-50/80",
  mal: "bg-red-50/80",
  "sin-marcacion": "bg-slate-100",
};

const STATUS_TEXT_STYLES: Record<TdStatus, string> = {
  bien: "text-emerald-700",
  regular: "text-amber-700",
  mal: "text-red-700",
  "sin-marcacion": "text-slate-600",
};

function Field({ label, icon, children }: { label: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return <label className="block text-[10px] font-black uppercase tracking-[0.1em] text-slate-500"><span className="mb-1.5 flex items-center gap-1">{icon}{label}</span>{children}</label>;
}

function formatDate(value: string) {
  const date = new Date(`${value}T12:00:00`);
  return new Intl.DateTimeFormat("es-CO", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("es-CO", { hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(value));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeStyle: "short", hour12: false }).format(new Date(value));
}

