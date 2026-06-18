import { Bell } from "lucide-react";
import type { ModulacionRegistro } from "../../lib/modulacionStorage";

export function ModulacionNotificationAlert({
  modulaciones,
  visible,
}: {
  modulaciones: ModulacionRegistro[];
  visible: boolean;
}) {
  const ultima = modulaciones[0] ?? null;
  const visibleModulaciones = modulaciones.slice(0, 3);

  if (!ultima || !visible) return null;

  return (
    <section className="mb-6 rounded-lg border border-amber-200 bg-[#fff8e6] p-5 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-md bg-[#f5bd19] text-[#10223d]">
            <Bell size={20} />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#0f7c58]">Alerta de modulacion</p>
            <h2 className="mt-1 text-xl font-semibold text-[#10223d]">Se acaba de hacer una modulacion</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              {ultima.persona} modulo el DT {ultima.dt} del cliente {ultima.codigoCliente}. Cajas rechazadas:{" "}
              {ultima.totalCajas}. Reubicadas: {ultima.cajasReubicadas || "0"}.
            </p>
          </div>
        </div>
        <span className="rounded-md bg-white px-3 py-2 text-sm font-semibold text-[#10223d] shadow-sm">
          {formatTime(ultima.createdAt)}
        </span>
      </div>

      {visibleModulaciones.length > 1 ? (
        <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {visibleModulaciones.slice(1).map((registro) => (
            <div className="rounded-md border border-amber-200/70 bg-white/75 px-3 py-2 text-sm" key={registro.id}>
              <p className="font-semibold text-[#10223d]">DT {registro.dt}</p>
              <p className="mt-1 text-xs text-slate-600">
                {registro.persona} - Cliente {registro.codigoCliente} - {formatTime(registro.createdAt)}
              </p>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--:--";

  return date.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" });
}
