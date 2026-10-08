"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { canWriteModulationsAndAttendance, CONTRACTORS, contractorLabel, normalizeContractorName } from "../lib/contractors";
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
  cedulaAuxiliar3: string;
};

type FormErrors = Partial<Record<keyof FormState, string>>;
type PersonField = "cedulaResponsable" | "cedulaAuxiliar1" | "cedulaAuxiliar2" | "cedulaAuxiliar3";
type Persona = { CC: string | number; NOMBRE: string; CARGO: string; CONTRATISTA: string };

const initialForm: FormState = {
  contratista: "",
  dt: "",
  cedulaResponsable: "",
  cedulaAuxiliar1: "",
  cedulaAuxiliar2: "",
  cedulaAuxiliar3: "",
};

const contractors = CONTRACTORS;
const personFields: PersonField[] = ["cedulaResponsable", "cedulaAuxiliar1", "cedulaAuxiliar2", "cedulaAuxiliar3"];

function onlyNumbers(value: string) {
  return value.replace(/\D/g, "");
}

function validate(form: FormState) {
  const errors: FormErrors = {};

  if (!form.contratista) errors.contratista = "Selecciona el contratista.";
  if (!form.dt) errors.dt = "Ingresa el DT.";
  if (!form.cedulaResponsable) errors.cedulaResponsable = "La cédula del responsable de ruta es obligatoria.";
  if (!form.cedulaAuxiliar1) errors.cedulaAuxiliar1 = "La cédula del conductor es obligatoria.";

  return errors;
}

export default function AsistenciaPage() {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(initialForm);
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitted, setSubmitted] = useState<FormState | null>(null);
  const [personas, setPersonas] = useState<Partial<Record<PersonField, Persona | null>>>({});
  const [lookupErrors, setLookupErrors] = useState<FormErrors>({});
  const [lookupAttempt, setLookupAttempt] = useState(0);
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);
  const personasCacheRef = useRef(new Map<string, Persona>());
  const { cedulaAuxiliar1, cedulaAuxiliar2, cedulaAuxiliar3, cedulaResponsable, contratista } = form;
  const readOnly = !canWriteModulationsAndAttendance(contratista);

  useEffect(() => {
    let cancelled = false;
    const cedulas: Record<PersonField, string> = {
      cedulaAuxiliar1,
      cedulaAuxiliar2,
      cedulaAuxiliar3,
      cedulaResponsable,
    };

    const timers = personFields.map((field) => {
      setLookupErrors((current) => ({ ...current, [field]: undefined }));
      const cc = cedulas[field];
      const contractor = contratista.trim();
      if (!cc || cc.length < 5 || !contractor) {
        setPersonas((current) => ({ ...current, [field]: undefined }));
        return undefined;
      }

      const cacheKey = `${contractor.toLowerCase()}:${cc}`;
      if (personasCacheRef.current.has(cacheKey)) {
        setPersonas((current) => ({ ...current, [field]: personasCacheRef.current.get(cacheKey) ?? null }));
        return undefined;
      }

      setPersonas((current) => ({ ...current, [field]: undefined }));
      return window.setTimeout(async () => {
        try {
          const response = await fetch(`/api/personas?cc=${encodeURIComponent(cc)}&contratista=${encodeURIComponent(contractor)}`, { cache: "no-store" });
          const body = await response.json();
          if (!response.ok) throw new Error(body.error || "No se pudo buscar la cedula.");
          const persona = body.persona ?? null;
          if (persona) personasCacheRef.current.set(cacheKey, persona);
          if (!cancelled) setPersonas((current) => ({ ...current, [field]: persona }));
        } catch (error) {
          if (!cancelled) setLookupErrors((current) => ({
            ...current,
            [field]: error instanceof Error ? error.message : "No se pudo consultar la cédula. Reintenta la búsqueda.",
          }));
        }
      }, 350);
    });

    return () => {
      cancelled = true;
      timers.forEach((timer) => timer && window.clearTimeout(timer));
    };
  }, [cedulaAuxiliar1, cedulaAuxiliar2, cedulaAuxiliar3, cedulaResponsable, contratista, lookupAttempt]);

  function updateField<Key extends keyof FormState>(key: Key, value: FormState[Key]) {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
    if (key === "contratista") {
      setPersonas({});
      setLookupErrors({});
    } else if (personFields.includes(key as PersonField)) {
      setPersonas((current) => ({ ...current, [key]: undefined }));
      setLookupErrors((current) => ({ ...current, [key]: undefined }));
    }
    setSubmitted(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (readOnly) {
      setSaveError("Logísticos puede ingresar, pero no registrar asistencias.");
      return;
    }
    const nextErrors = validate(form);

    personFields.forEach((field) => {
      const persona = personas[field];
      if (!form[field]) return;

      if (lookupErrors[field]) nextErrors[field] = lookupErrors[field];
      else if (persona === undefined) nextErrors[field] = "Espera a que termine la búsqueda de la cédula.";
      else if (persona === null) nextErrors[field] = "Cédula no encontrada para este contratista. Solicita a People revisar su registro y asignación.";
      if (persona && normalizeContractorName(contractorLabel(persona.CONTRATISTA)) !== normalizeContractorName(contractorLabel(form.contratista))) {
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
      cedulaAuxiliar3: form.cedulaAuxiliar3,
      nombreResponsable: personas.cedulaResponsable?.NOMBRE,
      nombreAuxiliar1: personas.cedulaAuxiliar1?.NOMBRE,
      nombreAuxiliar2: personas.cedulaAuxiliar2?.NOMBRE,
      nombreAuxiliar3: personas.cedulaAuxiliar3?.NOMBRE,
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
        cedulaAuxiliar3: "",
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
            <PersonMatch persona={personas.cedulaResponsable} value={form.cedulaResponsable} error={lookupErrors.cedulaResponsable} />

            <NumericField
              error={errors.cedulaAuxiliar1}
              icon={<Truck size={18} />}
              label="Cédula conductor (obligatoria)"
              onChange={(value) => updateField("cedulaAuxiliar1", value)}
              value={form.cedulaAuxiliar1}
            />
            <PersonMatch persona={personas.cedulaAuxiliar1} value={form.cedulaAuxiliar1} error={lookupErrors.cedulaAuxiliar1} />

            <NumericField
              error={errors.cedulaAuxiliar2}
              icon={<Users size={18} />}
              label="Cédula auxiliar (opcional)"
              onChange={(value) => updateField("cedulaAuxiliar2", value)}
              value={form.cedulaAuxiliar2}
            />
            <PersonMatch persona={personas.cedulaAuxiliar2} value={form.cedulaAuxiliar2} error={lookupErrors.cedulaAuxiliar2} />

            <NumericField
              error={errors.cedulaAuxiliar3}
              icon={<Users size={18} />}
              label="Cédula segundo auxiliar (opcional)"
              onChange={(value) => updateField("cedulaAuxiliar3", value)}
              value={form.cedulaAuxiliar3}
            />
            <PersonMatch persona={personas.cedulaAuxiliar3} value={form.cedulaAuxiliar3} error={lookupErrors.cedulaAuxiliar3} />

            {personFields.some((field) => lookupErrors[field] || personas[field] === null) ? (
              <button className="text-sm font-semibold text-blue-700 underline" type="button" onClick={() => setLookupAttempt((attempt) => attempt + 1)}>
                Reintentar búsqueda de cédulas
              </button>
            ) : null}

            {readOnly ? <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-800">Logísticos tiene acceso al módulo en modo consulta; el registro de asistencias está deshabilitado.</p> : null}
            <button
              className="flex h-12 w-full items-center justify-center gap-2 rounded-md bg-[#f5bd19] px-5 text-sm font-semibold text-[#10223d] transition hover:bg-[#e6a400] disabled:opacity-60"
              disabled={saving || readOnly}
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

function PersonMatch({ persona, value, error }: { persona?: Persona | null; value: string; error?: string }) {
  if (!value) return null;
  if (error) return <p className="-mt-3 text-xs font-medium text-red-600">{error}</p>;
  if (persona === undefined) return <p className="-mt-3 text-xs text-slate-400">Buscando persona...</p>;
  if (persona === null) return <p className="-mt-3 text-xs font-medium text-amber-700">Cédula no encontrada para este contratista. Solicita a People revisar su registro y asignación.</p>;
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
