import { contractorLabel, normalizeContractorName } from "./contractors";

// Anchored patterns preserve legacy spellings without allowing partial owners
// (Logisticos must never match Logisticos Arenosa).
export function literalSearchPattern(value: string) {
  const accents: Record<string, string> = { a: "[aáàäâãå]", e: "[eéèëê]", i: "[iíìïî]", o: "[oóòöôõ]", u: "[uúùüû]", n: "[nñ]", c: "[cç]" };
  return [...value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()]
    .map(char => accents[char] || char.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("");
}

export function contractorSqlPattern(contractor: string, includeLabels = false) {
  const key = normalizeContractorName(contractor);
  const aliases = [key];
  if (key === "hllogisticos") aliases.push("hllogistica");
  if (includeLabels && key === "puntocorona") aliases.push("corona");
  if (includeLabels && key === "puntocoronaarenosa") aliases.push("coronaarenosa");
  return `^[^[:alnum:]]*(${aliases.map(alias => [...alias].map(literalSearchPattern).join("[^[:alnum:]]*")).join("|")})[^[:alnum:]]*$`;
}

export function readListPage(params: URLSearchParams, defaultSize = 50) {
  const page = Number(params.get("page") || "1");
  const pageSize = Number(params.get("pageSize") || String(defaultSize));
  if (!Number.isSafeInteger(page) || page < 1 || page > 100_000 || ![25, 50].includes(pageSize)) throw new Error("La página o el tamaño solicitado no es válido.");
  return { page, pageSize, offset: (page - 1) * pageSize };
}

export function scopedPersonnelParams(contractor: string, search: string, page: number, pageSize: number) {
  const params = new URLSearchParams({
    select: "CC,NOMBRE,CARGO,CONTRATISTA,CELULAR,CORREO", order: "NOMBRE.asc,CC.asc,CONTRATISTA.asc",
    CONTRATISTA: `imatch.${contractorSqlPattern(contractorLabel(contractor), true)}`,
    limit: String(pageSize), offset: String((page - 1) * pageSize),
  });
  if (search.trim()) {
    const value = JSON.stringify(literalSearchPattern(search.trim().slice(0, 120)));
    params.set("or", `(CC.imatch.${value},NOMBRE.imatch.${value},CARGO.imatch.${value})`);
  }
  return params;
}
