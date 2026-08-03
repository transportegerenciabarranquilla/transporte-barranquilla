import assert from "node:assert/strict";
import test from "node:test";
import { averageRti, buildSkuBridge, isSkuUniverseContainer, positiveMatchingKeys, summarizeQuantities, type QuantityPair } from "./rtiCalculation.ts";

test("divide la suma de retornos por la suma de salidas", () => {
  assert.deepEqual(summarizeQuantities([{ outbound: 100, returned: 90 }, { outbound: 300, returned: 240 }]), {
    outboundTotal: 400,
    returnedTotal: 330,
    rtiPercentage: 82.5,
  });
});

test("agrupa implícitamente varias filas de la misma llave sin cambiar la razón de totales", () => {
  assert.equal(summarizeQuantities([{ outbound: 40, returned: 10 }, { outbound: 60, returned: 80 }]).rtiPercentage, 90);
});

test("conserva una llave solo salida", () => {
  assert.equal(summarizeQuantities([{ outbound: 100, returned: 0 }]).rtiPercentage, 0);
});

test("conserva una llave solo retorno sin dividir por cero", () => {
  assert.deepEqual(summarizeQuantities([{ outbound: 0, returned: 25 }]), { outboundTotal: 0, returnedTotal: 25, rtiPercentage: 0 });
});

test("DT repetidos en fechas distintas aportan ambas cantidades", () => {
  const rows: QuantityPair[] = [{ outbound: 50, returned: 45 }, { outbound: 50, returned: 50 }];
  assert.equal(summarizeQuantities(rows).rtiPercentage, 95);
});

test("responsables distintos conservan sus aportes al total", () => {
  assert.equal(summarizeQuantities([{ outbound: 80, returned: 72 }, { outbound: 20, returned: 10 }]).returnedTotal, 82);
});

test("un subconjunto que representa julio de 2026 se resume de forma independiente", () => {
  assert.equal(summarizeQuantities([{ outbound: 200, returned: 198 }]).rtiPercentage, 99);
});

test("una exclusión DAX se representa filtrando exactamente antes de resumir", () => {
  const included = [{ outbound: 100, returned: 99 }];
  assert.equal(summarizeQuantities(included).rtiPercentage, 99);
});

test("AVERAGEX por DT está disponible como operación distinta", () => {
  assert.equal(averageRti([{ outbound: 100, returned: 100 }, { outbound: 900, returned: 0 }]), 50);
});

test("demuestra que división de totales y AVERAGEX por DT no son equivalentes", () => {
  const rows = [{ outbound: 100, returned: 100 }, { outbound: 900, returned: 0 }];
  assert.equal(summarizeQuantities(rows).rtiPercentage, 10);
  assert.equal(averageRti(rows), 50);
});

test("mapea material de producto hacia envase", () => {
  const bridge = buildSkuBridge([{ material: "3128", envase: "3500162", descripcionEnvase: "Envase A", unidadesEnvase: 30 }]);
  assert.equal(bridge.byMaterial.get("3128")?.envase, "3500162");
});

test("permite que varios materiales apunten al mismo envase", () => {
  const bridge = buildSkuBridge([
    { material: "9480", envase: "3500888", descripcionEnvase: "Envase", unidadesEnvase: null },
    { material: "9494", envase: "3500888", descripcionEnvase: "Envase", unidadesEnvase: null },
  ]);
  assert.equal(bridge.byMaterial.size, 2);
  assert.equal(bridge.conflicts.length, 0);
});

test("no selecciona arbitrariamente un material con envases conflictivos", () => {
  const bridge = buildSkuBridge([
    { material: "1234", envase: "3500001", descripcionEnvase: "A", unidadesEnvase: null },
    { material: "1234", envase: "3500002", descripcionEnvase: "B", unidadesEnvase: null },
  ]);
  assert.equal(bridge.byMaterial.has("1234"), false);
  assert.deepEqual(bridge.conflicts, [{ material: "1234", envases: ["3500001", "3500002"] }]);
});

test("reporta materiales sin envase", () => {
  const bridge = buildSkuBridge([{ material: "9999", envase: "", descripcionEnvase: "", unidadesEnvase: null }]);
  assert.equal(bridge.materialsWithoutEnvase, 1);
});

type VisibleRecord = QuantityPair & { key: string; responsible: string; reference: string; carrier: string };

const visibleFixture: VisibleRecord[] = [
  { key: "A", outbound: 100, returned: 90, responsible: "Ana", reference: "3501", carrier: "Uno" },
  { key: "B", outbound: 50, returned: 40, responsible: "Luis", reference: "3502", carrier: "Dos" },
];

function aggregateVisible(records: VisibleRecord[], dimension: keyof Pick<VisibleRecord, "responsible" | "reference" | "carrier">) {
  const groups = new Map<string, QuantityPair>();
  records.forEach((record) => {
    const current = groups.get(record[dimension]) ?? { outbound: 0, returned: 0 };
    current.outbound += record.outbound;
    current.returned += record.returned;
    groups.set(record[dimension], current);
  });
  return summarizeQuantities(Array.from(groups.values()));
}

test("una llave solo salida no pertenece al escenario matchingKeysOnly", () => {
  const keys = positiveMatchingKeys(new Map([["A", 100], ["ONLY_OUT", 25]]), new Map([["A", 90]]));
  assert.equal(keys.has("ONLY_OUT"), false);
});

test("una llave solo retorno no pertenece al escenario matchingKeysOnly", () => {
  const keys = positiveMatchingKeys(new Map([["A", 100]]), new Map([["A", 90], ["ONLY_RETURN", 25]]));
  assert.equal(keys.has("ONLY_RETURN"), false);
});

test("el universo SKU conserva un envase catalogado aunque exista en un solo lado", () => {
  const validContainers = new Set(["3500162"]);
  assert.equal(isSkuUniverseContainer("3500162", validContainers), true);
});

test("el universo SKU excluye materiales que no son envases del catÃ¡logo", () => {
  const validContainers = new Set(["3500162"]);
  assert.equal(isSkuUniverseContainer("22102", validContainers), false);
  assert.equal(isSkuUniverseContainer("UNMAPPED-22102", validContainers), false);
});

test("el total por responsables coincide con summary", () => {
  assert.deepEqual(aggregateVisible(visibleFixture, "responsible"), summarizeQuantities(visibleFixture));
});

test("el total por referencias coincide con summary", () => {
  assert.deepEqual(aggregateVisible(visibleFixture, "reference"), summarizeQuantities(visibleFixture));
});

test("el total por transportistas coincide con summary", () => {
  assert.deepEqual(aggregateVisible(visibleFixture, "carrier"), summarizeQuantities(visibleFixture));
});

test("el RTI general coincide con la agregación visible", () => {
  assert.equal(summarizeQuantities(visibleFixture).rtiPercentage, 86.7);
});

test("los filtros se aplican antes de recalcular las coincidencias", () => {
  const outbound = new Map([["A", 100], ["B", 50]]);
  const returnedAfterFilter = new Map([["A", 90]]);
  assert.deepEqual(Array.from(positiveMatchingKeys(outbound, returnedAfterFilter)), ["A"]);
});
