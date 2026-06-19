"use client";

import { FormEvent, useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, BadgeCheck, Boxes, ClipboardCheck, RotateCcw, Truck, XCircle } from "lucide-react";
import {
  getCheckinByDt,
  readCheckinCajasRegistros,
  saveCheckinCajasRegistros,
  upsertCheckinCajas,
  type CheckinCajasRegistro,
} from "../../lib/checkinStorage";
import { getLocalDateKey, getModulacionesByDt, normalizeDt, readModulacionRegistros, summarizeModulaciones } from "../../lib/modulacionStorage";
import { readSeguimientoVehiculos } from "../../lib/seguimientoStorage";
import { initialVehicles } from "../data";
import type { Vehiculo } from "../types";

export default function CajasCheckinPage() {
  const router = useRouter();
  const [vehicles, setVehicles] = useState<Vehiculo[]>(initialVehicles);
  const [modulaciones, setModulaciones] = useState(() => readModulacionRegistros());
  const [checkins, setCheckins] = useState<CheckinCajasRegistro[]>([]);
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [savedDt, setSavedDt] = useState("");
  const [dateLabel, setDateLabel] = useState("");

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      const storedVehicles = readSeguimientoVehiculos();
      const storedCheckins = readCheckinCajasRegistros();

      setVehicles(storedVehicles.length ? storedVehicles : initialVehicles);
      setModulaciones(readModulacionRegistros());
      setCheckins(storedCheckins);
      setInputs(Object.fromEntries(storedCheckins.map((record) => [normalizeDt(record.dt), String(record.totalCajas)])));
      setDateLabel(new Date().toLocaleDateString("es-CO"));
    }, 0);

    return () => window.clearTimeout(timeout);
  }, []);

  const vehiclesToday = useMemo(() => vehicles.filter(isTodayVehicle), [vehicles]);
  const departedVehicles = useMemo(() => {
    const departed = vehiclesToday.filter(hasDeparture);
    return departed.length ? departed : vehiclesToday;
  }, [vehiclesToday]);

  const rows = useMemo(
    () =>
      departedVehicles.map((vehicle) => {
        const registrosDt = getModulacionesByDt(modulaciones, vehicle.transporte).filter((registro) => isTodayKey(registro.createdAt));
        const checkin = getCheckinByDt(checkins, vehicle.transporte);
        const resumen = summarizeModulaciones(registrosDt, vehicle.cajas, checkin?.totalCajas);

        return {
          vehicle,
          checkin,
          resumen,
          key: normalizeDt(vehicle.transporte),
        };
      }),
    [checkins, departedVehicles, modulaciones],
  );

  const totals = useMemo(
    () =>
      rows.reduce(
        (acc, row) => ({
          vehiculos: acc.vehiculos + 1,
          moduladas: acc.moduladas + row.resumen.cajasRechazadas,
          reubicadas: acc.reubicadas + row.resumen.cajasReubicadas,
          checkin: acc.checkin + (row.checkin?.totalCajas ?? 0),
          final: acc.final + row.resumen.cajasPendientes,
        }),
        { vehiculos: 0, moduladas: 0, reubicadas: 0, checkin: 0, final: 0 },
      ),
    [rows],
  );

  function handleSubmit(event: FormEvent<HTMLFormElement>, dt: string) {
    event.preventDefault();

    const nextRecords = upsertCheckinCajas(checkins, dt, Number(inputs[normalizeDt(dt)] || 0));
    saveCheckinCajasRegistros(nextRecords);
    setCheckins(nextRecords);
    setSavedDt(normalizeDt(dt));
  }

  function updateInput(dt: string, value: string) {
    const cleanValue = value.replace(/\D/g, "");
    setInputs((current) => ({ ...current, [normalizeDt(dt)]: cleanValue }));
    setSavedDt("");
  }

  return (
    <main className="min-h-screen bg-[#f4f7fb] text-slate-900">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 shadow-sm backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-5 py-4 sm:px-8 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <button
              aria-label="Volver a seguimiento"
              className="grid h-10 w-10 place-items-center rounded-md text-[#10223d] transition hover:bg-slate-100"
              onClick={() => router.push("/seguimiento")}
              type="button"
            >
              <ArrowLeft size={19} />
            </button>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#0f7c58]">Checkin diario</p>
              <h1 className="text-2xl font-semibold text-[#10223d]">Cajas checkin</h1>
            </div>
          </div>
          <button
            className="inline-flex h-10 items-center gap-2 rounded-md bg-[#10223d] px-4 text-sm font-semibold text-white transition hover:bg-[#1b355b]"
            onClick={() => router.push("/seguimiento/refusal")}
            type="button"
          >
            <ClipboardCheck size={18} />
            Ver refusal
          </button>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-5 py-8 sm:px-8">
        <div className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Metric icon={<Truck size={21} />} label="Carros del dia" value={totals.vehiculos} />
          <Metric icon={<XCircle size={21} />} label="Cajas moduladas" value={totals.moduladas} tone="red" />
          <Metric icon={<RotateCcw size={21} />} label="Reubicadas" value={totals.reubicadas} tone="green" />
          <Metric icon={<Boxes size={21} />} label="Refusal final" value={totals.final} tone="amber" />
        </div>

        <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-2 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-[#10223d]">Carros salidos hoy</h2>
              <p className="mt-1 text-sm text-slate-500">
                El checkin reemplaza el pendiente modulado como dato final de refusal para cada DT.
              </p>
            </div>
            <span className="rounded-md bg-[#e9f3ff] px-3 py-2 text-sm font-semibold text-[#10223d]">
              {dateLabel}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px]">
              <thead className="bg-slate-50 text-xs uppercase tracking-[0.12em] text-slate-500">
                <tr>
                  <th className="px-5 py-4 text-left">Vehiculo / DT</th>
                  <th className="px-5 py-4 text-left">Responsable</th>
                  <th className="px-5 py-4 text-center">Salida</th>
                  <th className="px-5 py-4 text-center">Moduladas</th>
                  <th className="px-5 py-4 text-center">Reubicadas</th>
                  <th className="px-5 py-4 text-center">Checkin</th>
                  <th className="px-5 py-4 text-right">Refusal final</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.length ? (
                  rows.map(({ checkin, key, resumen, vehicle }) => (
                    <tr className="transition hover:bg-slate-50" key={`${vehicle.vehiculo}-${vehicle.transporte}`}>
                      <td className="px-5 py-4">
                        <p className="font-semibold text-[#10223d]">{vehicle.vehiculo}</p>
                        <p className="text-sm text-slate-500">{vehicle.transporte}</p>
                      </td>
                      <td className="px-5 py-4 text-sm font-medium text-slate-600">{vehicle.responsable}</td>
                      <td className="px-5 py-4 text-center text-sm font-semibold text-[#10223d]">{vehicle.horaSalida || "Pendiente"}</td>
                      <td className="px-5 py-4 text-center">
                        <span className="rounded-full bg-red-50 px-3 py-1 text-sm font-semibold text-red-700">{resumen.cajasRechazadas}</span>
                      </td>
                      <td className="px-5 py-4 text-center">
                        <span className="rounded-full bg-emerald-50 px-3 py-1 text-sm font-semibold text-emerald-700">{resumen.cajasReubicadas}</span>
                      </td>
                      <td className="px-5 py-4">
                        <form className="flex items-center justify-center gap-2" onSubmit={(event) => handleSubmit(event, vehicle.transporte)}>
                          <input
                            aria-label={`Cajas checkin DT ${vehicle.transporte}`}
                            className="h-10 w-28 rounded-md border border-slate-200 px-3 text-center text-sm font-semibold outline-none transition focus:border-[#f5bd19]"
                            inputMode="numeric"
                            onChange={(event) => updateInput(vehicle.transporte, event.target.value)}
                            placeholder={String(resumen.cajasPendientesModulacion)}
                            value={inputs[key] ?? ""}
                          />
                          <button
                            aria-label={`Guardar checkin DT ${vehicle.transporte}`}
                            className="grid h-10 w-10 place-items-center rounded-md bg-[#10223d] text-white transition hover:bg-[#1b355b]"
                            type="submit"
                          >
                            <BadgeCheck size={18} />
                          </button>
                        </form>
                        {savedDt === key ? <p className="mt-2 text-center text-xs font-semibold text-emerald-700">Guardado</p> : null}
                      </td>
                      <td className="px-5 py-4 text-right">
                        <div className="flex flex-col items-end gap-1">
                          <span className="text-lg font-semibold text-[#10223d]">{resumen.cajasPendientes}</span>
                          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${checkin ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                            {checkin ? "Checkin aplicado" : "Pendiente actual"}
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="px-5 py-12 text-center text-sm font-medium text-slate-500" colSpan={7}>
                      No hay carros salidos para hoy.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </section>
    </main>
  );
}

function Metric({ icon, label, value, tone = "navy" }: { icon: ReactNode; label: string; value: ReactNode; tone?: "navy" | "red" | "green" | "amber" }) {
  const colors = {
    navy: "bg-[#e9f3ff] text-[#10223d]",
    red: "bg-red-50 text-red-700",
    green: "bg-emerald-50 text-emerald-700",
    amber: "bg-amber-50 text-amber-700",
  };

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <span className={`mb-4 grid h-11 w-11 place-items-center rounded-md ${colors[tone]}`}>{icon}</span>
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <p className="mt-1 text-3xl font-semibold text-[#10223d]">{value}</p>
    </div>
  );
}

function hasDeparture(vehicle: Vehiculo) {
  const salida = (vehicle.horaSalida || "").trim().toLowerCase();
  return salida !== "" && salida !== "pendiente" && salida !== "-";
}

function isTodayVehicle(vehicle: Vehiculo) {
  return toDateKey(vehicle.fechaDespacho || vehicle.fechaDt || vehicle.date || vehicle.createdAt) === getLocalDateKey();
}

function isTodayKey(value: string | undefined) {
  return toDateKey(value) === getLocalDateKey();
}

function toDateKey(value: string | undefined) {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  if (value.includes("/")) {
    const [day, month, year] = value.split("/").map(Number);
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value.slice(0, 10);
  return getLocalDateKey(parsed);
}
