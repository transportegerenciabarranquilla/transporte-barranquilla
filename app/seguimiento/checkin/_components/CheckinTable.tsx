import type { FormEvent } from "react";
import { BadgeCheck, ClipboardCheck } from "lucide-react";
import type { CheckinRow } from "../_lib/checkinPage";

export function CheckinTable({
  rows,
  inputs,
  savedDt,
  savingDt,
  dateLabel,
  onInputChange,
  onSubmit,
}: {
  rows: CheckinRow[];
  inputs: Record<string, string>;
  savedDt: string;
  savingDt: string;
  dateLabel: string;
  onInputChange: (dt: string, value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>, dt: string) => void;
}) {
  return (
    <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-2 border-b border-slate-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <ClipboardCheck size={17} className="text-[#10223d]" />
          <div>
            <h2 className="text-base font-semibold text-[#10223d]">Carros salidos hoy</h2>
            <p className="mt-0.5 text-xs text-slate-500">El checkin reemplaza el pendiente modulado como dato final de refusal para cada DT.</p>
          </div>
        </div>
        <span className="rounded-md bg-[#e9f3ff] px-2.5 py-1.5 text-xs font-semibold text-[#10223d]">{dateLabel}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px]">
          <thead className="bg-slate-50 text-xs uppercase tracking-[0.12em] text-slate-500">
            <tr>
              <th className="px-3 py-2 text-left">Vehículo / DT</th><th className="px-3 py-2 text-left">Responsable</th>
              <th className="px-3 py-2 text-center">Salida</th><th className="px-3 py-2 text-center">Moduladas</th>
              <th className="px-3 py-2 text-center">Gestionadas</th><th className="px-3 py-2 text-center">Checkin</th>
              <th className="px-3 py-2 text-right">Refusal final</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.length ? rows.map(({ checkin, key, resumen, vehicle }) => (
              <tr className="transition hover:bg-slate-50" key={`${vehicle.vehiculo}-${vehicle.transporte}`}>
                <td className="px-3 py-1.5"><p className="text-xs font-semibold text-[#10223d]">{vehicle.vehiculo}</p><p className="text-[10px] text-slate-500">{vehicle.transporte}</p></td>
                <td className="px-3 py-1.5 text-xs font-medium text-slate-600">{vehicle.responsable}</td>
                <td className="px-3 py-1.5 text-center text-xs font-semibold text-[#10223d]">{vehicle.horaSalida || "Pendiente"}</td>
                <td className="px-3 py-1.5 text-center"><span className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-semibold text-red-700">{resumen.cajasRechazadas}</span></td>
                <td className="px-3 py-1.5 text-center"><span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">{resumen.cajasGestionadas}</span></td>
                <td className="px-3 py-1.5">
                  <form className="flex items-center justify-center gap-1.5" onSubmit={(event) => onSubmit(event, vehicle.transporte)}>
                    <input aria-label={`Cajas checkin DT ${vehicle.transporte}`} className="h-7 w-16 rounded-md border border-slate-200 px-1.5 text-center text-xs font-semibold text-[#10223d] outline-none transition focus:border-[#f5bd19]" inputMode="numeric" onChange={(event) => onInputChange(vehicle.transporte, event.target.value)} placeholder={String(resumen.cajasPendientesModulacion)} value={inputs[key] ?? ""} />
                    <button aria-label={`Guardar checkin DT ${vehicle.transporte}`} className="grid h-7 w-7 place-items-center rounded-md bg-[#10223d] text-white transition hover:bg-[#1b355b] disabled:cursor-wait disabled:opacity-60" disabled={savingDt === key} type="submit"><BadgeCheck size={16} /></button>
                  </form>
                  {savingDt === key ? <p className="mt-1 text-center text-[10px] font-semibold text-slate-500">Guardando…</p> : savedDt === key ? <p className="mt-1 text-center text-[10px] font-semibold text-emerald-700">Guardado</p> : null}
                </td>
                <td className="px-3 py-1.5 text-right"><div className="flex flex-col items-end"><span className="text-sm font-semibold text-[#10223d]">{resumen.cajasPendientes}</span><span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${checkin ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{checkin ? "Checkin" : "Pendiente"}</span></div></td>
              </tr>
            )) : <tr><td className="px-5 py-12 text-center text-sm font-medium text-slate-500" colSpan={7}>No hay carros para esta fecha.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}
