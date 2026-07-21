"use client";

import { useMemo, useState } from "react";
import { formatClock } from "../lib/time";
import type { TdRow } from "../lib/types";

const INTERVAL_SECONDS = 20 * 60;
const CHART_HEIGHT = 260;
const CHART_PADDING = { top: 28, right: 30, bottom: 48, left: 48 };

export function TrendChart({ rows }: { rows: TdRow[] }) {
  const [selectedInterval, setSelectedInterval] = useState<number | null>(null);
  const intervals = useMemo(() => {
    const validRows = rows.filter((row) => row.departureSeconds !== null);
    if (!validRows.length) return [];

    const groups = new Map<number, TdRow[]>();
    validRows.forEach((row) => {
      const interval = Math.floor((row.departureSeconds as number) / INTERVAL_SECONDS) * INTERVAL_SECONDS;
      groups.set(interval, [...(groups.get(interval) ?? []), row]);
    });

    const starts = Array.from(groups.keys());
    const first = Math.min(...starts);
    const last = Math.max(...starts);
    const result = [];
    for (let interval = first; interval <= last; interval += INTERVAL_SECONDS) {
      const intervalRows = groups.get(interval) ?? [];
      const plateCount = new Set(intervalRows.map((row) => row.plate).filter(Boolean)).size;
      result.push({ interval, rows: intervalRows, vehicleCount: plateCount || intervalRows.length });
    }
    return result;
  }, [rows]);

  const selectedGroup = intervals.find((group) => group.interval === selectedInterval) ?? null;
  const chartWidth = Math.max(900, intervals.length * 105);
  const innerWidth = chartWidth - CHART_PADDING.left - CHART_PADDING.right;
  const innerHeight = CHART_HEIGHT - CHART_PADDING.top - CHART_PADDING.bottom;
  const maxVehicles = Math.max(1, ...intervals.map((group) => group.vehicleCount));
  const x = (index: number) => CHART_PADDING.left + (intervals.length <= 1 ? innerWidth / 2 : (index / (intervals.length - 1)) * innerWidth);
  const y = (value: number) => CHART_PADDING.top + innerHeight - (value / maxVehicles) * innerHeight;
  const linePoints = intervals.map((group, index) => `${x(index)},${y(group.vehicleCount)}`).join(" ");
  const areaPoints = intervals.length ? `${x(0)},${y(0)} ${linePoints} ${x(intervals.length - 1)},${y(0)}` : "";

  return (
    <section className="panel trend-panel-3d w-full overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50/80 px-5 py-4">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-violet-700">Evolución de salidas</p>
          <h2 className="mt-0.5 text-lg font-black text-[#2d1b4e]">Carros por intervalos de 20 minutos</h2>
          <p className="mt-1 text-xs text-slate-500">Pulsa un punto para consultar placas, DT, viaje y hora exacta.</p>
        </div>
        <span className="rounded-lg bg-white px-3 py-1.5 text-[10px] font-black text-violet-700 ring-1 ring-slate-200">{intervals.length} intervalos</span>
      </div>

      {intervals.length ? (
        <div className="overflow-x-auto p-4 scrollbar-thin">
          <svg
            aria-label="Cantidad de carros por intervalos de veinte minutos"
            className="trend-chart-3d w-full"
            role="img"
            style={{ minWidth: `${chartWidth}px` }}
            viewBox={`0 0 ${chartWidth} ${CHART_HEIGHT}`}
          >
            <defs>
              <linearGradient id="trend-area-gradient" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.48" />
                <stop offset="100%" stopColor="#ede9fe" stopOpacity="0.18" />
              </linearGradient>
              <filter id="trend-line-shadow" height="160%" width="140%" x="-20%" y="-20%">
                <feDropShadow dx="0" dy="5" floodColor="#4c1d95" floodOpacity="0.28" stdDeviation="4" />
              </filter>
              <filter id="trend-point-shadow" height="180%" width="180%" x="-40%" y="-40%">
                <feDropShadow dx="0" dy="4" floodColor="#2d1b4e" floodOpacity="0.3" stdDeviation="2" />
              </filter>
            </defs>
            {Array.from(new Set([0, Math.ceil(maxVehicles / 2), maxVehicles])).map((value) => {
              const gridY = y(value);
              return (
                <g key={value}>
                  <line stroke="#e2e8f0" strokeWidth="1" x1={CHART_PADDING.left} x2={chartWidth - CHART_PADDING.right} y1={gridY} y2={gridY} />
                  <text fill="#64748b" fontSize="10" textAnchor="end" x={CHART_PADDING.left - 9} y={gridY + 4}>{value}</text>
                </g>
              );
            })}
            <polygon className="trend-area-depth" fill="#4c1d95" opacity="0.16" points={areaPoints} />
            <polygon className="trend-area-face" fill="url(#trend-area-gradient)" points={areaPoints} />
            <polyline className="trend-line-depth" fill="none" points={linePoints} stroke="#4c1d95" strokeLinejoin="round" strokeWidth="8" transform="translate(0 5)" />
            <polyline className="trend-line-draw" fill="none" filter="url(#trend-line-shadow)" pathLength="1" points={linePoints} stroke="#7c3aed" strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" />
            {intervals.map((group, index) => {
              const selected = selectedInterval === group.interval;
              const hasSeveral = group.vehicleCount > 1;
              return (
                <g
                  className="trend-point cursor-pointer outline-none"
                  key={group.interval}
                  onClick={() => setSelectedInterval(selected ? null : group.interval)}
                  onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") setSelectedInterval(selected ? null : group.interval); }}
                  role="button"
                  tabIndex={0}
                >
                  <ellipse cx={x(index)} cy={y(group.vehicleCount) + 8} fill="#2d1b4e" opacity="0.18" rx={selected ? 9 : 7} ry="3" />
                  <circle cx={x(index)} cy={y(group.vehicleCount)} fill={selected ? "#7c3aed" : hasSeveral ? "#f59e0b" : "white"} filter="url(#trend-point-shadow)" r={selected ? 8 : 6} stroke={selected ? "#5b21b6" : hasSeveral ? "#d97706" : "#7c3aed"} strokeWidth="3">
                    <title>{`${intervalLabel(group.interval)}: ${group.vehicleCount} carro${group.vehicleCount === 1 ? "" : "s"}`}</title>
                  </circle>
                  <text fill="#5b21b6" fontSize="10" fontWeight="900" textAnchor="middle" x={x(index)} y={y(group.vehicleCount) - 12}>{group.vehicleCount}</text>
                  <text fill="#475569" fontSize="9" fontWeight="700" textAnchor="middle" x={x(index)} y={CHART_HEIGHT - 19}>{intervalLabel(group.interval)}</text>
                </g>
              );
            })}
          </svg>

          {selectedGroup ? (
            <div className="mt-3 rounded-xl border border-violet-100 bg-violet-50/50 p-3">
              <p className="text-[10px] font-black uppercase tracking-[0.12em] text-violet-700">Intervalo {intervalLabel(selectedGroup.interval)} · {selectedGroup.vehicleCount} carro{selectedGroup.vehicleCount === 1 ? "" : "s"}</p>
              {selectedGroup.rows.length ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  {selectedGroup.rows.map((row) => (
                    <span className="inline-flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-[10px] ring-1 ring-violet-100" key={row.id}>
                      <b className="text-violet-800">{row.plate || "Sin placa"}</b>
                      <span className="text-slate-500">{formatClock(row.departureSeconds).slice(0, 5)} · DT {row.dt || "—"} · Viaje {row.trip || "—"}</span>
                    </span>
                  ))}
                </div>
              ) : <p className="mt-2 text-xs text-slate-500">No salieron carros durante este intervalo.</p>}
            </div>
          ) : null}
        </div>
      ) : <div className="grid min-h-72 place-items-center px-5 text-center text-sm text-slate-500">No hay horas de salida válidas para construir la gráfica.</div>}
    </section>
  );
}

function intervalLabel(interval: number) {
  const start = formatClock(interval).slice(0, 5);
  const end = formatClock(interval + INTERVAL_SECONDS - 1).slice(0, 5);
  return `${start}–${end}`;
}
