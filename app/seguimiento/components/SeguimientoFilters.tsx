import { CalendarDays, ChevronDown, Search, X } from "lucide-react";
import { ROUTE_STATUSES } from "../utils";

export function SeguimientoFilters({
  fechaDtFilter,
  search,
  onlyWithoutResponsible,
  statusFilters,
  onFechaDtChange,
  onOnlyWithoutResponsibleChange,
  onSearchChange,
  onStatusChange,
}: {
  fechaDtFilter: string;
  onlyWithoutResponsible: boolean;
  search: string;
  statusFilters: string[];
  onFechaDtChange: (value: string) => void;
  onOnlyWithoutResponsibleChange: (value: boolean) => void;
  onSearchChange: (value: string) => void;
  onStatusChange: (value: string[]) => void;
}) {
  const today = getRelativeDateKey(0);
  const tomorrow = getRelativeDateKey(1);
  const selectedDate = fechaDtFilter || today;

  return (
    <div className="relative z-30 mb-5 overflow-visible rounded-lg border border-slate-200 bg-white/92 p-4 shadow-[0_14px_36px_rgba(15,23,42,0.07)] backdrop-blur">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Filtros</p>
          <h2 className="text-base font-semibold text-[#10223d]">Vista operativa</h2>
        </div>
        {(search || fechaDtFilter || onlyWithoutResponsible || statusFilters.length > 0) ? (
          <button
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 hover:text-[#10223d]"
            onClick={() => {
              onSearchChange("");
              onFechaDtChange("");
              onOnlyWithoutResponsibleChange(false);
              onStatusChange([]);
            }}
            type="button"
          >
            <X size={14} />
            Limpiar
          </button>
        ) : null}
      </div>
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="grid w-full gap-3 lg:grid-cols-[minmax(260px,1fr)_auto_190px]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input
              className="h-11 w-full rounded-md border border-slate-200 bg-white pl-10 pr-4 text-sm outline-none transition placeholder:text-slate-400 focus:border-[#1264ff] focus:ring-2 focus:ring-[#1264ff]/10"
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder="Buscar vehiculo, DT, responsable o territorio"
              value={search}
            />
          </div>

          <div className="grid grid-cols-2 rounded-md border border-slate-200 bg-slate-50 p-1" aria-label="Fecha operativa">
            <button
              className={`h-9 rounded px-4 text-sm font-semibold transition ${
                selectedDate === today ? "bg-[#10223d] text-white shadow-sm" : "text-slate-600 hover:bg-white"
              }`}
              onClick={() => onFechaDtChange("")}
              type="button"
            >
              Hoy
            </button>
            <button
              className={`h-9 rounded px-4 text-sm font-semibold transition ${
                selectedDate === tomorrow ? "bg-[#10223d] text-white shadow-sm" : "text-slate-600 hover:bg-white"
              }`}
              onClick={() => onFechaDtChange(tomorrow)}
              type="button"
            >
              Mañana
            </button>
          </div>

          <div className="relative">
            <CalendarDays className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input
              className="h-11 w-full rounded-md border border-slate-200 bg-white pl-10 pr-10 text-sm text-slate-700 outline-none transition focus:border-[#1264ff] focus:ring-2 focus:ring-[#1264ff]/10"
              onChange={(event) => onFechaDtChange(event.target.value)}
              type="date"
              value={selectedDate}
            />
          </div>

        </div>
        <div className="flex w-full flex-col gap-2 sm:flex-row xl:w-auto">
          <button
            className={`h-11 rounded-md border px-3 text-sm font-semibold transition ${
              onlyWithoutResponsible
                ? "border-amber-200 bg-amber-50 text-amber-800"
                : "border-slate-200 bg-white text-slate-600 hover:border-amber-200 hover:bg-amber-50/50"
            }`}
            onClick={() => onOnlyWithoutResponsibleChange(!onlyWithoutResponsible)}
            type="button"
          >
            Sin responsable
          </button>
          <details className="group relative z-50 w-full sm:w-56">
            <summary className="flex h-11 cursor-pointer list-none items-center justify-between rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 outline-none transition hover:border-[#1264ff]">
              <span className="truncate">
                {statusFilters.length === 0
                  ? "Todos los estados"
                  : statusFilters.length === 1
                    ? statusFilters[0]
                    : `${statusFilters.length} estados seleccionados`}
              </span>
              <ChevronDown className="shrink-0 text-slate-400 transition group-open:rotate-180" size={17} />
            </summary>
            <div className="absolute right-0 z-[100] mt-2 w-full min-w-56 overflow-hidden rounded-md border border-slate-200 bg-white p-2 shadow-xl">
              <button
                className="mb-1 flex w-full items-center rounded px-2 py-2 text-left text-xs font-semibold text-[#10223d] hover:bg-slate-50"
                onClick={() => onStatusChange([])}
                type="button"
              >
                Todos los estados
              </button>
              {ROUTE_STATUSES.map((status) => {
                const selected = statusFilters.includes(status);
                return (
                  <label className="flex cursor-pointer items-center gap-2 rounded px-2 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50" key={status}>
                    <input
                      checked={selected}
                      className="h-4 w-4 accent-[#1264ff]"
                      onChange={() => onStatusChange(selected ? statusFilters.filter((item) => item !== status) : [...statusFilters, status])}
                      type="checkbox"
                    />
                    {status}
                  </label>
                );
              })}
            </div>
          </details>
        </div>
      </div>
    </div>
  );
}

function getRelativeDateKey(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
