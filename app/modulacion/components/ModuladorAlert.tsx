"use client";

import type { ModulacionRegistro } from "../../lib/modulacionStorage";

type Vehicle = {
  transporte: string;
};

type Props = {
  registro: ModulacionRegistro | null;
  selectedVehicle: Vehicle | null;
  onChangeReubicadas: (id: string, value: string) => void;
};

export function ModuladorAlert({
  registro,
  selectedVehicle,
  onChangeReubicadas,
}: Props) {
  if (!registro) return null;

  return (
    <div className="mt-6 rounded-lg border border-red-200 bg-red-50 p-5">
      <h2 className="text-lg font-semibold text-red-700">
        Alerta de modulación
      </h2>

      <div className="mt-3 space-y-1">
        <p>
          <strong>DT:</strong> {registro.dt}
        </p>

        <p>
          <strong>Cliente:</strong> {registro.codigoCliente}
        </p>

        {selectedVehicle && (
          <p>
            <strong>Vehículo:</strong> {selectedVehicle.transporte}
          </p>
        )}
      </div>

      <div className="mt-4">
        <label className="text-sm font-medium">
          Cajas reubicadas
        </label>

        <input
          className="ml-2 rounded border border-slate-300 px-2 py-1"
          type="text"
          inputMode="numeric"
          value={registro.cajasReubicadas || ""}
          onChange={(e) =>
            onChangeReubicadas(registro.id, e.target.value)
          }
        />
      </div>
    </div>
  );
}