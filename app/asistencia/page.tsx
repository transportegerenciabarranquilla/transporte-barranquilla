"use client";

import { FormEvent, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, BadgeCheck, Building2, ClipboardCheck, Hash, IdCard, Truck, Users } from "lucide-react";
import {
  createAttendanceKey,
  saveAsistenciaRegistros,
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
type PersonField = "cedulaResponsable" | "cedulaAuxiliar1" | "cedulaAuxiliar2";
type Persona = { CC: string | number; NOMBRE: string; CARGO: string; CONTRATISTA: string };

const initialForm: FormState = {
  contratista: "",
  dt: "",
  cedulaResponsable: "",
  cedulaAuxiliar1: "",
  cedulaAuxiliar2: "",
};

const contractors = ["Punto Corona", "Logisticos", "Surti Cervezas"];
const personFields: PersonField[] = ["cedulaResponsable", "cedulaAuxiliar1", "cedulaAuxiliar2"];

function onlyNumbers(value: string) {
  return value.replace(/\D/g, "");
}

function validate(form: FormState) {
  const errors: FormErrors = {};

  if (!form.contratista) errors.contratista = "Selecciona el contratista.";
  if (!form.dt) errors.dt = "Ingresa el DT.";
  if (!personFields.some((field) => form[field])) {
    errors.cedulaResponsable = "Ingresa al menos una cedula.";
  }

  return errors;
}

export default function AsistenciaPage() {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(initialForm);
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitted, setSubmitted] = useState<FormState | null>(null);
  const [personas, setPersonas] = useState<Partial<Record<PersonField, Persona | null>>>({});
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const timers = personFields.map((field) => {
      const cc = form[field];
      if (!cc || !form.contratista) {
        setPersonas((current) => ({ ...current, [field]: undefined }));
        return undefined;
      }

      return window.setTimeout(async () => {
        try {
          const response = await fetch(`/api/personas?cc=${encodeURIComponent(cc)}&contratista=${encodeURIComponent(form.contratista)}`, { cache: "no-store" });
          const body = await response.json();
          if (!response.ok) throw new Error(body.error || "No se pudo buscar la cedula.");
          setPersonas((current) => ({ ...current, [field]: body.persona }));
        } catch {
          setPersonas((current) => ({ ...current, [field]: null }));
        }
      }, 350);
    });

    return () => timers.forEach((timer) => timer && window.clearTimeout(timer));
  }, [form]);

  function updateField<Key extends keyof FormState>(key: Key, value: FormState[Key]) {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
    setSubmitted(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors = validate(form);

    personFields.forEach((field) => {
      const persona = personas[field];
      if (!form[field]) return;

      if (!persona) nextErrors[field] = "Cedula no encontrada en Transporte Barranquilla.";
      if (persona && persona.CONTRATISTA.trim().toLowerCase() !== form.contratista.trim().toLowerCase()) {
        nextErrors[field] = `La persona pertenece a ${persona.CONTRATISTA}.`;
      }
    });

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSaving(true);
    setSaveError("");
    const createdAt = new Date().toISOString();
    const attendanceDate = getLocalDateKey();

    const nextRecord: AsistenciaRegistro = {
      id: crypto.randomUUID(),
      contratista: form.contratista,
      dt: form.dt,
      cedulaResponsable: form.cedulaResponsable,
      cedulaAuxiliar1: form.cedulaAuxiliar1,
      cedulaAuxiliar2: form.cedulaAuxiliar2,
      nombreResponsable: personas.cedulaResponsable?.NOMBRE,
      nombreAuxiliar1: personas.cedulaAuxiliar1?.NOMBRE,
      nombreAuxiliar2: personas.cedulaAuxiliar2?.NOMBRE,
      llave: createAttendanceKey(form.contratista, form.dt, attendanceDate),
      createdAt,
    };

    try {
      await saveAsistenciaRegistros([nextRecord]);
      setSubmitted(form);
      setForm((current) => ({
        ...current,
        cedulaResponsable: "",
        cedulaAuxiliar1: "",
        cedulaAuxiliar2: "",
      }));
      setPersonas({});
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "No se pudo guardar la asistencia.");
    } finally {
      setSaving(false);
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
            Registro asistencia
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-3xl px-5 py-8 sm:px-8 lg:py-10">
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
              label="Cedula responsable de ruta - RR"
              onChange={(value) => updateField("cedulaResponsable", value)}
              value={form.cedulaResponsable}
            />
            <PersonMatch persona={personas.cedulaResponsable} value={form.cedulaResponsable} />

            <NumericField
              error={errors.cedulaAuxiliar1}
              icon={<Truck size={18} />}
              label="Cedula conductor / auxiliar 1"
              onChange={(value) => updateField("cedulaAuxiliar1", value)}
              value={form.cedulaAuxiliar1}
            />
            <PersonMatch persona={personas.cedulaAuxiliar1} value={form.cedulaAuxiliar1} />

            <NumericField
              error={errors.cedulaAuxiliar2}
              icon={<Users size={18} />}
              label="Cedula auxiliar 2"
              onChange={(value) => updateField("cedulaAuxiliar2", value)}
              value={form.cedulaAuxiliar2}
            />
            <PersonMatch persona={personas.cedulaAuxiliar2} value={form.cedulaAuxiliar2} />

            <button
              className="flex h-12 w-full items-center justify-center gap-2 rounded-md bg-[#f5bd19] px-5 text-sm font-semibold text-[#10223d] transition hover:bg-[#e6a400] disabled:opacity-60"
              disabled={saving}
              type="submit"
            >
              <BadgeCheck size={18} />
              {saving ? "Guardando..." : "Guardar asistencia"}
            </button>
            {saveError ? <p className="text-sm font-medium text-red-600">{saveError}</p> : null}
          </form>

          {submitted ? (
            <div className="mt-6 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
              <p className="font-semibold">Asistencia guardada en Supabase.</p>
              <p className="mt-1">
                Llave: <strong>{createAttendanceKey(submitted.contratista, submitted.dt, getLocalDateKey())}</strong>
              </p>
              <p className="mt-1">
                Cedulas guardadas: <strong>{personFields.map((field) => submitted[field]).filter(Boolean).join(", ")}</strong>
              </p>
            </div>
          ) : null}
        </div>
      </section>
    </main>
  );
}

function PersonMatch({ persona, value }: { persona?: Persona | null; value: string }) {
  if (!value) return null;
  if (persona === undefined) return <p className="-mt-3 text-xs text-slate-400">Buscando persona...</p>;
  if (persona === null) return <p className="-mt-3 text-xs font-medium text-amber-700">Cedula no encontrada en Transporte Barranquilla.</p>;
  return <p className="-mt-3 text-sm font-semibold text-emerald-700">{persona.NOMBRE} - {persona.CARGO}</p>;
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

function getLocalDateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
