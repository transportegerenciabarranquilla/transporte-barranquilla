"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  normalizeDt,
  isTodayDate,
  readModulacionRegistros,
  saveModulacionRegistros,
  summarizeModulaciones,
  type ModulacionRegistro,
} from "../lib/modulacionStorage";
import type { Vehiculo } from "../seguimiento/types";
import { initialForm } from "../modulacion/constants";
import type { FormErrors, FormState } from "../modulacion/types";
import { getUniquePersonas, getVehiculosSeguimiento, validateModulacion } from "../modulacion/utils";
import { ModulacionForm } from "../modulacion/components/ModulacionForm";
import { ModulacionHeader } from "../modulacion/components/ModulacionHeader";
import { ModulacionSidebar } from "../modulacion/components/ModulacionSidebar";

export default function RegistroModulacionPage() {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(initialForm);
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitted, setSubmitted] = useState(false);
  const [registros, setRegistros] = useState<ModulacionRegistro[]>(() => readModulacionRegistros());
  const [vehiculosSeguimiento] = useState<Vehiculo[]>(() => getVehiculosSeguimiento());

  const registrosHoy = useMemo(() => registros.filter((registro) => isTodayDate(registro.createdAt)), [registros]);
  const personas = useMemo(() => getUniquePersonas(registrosHoy), [registrosHoy]);
  const totalCajasVehiculos = useMemo(
    () => vehiculosSeguimiento.reduce((total, vehiculo) => total + Number(vehiculo.cajas || 0), 0),
    [vehiculosSeguimiento],
  );
  const resumenGeneral = useMemo(
    () => summarizeModulaciones(registrosHoy, totalCajasVehiculos),
    [registrosHoy, totalCajasVehiculos],
  );
  const selectedVehicle = useMemo(() => {
    const dt = normalizeDt(form.dt);
    return vehiculosSeguimiento.find((vehiculo) => normalizeDt(vehiculo.transporte) === dt) ?? null;
  }, [form.dt, vehiculosSeguimiento]);
  const resumenDt = useMemo(() => {
    const dt = normalizeDt(form.dt);
    return summarizeModulaciones(
      registrosHoy.filter((registro) => normalizeDt(registro.dt) === dt),
      selectedVehicle?.cajas ?? 0,
    );
  }, [form.dt, registrosHoy, selectedVehicle]);

  function updateField<Key extends keyof FormState>(key: Key, value: FormState[Key]) {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
    setSubmitted(false);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors = validateModulacion(form);
    setErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) return;

    const nextRecord: ModulacionRegistro = {
      id: crypto.randomUUID(),
      ...form,
      dt: normalizeDt(form.dt),
      cajasReubicadas: form.cajasReubicadas || "0",
      persona: form.persona.trim(),
      comentario: form.comentario.trim(),
      createdAt: new Date().toISOString(),
    };
    const nextRecords = [nextRecord, ...registros];

    saveModulacionRegistros(nextRecords);
    setRegistros(nextRecords);
    setForm(initialForm);
    setSubmitted(true);
  }

  return (
    <main className="min-h-screen bg-[#f4f7fb] text-slate-900">
      <ModulacionHeader onBack={() => router.push("/")} />

      <section className="mx-auto grid max-w-6xl gap-6 px-5 py-8 sm:px-8 lg:grid-cols-[0.85fr_1.15fr] lg:py-10">
        <ModulacionSidebar
          personas={personas}
          resumenGeneral={resumenGeneral}
          topeMaximoCajas={resumenGeneral.topeMaximoCajas}
          totalCajasVehiculos={totalCajasVehiculos}
        />
        <ModulacionForm
          errors={errors}
          form={form}
          onChange={updateField}
          onSubmit={handleSubmit}
          resumenDt={resumenDt}
          selectedVehicle={selectedVehicle}
          submitted={submitted}
          vehiculosSeguimiento={vehiculosSeguimiento}
        />
      </section>
    </main>
  );
}
