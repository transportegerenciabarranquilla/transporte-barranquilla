import { ClipboardList, Users } from "lucide-react";
import type { ModulacionRegistro, ModulacionResumen } from "../../lib/modulacionStorage";

export function ModulacionSidebar({
  personas,
  resumenGeneral,
  topeMaximoCajas,
  totalCajasVehiculos,
}: {
  personas: ModulacionRegistro[];
  resumenGeneral: ModulacionResumen;
  topeMaximoCajas: number;
  totalCajasVehiculos: number;
}) {
  return (
    <aside className="space-y-5">
      <div className="rounded-lg bg-[#10223d] p-6 text-white shadow-[0_22px_70px_rgba(16,34,61,0.2)] sm:p-8">
        <div className="mb-8 inline-flex h-12 w-12 items-center justify-center rounded-md bg-[#f5bd19] text-[#10223d]">
          <ClipboardList size={24} />
        </div>
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#f5bd19]">Punto Corona Galapa</p>
        <h1 className="mt-3 text-3xl font-semibold leading-tight">Modulacion de novedades</h1>
        <p className="mt-4 text-sm leading-6 text-white/72">
          Registra el DT, cliente, cajas, causal y comentario en un formulario mas claro para la operacion diaria.
        </p>

        <Metric label="Cajas rechazadas" value={resumenGeneral.cajasRechazadas.toLocaleString("es-CO")} />
        <Metric label="Cajas reubicadas" value={resumenGeneral.cajasReubicadas.toLocaleString("es-CO")} />

        <Metric label="Tope maximo de cajas" value={topeMaximoCajas} />
        <p className="mt-1 text-xs text-white/60">
          1 caja por cada 100 cajas salidas. Calculado sobre {totalCajasVehiculos.toLocaleString("es-CO")} cajas.
        </p>

        <Metric label="Refusal neto" value={`${resumenGeneral.refusal.toLocaleString("es-CO")}%`} />

        <Metric label="Personas que han modulado" value={personas.length} />
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center gap-2 text-[#10223d]">
          <Users size={18} />
          <h2 className="text-base font-semibold">Personas registradas</h2>
        </div>
        {personas.length ? (
          <div className="space-y-3">
            {personas.map((registro) => (
              <div className="rounded-md border border-slate-200 p-3" key={registro.id}>
                <p className="text-sm font-semibold text-[#10223d]">{registro.persona}</p>
                <p className="mt-1 text-xs text-slate-500">Ultimo DT: {registro.dt}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm leading-6 text-slate-500">Aun no hay personas moduladas en este navegador.</p>
        )}
      </div>
    </aside>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="mt-8 rounded-md border border-white/15 bg-white/10 p-4">
      <p className="text-sm text-white/65">{label}</p>
      <p className="mt-2 text-3xl font-semibold text-[#f5bd19]">{value}</p>
    </div>
  );
}
