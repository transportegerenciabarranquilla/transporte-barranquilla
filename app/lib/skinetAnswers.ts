import { contractorSiteName, normalizeContractorName } from "./contractors";
import type { Vehiculo } from "../seguimiento/types";
import type { ModulacionRegistro } from "./modulacionStorage";
import { skinetDate, understandSkinet, type SkinetContext } from "./skinetUnderstanding";

export type SkinetData = {
  summaries?: { contractor: string }[];
  records?: Vehiculo[];
  modulations?: ModulacionRegistro[];
};
function number(value: unknown) {
  const raw = typeof value === "string" ? value.trim().replace(/\s/g, "") : value;
  const normalized = typeof raw === "string" ? /^-?\d{1,3}(\.\d{3})+$/.test(raw) ? raw.replace(/\./g, "") : raw.replace(",", ".") : raw;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}
function format(value: number) { return value.toLocaleString("es-CO", { maximumFractionDigits: 2 }); }
function modulationDay(record: ModulacionRegistro) {
  const date = record.fechaDespacho || record.fechaDt || record.createdAt || "";
  const legacy = date.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  return legacy ? `${legacy[3]}-${legacy[2].padStart(2, "0")}-${legacy[1].padStart(2, "0")}` : date.slice(0, 10);
}

export function skinetOperationReport(data: SkinetData, day: string) {
  const allowed = new Set((data.summaries || []).map(row => normalizeContractorName(row.contractor)));
  const records = (data.records || []).filter(row => allowed.has(normalizeContractorName(row.transportista)));
  const modulations = (data.modulations || []).filter(row => allowed.has(normalizeContractorName(row.contratista)) && modulationDay(row) === day);
  const sum = (field: "cajas" | "cajasRefusalFinal" | "clientes" | "visitados") => records.reduce((total, row) => total + number(row[field]), 0);
  const boxes = sum("cajas");
  const clients = sum("clientes");
  const visited = sum("visitados");
  const modulated = modulations.reduce((total, row) => total + number(row.totalCajas), 0);
  const relocated = modulations.reduce((total, row) => total + number(row.cajasGestionadas), 0);
  const refusal = boxes ? `El refusal va en ${format(sum("cajasRefusalFinal") / boxes * 100)} por ciento.` : "Todavía no hay cajas de salida para calcular el refusal.";
  return `Oe, mijo, así va la operación de hoy. Tenemos ${records.length} rutas registradas. Van ${format(visited)} de ${format(clients)} clientes visitados${clients ? `, un avance del ${format(visited / clients * 100)} por ciento` : ""}. ${refusal} Llevamos ${format(modulated)} cajas moduladas y ${format(relocated)} reubicadas.`;
}

export function skinetQuestionDate(question: string, today: string) {
  return skinetDate(question, today)?.day || today;
}

export function answerSkinet(question: string, data: SkinetData, day: string, resolvedContext?: SkinetContext): { answer: string; clarify?: boolean } {
  const understood = understandSkinet(question, day);
  if (!resolvedContext && understood.prompt) return { answer: understood.prompt };
  const context = resolvedContext || understood.context;
  const authorized = data.summaries?.map(summary => summary.contractor) || [];
  let contractors = authorized;
  const named = Boolean(context.contractor);
  if (context.contractor === "hl") contractors = authorized.filter(value => normalizeContractorName(value) === "hllogisticos");
  else if (context.contractor === "logisticos") contractors = authorized.filter(value => ["logisticos", "logisticosarenosa"].includes(normalizeContractorName(value)));
  else if (context.contractor === "corona") contractors = authorized.filter(value => /^(punto)?corona(arenosa)?$/.test(normalizeContractorName(value)));
  else if (context.contractor === "surti") contractors = authorized.filter(value => normalizeContractorName(value) === "surticervezas");
  const site = context.site;
  if (site) contractors = contractors.filter(value => contractorSiteName(value) === site);
  if (named && !site && contractors.length > 1) return { answer: "¿Te refieres a Galapa o a Arenosa?", clarify: true };
  if (!contractors.length) return { answer: "No tengo datos de esa contratista dentro del alcance de tu sesión." };
  const permitted = new Set(contractors.map(normalizeContractorName));
  let records = (data.records || []).filter(record => permitted.has(normalizeContractorName(record.transportista)));
  let modulations = (data.modulations || []).filter(record => permitted.has(normalizeContractorName(record.contratista))
    && modulationDay(record) === day);
  const dt = context.dt;
  if (dt) {
    records = records.filter(record => String(record.transporte).replace(/\D/g, "") === dt);
    modulations = modulations.filter(record => String(record.dt).replace(/\D/g, "") === dt);
    if (records.length > 1 && new Set(records.map(record => record.transportista)).size > 1 && !named) return { answer: "Ese DT aparece en varias contratistas. Dime cuál quieres consultar.", clarify: true };
  }
  const contractorLabel = named ? contractors[0] === "HL Logisticos" ? "HL" : contractors[0] : site ? `la operación de ${site}` : "la operación";
  const period = context.period;
  const label = `${dt ? `el DT ${dt} de ` : ""}${contractorLabel}`;
  const boxes = records.reduce((sum, record) => sum + number(record.cajas), 0);
  const pending = records.reduce((sum, record) => sum + number(record.cajasRefusalFinal), 0);
  const refusal = boxes ? `Oe, el refusal de ${label} ${period} va en ${format(pending / boxes * 100)} por ciento. Son ${format(pending)} cajas pendientes de ${format(boxes)} cajas de salida, mijo.`
    : `Mijo, ${label} no tiene cajas de salida registradas para ${period}. Todavía no puedo calcular su refusal.`;
  const messages: string[] = [];
  const metrics = new Set(context.metrics);
  if (metrics.has("refusal")) messages.push(refusal);
  if (metrics.has("modulated") || metrics.has("modulations") || metrics.has("relocated")) {
    const modulated = modulations.reduce((sum, record) => sum + number(record.totalCajas), 0);
    const relocated = modulations.reduce((sum, record) => sum + number(record.cajasGestionadas), 0);
    if (metrics.has("modulations")) {
      messages.push(`${label} lleva ${modulations.length} ${modulations.length === 1 ? "modulación" : "modulaciones"} ${period}, mijo. Son ${format(modulated)} cajas moduladas y ${format(relocated)} reubicadas.`);
    } else if (metrics.has("modulated")) {
      messages.push(`${label} ${period} lleva ${format(modulated)} cajas moduladas y ${format(relocated)} reubicadas, mijo.`);
    } else {
      messages.push(`${label} ${period} lleva ${format(relocated)} cajas reubicadas de ${format(modulated)} moduladas, mijo.`);
    }
  }
  if (metrics.has("boxes")) messages.push(`${label} lleva ${format(boxes)} cajas de salida ${period}, con ${format(pending)} pendientes de refusal, mijo.`);
  if (metrics.has("progress")) {
    const clients = records.reduce((sum, record) => sum + number(record.clientes), 0);
    const visited = records.reduce((sum, record) => sum + number(record.visitados), 0);
    messages.push(`Oe, ${label} lleva ${format(visited)} de ${format(clients)} clientes visitados ${period}${clients ? `: ${format(visited / clients * 100)} por ciento de avance` : ""}.`);
  }
  if (metrics.has("routes")) messages.push(`${label} tiene ${records.length} rutas registradas para ${period}, mijo.`);
  if (metrics.has("departures")) {
    const departed = records.filter(record => /^\d{1,2}:\d{2}(?::\d{2})?$/.test(String(record.horaSalida || "").trim())).length;
    messages.push(`${label} tiene ${departed} rutas con hora de salida registrada y ${records.length - departed} sin salida registrada para ${period}, mijo.`);
  }
  if (dt && metrics.has("status")) {
    const record = records[0];
    messages.push(record ? `El DT ${dt} de ${record.transportista}, ${period}, está ${record.status || "sin estado registrado"}. Placa ${record.vehiculo || "sin placa"}. Responsable ${record.responsable || "sin responsable registrado"}.`
      : `No encontré el DT ${dt} para ${day} dentro del alcance consultado.`);
  }
  if (metrics.has("status") && !dt) return { answer: "Mijo, dime el número del DT para consultar su estado, placa y responsable.", clarify: true };
  if (metrics.has("summary")) messages.push(`${refusal} Hay ${records.length} rutas y ${modulations.length} modulaciones.`);
  return { answer: messages.join(" ") || "Puedo consultar refusal, cajas, modulaciones, rutas y avance de clientes. Por ejemplo: ¿cuánto va el refusal de Logísticos Galapa?" };
}
