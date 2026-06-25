import { Truck } from "lucide-react";
import type { ResumenSeguimiento } from "../types";
import type { ContractorBrand } from "../../lib/contractorBranding";

export function SeguimientoHero({ resumen, brand }: { resumen: ResumenSeguimiento; brand: ContractorBrand }) {
  return (
    <div className="mb-8 overflow-hidden rounded-lg bg-[#10223d] text-white shadow-[0_22px_70px_rgba(16,34,61,0.22)]">
      <div className="relative p-6 sm:p-8">
        <div className="absolute right-0 top-0 h-40 w-40 rounded-bl-full bg-[#f5bd19]/20" />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-4 inline-flex items-center gap-2 rounded-md border border-white/15 bg-white/10 px-3 py-2 text-sm text-white/80">
              <Truck size={18} />
              Modulo operativo
            </div>
            <h1 className="text-3xl font-semibold leading-tight sm:text-4xl">Seguimiento {brand.name}</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-white/70">
              Monitorea vehículos, avance de visitas, carga movilizada y novedades de ruta en tiempo real.
            </p>
          </div>

          <div className="min-w-[220px] rounded-md border border-white/15 bg-white/10 p-4">
            <p className="text-sm text-white/65">Avance general</p>
            <div className="mt-3 flex items-end gap-3">
              <span className="text-4xl font-semibold" style={{ color: brand.accent }}>{resumen.avance}%</span>
              <span className="pb-1 text-sm text-white/70">
                {resumen.visitados}/{resumen.clientes} clientes
              </span>
            </div>
            <div className="mt-4 h-2 rounded-full bg-white/15">
              <div className="h-2 rounded-full" style={{ width: `${resumen.avance}%`, backgroundColor: brand.accent }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
