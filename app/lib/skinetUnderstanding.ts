export type SkinetMetric = "refusal" | "modulated" | "relocated" | "modulations" | "boxes" | "progress" | "routes" | "status" | "departures" | "summary" | "tracking" | "range" | "rangeDetails" | "maxBoxes" | "rangeVehicles";
export type SkinetContext = {
  metrics: SkinetMetric[];
  contractor?: "hl" | "logisticos" | "corona" | "surti";
  contractors?: NonNullable<SkinetContext["contractor"]>[];
  site?: "Galapa" | "Arenosa";
  dt?: string;
  plate?: string;
  rr?: string;
  routeField?: "rr" | "plate" | "crew" | "departure" | "arrival" | "status";
  outsideRange?: boolean;
  day: string;
  period: string;
};
export const SKINET_IDENTITY_REPLY = "¡Yo soy Skainet! ¡Y tú no eres nadie delante mío!";
export function isSkinetIdentityQuestion(question: string) {
  return /\b(?:quien eres|quien sos|quien es (?:skainet|skinet)|como te llamas|presentate|que eres)\b/.test(normalizeSkinet(question));
}
export function normalizeSkinet(text: string) {
  return text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/\b(?:erre\s+erre|r\s+r)\b/g, "rr")
    .replace(/\b(?:re\s*f[uio]\s*[sz]\s*[ao]l|refiusal|refuzal|refus[ao]l|refus[a-z]*)\b/g, "refusal")
    .replace(/\b(?:hache\s*ele|ache\s*ele|h\s*[.-]?\s*l)\b/g, "hl")
    .replace(/\blog[iy]stic[oa]s?\b/g, "logisticos")
    .replace(/\b(?:punto\s*corona|puntocorona)\b/g, "corona")
    .replace(/\b(?:surti\s*cervezas|surticervezas)\b/g, "surti")
    .replace(/\b(?:de\s*te|d\s*[.-]?\s*t)\b/g, "dt");
}

export function skinetMetrics(text: string): SkinetMetric[] {
  const value = normalizeSkinet(text);
  const metrics: SkinetMetric[] = [];
  if (/\bcajas\b/.test(value) && /mas cajas|mayor (?:cantidad|numero|carga)|mas (?:cantidad|numero) de cajas/.test(value)) return ["maxBoxes"];
  if (/(?:rango|radio)/.test(value) && /vehiculos|camiones|carros|placas/.test(value) && /cuantos|cuantas|cantidad|numero|total/.test(value)) return ["range", "rangeVehicles"];
  if (/\brr\b|\bresponsable\b/.test(value)) metrics.push("status");
  const range = /\brango\b|\bradio\b/.test(value);
  if (range) {
    metrics.push("range");
    if (/cuales|quienes|detalle|lista|motivo|causa|\bque\s+(?:clientes|dts|dt|rutas|placas)|\bplaca/.test(value)) metrics.push("rangeDetails");
  }
  if (/\brefusal\b|rechaz|devoluc/.test(value)) metrics.push("refusal");
  const modulation = /modul[a-z]*|modol[a-z]*/.test(value);
  if (modulation) metrics.push(/cuantas?\s+(?:nuevas?\s+)?modulaciones|numero de modulaciones|cantidad de modulaciones/.test(value) ? "modulations" : "modulated");
  if (/reubic[a-z]*|recuperad[a-z]*|gestionad[a-z]*/.test(value)) metrics.push("relocated");
  if (!range && /clientes|visitad[a-z]*|visitas|avance|entregas|por visitar/.test(value)) metrics.push("progress");
  if (!range && /\b(?:placa|responsable|conductor|tripulacion|auxiliar)\b|hora.*(?:sali|llega)/.test(value)) metrics.push("status");
  if (/\bsali[do][a-z]*\b|salieron|despachad[a-z]*|pendientes por salir/.test(value) && !/\bcajas\b|hora|cuando/.test(value)) metrics.push("departures");
  if (/\bcajas\b|carga total/.test(value) && !metrics.length) metrics.push("boxes");
  if (/\brutas\b|vehiculos|camiones|carros/.test(value) && !metrics.length) metrics.push("routes");
  if (/estado|placa|responsable|conductor|tripulacion|auxiliar|hora|detalle|informacion|\bdt\b|\bruta\s+(?:numero\s*)?\d/.test(value) && !metrics.length) metrics.push("status");
  if (/\bseguimiento\b/.test(value) && !metrics.length) metrics.push("tracking");
  if (/resumen|balance|reporte|seguimiento|operacion|avance general|como (?:va|vamos|esta)/.test(value) && !metrics.length) metrics.push("summary");
  return metrics;
}

function validDate(date: string) {
  if (!Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) throw new Error("Revisa esa fecha; no es una fecha válida.");
  return date;
}
export function skinetDate(text: string, today: string): { day: string; period: string } | undefined {
  const value = normalizeSkinet(text);
  const iso = value.match(/\b\d{4}-\d{2}-\d{2}\b/)?.[0];
  if (iso) return { day: validDate(iso), period: `el ${iso}` };
  const short = value.match(/\b(\d{1,2})[/-](\d{1,2})[/-](\d{4})\b/);
  if (short) {
    const day = validDate(`${short[3]}-${short[2].padStart(2, "0")}-${short[1].padStart(2, "0")}`);
    return { day, period: `el ${day}` };
  }
  const months = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  const spoken = value.match(/\b(\d{1,2})\s+(?:de\s+)?(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)(?:\s+(?:de[l]?\s+)?(\d{4}))?\b/);
  if (spoken) {
    const day = validDate(`${spoken[3] || today.slice(0, 4)}-${String(months.indexOf(spoken[2]) + 1).padStart(2, "0")}-${spoken[1].padStart(2, "0")}`);
    return { day, period: `el ${day}` };
  }
  const daysAgo = /anteayer|antes de ayer/.test(value) ? 2 : /\bayer\b/.test(value) ? 1 : /\bmanana\b/.test(value) && !/esta manana/.test(value) ? -1 : 0;
  if (daysAgo) {
    const date = new Date(`${today}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() - daysAgo);
    return { day: date.toISOString().slice(0, 10), period: daysAgo === 2 ? "anteayer" : daysAgo === -1 ? "mañana" : "ayer" };
  }
  if (/\bhoy\b|esta manana|este dia|\bahora\b|actualmente/.test(value)) return { day: today, period: "hoy" };
  const dayOfMonth = value.match(/\bdia\s+(\d{1,2})\b/);
  if (dayOfMonth) {
    const day = validDate(`${today.slice(0, 7)}-${dayOfMonth[1].padStart(2, "0")}`);
    return { day, period: `el ${day}` };
  }
  return undefined;
}

export function understandSkinet(question: string, today: string, previous?: SkinetContext): { context: SkinetContext; prompt?: string } {
  const text = normalizeSkinet(question);
  if (/otra pregunta|nuevo tema|empezar de nuevo/.test(text)) previous = undefined;
  const families: NonNullable<SkinetContext["contractor"]>[] = [];
  if (/\bhl\b/.test(text)) families.push("hl");
  if (/\blogisticos\b/.test(text.replace(/\bhl\s+logisticos\b/g, "hl"))) families.push("logisticos");
  if (/\bcorona\b/.test(text)) families.push("corona");
  if (/\bsurti\b/.test(text)) families.push("surti");
  const site = /arenosa|barranquilla/.test(text) ? "Arenosa" : /galapa/.test(text) ? "Galapa" : undefined;
  const all = /tod[oa]s (?:l[oa]s )?(?:contratistas|sedes|empresas)|\bgeneral\b|\bglobal\b|toda la operacion|^(?:y\s+)?(?:de\s+)?tod[oa]s[\s.!?]*$/.test(text);
  const route = text.match(/\b(?:dt|ruta|transporte)\s*(?:numero\s*)?([\d][\d\s]*)/);
  const bareRoute = previous?.metrics.includes("status") ? text.match(/^\s*(?:el\s+|numero\s+)?(\d[\d\s]*)[.!?]*$/)?.[1] : undefined;
  const spokenDigits = text.match(/\b(?:dt|ruta|transporte)\s+(?:numero\s+)?((?:(?:cero|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve)\s*)+)\b/)?.[1];
  const digits = ["cero", "uno", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve"];
  const spokenDt = spokenDigits?.trim().split(/\s+/).map(word => digits.indexOf(word)).join("");
  const dt = (route?.[1] || bareRoute || spokenDt)?.replace(/\s/g, "");
  const plateMatch = text.match(/\bplaca\s+([a-z]{3})[\s-]*(\d{3})\b/) || text.match(/\b([a-z]{3})-?(\d{3})\b/);
  const plate = plateMatch?.slice(1).join("").toUpperCase();
  const rr = text.match(/\b(?:rr|responsable)\s+(?:con\s+cedula\s+|cedula\s+)?(\d+|[a-z]+(?:\s+[a-z]+)*)/)?.[1]
    ?.split(/\s+(?:de|del|hoy|ayer|dia|en|para|tiene|lleva|esta)\b/)[0].trim();
  const rrSearch = rr && !/^(?:de|del|que|es|tiene|esta|hoy|ayer)\b/.test(rr) ? rr : undefined;
  const routeField = /\brr\b|responsable/.test(text) ? "rr"
    : /placa/.test(text) ? "plate" : /auxiliar|tripulacion/.test(text) ? "crew"
    : /hora.*sali|cuando salio/.test(text) ? "departure"
    : /hora.*llega|cuando llego/.test(text) ? "arrival"
    : /\bestado\b/.test(text) ? "status" : undefined;
  const metrics = skinetMetrics(text);
  const aggregate = metrics.includes("maxBoxes") || metrics.includes("rangeVehicles");
  const topicChanged = Boolean(previous?.metrics.length && metrics.length && metrics[0] !== previous.metrics[0]
    && !/\b(?:ese|esa|mismo|misma|anterior|tambien|también)\b/.test(text));
  if (plate && !metrics.length) metrics.push("status");
  const date = skinetDate(text, today);
  const changedContractor = all || Boolean(families[0] && families[0] !== previous?.contractor);
  const context: SkinetContext = {
    metrics: metrics.length ? metrics : previous?.metrics || [],
    contractor: all || families.length > 1 ? undefined : families[0] || previous?.contractor,
    contractors: all ? undefined : families.length > 1 ? families : families.length ? undefined : previous?.contractors,
    site: site || (all || changedContractor ? undefined : previous?.site),
    dt: dt || (topicChanged || aggregate || rrSearch || plate || all || changedContractor || (site && site !== previous?.site) ? undefined : previous?.dt),
    plate: plate || (topicChanged || aggregate || rrSearch || dt || all || changedContractor || (site && site !== previous?.site) ? undefined : previous?.plate),
    rr: rrSearch || (topicChanged || aggregate || dt || plate || all || changedContractor ? undefined : previous?.rr),
    routeField,
    outsideRange: /fuera (?:de|del) (?:rango|radio)/.test(text) ? true : /(?:en|dentro del?) rango/.test(text) ? false : metrics.includes("range") ? undefined : previous?.outsideRange,
    day: date?.day || previous?.day || today,
    period: date?.period || (previous?.day && previous.day !== today ? `el ${previous.day}` : "hoy"),
  };
  if (/\b(mes|semana|historico|historial)\b/.test(text)) return { context, prompt: "Por ahora consulto un día a la vez. Dime hoy, ayer o la fecha que quieres revisar." };
  if (!metrics.length && !families.length && !site && !dt && !plate && !date && !all
    && !/\b(cuant[oa]s?|lo mismo|repite|otra vez)\b/.test(text)) {
    return { context, prompt: "No capté qué dato necesitas. Puedes preguntar por entrega en rango, refusal, modulación, cajas, clientes, DT o placa." };
  }
  if (!context.metrics.length) return { context, prompt: "¿Quieres saber el refusal, las cajas moduladas, las reubicadas o cómo van las rutas?" };
  return { context };
}
