import { Activity, Boxes, PackageCheck, Truck, Users } from "lucide-react";
import type { ResumenSeguimiento } from "../types";
import type { ContractorBrand } from "../../lib/contractorBranding";

export function SeguimientoHero({ resumen, brand }: { resumen: ResumenSeguimiento; brand: ContractorBrand }) {
  const stats = [
    { label: "Rutas", value: resumen.vehiculos, icon: <Truck size={15} /> },
    { label: "Cajas", value: resumen.cajas, icon: <Boxes size={15} /> },
    { label: "HL", value: resumen.hl, icon: <PackageCheck size={15} /> },
    { label: "Clientes", value: resumen.clientes, icon: <Users size={15} /> },
  ];

  return (
    <div className="mb-8 overflow-hidden rounded-lg bg-[#091525] text-white shadow-[0_28px_90px_rgba(9,21,37,0.26)]">
      <div className="relative p-5 sm:p-7 lg:p-8">
        <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(18,100,255,0.22),transparent_46%),radial-gradient(circle_at_92%_12%,rgba(245,189,25,0.22),transparent_30%)]" />
        <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-[#00b8d9]/60 to-transparent" />
        <div className="relative grid gap-6 lg:grid-cols-[1fr_340px] lg:items-end">
          <div>
            <div className="mb-4 inline-flex items-center gap-2 rounded-md border border-white/15 bg-white/10 px-3 py-2 text-sm font-semibold text-white/80 backdrop-blur">
              <Truck size={18} />
              Modulo operativo
            </div>
            <h1 className="text-balance text-3xl font-semibold leading-tight sm:text-4xl lg:text-5xl">
              Seguimiento{brand.name ? ` ${brand.name}` : ""}
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-white/70">
              Monitorea vehiculos, avance de visitas, carga movilizada y novedades de ruta en tiempo real.
            </p>
            <div className="mt-6 grid gap-2 sm:grid-cols-2 lg:max-w-2xl lg:grid-cols-4">
              {stats.map((item) => (
                <div className="rounded-lg border border-white/12 bg-white/8 px-3 py-3 backdrop-blur" key={item.label}>
                  <div className="flex items-center justify-between gap-2 text-white/60">
                    <span className="text-xs font-semibold uppercase tracking-[0.12em]">{item.label}</span>
                    {item.icon}
                  </div>
                  <p className="mt-2 truncate text-xl font-semibold text-white">{item.value}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-white/15 bg-white/10 p-4 shadow-2xl shadow-black/10 backdrop-blur">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-white/72">Avance general</p>
              <span className="grid h-8 w-8 place-items-center rounded-md bg-white/10" style={{ color: brand.accent }}>
                <Activity size={17} />
              </span>
            </div>
            <div className="mt-3 flex items-end gap-3">
              <span className="text-4xl font-semibold" style={{ color: brand.accent }}>{resumen.avance}%</span>
              <span className="pb-1 text-sm text-white/70">
                {resumen.visitados}/{resumen.clientes} clientes
              </span>
            </div>
            <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-white/15">
              <div className="h-full rounded-full shadow-[0_0_22px_rgba(0,184,217,0.45)]" style={{ width: `${resumen.avance}%`, backgroundColor: brand.accent }} />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-md bg-white/8 px-3 py-2">
                <p className="text-white/50">Pendientes</p>
                <p className="mt-0.5 font-semibold text-white">{Math.max(resumen.clientes - resumen.visitados, 0)}</p>
              </div>
              <div className="rounded-md bg-white/8 px-3 py-2">
                <p className="text-white/50">Visitados</p>
                <p className="mt-0.5 font-semibold text-white">{resumen.visitados}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
