import type { FormEvent, ReactNode } from "react";
import { BadgeCheck, Boxes, ClipboardList, MessageSquareText, Truck } from "lucide-react";
import { causales } from "../constants";
import type { FormErrors, FormState } from "../types";
import { onlyNumbers } from "../utils";
import { normalizeDt } from "../../lib/modulacionStorage";
import type { Vehiculo } from "../../seguimiento/types";
import { NumericField } from "./NumericField";

const contractors = ["Punto Corona", "Logisticos", "Surti Cervezas"];

export function ModulacionForm({
  clienteError,
  errors,
  form,
  loadingCliente,
  loadingModulador,
  loadingVehicles,
  moduladorError,
  onChange,
  onSubmit,
  saveError,
  saving,
  submitted,
  vehiclesError,
  vehiculosSeguimiento,
}: {
  clienteError?: string;
  errors: FormErrors;
  form: FormState;
  loadingCliente?: boolean;
  loadingModulador?: boolean;
  loadingVehicles?: boolean;
  moduladorError?: string;
  onChange: <Key extends keyof FormState>(key: Key, value: FormState[Key]) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  saveError?: string;
  saving?: boolean;
  submitted: boolean;
  vehiclesError?: string;
  vehiculosSeguimiento: Vehiculo[];
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
      <form className="space-y-6" onSubmit={onSubmit} noValidate>
        <FormSection icon={<Truck size={18} />} title="DT y cliente">
          <div className="grid gap-4 lg:grid-cols-2">
            <label className="block lg:col-span-2">
              <span className="mb-2 block text-sm font-medium text-slate-700">Contratista</span>
              <select
                className={`h-12 w-full rounded-md border bg-white px-3 text-sm outline-none transition ${
                  errors.contratista ? "border-red-400" : "border-slate-200 focus:border-[#0f7c58]"
                }`}
                onChange={(event) => onChange("contratista", event.target.value)}
                value={form.contratista}
              >
                <option value="">Selecciona el contratista</option>
                {contractors.map((contractor) => (
                  <option key={contractor} value={contractor}>
                    {contractor}
                  </option>
                ))}
              </select>
              {errors.contratista ? <p className="mt-2 text-sm text-red-600">{errors.contratista}</p> : null}
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
              <span className="mb-2 block text-sm font-medium text-slate-700">DT validado</span>
              <select
                className={`h-12 w-full rounded-md border bg-white px-3 text-sm outline-none transition ${
                  errors.dt ? "border-red-400" : "border-slate-200 focus:border-[#0f7c58]"
                }`}
                disabled
                value={vehiculosSeguimiento.length ? form.dt : ""}
              >
                <option value="">
                  {!form.contratista
                    ? "Primero selecciona el contratista"
                    : !form.dt
                      ? "Escribe el DT manual para validar"
                      : loadingVehicles
                        ? "Validando DT..."
                        : "Sin DT cargado para ese numero"}
                </option>
                {vehiculosSeguimiento.map((vehiculo) => (
                  <option key={`${vehiculo.vehiculo}-${vehiculo.transporte}`} value={normalizeDt(vehiculo.transporte)}>
                    {vehiculo.transporte} - {vehiculo.vehiculo} - {vehiculo.responsable}
                  </option>
                ))}
              </select>
              {errors.dt ? <p className="mt-2 text-sm text-red-600">{errors.dt}</p> : null}
              {vehiclesError ? <p className="mt-2 text-sm text-red-600">{vehiclesError}</p> : null}
              {form.contratista && form.dt && !loadingVehicles && !vehiclesError && !vehiculosSeguimiento.length ? (
                <p className="mt-2 text-sm text-amber-700">No hay DT cargado para ese numero.</p>
              ) : null}
            </label>

            <label className="block lg:col-span-2">
              <span className="mb-2 block text-sm font-medium text-slate-700">Nombre cliente</span>
              <input
                className="h-12 w-full rounded-md border border-slate-200 bg-slate-50 px-4 text-sm outline-none transition placeholder:text-slate-400"
                onChange={(event) => onChange("nombreCliente", event.target.value)}
                placeholder={loadingCliente ? "Buscando cliente..." : "Nombre del cliente"}
                readOnly
                type="text"
                value={form.nombreCliente}
              />
              {clienteError ? <p className="mt-2 text-sm text-amber-700">{clienteError}</p> : null}
            </label>

            <InfoField label="Jefe de ventas" value={form.jefeComercial || "-"} />
            <InfoField label="Telefono jefe comercial" value={form.telefonoJefeComercial || "-"} />
            <InfoField label="Preventista" value={form.preventista || "-"} />
            <InfoField label="Telefono cliente" value={form.telefonoCliente || "-"} />
          </div>
        </FormSection>

        <FormSection icon={<Boxes size={18} />} title="Cajas">
          <NumericField
            error={errors.totalCajas}
            icon="boxes"
            label="Cajas rechazadas"
            onChange={(value) => onChange("totalCajas", onlyNumbers(value))}
            value={form.totalCajas}
          />
        </FormSection>

        <FormSection icon={<ClipboardList size={18} />} title="Detalle de la novedad">
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-3">
              <NumericField
                error={errors.persona}
                label="Cédula del modulador"
                onChange={(value) => onChange("persona", onlyNumbers(value))}
                value={form.persona}
              />
              <InfoField
                label="Modulador"
                value={loadingModulador ? "Buscando..." : form.personaNombre || "-"}
              />
              {moduladorError ? <p className="-mt-1 text-sm text-amber-700">{moduladorError}</p> : null}
            </div>

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
          disabled={saving}
          type="submit"
        >
          <BadgeCheck size={18} />
          {saving ? "Guardando..." : "Enviar modulacion"}
        </button>
      </form>

      {saveError ? <p className="mt-4 text-sm font-medium text-red-600">{saveError}</p> : null}

      {submitted ? (
        <div className="mt-6 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          <p className="font-semibold">Modulacion registrada en Supabase.</p>
          <p className="mt-1">El registro queda disponible para seguimiento.</p>
        </div>
      ) : null}
    </div>
  );
}

function InfoField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 px-4 py-3">
      <p className="text-xs font-medium uppercase tracking-[0.12em] text-slate-500">{label}</p>
      <p className="mt-1 min-h-5 text-sm font-semibold text-[#10223d]">{value}</p>
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
