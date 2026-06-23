"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  normalizeDt,
  saveModulacionRegistros,
  type ModulacionRegistro,
} from "../lib/modulacionStorage";
import type { Vehiculo } from "../seguimiento/types";
import { initialForm } from "../modulacion/constants";
import type { FormErrors, FormState } from "../modulacion/types";
import { validateModulacion } from "../modulacion/utils";
import { ModulacionForm } from "../modulacion/components/ModulacionForm";
import { ModulacionHeader } from "../modulacion/components/ModulacionHeader";

export default function RegistroModulacionPage() {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(initialForm);
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitted, setSubmitted] = useState(false);
  const [vehiculosSeguimiento, setVehiculosSeguimiento] = useState<Vehiculo[]>([]);
  const [vehiclesError, setVehiclesError] = useState("");
  const [loadingVehicles, setLoadingVehicles] = useState(false);
  const [loadingCliente, setLoadingCliente] = useState(false);
  const [clienteError, setClienteError] = useState("");
  const [loadingModulador, setLoadingModulador] = useState(false);
  const [moduladorError, setModuladorError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!form.contratista) {
      setVehiculosSeguimiento([]);
      setVehiclesError("");
      return;
    }

    const controller = new AbortController();
    setLoadingVehicles(true);
    setVehiclesError("");

    fetch(`/api/seguimiento?contratista=${encodeURIComponent(form.contratista)}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error || "No se pudieron cargar los DT.");
        setVehiculosSeguimiento(Array.isArray(body.records) ? body.records : []);
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setVehiculosSeguimiento([]);
        setVehiclesError(error instanceof Error ? error.message : "No se pudieron cargar los DT.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingVehicles(false);
      });

    return () => controller.abort();
  }, [form.contratista]);

  useEffect(() => {
    const codigo = form.codigoCliente.trim();
    if (!codigo) {
      setClienteError("");
      setLoadingCliente(false);
      setForm((current) => ({ ...current, nombreCliente: "", com: "", jefeComercial: "", preventista: "" }));
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      setLoadingCliente(true);
      setClienteError("");

      fetch(`/api/clientes?codigo=${encodeURIComponent(codigo)}`, {
        cache: "no-store",
        signal: controller.signal,
      })
        .then(async (response) => {
          const body = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(body.error || "No se pudo buscar el cliente.");

          const cliente = body.cliente;
          if (!cliente) {
            setClienteError("Cliente no encontrado.");
            setForm((current) => ({ ...current, nombreCliente: "", com: "", jefeComercial: "", preventista: "" }));
            return;
          }

          setForm((current) => ({
            ...current,
            nombreCliente: cliente.nombre || "",
            com: cliente.com || "",
            jefeComercial: cliente.jefeComercial || "",
            preventista: cliente.preventista || "",
          }));
        })
        .catch((error) => {
          if (error instanceof DOMException && error.name === "AbortError") return;
          setClienteError(error instanceof Error ? error.message : "No se pudo buscar el cliente.");
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoadingCliente(false);
        });
    }, 350);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [form.codigoCliente]);

  useEffect(() => {
    const cedula = form.persona.replace(/\D/g, "").trim();
    if (!cedula) {
      setModuladorError("");
      setLoadingModulador(false);
      setForm((current) => ({ ...current, personaNombre: "" }));
      return;
    }
    if (!form.contratista) return;

    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      setLoadingModulador(true);
      setModuladorError("");

      fetch(`/api/personas?cc=${encodeURIComponent(cedula)}&contratista=${encodeURIComponent(form.contratista)}`, {
        cache: "no-store",
        signal: controller.signal,
      })
        .then(async (response) => {
          const body = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(body.error || "No se pudo buscar el modulador.");

          const persona = body.persona;
          if (!persona) {
            setModuladorError("Cédula no encontrada para este contratista.");
            setForm((current) => ({ ...current, personaNombre: "" }));
            return;
          }

          setForm((current) => ({ ...current, personaNombre: persona.NOMBRE || "" }));
        })
        .catch((error) => {
          if (error instanceof DOMException && error.name === "AbortError") return;
          setModuladorError(error instanceof Error ? error.message : "No se pudo buscar el modulador.");
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoadingModulador(false);
        });
    }, 350);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [form.contratista, form.persona]);

  const selectedVehicle = useMemo(() => {
    const dt = normalizeDt(form.dt);
    return vehiculosSeguimiento.find((vehiculo) => normalizeDt(vehiculo.transporte) === dt) ?? null;
  }, [form.dt, vehiculosSeguimiento]);

  function updateField<Key extends keyof FormState>(key: Key, value: FormState[Key]) {
    setForm((current) => ({
      ...current,
      [key]: value,
      ...(key === "contratista" ? { dt: "", personaNombre: "" } : {}),
      ...(key === "persona" ? { personaNombre: "" } : {}),
    }));
    setErrors((current) => ({ ...current, [key]: undefined }));
    setSubmitted(false);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors = validateModulacion(form);
    if (form.persona.trim() && !form.personaNombre.trim()) {
      nextErrors.persona = moduladorError || "Busca una cédula válida del modulador.";
    }
    setErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) return;

    const nextRecord: ModulacionRegistro = {
      id: crypto.randomUUID(),
      ...form,
      dt: normalizeDt(form.dt),
      fechaDespacho: selectedVehicle?.fechaDespacho || selectedVehicle?.fechaDt || selectedVehicle?.date,
      fechaDt: selectedVehicle?.fechaDt || selectedVehicle?.fechaDespacho || selectedVehicle?.date,
      cajasGestionadas: "0",
      persona: form.persona.trim(),
      comentario: form.comentario.trim(),
      createdAt: new Date().toISOString(),
    };

    setSaving(true);
    setSaveError("");

    try {
      await saveModulacionRegistros([nextRecord]);
      setForm(initialForm);
      setSubmitted(true);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "No se pudo guardar la modulación.");
      setSubmitted(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#f4f7fb] text-slate-900">
      <ModulacionHeader onBack={() => router.push("/")} />

      <section className="mx-auto max-w-3xl px-5 py-8 sm:px-8 lg:py-10">
        <ModulacionForm
          errors={errors}
          clienteError={clienteError}
          form={form}
          loadingCliente={loadingCliente}
          loadingModulador={loadingModulador}
          loadingVehicles={loadingVehicles}
          moduladorError={moduladorError}
          onChange={updateField}
          onSubmit={handleSubmit}
          saveError={saveError}
          saving={saving}
          submitted={submitted}
          vehiclesError={vehiclesError}
          vehiculosSeguimiento={vehiculosSeguimiento}
        />
      </section>
    </main>
  );
}
