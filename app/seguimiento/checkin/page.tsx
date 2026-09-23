"use client";

import { type FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CHECKIN_STORAGE_KEY,
  getCheckinByDt,
  readCheckinCajasRegistros,
  saveCheckinCajasRegistro,
  upsertCheckinCajas,
  type CheckinCajasRegistro,
} from "../../lib/checkinStorage";
import {
  getLocalDateKey,
  getModulacionesByDt,
  getOperationalModulaciones,
  MODULACION_STORAGE_KEY,
  normalizeDt,
  readModulacionRegistros,
  summarizeModulaciones,
} from "../../lib/modulacionStorage";
import { refreshRemoteRecords } from "../../lib/remoteStore";
import { readSeguimientoVehiculos, SEGUIMIENTO_STORAGE_KEY } from "../../lib/seguimientoStorage";
import { useStorageSnapshot } from "../../lib/storageEvents";
import type { Vehiculo } from "../types";
import { CheckinHeader } from "./_components/CheckinHeader";
import { CheckinMetrics } from "./_components/CheckinMetrics";
import { CheckinTable } from "./_components/CheckinTable";
import { calculateCheckinTotals, hasDeparture, isVehicleForDate } from "./_lib/checkinPage";

const DATA_REFRESH_MS = 30_000;

export default function CajasCheckinPage() {
  const router = useRouter();
  const vehicles = useStorageSnapshot<Vehiculo[]>([SEGUIMIENTO_STORAGE_KEY], readSeguimientoVehiculos, []);
  const modulaciones = useStorageSnapshot([MODULACION_STORAGE_KEY], readModulacionRegistros, []);
  const checkins = useStorageSnapshot<CheckinCajasRegistro[]>([CHECKIN_STORAGE_KEY], readCheckinCajasRegistros, []);
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [savedDt, setSavedDt] = useState("");
  const [savingDt, setSavingDt] = useState("");
  const [saveError, setSaveError] = useState("");
  const [selectedDate, setSelectedDate] = useState(getLocalDateKey);

  useEffect(() => {
    const refresh = () => {
      void refreshRemoteRecords("/api/checkins", { force: true });
      void refreshRemoteRecords("/api/modulaciones", { force: true });
      void refreshRemoteRecords("/api/seguimiento", { force: true });
    };
    refresh();
    const interval = window.setInterval(refresh, DATA_REFRESH_MS);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    // Solo hidrata inputs que el usuario no está editando. Así una
    // sincronización remota no devuelve el valor anterior mientras se escribe.
    setInputs((current) => {
      const next = { ...current };
      checkins.forEach((record) => {
        const key = normalizeDt(record.dt);
        if (!(key in next)) next[key] = String(record.totalCajas);
      });
      return next;
    });
  }, [checkins]);

  const vehiclesToday = useMemo(
    () => vehicles.filter((vehicle) => isVehicleForDate(vehicle, selectedDate)),
    [selectedDate, vehicles],
  );
  const departedVehicles = useMemo(() => {
    const departed = vehiclesToday.filter(hasDeparture);
    return departed.length ? departed : vehiclesToday;
  }, [vehiclesToday]);
  const operationalModulaciones = useMemo(
    () => getOperationalModulaciones(modulaciones, departedVehicles),
    [departedVehicles, modulaciones],
  );
  const rows = useMemo(
    () =>
      departedVehicles.map((vehicle) => {
        const registrosDt = getModulacionesByDt(operationalModulaciones, vehicle.transporte);
        const checkin = getCheckinByDt(checkins, vehicle.transporte);
        return {
          vehicle,
          checkin,
          resumen: summarizeModulaciones(registrosDt, vehicle.cajas, checkin?.totalCajas),
          key: normalizeDt(vehicle.transporte),
        };
      }),
    [checkins, departedVehicles, operationalModulaciones],
  );
  const totals = useMemo(() => calculateCheckinTotals(rows), [rows]);
  const dateLabel = useMemo(
    () => new Date(`${selectedDate}T12:00:00`).toLocaleDateString("es-CO"),
    [selectedDate],
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>, dt: string) {
    event.preventDefault();
    const key = normalizeDt(dt);
    if (savingDt) return;
    const row = rows.find((item) => item.key === key);
    if (!row) return;
    const inputValue = (inputs[key] ?? String(row.resumen.cajasPendientes)).trim();
    const numericValue = Number(inputValue);

    setSavingDt(key);
    setSavedDt("");
    setSaveError("");
    try {
      if (!inputValue || !Number.isSafeInteger(numericValue) || numericValue < 0) {
        throw new Error("Escribe una cantidad entera de cajas. Usa 0 si no regresaron cajas.");
      }
      const nextRecord = getCheckinByDt(upsertCheckinCajas(checkins, dt, numericValue), dt);
      if (!nextRecord) throw new Error("No se pudo identificar el DT para guardar.");
      await saveCheckinCajasRegistro(nextRecord);
      setInputs((current) => ({ ...current, [key]: String(nextRecord.totalCajas) }));
      setSavedDt(key);
    } catch (error) {
      setSaveError(`DT ${dt}: ${error instanceof Error ? error.message : "No se pudo guardar el checkin. Intenta nuevamente."}`);
    } finally {
      setSavingDt("");
    }
  }

  function updateInput(dt: string, value: string) {
    setInputs((current) => ({ ...current, [normalizeDt(dt)]: value.replace(/\D/g, "") }));
    setSavedDt("");
  }

  return (
    <main className="min-h-screen bg-[#f4f7fb] text-slate-900">
      <CheckinHeader
        onBack={() => router.push("/seguimiento")}
        onDateChange={setSelectedDate}
        onOpenRefusal={() => router.push("/seguimiento/refusal")}
        selectedDate={selectedDate}
      />
      <section className="mx-auto max-w-7xl px-5 py-8 sm:px-8">
        <CheckinMetrics totals={totals} />
        {saveError ? <p role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{saveError}</p> : null}
        <CheckinTable
          dateLabel={dateLabel}
          inputs={inputs}
          onInputChange={updateInput}
          onSubmit={handleSubmit}
          rows={rows}
          savedDt={savedDt}
          savingDt={savingDt}
        />
      </section>
    </main>
  );
}
