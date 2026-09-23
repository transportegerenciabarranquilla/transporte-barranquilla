import { normalizeContractorName } from "./contractors";

// Algunas filas históricas tienen contractor nulo. En ese caso, el dueño
// es la contratista que la API guardó dentro de data; nunca sustituye a
// una columna contractor que ya identifica a otra contratista.
export function scopeCheckinQuery(params: URLSearchParams, contractors: readonly string[]) {
  const values = Array.from(new Set(contractors.flatMap((contractor) =>
    normalizeContractorName(contractor) === "hllogisticos"
      ? ["HL Logisticos", "HL Logistica", "HL Logísticos"]
      : [contractor]
  ))).map((value) => JSON.stringify(value)).join(",");
  params.set("or", `(contractor.in.(${values}),and(contractor.is.null,data->>contratista.in.(${values})))`);
  return params;
}
