export type QuantityPair = { outbound: number; returned: number };

export type RtiSummary = {
  outboundTotal: number;
  returnedTotal: number;
  rtiPercentage: number;
};

export function summarizeQuantities(rows: readonly QuantityPair[]): RtiSummary {
  const outboundTotal = rows.reduce((sum, row) => sum + row.outbound, 0);
  const returnedTotal = rows.reduce((sum, row) => sum + row.returned, 0);
  return {
    outboundTotal,
    returnedTotal,
    rtiPercentage: outboundTotal ? Math.round((returnedTotal / outboundTotal) * 1_000) / 10 : 0,
  };
}

export function averageRti(rows: readonly QuantityPair[]) {
  const ratios = rows.filter((row) => row.outbound !== 0).map((row) => row.returned / row.outbound);
  return ratios.length ? Math.round((ratios.reduce((sum, ratio) => sum + ratio, 0) / ratios.length) * 1_000) / 10 : 0;
}

export function positiveMatchingKeys(outbound: ReadonlyMap<string, number>, returned: ReadonlyMap<string, number>) {
  return new Set(Array.from(outbound.keys()).filter((key) =>
    (outbound.get(key) ?? 0) > 0 && (returned.get(key) ?? 0) > 0
  ));
}

export type SkuBridgeEntry = {
  material: string;
  envase: string;
  descripcionEnvase: string;
  unidadesEnvase: number | null;
};

export type SkuBridgeValue = Omit<SkuBridgeEntry, "material">;

export function buildSkuBridge(entries: readonly SkuBridgeEntry[]) {
  const candidates = new Map<string, SkuBridgeEntry[]>();
  entries.forEach((entry) => {
    if (!entry.material) return;
    const values = candidates.get(entry.material) ?? [];
    values.push(entry);
    candidates.set(entry.material, values);
  });
  const conflicts: Array<{ material: string; envases: string[] }> = [];
  const byMaterial = new Map<string, SkuBridgeValue>();
  let materialsWithoutEnvase = 0;
  candidates.forEach((values, material) => {
    const envases = Array.from(new Set(values.map((value) => value.envase).filter(Boolean)));
    if (!envases.length) {
      materialsWithoutEnvase += 1;
      return;
    }
    if (envases.length > 1) {
      conflicts.push({ material, envases });
      return;
    }
    const selected = values.find((value) => value.envase === envases[0]);
    if (selected) byMaterial.set(material, {
      envase: selected.envase,
      descripcionEnvase: selected.descripcionEnvase,
      unidadesEnvase: selected.unidadesEnvase,
    });
  });
  return {
    byMaterial,
    conflicts,
    uniqueMaterials: candidates.size,
    duplicatedMaterials: Array.from(candidates.values()).filter((values) => values.length > 1).length,
    materialsWithoutEnvase,
  };
}
