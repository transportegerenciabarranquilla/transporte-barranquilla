export type SkinetMetric = "refusal" | "modulated" | "relocated" | "modulations" | "boxes" | "progress" | "routes" | "status" | "departures" | "summary";
export type SkinetContext = {
  metrics: SkinetMetric[];
  contractor?: "hl" | "logisticos" | "corona" | "surti";
  site?: "Galapa" | "Arenosa";
  dt?: string;
  day: string;
  period: string;
};
export const SKINET_IDENTITY_REPLY = "¡Yo soy Skainet! ¡Y tú no eres nadie delante mío!";
export function isSkinetIdentityQuestion(question: string) {
  return /\b(?:quien eres|quien sos|quien es (?:skainet|skinet)|como te llamas|presentate|que eres)\b/.test(normalizeSkinet(question));
}
export function normalizeSkinet(text: string) {
  return text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
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
  if (/\brefusal\b|rechaz|devoluc/.test(value)) metrics.push("refusal");
  const modulation = /modul[a-z]*|modol[a-z]*/.test(value);
  if (modulation) metrics.push(/cuantas?\s+(?:nuevas?\s+)?modulaciones|numero de modulaciones|cantidad de modulaciones/.test(value) ? "modulations" : "modulated");
  if (/reubic[a-z]*|recuperad[a-z]*|gestionad[a-z]*/.test(value)) metrics.push("relocated");
  if (/clientes|visitad[a-z]*|visitas|avance|entregas|por visitar/.test(value)) metrics.push("progress");
  if (/\bsali[do][a-z]*\b|salieron|despachad[a-z]*|pendientes por salir/.test(value) && !/\bcajas\b/.test(value)) metrics.push("departures");
  if (/\bcajas\b|carga total/.test(value) && !metrics.length) metrics.push("boxes");
  if (/\brutas\b|vehiculos|camiones|carros/.test(value) && !metrics.length) metrics.push("routes");
  if (/estado|placa|responsable|conductor|\bdt\b|\bruta\s+(?:numero\s*)?\d/.test(value) && !metrics.length) metrics.push("status");
  if (/resumen|balance|reporte|como (?:va|vamos|esta)/.test(value) && !metrics.length) metrics.push("summary");
  return metrics;
}

function validDate(date: string) {
  if (!Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) throw new Error("Mijo, revisa esa fecha; no es una fecha válida.");
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
  return undefined;
}

export function understandSkinet(question: string, today: string, previous?: SkinetContext): { context: SkinetContext; prompt?: string } {
  const text = normalizeSkinet(question);
  if (/otra pregunta|nuevo tema|empezar de nuevo/.test(text)) previous = undefined;
  const families: SkinetContext["contractor"][] = [];
  if (/\bhl\b/.test(text)) families.push("hl");
  if (/\blogisticos\b/.test(text.replace(/\bhl\s+logisticos\b/g, "hl"))) families.push("logisticos");
  if (/\bcorona\b/.test(text)) families.push("corona");
  if (/\bsurti\b/.test(text)) families.push("surti");
  const site = /arenosa|barranquilla/.test(text) ? "Arenosa" : /galapa/.test(text) ? "Galapa" : undefined;
  const all = /tod[oa]s (?:l[oa]s )?(?:contratistas|sedes|empresas)|total general|\bglobal\b|toda la operacion|^(?:y\s+)?(?:de\s+)?tod[oa]s[\s.!?]*$/.test(text);
  const route = text.match(/\b(?:dt|ruta|transporte)\s*(?:numero\s*)?([\d][\d\s]*)/);
  const bareRoute = previous?.metrics.includes("status") ? text.match(/^\s*(?:el\s+|numero\s+)?(\d[\d\s]*)[.!?]*$/)?.[1] : undefined;
  const spokenDigits = text.match(/\b(?:dt|ruta|transporte)\s+(?:numero\s+)?((?:(?:cero|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve)\s*)+)\b/)?.[1];
  const digits = ["cero", "uno", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve"];
  const spokenDt = spokenDigits?.trim().split(/\s+/).map(word => digits.indexOf(word)).join("");
  const dt = (route?.[1] || bareRoute || spokenDt)?.replace(/\s/g, "");
  const metrics = skinetMetrics(text);
  const date = skinetDate(text, today);
  const changedContractor = all || Boolean(families[0] && families[0] !== previous?.contractor);
  const context: SkinetContext = {
    metrics: metrics.length ? metrics : previous?.metrics || [],
    contractor: all ? undefined : families[0] || previous?.contractor,
    site: site || (all || changedContractor ? undefined : previous?.site),
    dt: dt || (all || changedContractor || (site && site !== previous?.site) ? undefined : previous?.dt),
    day: date?.day || previous?.day || today,
    period: date?.period || (previous?.day && previous.day !== today ? `el ${previous.day}` : "hoy"),
  };
  if (/\b(mes|semana|historico|historial)\b/.test(text)) return { context, prompt: "Por ahora consulto un día a la vez. Dime hoy, ayer o la fecha que quieres revisar." };
  if (families.length > 1) return { context, prompt: "Mijo, consultemos una contratista a la vez. ¿Cuál quieres revisar primero?" };
  if (!metrics.length && !families.length && !site && !dt && !date && !all
    && !/\b(cuant[oa]s?|lo mismo|repite|otra vez)\b/.test(text)) {
    return { context, prompt: "Oe, no capté qué dato necesitas. Puedes preguntar por refusal, modulación, cajas, clientes o una ruta." };
  }
  if (!context.metrics.length) return { context, prompt: "Oe, ¿quieres saber el refusal, las cajas moduladas, las reubicadas o cómo van las rutas?" };
  return { context };
}
