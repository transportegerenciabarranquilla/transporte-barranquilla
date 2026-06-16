export function StatusBadge({ status }: { status: string }) {
  const className =
    status === "Finalizado"
      ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
      : status === "En ruta"
        ? "bg-blue-50 text-blue-700 ring-blue-200"
        : "bg-amber-50 text-amber-700 ring-amber-200";

  return <span className={`rounded-md px-3 py-1.5 text-xs font-semibold ring-1 ${className}`}>{status}</span>;
}
