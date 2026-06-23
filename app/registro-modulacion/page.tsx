"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  normalizeDt,
  saveModulacionRegistros,
  type ModulacionRegistro,
} from "../lib/modulacionStorage";
import type { AsistenciaRegistro } from "../lib/asistenciaStorage";
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
    const contratista = form.contratista;
    const dt = normalizeDt(form.dt);

    if (!contratista || !dt) {
      const timeout = window.setTimeout(() => {
        setVehiculosSeguimiento([]);
        setVehiclesError("");
        setLoadingVehicles(false);
      }, 0);
      return () => window.clearTimeout(timeout);
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      setLoadingVehicles(true);
      setVehiclesError("");

      Promise.all([
        fetch(`/api/seguimiento?contratista=${encodeURIComponent(contratista)}`, {
          cache: "no-store",
          signal: controller.signal,
        }),
        fetch(`/api/asistencias/buscar?contratista=${encodeURIComponent(contratista)}&dt=${encodeURIComponent(dt)}`, {
          cache: "no-store",
          signal: controller.signal,
        }),
      ])
        .then(async ([seguimientoResponse, asistenciaResponse]) => {
          const seguimientoBody = await seguimientoResponse.json().catch(() => ({}));
          const asistenciaBody = await asistenciaResponse.json().catch(() => ({}));

          if (!seguimientoResponse.ok) throw new Error(seguimientoBody.error || "No se pudo validar el DT.");

          const matchedVehicles = Array.isArray(seguimientoBody.records)
            ? seguimientoBody.records.filter((vehicle: Vehiculo) => isTodayVehicle(vehicle) && normalizeDt(vehicle.transporte) === dt)
            : [];
          const matchedAttendance = asistenciaResponse.ok && Array.isArray(asistenciaBody.records)
            ? (asistenciaBody.records as AsistenciaRegistro[]).find((record) => normalizeDt(record.dt) === dt)
            : null;
          const asistenciaError = !asistenciaResponse.ok ? asistenciaBody.error || "No se pudo leer la asistencia para autocompletar el RR." : "";
          const responsibleId = matchedAttendance?.cedulaResponsable || matchedVehicles[0]?.cedulaResponsable || "";
          const responsibleName = matchedAttendance?.nombreResponsable || matchedVehicles[0]?.nombreResponsable || "";
          const visibleVehicles = matchedVehicles.map((vehicle: Vehiculo) => ({
            ...vehicle,
            cedulaResponsable: responsibleId || vehicle.cedulaResponsable,
            nombreResponsable: responsibleName || vehicle.nombreResponsable,
            responsable: responsibleName || (responsibleId ? `RR ${responsibleId}` : vehicle.responsable),
          }));

          setVehiculosSeguimiento(visibleVehicles);
          if (asistenciaError) setVehiclesError(asistenciaError);
          if (responsibleId) {
            setForm((current) => {
              if (current.contratista !== contratista || normalizeDt(current.dt) !== dt) return current;
              return { ...current, persona: responsibleId, personaNombre: responsibleName || current.personaNombre };
            });
          }
        })
        .catch((error) => {
          if (error instanceof DOMException && error.name === "AbortError") return;
          setVehiculosSeguimiento([]);
          setVehiclesError(error instanceof Error ? error.message : "No se pudo validar el DT.");
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoadingVehicles(false);
        });
    }, 350);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [form.contratista, form.dt]);

  useEffect(() => {
    const codigo = form.codigoCliente.trim();
    if (!codigo) {
      const timeout = window.setTimeout(() => {
        setClienteError("");
        setLoadingCliente(false);
        setForm((current) => ({ ...current, nombreCliente: "", telefonoCliente: "", com: "", jefeComercial: "", telefonoJefeComercial: "", preventista: "" }));
      }, 0);
      return () => window.clearTimeout(timeout);
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
            setForm((current) => ({ ...current, nombreCliente: "", telefonoCliente: "", com: "", jefeComercial: "", telefonoJefeComercial: "", preventista: "" }));
            return;
          }

          setForm((current) => ({
            ...current,
            nombreCliente: cliente.nombre || "",
            telefonoCliente: cliente.telefono || "",
            com: cliente.com || "",
            jefeComercial: cliente.jefeComercial || "",
            telefonoJefeComercial: cliente.telefonoJefeComercial || "",
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
      const timeout = window.setTimeout(() => {
        setModuladorError("");
        setLoadingModulador(false);
        setForm((current) => ({ ...current, personaNombre: "" }));
      }, 0);
      return () => window.clearTimeout(timeout);
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
      ...(key === "contratista" ? { dt: "", persona: "", personaNombre: "" } : {}),
      ...(key === "dt" ? { persona: "", personaNombre: "" } : {}),
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

function isTodayVehicle(vehicle: Vehiculo) {
  return toDateKey(vehicle.fechaDespacho || vehicle.fechaDt || vehicle.date || vehicle.createdAt) === getTodayKey();
}

function toDateKey(value: string | undefined) {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  if (value.includes("/")) {
    const [day, month, year] = value.split("/").map(Number);
    if ([day, month, year].every(Number.isFinite)) {
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(parsed.getDate()).padStart(2, "0")}`;
}

function getTodayKey() {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
}
