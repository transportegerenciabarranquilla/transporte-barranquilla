import type { FormEvent, ReactNode } from "react";
import { BadgeCheck, Boxes, ClipboardList, MessageSquareText, Truck, UserRound } from "lucide-react";
import { causales } from "../constants";
import type { FormErrors, FormState } from "../types";
import { onlyNumbers } from "../utils";
import { normalizeDt, type ModulacionResumen } from "../../lib/modulacionStorage";
import type { Vehiculo } from "../../seguimiento/types";
import { NumericField } from "./NumericField";
import { SummaryInfo } from "./SummaryInfo";

export function ModulacionForm({
  errors,
  form,
  onChange,
  onSubmit,
  resumenDt,
  selectedVehicle,
  submitted,
  vehiculosSeguimiento,
}: {
  errors: FormErrors;
  form: FormState;
  onChange: <Key extends keyof FormState>(key: Key, value: FormState[Key]) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  resumenDt: ModulacionResumen;
  selectedVehicle: Vehiculo | null;
  submitted: boolean;
  vehiculosSeguimiento: Vehiculo[];
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
      <form className="space-y-6" onSubmit={onSubmit} noValidate>
        <FormSection icon={<Truck size={18} />} title="DT y cliente">
          <div className="grid gap-4 lg:grid-cols-2">
            <label className="block lg:col-span-2">
              <span className="mb-2 block text-sm font-medium text-slate-700">DT de hoy</span>
              <select
                className={`h-12 w-full rounded-md border bg-white px-3 text-sm outline-none transition ${
                  errors.dt ? "border-red-400" : "border-slate-200 focus:border-[#0f7c58]"
                }`}
                onChange={(event) => onChange("dt", normalizeDt(event.target.value))}
                value={form.dt}
              >
                <option value="">Selecciona el DT del carro</option>
                {vehiculosSeguimiento.map((vehiculo) => (
                  <option key={`${vehiculo.vehiculo}-${vehiculo.transporte}`} value={normalizeDt(vehiculo.transporte)}>
                    {vehiculo.transporte} - {vehiculo.vehiculo} - {vehiculo.responsable}
                  </option>
                ))}
              </select>
              {errors.dt ? <p className="mt-2 text-sm text-red-600">{errors.dt}</p> : null}
              {!vehiculosSeguimiento.length ? (
                <p className="mt-2 text-sm text-amber-700">No hay DT cargados para el dia de hoy.</p>
              ) : null}
            </label>

            <NumericField
              error={errors.dt}
              label="Escribe tu DT manual"
              onChange={(value) => onChange("dt", onlyNumbers(value))}
              value={form.dt}
            />

            <NumericField
              error={errors.codigoCliente}
              label="Codigo de cliente"
              onChange={(value) => onChange("codigoCliente", onlyNumbers(value))}
              value={form.codigoCliente}
            />

            <label className="block lg:col-span-2">
              <span className="mb-2 block text-sm font-medium text-slate-700">Nombre cliente</span>
              <input
                className="h-12 w-full rounded-md border border-slate-200 bg-white px-4 text-sm outline-none transition placeholder:text-slate-400 focus:border-[#0f7c58]"
                onChange={(event) => onChange("nombreCliente", event.target.value)}
                placeholder="Nombre del cliente"
                type="text"
                value={form.nombreCliente}
              />
            </label>
          </div>
        </FormSection>

        {selectedVehicle ? <VehicleSummary selectedVehicle={selectedVehicle} resumenDt={resumenDt} /> : null}

        <FormSection icon={<Boxes size={18} />} title="Cajas">
          <div className="grid gap-4 sm:grid-cols-2">
            <NumericField
              error={errors.totalCajas}
              icon="boxes"
              label="Cajas rechazadas"
              onChange={(value) => onChange("totalCajas", onlyNumbers(value))}
              value={form.totalCajas}
            />

            <NumericField
              error={errors.cajasGestionadas}
              icon="boxes"
              label="Cajas gestionadas"
              onChange={(value) => onChange("cajasGestionadas", onlyNumbers(value))}
              value={form.cajasGestionadas}
            />
          </div>
        </FormSection>

        <FormSection icon={<ClipboardList size={18} />} title="Detalle de la novedad">
          <div className="grid gap-4 lg:grid-cols-2">
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">Persona que modula</span>
              <span className="relative block">
                <UserRound className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input
                  className={`h-12 w-full rounded-md border bg-white pl-10 pr-4 text-sm outline-none transition placeholder:text-slate-400 ${
                    errors.persona ? "border-red-400" : "border-slate-200 focus:border-[#0f7c58]"
                  }`}
                  onChange={(event) => onChange("persona", event.target.value)}
                  placeholder="Nombre o cedula"
                  type="text"
                  value={form.persona}
                />
              </span>
              {errors.persona ? <p className="mt-2 text-sm text-red-600">{errors.persona}</p> : null}
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">Causal</span>
              <select
                className={`h-12 w-full rounded-md border bg-white px-3 text-sm outline-none transition ${
                  errors.causal ? "border-red-400" : "border-slate-200 focus:border-[#0f7c58]"
                }`}
                onChange={(event) => onChange("causal", event.target.value)}
                value={form.causal}
              >
                <option value="">Elegir</option>
                {causales.map((causal) => (
                  <option key={causal} value={causal}>
                    {causal}
                  </option>
                ))}
              </select>
              {errors.causal ? <p className="mt-2 text-sm text-red-600">{errors.causal}</p> : null}
            </label>

            <label className="block lg:col-span-2">
              <span className="mb-2 block text-sm font-medium text-slate-700">Comentario</span>
              <span className="relative block">
                <MessageSquareText className="pointer-events-none absolute left-3 top-4 text-slate-400" size={18} />
                <textarea
                  className={`min-h-32 w-full rounded-md border bg-white py-3 pl-10 pr-4 text-sm outline-none transition placeholder:text-slate-400 ${
                    errors.comentario ? "border-red-400" : "border-slate-200 focus:border-[#0f7c58]"
                  }`}
                  onChange={(event) => onChange("comentario", event.target.value)}
                  placeholder="Detalle de la novedad"
                  value={form.comentario}
                />
              </span>
              {errors.comentario ? <p className="mt-2 text-sm text-red-600">{errors.comentario}</p> : null}
            </label>
          </div>
        </FormSection>

        <button
          className="flex h-12 w-full items-center justify-center gap-2 rounded-md bg-[#0f7c58] px-5 text-sm font-semibold text-white transition hover:bg-[#0b684a]"
          type="submit"
        >
          <BadgeCheck size={18} />
          Enviar modulacion
        </button>
      </form>

      {submitted ? (
        <div className="mt-6 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          <p className="font-semibold">Modulacion registrada en modo demo.</p>
          <p className="mt-1">El registro queda disponible en esta pagina desde este navegador.</p>
        </div>
      ) : null}
    </div>
  );
}

function FormSection({ children, icon, title }: { children: ReactNode; icon: ReactNode; title: string }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-slate-50/70 p-4">
      <div className="mb-4 flex items-center gap-2 text-[#10223d]">
        <span className="grid h-8 w-8 place-items-center rounded-md bg-[#e9f3ff]">{icon}</span>
        <h2 className="text-sm font-semibold">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function VehicleSummary({
  resumenDt,
  selectedVehicle,
}: {
  resumenDt: ModulacionResumen;
  selectedVehicle: Vehiculo;
}) {
  return (
    <div className="grid gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4 sm:grid-cols-2">
      <SummaryInfo label="Carro" value={selectedVehicle.vehiculo} />
      <SummaryInfo label="Responsable" value={selectedVehicle.responsable} />
      <SummaryInfo label="Cedula RR" value={selectedVehicle.cedulaResponsable || "-"} />
      <SummaryInfo label="Auxiliar 1" value={selectedVehicle.cedulaAuxiliar1 || "-"} />
      <SummaryInfo label="Auxiliar 2" value={selectedVehicle.cedulaAuxiliar2 || "-"} />
      <SummaryInfo label="Cajas rechazadas DT" value={resumenDt.cajasRechazadas.toLocaleString("es-CO")} />
      <SummaryInfo label="Cajas gestionadas DT" value={resumenDt.cajasGestionadas.toLocaleString("es-CO")} />
      <SummaryInfo label="Refusal DT" value={`${resumenDt.refusal.toLocaleString("es-CO")}%`} />
      <SummaryInfo label="Clientes que rechazan" value={resumenDt.clientesRechazan} />
    </div>
  );
}
