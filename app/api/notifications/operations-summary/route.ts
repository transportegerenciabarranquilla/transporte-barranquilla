import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { normalizeContractorName } from "../../../lib/contractors";
import { normalizeDt } from "../../../lib/modulacionStorage";
import { amount, dateKey, loadDailySummary, type DailyContractorSummary } from "../../../lib/n8nDailySummary";
import { escapeHtml } from "../../../lib/n8nWebhook";

export async function POST(request: Request) {
  const expected = process.env.N8N_WEBHOOK_SECRET?.trim() || "";
  const received = request.headers.get("x-webhook-secret") || "";
  const authorized = expected && received && expected.length === received.length && timingSafeEqual(Buffer.from(expected), Buffer.from(received));
  if (!authorized) return NextResponse.json({ error: "No autorizado." }, { status: 403 });

  const date = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());
  const report = await loadDailySummary(date);
  if (!report) return NextResponse.json({ error: "No se pudo consultar el resumen general." }, { status: 503 });

  const fmt = (value: number) => value.toLocaleString("es-CO", { maximumFractionDigits: 2 });
  const tracking = (item: DailyContractorSummary["tracking"]) => item ? `${item.routes} rutas · ${fmt(item.visited)} de ${fmt(item.clients)} clientes (${fmt(item.percentage)} %)` : "Sin rutas registradas";
  const refusal = (item: DailyContractorSummary["refusal"]) => item ? `${fmt(item.percentage)} % · ${fmt(item.pending)} pendientes de ${fmt(item.boxes)} cajas` : "Sin rutas con cajas registradas";
  const range = (item: DailyContractorSummary["range"]) => item ? item.started ? `${fmt(item.percentage)} % · ${item.inRange} de ${item.started} visitas iniciadas (${item.outside} fuera)` : "Sin visitas iniciadas" : "Sin reporte de rango";
  const contractorCards = report.contractors.map(item => `
    <div style="margin-top:14px;padding:16px;border:1px solid #dbe7ef;border-radius:10px">
      <div style="font-size:16px;font-weight:700;color:#0b2a4a">${escapeHtml(item.contractor)}</div>
      <p style="margin:10px 0 0"><strong>Seguimiento:</strong> ${escapeHtml(tracking(item.tracking))}</p>
      <p style="margin:7px 0 0"><strong>Refusal:</strong> ${escapeHtml(refusal(item.refusal))}</p>
      <p style="margin:7px 0 0"><strong>Entrega en rango:</strong> ${escapeHtml(range(item.range))}</p>
    </div>`).join("");

  const routeByDt = new Map(report.routes.filter(row => row.data).map(row => [`${normalizeContractorName(row.contractor)}:${normalizeDt(row.data!.transporte)}`, row.data!]));
  const byPerson = new Map<string, { name: string; boxes: number; contractor: string; dt: string; vehicle: string }>();
  for (const row of report.modulations) {
    const record = row.data;
    if (!record || dateKey(record.fechaDespacho || record.fechaDt || record.createdAt) !== date) continue;
    const person = String(record.personaNombre || record.persona || "").trim();
    if (!person) continue;
    const boxes = amount(record.totalCajas);
    const key = `${normalizeContractorName(row.contractor)}:${person.toLowerCase()}`;
    const current = byPerson.get(key) || { name: person, boxes: 0, contractor: row.contractor, dt: record.dt, vehicle: "" };
    current.boxes += Number.isFinite(boxes) ? boxes : 0;
    if (!current.vehicle) current.vehicle = routeByDt.get(`${normalizeContractorName(row.contractor)}:${normalizeDt(record.dt)}`)?.vehiculo || "";
    byPerson.set(key, current);
  }
  const top = [...byPerson.values()].sort((a, b) => b.boxes - a.boxes)[0];
  const topLine = top ? `${escapeHtml(top.name)} · ${escapeHtml(top.contractor)} · ${fmt(top.boxes)} cajas · ${top.vehicle ? `VH ${escapeHtml(top.vehicle)}` : `DT ${escapeHtml(top.dt)}`}` : "Sin modulaciones registradas hoy";
  const html = `<div style="font-family:Arial,sans-serif;max-width:640px;margin:auto;color:#10213b;font-size:14px;line-height:1.5">
    <div style="background:#0b2a4a;color:#fff;padding:24px;border-radius:14px 14px 0 0">
      <div style="font-size:12px;letter-spacing:2px;color:#8ee8ff">TORRE CONTROL</div>
      <h1 style="margin:8px 0 0;font-size:23px">Resumen de operación</h1>
      <div style="margin-top:6px;color:#cfe8f5">Galapa · ${escapeHtml(date)} · corte cada 30 minutos</div>
    </div>
    <div style="padding:20px;border:1px solid #dbe7ef;border-top:0;border-radius:0 0 14px 14px">
      <div style="padding:16px;background:#f1f5f9;border-radius:10px">
        <div style="font-weight:700;color:#0b2a4a">Resultado general</div>
        <p style="margin:10px 0 0"><strong>Seguimiento:</strong> ${escapeHtml(tracking(report.total.tracking))}</p>
        <p style="margin:7px 0 0"><strong>Refusal:</strong> ${escapeHtml(refusal(report.total.refusal))}</p>
        <p style="margin:7px 0 0"><strong>Entrega en rango:</strong> ${escapeHtml(range(report.total.range))}</p>
      </div>
      <h2 style="margin:22px 0 0;font-size:18px;color:#0b2a4a">Por contratista</h2>
      ${contractorCards}
      <div style="margin-top:18px;padding:16px;background:#eff6ff;border-radius:10px">
        <strong>Persona con más cajas moduladas hoy</strong><br>${topLine}
      </div>
      <p style="margin:18px 0 0;color:#64748b;font-size:12px">Los porcentajes generales se calculan con los totales del día. Los contratistas sin datos se indican por separado.</p>
    </div>
  </div>`;
  return NextResponse.json({ body: { event: "operations_summary", date, contractors: report.contractors, total: report.total, emailHtml: html } });
}
