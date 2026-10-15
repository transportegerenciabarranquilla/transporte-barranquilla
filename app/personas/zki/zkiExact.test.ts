import assert from "node:assert/strict";
import test from "node:test";
import loadHighs from "highs";
import { buildExactZkiModel, decodeExactZkiSolution, type ExactPlan } from "./zkiExact.ts";
import type { Candidate } from "./zkiEngine.ts";

const candidate = (rr: string, rrId: string, zki: number, auxiliaries: Array<{ name: string; id: string; zki: number }>): Candidate => ({
  rr, rrId, zki, auxiliary: auxiliaries[0].name, auxiliaryId: auxiliaries[0].id, auxiliaryZki: auxiliaries[0].zki,
  auxiliaryOptions: auxiliaries, totalZki: zki + auxiliaries[0].zki, driver: "Sin conductor", driverId: "", vehicle: "Sin placa",
  coverage: 0, frequency: 0, frequencyScore: 0, depth: zki, capacity: 0, viable: false, hasKnowledge: zki > 0,
  habitualVehicle: false, reason: "",
});
const trip = (id: string, weight = 9000): ExactPlan["trip"] => ({
  id, territoryId: id, date: "", zone: id, vehicle: "", assignedPlate: "", weight, maximumWeight: 0,
  cubicage: 0, clients: 1, trip: "1", raw: {},
});

test("optimiza RR y auxiliar juntos sin depender del VH histórico del RR", async () => {
  const aux = [{ name: "Auxiliar bajo", id: "11", zki: 0 }, { name: "Auxiliar alto", id: "12", zki: 80 }];
  const plans: ExactPlan[] = [
    { trip: trip("1"), candidates: [candidate("RR fuerte", "1", 100, aux), candidate("RR bajo", "2", 0, aux)] },
    { trip: trip("2"), candidates: [candidate("RR fuerte", "1", 100, aux), candidate("RR bajo", "2", 0, aux)] },
  ];
  const drivers = [{ name: "Conductor A", id: "21" }, { name: "Conductor B", id: "22" }];
  const pairs = [{ driver: "Conductor A", driverId: "21", plate: "COAAA111" }, { driver: "Conductor B", driverId: "22", plate: "COBBB222" }];
  const model = buildExactZkiModel(plans, drivers, pairs, [["aaa111", 9710], ["bbb222", 9710]], 75);
  const highs = await loadHighs();
  const result = highs.solve(model.lp, { output_flag: false, mip_rel_gap: 0 });
  assert.equal(result.Status, "Optimal");
  const choices = decodeExactZkiSolution(model, result.Columns, plans, 75);
  assert.equal(choices.filter((choice) => choice.viable).length, 2);
  assert.equal(new Set(choices.map((choice) => choice.driver?.id)).size, 2);
  assert.equal(new Set(choices.map((choice) => choice.auxiliary?.id)).size, 2);
});

test("un reemplazo no toma la placa habitual disponible de otro conductor", async () => {
  const aux = [{ name: "Auxiliar", id: "11", zki: 0 }];
  const plans: ExactPlan[] = [
    { trip: trip("1"), candidates: [candidate("RR uno", "1", 100, aux)] },
    { trip: trip("2"), candidates: [candidate("RR dos", "2", 100, [{ name: "Auxiliar dos", id: "12", zki: 0 }])] },
  ];
  const drivers = [{ name: "Conductor habitual", id: "21" }, { name: "Conductor reemplazo", id: "22" }];
  const pairs = [{ driver: "Conductor habitual", driverId: "21", plate: "COAAA111" }, { driver: "Conductor reemplazo", driverId: "22", plate: "COCCC333" }];
  const model = buildExactZkiModel(plans, drivers, pairs, [["aaa111", 9710], ["bbb222", 9710]], 75);
  const highs = await loadHighs();
  const result = highs.solve(model.lp, { output_flag: false, mip_rel_gap: 0 });
  assert.equal(result.Status, "Optimal");
  const choices = decodeExactZkiSolution(model, result.Columns, plans, 75);
  assert.equal(choices.filter((choice) => choice.viable).length, 2);
  assert.equal(choices.find((choice) => choice.driver?.id === "21")?.plate, "AAA111");
  assert.equal(choices.find((choice) => choice.driver?.id === "22")?.plate, "BBB222");
});

test("reparte el ZKI sobrante a una ruta pendiente sin reducir las rutas viables", async () => {
  const auxiliaries = [{ name: "Auxiliar fuerte", id: "11", zki: 100 }, { name: "Auxiliar de apoyo", id: "12", zki: 0 }];
  const plans: ExactPlan[] = [
    { trip: trip("1"), candidates: [candidate("RR fuerte", "1", 100, auxiliaries)] },
    { trip: trip("2"), candidates: [candidate("RR sin historial", "2", 0, auxiliaries)] },
  ];
  const drivers = [{ name: "Conductor", id: "21" }];
  const pairs = [{ driver: "Conductor", driverId: "21", plate: "COAAA111" }];
  const model = buildExactZkiModel(plans, drivers, pairs, [["aaa111", 9710]], 75);
  const highs = await loadHighs();
  const result = highs.solve(model.lp, { output_flag: false, mip_rel_gap: 0 });
  assert.equal(result.Status, "Optimal");
  const choices = decodeExactZkiSolution(model, result.Columns, plans, 75);
  assert.equal(choices.filter((choice) => choice.viable).length, 1);
  assert.equal(choices.find((choice) => choice.tripId === "2")?.auxiliary?.id, "11");
  assert.equal(choices.find((choice) => choice.tripId === "1")?.auxiliary?.id, "12");
});

test("reduce rutas tripuladas con ZKI cero cuando no cambia el número viable", async () => {
  const plans: ExactPlan[] = [
    { trip: trip("1"), candidates: [candidate("RR conocido", "1", 100, [{ name: "Auxiliar uno", id: "11", zki: 0 }])] },
    { trip: trip("2"), candidates: [candidate("RR A", "2", 70, [{ name: "Auxiliar dos", id: "12", zki: 0 }]), candidate("RR B", "3", 20, [{ name: "Auxiliar dos", id: "12", zki: 0 }])] },
    { trip: trip("3"), candidates: [candidate("RR A", "2", 20, [{ name: "Auxiliar tres", id: "13", zki: 0 }]), candidate("RR B", "3", 0, [{ name: "Auxiliar tres", id: "13", zki: 0 }])] },
  ];
  const drivers = ["21", "22", "23"].map((id) => ({ name: `Conductor ${id}`, id }));
  const pairs = drivers.map((driver, index) => ({ driver: driver.name, driverId: driver.id, plate: `COAAA11${index}` }));
  const model = buildExactZkiModel(plans, drivers, pairs, pairs.map((pair) => [pair.plate, 9710]), 75);
  const highs = await loadHighs();
  const result = highs.solve(model.lp, { output_flag: false, mip_rel_gap: 0 });
  assert.equal(result.Status, "Optimal");
  const choices = decodeExactZkiSolution(model, result.Columns, plans, 75);
  assert.equal(choices.filter((choice) => choice.viable).length, 1);
  assert.equal(choices.find((choice) => choice.tripId === "2")?.rrIndex, 1);
  assert.equal(choices.find((choice) => choice.tripId === "3")?.rrIndex, 0);
});
