import type { PuntoCoronaRouteRow } from "./puntoCoronaRoutesStorage";
import { rangeHour, recordedRangeTime } from "./rangeHours";

export type BeesRangeRow = PuntoCoronaRouteRow & { contractor: string; date: string };

export function uniqueBeesClients(rows: BeesRangeRow[]) {
  const seen = new Map<string, BeesRangeRow>();
  for (const row of rows) {
    if (row.status === "NOT_STARTED") continue;
    const dt = String(row.dt || "").replace(/\D/g, "");
    const key = JSON.stringify([row.contractor, row.date, dt, row.pocExternalId || row.id]);
    if (!seen.has(key)) seen.set(key, row);
  }
  return [...seen.values()];
}

export function beesRangeTotals(rows: BeesRangeRow[]) {
  const clients = uniqueBeesClients(rows);
  const inside = clients.filter(row => row.withinRadius === true).length;
  const outside = clients.filter(row => row.withinRadius === false).length;
  return { clients, total: clients.length, inside, outside, unvalidated: clients.length - inside - outside };
}

export function beesOutsideByContractor(rows: BeesRangeRow[]) {
  const groups = new Map<string, BeesRangeRow[]>();
  for (const row of uniqueBeesClients(rows)) {
    const group = groups.get(row.contractor) || [];
    group.push(row);
    groups.set(row.contractor, group);
  }
  return [...groups].map(([contractor, clients]) => ({ contractor, ...beesRangeTotals(clients) }))
    .sort((a, b) => a.contractor.localeCompare(b.contractor, "es-CO"));
}

export function beesOutsideByWeekday(rows: BeesRangeRow[]) {
  const values = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo", "Sin fecha"]
    .map(label => ({ label, count: 0 }));
  for (const row of uniqueBeesClients(rows)) {
    if (row.withinRadius !== false) continue;
    const date = new Date(`${row.date}T00:00:00Z`);
    const valid = /^\d{4}-\d{2}-\d{2}$/.test(row.date) && Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === row.date;
    values[valid ? (date.getUTCDay() + 6) % 7 : 7].count++;
  }
  return values.filter((day, index) => index < 7 || day.count > 0);
}

export function beesOutsideByHour(rows: BeesRangeRow[], expanded = false) {
  const windows = [
    { label: "Antes de 6 a. m.", start: 0, end: 6 },
    { label: "6–8 a. m.", start: 6, end: 8 },
    { label: "8–10 a. m.", start: 8, end: 10 },
    { label: "10 a. m.–12 m.", start: 10, end: 12 },
    { label: "12 m.–2 p. m.", start: 12, end: 14 },
    { label: "2–4 p. m.", start: 14, end: 16 },
    ...(expanded ? [
      { label: "4–6 p. m.", start: 16, end: 18 },
      { label: "6–8 p. m.", start: 18, end: 20 },
      { label: "8–10 p. m.", start: 20, end: 22 },
      { label: "10 p. m.–12 a. m.", start: 22, end: 24 },
    ] : [{ label: "4 p. m. en adelante", start: 16, end: 24 }]),
  ];
  const values = [...windows.map(window => ({ label: window.label, count: 0 })), { label: "Sin hora", count: 0 }];
  for (const row of uniqueBeesClients(rows)) {
    if (row.withinRadius !== false) continue;
    const hour = rangeHour(recordedRangeTime(row));
    const index = hour === null ? -1 : windows.findIndex(window => hour >= window.start && hour < window.end);
    values[index < 0 ? windows.length : index].count++;
  }
  return values;
}
