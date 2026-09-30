"use client";

import { useState } from "react";
import { RANGE_REASONS, isRangeReason } from "../lib/rangeReasons";
import { savePuntoCoronaRangeReason, type PuntoCoronaRouteRow } from "../lib/puntoCoronaRoutesStorage";

export default function RangeReasonSelect({ reportId, row, disabled, contractor }: {
  reportId: string;
  contractor: string;
  row: PuntoCoronaRouteRow;
  disabled: boolean;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const reason = row.manualOutOfRadiusReason || row.outOfRadiusReason || row.skippedReason || "";

  async function handleChange(value: string) {
    if (saving || disabled || !isRangeReason(value)) return;
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      await savePuntoCoronaRangeReason(reportId, row.id, value, contractor);
      setSaved(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo guardar el motivo.");
    } finally {
      setSaving(false);
    }
  }

  return <div className="space-y-1">
    <select
      aria-label={`Motivo fuera de rango de ${row.pocName || row.pocExternalId}`}
      value={isRangeReason(reason) ? reason : ""}
      disabled={disabled || saving}
      onChange={(event) => void handleChange(event.target.value)}
      className="w-full min-w-40 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-700 focus:ring-2 focus:ring-blue-500 disabled:opacity-60"
    >
      <option value="" disabled>Seleccionar motivo</option>
      {RANGE_REASONS.map((option) => <option key={option} value={option}>{option}</option>)}
    </select>
    {!isRangeReason(reason) && reason ? <p className="text-[10px] text-slate-500">{reason}</p> : null}
    {error ? <p role="alert" className="text-xs text-red-700">{error}</p> : null}
    <p role="status" className="text-[10px] text-slate-500">{saving ? "Guardando…" : saved ? "Motivo guardado" : disabled ? "Cierre guardado: reabre el día para editar." : ""}</p>
  </div>;
}
