import type { ModulacionRegistro } from "./modulacionStorage";

export function modulationAnnouncement(record: ModulacionRegistro) {
  const who = record.personaNombre?.trim();
  return `Nueva modulación. ${record.contratista || "Contratista sin identificar"}${who ? `, modulador ${who}` : ""}. ${record.totalCajas || "0"} cajas del DT ${record.dt}, cliente ${record.nombreCliente || record.codigoCliente}.${record.causal ? ` Causal: ${record.causal}.` : ""}`;
}

export function createModulationTracker(startedAt = Date.now()) {
  const seen = new Set<string>();
  let initialized = false;
  return (records: ModulacionRegistro[]) => {
    const fresh: ModulacionRegistro[] = [];
    for (const record of records) {
      if (!record.id) continue;
      const key = `${record.contratista}:${record.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (initialized && Date.parse(record.createdAt) >= startedAt) fresh.push(record);
    }
    initialized = true;
    return fresh.sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  };
}
