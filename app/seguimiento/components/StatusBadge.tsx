export function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    "Pendiente por salir": "bg-slate-50 text-slate-700 ring-slate-200",
    "En ruta": "bg-blue-50 text-blue-700 ring-blue-200",
    Pernoctado: "bg-violet-50 text-violet-700 ring-violet-200",
    Cargando: "bg-amber-50 text-amber-700 ring-amber-200",
    "Cambio de fecha": "bg-orange-50 text-orange-700 ring-orange-200",
    Finalizado: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  };
  const className = styles[status] ?? styles.Cargando;

  return <span className={`inline-flex whitespace-nowrap rounded px-1.5 py-0.5 text-[9px] font-semibold ring-1 ${className}`}>{status}</span>;
}
