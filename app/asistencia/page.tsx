"use client";

import { FormEvent, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, BadgeCheck, Building2, ClipboardCheck, Hash, IdCard, Truck, Users } from "lucide-react";
import {
  ASISTENCIA_STORAGE_KEY,
  createAttendanceKey,
  type AsistenciaRegistro,
} from "../lib/asistenciaStorage";

type FormState = {
  contratista: string;
  dt: string;
  cedulaResponsable: string;
  cedulaAuxiliar1: string;
  cedulaAuxiliar2: string;
};

type FormErrors = Partial<Record<keyof FormState, string>>;

const initialForm: FormState = {
  contratista: "",
  dt: "",
  cedulaResponsable: "",
  cedulaAuxiliar1: "",
  cedulaAuxiliar2: "",
};

const contractors = ["Punto Corona", "Logisticos", "Surti Cervezas"];

function onlyNumbers(value: string) {
  return value.replace(/\D/g, "");
}

function validate(form: FormState) {
  const errors: FormErrors = {};

  if (!form.contratista) errors.contratista = "Selecciona el contratista.";
  if (!form.dt) errors.dt = "Ingresa el DT.";
  if (!form.cedulaResponsable) errors.cedulaResponsable = "Ingresa la cedula del RR.";
  if (!form.cedulaAuxiliar1) errors.cedulaAuxiliar1 = "Ingresa la cedula del conductor o auxiliar 1.";
  if (!form.cedulaAuxiliar2) errors.cedulaAuxiliar2 = "Ingresa la cedula del auxiliar 2.";

  return errors;
}

export default function AsistenciaPage() {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(initialForm);
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitted, setSubmitted] = useState<FormState | null>(null);

  const llave = useMemo(() => {
    if (!form.contratista || !form.dt) return "";
    return createAttendanceKey(form.contratista, form.dt);
  }, [form.contratista, form.dt]);

  function updateField<Key extends keyof FormState>(key: Key, value: FormState[Key]) {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
    setSubmitted(null);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors = validate(form);
    setErrors(nextErrors);

    if (Object.keys(nextErrors).length === 0) {
      const nextRecord: AsistenciaRegistro = {
        id: crypto.randomUUID(),
        contratista: form.contratista,
        dt: form.dt,
        cedulaResponsable: form.cedulaResponsable,
        cedulaAuxiliar1: form.cedulaAuxiliar1,
        cedulaAuxiliar2: form.cedulaAuxiliar2,
        llave: createAttendanceKey(form.contratista, form.dt),
        createdAt: new Date().toISOString(),
      };

      if (form.contratista === "Punto Corona") {
        const current = localStorage.getItem(ASISTENCIA_STORAGE_KEY);
        const records = current ? (JSON.parse(current) as AsistenciaRegistro[]) : [];
        const withoutDuplicate = records.filter((record) => record.llave !== nextRecord.llave);

        localStorage.setItem(ASISTENCIA_STORAGE_KEY, JSON.stringify([...withoutDuplicate, nextRecord]));
      }

      setSubmitted(form);
    }
  }

  return (
    <main className="min-h-screen bg-[#f4f7fb] text-slate-900">
      <header className="border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4 sm:px-8">
          <button
            className="flex h-10 items-center gap-2 rounded-md px-3 text-sm font-semibold text-[#10223d] transition hover:bg-slate-100"
            onClick={() => router.push("/")}
            type="button"
          >
            <ArrowLeft size={18} />
            Portal
          </button>
          <div className="flex items-center gap-2 rounded-md bg-[#e9f3ff] px-3 py-2 text-sm font-medium text-[#10223d]">
            <ClipboardCheck size={18} />
            Registro RR
          </div>
        </div>
      </header>

      <section className="mx-auto grid max-w-6xl gap-6 px-5 py-8 sm:px-8 lg:grid-cols-[0.95fr_1.05fr] lg:py-10">
        <aside className="rounded-lg bg-[#10223d] p-6 text-white shadow-[0_22px_70px_rgba(16,34,61,0.2)] sm:p-8">
          <div className="mb-8 inline-flex h-12 w-12 items-center justify-center rounded-md bg-[#f5bd19] text-[#10223d]">
            <Users size={24} />
          </div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#f5bd19]">Asistencia de ruta</p>
          <h1 className="mt-3 text-3xl font-semibold leading-tight">Registro de RR, conductor y auxiliares</h1>
          <p className="mt-4 text-sm leading-6 text-white/72">
            Este formulario captura el DT, contratista y cedulas. Con el contratista y el DT se genera la llave que luego
            alimentara el modulo de seguimiento.
          </p>

          <div className="mt-8 rounded-md border border-white/15 bg-white/10 p-4">
            <p className="text-sm text-white/65">Llave generada</p>
            <p className="mt-2 break-all text-xl font-semibold text-[#f5bd19]">{llave || "Selecciona contratista e ingresa DT"}</p>
          </div>
        </aside>

        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <form className="space-y-5" onSubmit={handleSubmit} noValidate>
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">Contratista</span>
              <span className="relative block">
                <Building2 className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <select
                  className={`h-12 w-full rounded-md border bg-white pl-10 pr-4 text-sm outline-none transition ${
                    errors.contratista ? "border-red-400" : "border-slate-200 focus:border-[#f5bd19]"
                  }`}
                  onChange={(event) => updateField("contratista", event.target.value)}
                  value={form.contratista}
                >
                  <option value="">Selecciona un contratista</option>
                  {contractors.map((contractor) => (
                    <option key={contractor} value={contractor}>
                      {contractor}
                    </option>
                  ))}
                </select>
              </span>
              {errors.contratista ? <p className="mt-2 text-sm text-red-600">{errors.contratista}</p> : null}
            </label>

            <NumericField
              error={errors.dt}
              icon={<Hash size={18} />}
              label="DT"
              onChange={(value) => updateField("dt", value)}
              value={form.dt}
            />
            <NumericField
              error={errors.cedulaResponsable}
              icon={<IdCard size={18} />}
              label="Cedula de responsable de ruta - conductor RR"
              onChange={(value) => updateField("cedulaResponsable", value)}
              value={form.cedulaResponsable}
            />
            <NumericField
              error={errors.cedulaAuxiliar1}
              icon={<Truck size={18} />}
              label="Cedula conductor / auxiliar 1"
              onChange={(value) => updateField("cedulaAuxiliar1", value)}
              value={form.cedulaAuxiliar1}
            />
            <NumericField
              error={errors.cedulaAuxiliar2}
              icon={<Users size={18} />}
              label="Cedula de auxiliar 2"
              onChange={(value) => updateField("cedulaAuxiliar2", value)}
              value={form.cedulaAuxiliar2}
            />

            <button
              className="flex h-12 w-full items-center justify-center gap-2 rounded-md bg-[#f5bd19] px-5 text-sm font-semibold text-[#10223d] transition hover:bg-[#e6a400]"
              type="submit"
            >
              <BadgeCheck size={18} />
              Guardar asistencia
            </button>
          </form>

          {submitted ? (
            <div className="mt-6 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
            <p className="font-semibold">Asistencia registrada en modo demo.</p>
            <p className="mt-1">
                Llave: <strong>{createAttendanceKey(submitted.contratista, submitted.dt)}</strong>
            </p>
              <p className="mt-1">
                {submitted.contratista === "Punto Corona"
                  ? "Este registro ya queda disponible en Seguimiento en este navegador."
                  : "Por ahora solo Punto Corona alimenta Seguimiento en modo demo."}
              </p>
            </div>
          ) : null}
        </div>
      </section>
    </main>
  );
}

function NumericField({
  error,
  icon,
  label,
  onChange,
  value,
}: {
  error?: string;
  icon: ReactNode;
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-slate-700">{label}</span>
      <span className="relative block">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">{icon}</span>
        <input
          className={`h-12 w-full rounded-md border bg-white pl-10 pr-4 text-sm outline-none transition placeholder:text-slate-400 ${
            error ? "border-red-400" : "border-slate-200 focus:border-[#f5bd19]"
          }`}
          inputMode="numeric"
          onChange={(event) => onChange(onlyNumbers(event.target.value))}
          placeholder="Solo numeros sin comas ni espacios"
          type="text"
          value={value}
        />
      </span>
      <p className="mt-1 text-xs text-slate-400">SOLO COLOCAR NUMEROS SIN COMAS NI ESPACIOS</p>
      {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
    </label>
  );
}
