import { Search } from "lucide-react";

export function SeguimientoFilters({
  search,
  statusFilter,
  onSearchChange,
  onStatusChange,
}: {
  search: string;
  statusFilter: string;
  onSearchChange: (value: string) => void;
  onStatusChange: (value: string) => void;
}) {
  return (
    <div className="mb-5 flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm lg:flex-row lg:items-center lg:justify-between">
      <div className="relative w-full lg:max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
        <input
          className="h-11 w-full rounded-md border border-slate-200 bg-white pl-10 pr-4 text-sm outline-none transition placeholder:text-slate-400 focus:border-[#f5bd19]"
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Buscar vehiculo, responsable o territorio"
          value={search}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        {["Todos", "Cargando", "En ruta", "Finalizado"].map((status) => (
          <button
            className={`rounded-md px-3 py-2 text-sm font-medium transition ${
              statusFilter === status ? "bg-[#10223d] text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
            key={status}
            onClick={() => onStatusChange(status)}
            type="button"
          >
            {status}
          </button>
        ))}
      </div>
    </div>
  );
}
