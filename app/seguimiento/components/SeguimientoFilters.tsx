import { CalendarDays, ChevronDown, Search, X } from "lucide-react";
import { ROUTE_STATUSES } from "../utils";

export function SeguimientoFilters({
  fechaDtFilter,
  search,
  statusFilter,
  onFechaDtChange,
  onSearchChange,
  onStatusChange,
}: {
  fechaDtFilter: string;
  search: string;
  statusFilter: string;
  onFechaDtChange: (value: string) => void;
  onSearchChange: (value: string) => void;
  onStatusChange: (value: string) => void;
}) {
  return (
    <div className="mb-5 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="grid w-full gap-3 lg:grid-cols-[1fr_220px_180px]">
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

          {/* Seleccionador de Estado */}
          <div className="relative">
            <select
              className="h-11 w-full appearance-none rounded-md border border-slate-200 bg-white px-4 pr-10 text-sm font-medium text-slate-700 outline-none transition focus:border-[#f5bd19]"
              onChange={(event) => onStatusChange(event.target.value)}
              value={statusFilter}
            >
              <option value="Todos">Todos los estados</option>
              {ROUTE_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          </div>
        </div>
      </div>
    </div>
  );
}