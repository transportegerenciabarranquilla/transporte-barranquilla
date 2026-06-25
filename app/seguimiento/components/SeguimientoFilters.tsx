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
  return (
    <div className="mb-5 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="grid w-full gap-3 lg:grid-cols-[1fr_200px]">
          {/* Buscador */}
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input
              className="h-11 w-full rounded-md border border-slate-200 bg-white pl-10 pr-4 text-sm outline-none transition placeholder:text-slate-400 focus:border-[#f5bd19]"
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder="Buscar vehiculo, responsable o territorio"
              value={search}
            />
          </div>

          {/* Calendario (Filtro principal de fecha) */}
          <div className="relative">
            <CalendarDays className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input
              className="h-11 w-full rounded-md border border-slate-200 bg-white pl-10 pr-10 text-sm text-slate-700 outline-none transition focus:border-[#f5bd19]"
              onChange={(event) => onFechaDtChange(event.target.value)}
              type="date"
              value={fechaDtFilter}
            />
            {fechaDtFilter ? (
              <button
                className="absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                onClick={() => onFechaDtChange("")}
                type="button"
                aria-label="Limpiar fecha"
              >
                <X size={15} />
              </button>
            ) : null}
          </div>

        </div>
        <div className="flex w-full flex-col gap-2 sm:flex-row xl:w-auto">
          <button
            className={`h-11 rounded-md border px-3 text-sm font-semibold transition ${
              onlyWithoutResponsible
                ? "border-[#f5bd19] bg-[#fff8e6] text-[#10223d]"
                : "border-slate-200 bg-white text-slate-600 hover:border-[#f5bd19]"
            }`}
            onClick={() => onOnlyWithoutResponsibleChange(!onlyWithoutResponsible)}
            type="button"
          >
            Sin responsable
          </button>
          <details className="group relative w-full sm:w-56">
            <summary className="flex h-11 cursor-pointer list-none items-center justify-between rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 outline-none transition hover:border-[#f5bd19]">
              <span className="truncate">
                {statusFilters.length === 0
                  ? "Todos los estados"
                  : statusFilters.length === 1
                    ? statusFilters[0]
                    : `${statusFilters.length} estados seleccionados`}
              </span>
              <ChevronDown className="shrink-0 text-slate-400 transition group-open:rotate-180" size={17} />
            </summary>
            <div className="absolute right-0 z-30 mt-2 w-full min-w-56 overflow-hidden rounded-md border border-slate-200 bg-white p-2 shadow-xl">
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
                      className="h-4 w-4 accent-[#f5bd19]"
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
