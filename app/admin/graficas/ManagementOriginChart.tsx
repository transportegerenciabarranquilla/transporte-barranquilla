import { BarChart3 } from "lucide-react";
import { ChartPanel } from "./components";
import type { ModulationRefusalRecord } from "./types";

export default function ManagementOriginChart({ records, loading, error }: { records: ModulationRefusalRecord[]; loading: boolean; error: string }) {
  const rows = [
    { label: "Ventas", color: "bg-violet-500", boxes: 0, count: 0 },
    { label: "Logística", color: "bg-cyan-500", boxes: 0, count: 0 },
    { label: "Sin clasificar", color: "bg-slate-400", boxes: 0, count: 0 },
  ];
  for (const record of records) {
    const boxes = Number(record.cajasGestionadas || 0);
    if (!Number.isFinite(boxes) || boxes <= 0) continue;
    const row = rows.find((item) => item.label === record.origenReubicacion) || rows[2];
    row.boxes += boxes;
    row.count += 1;
  }
  const total = rows.reduce((sum, row) => sum + row.boxes, 0);
  return (
    <ChartPanel icon={<BarChart3 size={16} />} title="Gestión por área: Ventas y Logística">
      <p className="mb-4 text-xs text-slate-500">Cajas gestionadas según el área registrada en Modulación. Aplica los filtros de fecha, contratista y DT.</p>
      {loading ? <p role="status" className="py-6 text-sm text-slate-500">Cargando gestiones…</p>
        : error ? <p role="alert" className="py-6 text-sm text-red-600">{error}</p>
        : !total ? <p className="py-6 text-sm text-slate-500">No hay cajas gestionadas para los filtros seleccionados.</p>
        : <>
          <p className="mb-4 text-sm font-bold text-[#10223d]">{total.toLocaleString("es-CO")} cajas gestionadas en total</p>
          <div className="space-y-5">
            {rows.map((row) => {
              const percentage = row.boxes / total * 100;
              return <div key={row.label}>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="font-bold text-[#10223d]">{row.label}</span>
                  <span className="text-slate-600">{row.boxes.toLocaleString("es-CO")} cajas · {percentage.toLocaleString("es-CO", { maximumFractionDigits: 1 })}% · {row.count.toLocaleString("es-CO")} registros con gestión</span>
                </div>
                <div role="img" aria-label={`${row.label}: ${row.boxes} cajas, ${percentage.toFixed(1)}% del total`} className="h-6 overflow-hidden rounded-md bg-slate-100">
                  <div className={`h-full rounded-md ${row.color}`} style={{ width: `${percentage}%` }} />
                </div>
              </div>;
            })}
          </div>
          <p className="mt-4 text-xs text-slate-500">La participación se calcula sobre todas las cajas gestionadas. Sin clasificar incluye gestiones sin área registrada.</p>
        </>}
    </ChartPanel>
  );
}
