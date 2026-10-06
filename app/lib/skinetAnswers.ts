import { contractorSiteName, normalizeContractorName } from "./contractors";
import type { Vehiculo } from "../seguimiento/types";
import type { ModulacionRegistro } from "./modulacionStorage";
import { skinetDate, skinetMetrics, understandSkinet, normalizeSkinet, type SkinetContext } from "./skinetUnderstanding";
import { skinetRouteAnswer } from "./skinetRouteAnswer";
import { skinetDt, skinetPlate, skinetRangeRows, skinetRangeAnswer, skinetRangeVehicleAnswer, type SkinetRangeReport } from "./skinetRange";

export type SkinetData = {
  summaries?: { contractor: string }[];
  records?: Vehiculo[];
  modulations?: ModulacionRegistro[];
  rangeReports?: SkinetRangeReport[];
};
function number(value: unknown) {
  const raw = typeof value === "string" ? value.trim().replace(/\s/g, "") : value;
  const normalized = typeof raw === "string" ? /^-?\d{1,3}(\.\d{3})+$/.test(raw) ? raw.replace(/\./g, "") : raw.replace(",", ".") : raw;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}
function format(value: number) { return value.toLocaleString("es-CO", { maximumFractionDigits: 2 }); }
function hasNumber(value: unknown) {
  if (value === null || value === undefined || String(value).trim() === "") return false;
  const raw = String(value).trim().replace(/\s/g, "");
  return Number.isFinite(Number(/^-?\d{1,3}(\.\d{3})+$/.test(raw) ? raw.replace(/\./g, "") : raw.replace(",", ".")));
}
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
  return `Así va la operación de hoy. Tenemos ${records.length} rutas registradas. Van ${format(visited)} de ${format(clients)} clientes visitados${clients ? `, un avance del ${format(visited / clients * 100)} por ciento` : ""}. ${refusal} Llevamos ${format(modulated)} cajas moduladas y ${format(relocated)} reubicadas.`;
}

export function skinetQuestionDate(question: string, today: string) {
  return skinetDate(question, today)?.day || today;
}

export function answerSkinet(question: string, data: SkinetData, day: string, resolvedContext?: SkinetContext): { answer: string; clarify?: boolean } {
  const understood = understandSkinet(question, day);
  if (!resolvedContext && understood.prompt) return { answer: understood.prompt };
  // El tema explícito de la pregunta tiene prioridad sobre el de la conversación.
  // Solo frases de continuación como «y HL» heredan la métrica anterior.
  const questionMetrics = skinetMetrics(question);
  const baseContext = resolvedContext || understood.context;
  const context = questionMetrics.length ? { ...baseContext, metrics: questionMetrics } : baseContext;
  const authorized = data.summaries?.map(summary => summary.contractor) || [];
  let contractors = authorized;
  const named = Boolean(context.contractor);
  if (context.contractors?.length) contractors = authorized.filter(value => {
    const normalized = normalizeContractorName(value);
    return context.contractors!.some(family => family === "hl" ? normalized === "hllogisticos"
      : family === "surti" ? normalized === "surticervezas"
      : family === "logisticos" ? ["logisticos", "logisticosarenosa"].includes(normalized)
      : /^(punto)?corona(arenosa)?$/.test(normalized));
  });
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
  const metrics = new Set(context.metrics);
  if (metrics.has("maxRefusal")) {
    const refusalRows = authorized.map(contractor => {
      const contractorRecords = (data.records || []).filter(record => normalizeContractorName(record.transportista) === normalizeContractorName(contractor));
      const boxes = contractorRecords.reduce((sum, record) => sum + number(record.cajas), 0);
      const pending = contractorRecords.reduce((sum, record) => sum + number(record.cajasRefusalFinal), 0);
      const missing = contractorRecords.filter(record => !hasNumber(record.cajas) || !hasNumber(record.cajasRefusalFinal)).length;
      return { contractor, boxes, pending, missing, percent: boxes ? pending / boxes * 100 : null };
    }).filter(row => row.boxes > 0 && row.missing === 0 && row.percent !== null);
    if (!refusalRows.length) return { answer: "No tengo datos completos de refusal para comparar las contratistas dentro del alcance de tu sesión." };
    const highest = Math.max(...refusalRows.map(row => row.percent!));
    const leaders = refusalRows.filter(row => row.percent === highest);
    const targetName = context.contractor === "hl" ? "hllogisticos" : context.contractor === "logisticos" ? "logisticos" : context.contractor === "corona" ? "corona" : context.contractor === "surti" ? "surticervezas" : undefined;
    const target = targetName ? refusalRows.find(row => normalizeContractorName(row.contractor).includes(targetName)) : undefined;
    const ranking = [...refusalRows].sort((a, b) => b.percent! - a.percent!).map(row => `${row.contractor}: ${format(row.percent!)} por ciento (${format(row.pending)} de ${format(row.boxes)} cajas)`).join("; ");
    const conclusion = target ? target.percent === highest
      ? `${target.contractor} sí es la contratista con mayor refusal${leaders.length > 1 ? " junto con " + leaders.filter(row => row !== target).map(row => row.contractor).join(", ") : ""}.`
      : `${target.contractor} no es la contratista con mayor refusal; la mayor es ${leaders.map(row => row.contractor).join(", ")}.` : `La contratista con mayor refusal es ${leaders.map(row => row.contractor).join(", ")}.`;
    return { answer: `${conclusion} Comparación: ${ranking}.` };
  }
  let personName = context.rr || "";
  if (context.rr) {
    const query = normalizeSkinet(context.rr);
    const people = (record: Vehiculo) => [
      { name: record.nombreResponsable || record.responsable || "", id: record.cedulaResponsable },
      ...(context.person ? [
        { name: record.nombreAuxiliar1 || "", id: record.cedulaAuxiliar1 },
        { name: record.nombreAuxiliar2 || "", id: record.cedulaAuxiliar2 },
        { name: record.nombreAuxiliar3 || "", id: record.cedulaAuxiliar3 },
      ] : []),
    ];
    const matchesQuery = (person: ReturnType<typeof people>[number]) => /^\d+$/.test(query)
      ? String(person.id || "").replace(/\D/g, "") === query
      : Boolean(person.name) && query.split(/\s+/).every(word => normalizeSkinet(person.name).split(/\s+/).includes(word));
    const matches = new Map<string, string>();
    records = records.filter(record => {
      const found = people(record).filter(matchesQuery);
      for (const person of found) matches.set(`${normalizeContractorName(record.transportista)}:${person.id || normalizeSkinet(person.name)}`, person.name);
      return found.length > 0;
    });
    if (matches.size > 1) return { answer: `Encontré ${context.person ? "varias personas" : "varios RR"} con ese nombre: ${[...matches.values()].slice(0, 5).join(", ")}. Indica el nombre completo, la cédula o la contratista.`, clarify: true };
    if (!records.length) return { answer: `No encontré rutas de ${context.person ? "esa persona" : "ese RR"} ${context.period} dentro del alcance de tu sesión.` };
    personName = [...matches.values()][0] || personName;
  }
  let modulations = (data.modulations || []).filter(record => permitted.has(normalizeContractorName(record.contratista))
    && modulationDay(record) === day);
  const dt = context.dt;
  const rrRoutes = new Set(records.map(record => `${normalizeContractorName(record.transportista)}:${skinetDt(record.transporte)}`));
  if (context.rr) modulations = modulations.filter(record => rrRoutes.has(`${normalizeContractorName(record.contratista)}:${skinetDt(record.dt)}`));
  const rangeReports = context.rr ? (data.rangeReports || []).map(report => ({ ...report, rows: report.rows.filter(row => rrRoutes.has(`${normalizeContractorName(report.contractor)}:${skinetDt(row.dt)}`)) })) : data.rangeReports || [];
  const range = skinetRangeRows(rangeReports, permitted, day, context);
  const contractorLabel = named ? contractors[0] === "HL Logisticos" ? "HL" : contractors[0] : site ? `la operación de ${site}` : "la operación";
  const period = context.period;
  if (context.client) {
    const query = normalizeSkinet(context.client).replace(/[^a-z0-9\s]/g, "").trim();
    const words = query.split(/\s+/).filter(Boolean);
    const matches = range.rows.filter(row => {
      const code = normalizeSkinet(row.pocExternalId || "").replace(/[^a-z0-9]/g, "");
      const name = normalizeSkinet(row.pocName || "").replace(/[^a-z0-9\s]/g, " ");
      return code === query.replace(/\s/g, "") || words.every(word => name.split(/\s+/).includes(word));
    });
    const clients = new Map<string, typeof matches>();
    for (const row of matches) {
      const key = `${normalizeContractorName(row.contractor)}:${normalizeSkinet(row.pocExternalId || row.pocName)}`;
      clients.set(key, [...(clients.get(key) || []), row]);
    }
    if (!matches.length) {
      const modulationMatches = modulations.filter(record => {
        const code = normalizeSkinet(record.codigoCliente || "").replace(/[^a-z0-9]/g, "");
        const name = normalizeSkinet(record.nombreCliente || "").replace(/[^a-z0-9\s]/g, " ");
        return code === query.replace(/\s/g, "") || words.every(word => name.split(/\s+/).includes(word));
      });
      const modulationClients = new Map<string, typeof modulationMatches>();
      for (const record of modulationMatches) {
        const key = `${normalizeContractorName(record.contratista)}:${normalizeSkinet(record.codigoCliente || record.nombreCliente || "")}`;
        modulationClients.set(key, [...(modulationClients.get(key) || []), record]);
      }
      if (!modulationClients.size) return { answer: `No encontré al cliente ${context.client} en los reportes de rango ni en las modulaciones de ${contractorLabel} ${period} dentro del alcance de tu sesión.` };
      if (modulationClients.size > 1) return { answer: `Encontré varios clientes para «${context.client}»: ${[...modulationClients.values()].slice(0, 5).map(rows => `${rows[0].nombreCliente || rows[0].codigoCliente} (código ${rows[0].codigoCliente || "sin registrar"})`).join(", ")}. Indica el código.`, clarify: true };
      const clientModulations = [...modulationClients.values()][0];
      const client = clientModulations[0];
      return { answer: `Cliente ${client.nombreCliente || "sin nombre"} (código ${client.codigoCliente || "sin registrar"}) de ${client.contratista || contractorLabel} ${period}: ${clientModulations.length} modulaciones, ${format(clientModulations.reduce((sum, row) => sum + number(row.totalCajas), 0))} cajas reportadas y ${format(clientModulations.reduce((sum, row) => sum + number(row.cajasGestionadas), 0))} gestionadas. DT: ${[...new Set(clientModulations.map(row => row.dt).filter(Boolean))].join(", ") || "sin registrar"}. No hay visitas de rango disponibles para este cliente.` };
    }
    if (clients.size > 1) return { answer: `Encontré varios clientes para «${context.client}»: ${[...clients.values()].slice(0, 5).map(rows => `${rows[0].pocName || rows[0].pocExternalId} (${rows[0].contractor}, código ${rows[0].pocExternalId || "sin registrar"})`).join(", ")}. Indica el código o nombre completo.`, clarify: true };
    const visits = [...clients.values()][0];
    const client = visits[0];
    const related = modulations.filter(record => normalizeContractorName(record.contratista) === normalizeContractorName(client.contractor)
      && (client.pocExternalId && normalizeSkinet(record.codigoCliente) === normalizeSkinet(client.pocExternalId)
        || Boolean(record.nombreCliente && normalizeSkinet(record.nombreCliente) === normalizeSkinet(client.pocName))));
    const details = visits.slice(0, 10).map(row => `DT ${row.dt}, placa ${row.truckLicensePlate || "sin registrar"}, ${row.status === "NOT_STARTED" ? "sin iniciar" : row.withinRadius === true ? "en rango" : row.withinRadius === false ? "fuera de rango" : "rango sin validar"}, estado ${row.status || "sin registrar"}${row.withinRadius === false ? `, motivo ${row.manualOutOfRadiusReason || row.outOfRadiusReason || "sin registrar"}` : ""}, ${hasNumber(row.deliveredVolume) ? format(number(row.deliveredVolume)) : "sin dato de"} cajas entregadas y ${hasNumber(row.refusedVolume) ? format(number(row.refusedVolume)) : "sin dato de"} rechazadas`);
    return { answer: `Cliente ${client.pocName || "sin nombre"} (código ${client.pocExternalId || "sin registrar"}) de ${client.contractor} ${period}. ${visits.length} ${visits.length === 1 ? "visita" : "visitas"}: ${details.join("; ")}.${visits.length > 10 ? " Muestra las primeras 10; indica el DT para precisar." : ""}${related.length ? ` ${related.length} modulaciones: ${format(related.reduce((sum, row) => sum + number(row.totalCajas), 0))} cajas reportadas y ${format(related.reduce((sum, row) => sum + number(row.cajasGestionadas), 0))} gestionadas.` : ""}` };
  }
  if (context.plate) {
    records = records.filter(record => skinetPlate(record.vehiculo) === context.plate);
    const plateDts = new Set([...records.map(record => skinetDt(record.transporte)), ...range.rows.map(row => skinetDt(row.dt))]);
    modulations = modulations.filter(record => plateDts.has(skinetDt(record.dt)));
  }
  if (dt) {
    records = records.filter(record => skinetDt(record.transporte) === skinetDt(dt));
    modulations = modulations.filter(record => skinetDt(record.dt) === skinetDt(dt));
    if (records.length > 1 && new Set(records.map(record => record.transportista)).size > 1 && !named) return { answer: "Ese DT aparece en varias contratistas. Dime cuál quieres consultar.", clarify: true };
  }
  if ((dt || context.plate) && !named && new Set([...records.map(row => normalizeContractorName(row.transportista)), ...range.rows.map(row => normalizeContractorName(row.contractor))]).size > 1) return { answer: "Ese DT o placa aparece en varias contratistas. Indica la contratista y sede que quieres consultar.", clarify: true };
  const label = `${dt ? `el DT ${dt} de ` : context.plate ? `la placa ${context.plate} de ` : context.rr ? `${context.person ? "la persona" : "el RR"} ${personName} de ` : ""}${contractorLabel}`;
  const boxes = records.reduce((sum, record) => sum + number(record.cajas), 0);
  const pending = records.reduce((sum, record) => sum + number(record.cajasRefusalFinal), 0);
  const missingRefusal = records.filter(record => !hasNumber(record.cajasRefusalFinal) || !hasNumber(record.cajas)).length;
  const refusal = missingRefusal ? `Faltan datos de refusal o cajas de salida en ${missingRefusal} rutas de ${label} ${period}. No puedo calcular un porcentaje completo.`
    : boxes ? `El refusal de ${label} ${period} va en ${format(pending / boxes * 100)} por ciento. Son ${format(pending)} cajas pendientes de ${format(boxes)} cajas de salida.`
    : `${label} no tiene cajas de salida registradas para ${period}. Todavía no puedo calcular su refusal.`;
  const messages: string[] = [];
  if (metrics.has("maxBoxes")) {
    const candidates = records.filter(record => record.cajas !== null && record.cajas !== undefined && String(record.cajas).trim() !== "" && Number.isFinite(Number(String(record.cajas).replace(/\./g, "").replace(",", "."))));
    if (!candidates.length) return { answer: `No hay rutas con cajas registradas de ${contractorLabel} ${period}.` };
    const maximum = Math.max(...candidates.map(record => number(record.cajas)));
    const winners = candidates.filter(record => number(record.cajas) === maximum);
    return { answer: `${winners.length > 1 ? "Empate en la mayor cantidad de cajas. " : ""}${winners.map(record => `DT ${record.transporte} de ${record.transportista} ${period}: ${format(maximum)} cajas. Responsable: ${record.nombreResponsable || record.responsable || "sin registrar"}.`).join(" ")}` };
  }
  if (metrics.has("rangeVehicles")) {
    const missing = contractors.filter(contractor => ["logisticos", "surticervezas", "hllogisticos", "logisticosarenosa"].includes(normalizeContractorName(contractor)) && !range.reports.some(report => normalizeContractorName(report.contractor) === normalizeContractorName(contractor)));
    return { answer: skinetRangeVehicleAnswer(range, context, label) + (range.reports.length && missing.length ? ` Conteo parcial: faltan reportes de ${missing.join(", ")}.` : "") };
  }
  if (metrics.has("range")) {
    if (!named && !dt && !context.plate && !context.rr) {
      const rangeContractors = contractors.filter(contractor =>
        ["surticervezas", "logisticos", "hllogisticos", "logisticosarenosa"].includes(normalizeContractorName(contractor))
        || range.reports.some(report => normalizeContractorName(report.contractor) === normalizeContractorName(contractor)));
      if (rangeContractors.length > 1) {
        const missing = rangeContractors.filter(contractor => !range.reports.some(report => normalizeContractorName(report.contractor) === normalizeContractorName(contractor)));
        messages.push(skinetRangeAnswer(range, context, label)
          + (missing.length ? ` Resultado parcial: faltan reportes de ${missing.join(", ")}.` : ""));
      }
      messages.push(...rangeContractors.map(contractor => skinetRangeAnswer(
        skinetRangeRows(data.rangeReports || [], new Set([normalizeContractorName(contractor)]), day, context), context, contractor)));
      if (!rangeContractors.length) messages.push(skinetRangeAnswer(range, context, label));
    } else messages.push(skinetRangeAnswer(range, context, label));
  }
  if (metrics.has("refusal")) messages.push(refusal);
  if (metrics.has("modulated") || metrics.has("modulations") || metrics.has("relocated")) {
    const modulated = modulations.reduce((sum, record) => sum + number(record.totalCajas), 0);
    const relocated = modulations.reduce((sum, record) => sum + number(record.cajasGestionadas), 0);
    if (metrics.has("modulations")) {
      messages.push(`${label} lleva ${modulations.length} ${modulations.length === 1 ? "modulación" : "modulaciones"} ${period}. Son ${format(modulated)} cajas moduladas y ${format(relocated)} reubicadas.`);
    } else if (metrics.has("modulated")) {
      messages.push(`${label} ${period} lleva ${format(modulated)} cajas moduladas y ${format(relocated)} reubicadas.`);
    } else {
      messages.push(`${label} ${period} lleva ${format(relocated)} cajas reubicadas de ${format(modulated)} moduladas.`);
    }
  }
  if (metrics.has("boxes")) messages.push(`${label} lleva ${format(boxes)} cajas de salida ${period}, con ${format(pending)} pendientes de refusal.`);
  if (metrics.has("progress")) {
    const clients = records.reduce((sum, record) => sum + number(record.clientes), 0);
    const visited = records.reduce((sum, record) => sum + number(record.visitados), 0);
    const missing = records.filter(record => !hasNumber(record.clientes) || !hasNumber(record.visitados)).length;
    messages.push(missing ? `Faltan datos de clientes o visitas en ${missing} rutas de ${label} ${period}. No puedo calcular el avance completo.`
      : `${label} lleva ${format(visited)} de ${format(clients)} clientes visitados ${period}${clients ? `: ${format(visited / clients * 100)} por ciento de avance` : "; sin clientes registrados para calcular el porcentaje"}.`);
  }
  if (metrics.has("routes")) messages.push(`${label} tiene ${records.length} rutas registradas para ${period}.`);
  if (metrics.has("departures")) {
    const departed = records.filter(record => /^\d{1,2}:\d{2}(?::\d{2})?$/.test(String(record.horaSalida || "").trim())).length;
    messages.push(`${label} tiene ${departed} rutas con hora de salida registrada y ${records.length - departed} sin salida registrada para ${period}.`);
  }
  if ((dt || context.plate || context.rr) && metrics.has("status")) {
    for (const record of records.slice(0, 10)) messages.push(skinetRouteAnswer(record, context));
    if ((dt || context.plate) && !context.routeField && records.length) {
      const clients = records.reduce((sum, record) => sum + number(record.clientes), 0);
      const visited = records.reduce((sum, record) => sum + number(record.visitados), 0);
      messages.push(`Seguimiento: ${format(visited)} de ${format(clients)} clientes visitados. ${format(boxes)} cajas de salida.${missingRefusal ? " Faltan datos para calcular refusal." : boxes ? ` Refusal: ${format(pending / boxes * 100)} por ciento (${format(pending)} cajas pendientes).` : ""}`);
      if (range.reports.length) messages.push(skinetRangeAnswer(range, context, label));
    }
    if (records.length > 10) messages.push(`Hay ${records.length} rutas coincidentes. Consulta un DT para acotar el resultado.`);
    if (!records.length) {
      const row = range.rows[0];
      messages.push(row ? `En entrega en rango: DT ${row.dt}, contratista ${row.contractor}, placa ${row.truckLicensePlate || "sin placa"}, conductor ${row.driverName || "sin dato"}. No hay una ruta de Seguimiento disponible para completar los demás datos.` : `No encontré ese DT o placa para ${day} dentro del alcance consultado.`);
    }

  }
  if (metrics.has("status") && !dt && !context.plate && !context.rr) return { answer: "Indica el número del DT o la placa para consultar el estado y los datos de la ruta.", clarify: true };
  if (metrics.has("summary") || metrics.has("tracking")) {
    if (!records.length) {
      messages.push(`No hay rutas de Seguimiento registradas para ${label} ${period} dentro del alcance consultado.`);
      return { answer: messages.join(" ") };
    }
    const clients = records.reduce((sum, record) => sum + number(record.clientes), 0);
    const visited = records.reduce((sum, record) => sum + number(record.visitados), 0);
    const missing = records.filter(record => !hasNumber(record.clientes) || !hasNumber(record.visitados)).length;
    const progress = missing ? ` Faltan datos de clientes o visitas en ${missing} rutas; no puedo calcular el avance completo.`
      : clients ? ` Avance de visitas: ${format(visited)} de ${format(clients)} clientes, ${format(visited / clients * 100)} por ciento. Faltan ${format(Math.max(0, clients - visited))} clientes por visitar.` : " No hay clientes registrados para calcular el avance.";
    messages.push(`Seguimiento de ${label} ${period}: ${records.length} rutas registradas.${progress}${metrics.has("refusal") ? "" : ` ${refusal}`} Hay ${modulations.length} modulaciones.`);
  }
  return { answer: messages.join(" ") || "Puedo consultar entrega en rango, motivos fuera de rango, refusal, cajas, modulaciones, clientes y detalles de rutas por DT o placa." };
}
