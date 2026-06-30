import { Activity, Truck } from "lucide-react";
import type { ResumenSeguimiento } from "../types";
import type { ContractorBrand } from "../../lib/contractorBranding";

export function SeguimientoHero({ resumen, brand }: { resumen: ResumenSeguimiento; brand: ContractorBrand }) {
  return (
    <div className="mb-8 overflow-hidden rounded-lg bg-[#091525] text-white shadow-[0_28px_90px_rgba(9,21,37,0.26)]">
      <div className="relative p-6 sm:p-8">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_0%,rgba(0,184,217,0.24),transparent_34%),radial-gradient(circle_at_92%_18%,rgba(245,189,25,0.22),transparent_28%)]" />
        <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-[#00b8d9]/60 to-transparent" />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-4 inline-flex items-center gap-2 rounded-md border border-white/15 bg-white/10 px-3 py-2 text-sm text-white/80 backdrop-blur">
              <Truck size={18} />
              Modulo operativo
            </div>
            <h1 className="text-balance text-3xl font-semibold leading-tight sm:text-4xl">
              Seguimiento{brand.name ? ` ${brand.name}` : ""}
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-white/70">
              Monitorea vehiculos, avance de visitas, carga movilizada y novedades de ruta en tiempo real.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              {["Rutas activas", "Refusal", "Jornada", "Check-in"].map((item) => (
                <span className="rounded-md border border-white/10 bg-white/8 px-3 py-1.5 text-xs font-semibold text-white/72" key={item}>
                  {item}
                </span>
              ))}
            </div>
          </div>

          <div className="min-w-[240px] rounded-md border border-white/15 bg-white/10 p-4 shadow-2xl shadow-black/10 backdrop-blur">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-white/65">Avance general</p>
              <Activity size={17} style={{ color: brand.accent }} />
            </div>
            <div className="mt-3 flex items-end gap-3">
              <span className="text-4xl font-semibold" style={{ color: brand.accent }}>{resumen.avance}%</span>
              <span className="pb-1 text-sm text-white/70">
                {resumen.visitados}/{resumen.clientes} clientes
              </span>
            </div>
            <div className="mt-4 h-2 rounded-full bg-white/15">
              <div className="h-2 rounded-full shadow-[0_0_22px_rgba(0,184,217,0.45)]" style={{ width: `${resumen.avance}%`, backgroundColor: brand.accent }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
