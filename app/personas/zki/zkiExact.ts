import type { Candidate, DriverVehiclePair, Trip } from "./zkiEngine";

export type ExactPlan = { trip: Trip; candidates: Candidate[] };
export type ExactDriver = { name: string; id: string };
export type ExactChoice = { tripId: string; rrIndex: number; auxiliary?: { name: string; id: string; zki: number }; driver?: ExactDriver; plate?: string; capacity: number; viable: boolean };

type Variable = { name: string; score: number; kind: "rr" | "aux" | "vehicle" | "complete" | "viable" | "positiveZki" | "usefulZki"; trip: number; index: number };
type Constraint = { name: string; terms: Array<[string, number]>; relation: "<=" | ">=" | "="; value: number };

const personKey = (id: string, name: string) => {
  const digits = String(id || "").replace(/\D/g, "").replace(/^0+(?=\d)/, "");
  return digits ? `id${digits}` : `name${String(name || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "")}`;
};
const plateKey = (plate: string) => String(plate || "").toLowerCase().replace(/[^a-z0-9]/g, "").replace(/^co(?=[a-z]{3}\d{3}$)/, "");
const rounded = (value: number) => Math.round(Math.max(0, value) * 100) / 100;

export function buildExactZkiModel(plans: ExactPlan[], drivers: ExactDriver[], pairs: DriverVehiclePair[], capacityEntries: Array<[string, number]>, minimumZki: number) {
  const zkiCap = Math.max(0, Math.min(200, minimumZki));
  const maximumUsefulZki = plans.length * zkiCap;
  const maximumAssignments = plans.length * 3;
  const positiveScore = maximumUsefulZki + maximumAssignments + 1;
  const completeScore = plans.length * positiveScore + maximumUsefulZki + maximumAssignments + 1;
  const viableScore = plans.length * completeScore + plans.length * positiveScore + maximumUsefulZki + maximumAssignments + 1;
  const capacities = new Map(capacityEntries.map(([plate, capacity]) => [plateKey(plate), capacity]));
  const variables: Variable[] = [];
  const constraints: Constraint[] = [];
  const resourceTerms = new Map<string, Array<[string, number]>>();
  const addResource = (key: string, name: string) => resourceTerms.set(key, [...(resourceTerms.get(key) || []), [name, 1]]);
  const put = (variable: Variable) => { variables.push(variable); return variable.name; };
  const pairsByDriver = new Map<string, string[]>();
  pairs.forEach((pair) => {
    const key = personKey(pair.driverId, pair.driver);
    const plate = plateKey(pair.plate);
    if (plate) pairsByDriver.set(key, [...new Set([...(pairsByDriver.get(key) || []), plate])]);
  });
  const reservedHabitual = new Set(drivers.flatMap((driver) =>
    (pairsByDriver.get(personKey(driver.id, driver.name)) || []).filter((plate) => capacities.has(plate))));
  const eligibleDrivers = drivers.flatMap((driver) => {
    const habitual = pairsByDriver.get(personKey(driver.id, driver.name)) || [];
    if (!habitual.length) return [];
    const availableHabitual = habitual.filter((plate) => capacities.has(plate));
    const plates = availableHabitual.length ? availableHabitual : [...capacities.keys()].filter((plate) => !reservedHabitual.has(plate));
    return plates.map((plate) => ({ driver, plate, capacity: capacities.get(plate) || 0 }));
  }).filter((entry) => entry.capacity > 0);
  const rrOptions: Candidate[][] = [];
  const auxiliaryOptions: Array<Array<{ name: string; id: string; zki: number }>> = [];
  const vehicleOptions: Array<typeof eligibleDrivers> = [];

  plans.forEach(({ trip, candidates }, tripIndex) => {
    const rrByPerson = new Map<string, Candidate>();
    candidates.forEach((candidate) => {
      const key = personKey(candidate.rrId, candidate.rr);
      const previous = rrByPerson.get(key);
      if (key !== "name" && (!previous || candidate.zki > previous.zki)) rrByPerson.set(key, candidate);
    });
    const rr = [...rrByPerson.values()];
    const auxByPerson = new Map<string, { name: string; id: string; zki: number }>();
    candidates.forEach((candidate) => {
      [...(candidate.auxiliaryOptions || []), { name: candidate.auxiliary, id: candidate.auxiliaryId, zki: candidate.auxiliaryZki }].forEach((option) => {
        const key = personKey(option.id, option.name);
        if (!option.name || option.name.toLowerCase().startsWith("sin ") || key === "name") return;
        const previous = auxByPerson.get(key);
        if (!previous || option.zki > previous.zki) auxByPerson.set(key, option);
      });
    });
    const aux = [...auxByPerson.values()];
    const vehicle = eligibleDrivers.filter((entry) => entry.capacity >= trip.weight);
    rrOptions.push(rr);
    auxiliaryOptions.push(aux);
    vehicleOptions.push(vehicle);
    const rrNames = rr.map((item, index) => {
      const name = put({ name: `r${tripIndex}_${index}`, score: 1, kind: "rr", trip: tripIndex, index });
      addResource(`person:${personKey(item.rrId, item.rr)}`, name);
      return name;
    });
    const auxNames = aux.map((item, index) => {
      const name = put({ name: `a${tripIndex}_${index}`, score: 1, kind: "aux", trip: tripIndex, index });
      addResource(`person:${personKey(item.id, item.name)}`, name);
      return name;
    });
    const vehicleNames = vehicle.map((item, index) => {
      const name = put({ name: `v${tripIndex}_${index}`, score: 1, kind: "vehicle", trip: tripIndex, index });
      addResource(`person:${personKey(item.driver.id, item.driver.name)}`, name);
      addResource(`plate:${item.plate}`, name);
      return name;
    });
    const complete = put({ name: `c${tripIndex}`, score: completeScore, kind: "complete", trip: tripIndex, index: 0 });
    const viable = put({ name: `z${tripIndex}`, score: viableScore, kind: "viable", trip: tripIndex, index: 0 });
    const positiveZki = put({ name: `p${tripIndex}`, score: positiveScore, kind: "positiveZki", trip: tripIndex, index: 0 });
    const usefulZki = put({ name: `q${tripIndex}`, score: 1, kind: "usefulZki", trip: tripIndex, index: 0 });
    for (const [type, names] of [["rr", rrNames], ["aux", auxNames], ["vehicle", vehicleNames]] as const) {
      constraints.push({ name: `one_${type}_${tripIndex}`, terms: names.map((name): [string, number] => [name, 1]), relation: "<=", value: 1 });
      constraints.push({ name: `crew_${type}_${tripIndex}`, terms: [[complete, 1], ...names.map((name): [string, number] => [name, -1])], relation: "<=", value: 0 });
    }
    constraints.push({ name: `viable_crew_${tripIndex}`, terms: [[viable, 1], [complete, -1]], relation: "<=", value: 0 });
    constraints.push({ name: `positive_crew_${tripIndex}`, terms: [[positiveZki, 1], [complete, -1]], relation: "<=", value: 0 });
    constraints.push({ name: `threshold_${tripIndex}`, terms: [[viable, minimumZki], ...rrNames.map((name, index): [string, number] => [name, -rounded(rr[index].zki)]), ...auxNames.map((name, index): [string, number] => [name, -rounded(aux[index].zki)])], relation: "<=", value: 0 });
    constraints.push({ name: `positive_zki_${tripIndex}`, terms: [[positiveZki, 0.01], ...rrNames.map((name, index): [string, number] => [name, -rounded(rr[index].zki)]), ...auxNames.map((name, index): [string, number] => [name, -rounded(aux[index].zki)])], relation: "<=", value: 0 });
    constraints.push({ name: `useful_zki_${tripIndex}`, terms: [[usefulZki, 1], ...rrNames.map((name, index): [string, number] => [name, -rounded(rr[index].zki)]), ...auxNames.map((name, index): [string, number] => [name, -rounded(aux[index].zki)])], relation: "<=", value: 0 });
  });
  let resourceIndex = 0;
  resourceTerms.forEach((terms) => constraints.push({ name: `resource_${resourceIndex++}`, terms, relation: "<=", value: 1 }));
  const expression = (terms: Array<[string, number]>) => terms.length
    ? terms.map(([name, coefficient], index) => `${index && coefficient >= 0 ? "+ " : coefficient < 0 ? "- " : ""}${Math.abs(coefficient)} ${name}`).join(" ")
    : "0 zero_anchor";
  const lp = ["Maximize", `objective: ${expression(variables.map((item) => [item.name, item.score]).filter(([, score]) => score !== 0) as Array<[string, number]>)}`,
    "Subject To", ...constraints.map((item) => `${item.name}: ${expression(item.terms)} ${item.relation} ${item.value}`),
    "Bounds", "zero_anchor = 0", ...variables.filter((item) => item.kind === "usefulZki").map((item) => `0 <= ${item.name} <= ${zkiCap}`),
    "Binaries", ...variables.filter((item) => item.kind !== "usefulZki").map((item) => item.name), "End"].join("\n");
  return { lp, variables, rrOptions, auxiliaryOptions, vehicleOptions };
}

export function decodeExactZkiSolution(model: ReturnType<typeof buildExactZkiModel>, primal: Record<string, { Primal: number }>, plans: ExactPlan[], minimumZki: number): ExactChoice[] {
  const chosen = new Map<string, Variable>();
  model.variables.filter((variable) => primal[variable.name]?.Primal > 0.5).forEach((variable) => chosen.set(`${variable.trip}:${variable.kind}`, variable));
  return plans.flatMap(({ trip }, index) => {
    const rr = chosen.get(`${index}:rr`);
    const aux = chosen.get(`${index}:aux`);
    const vehicle = chosen.get(`${index}:vehicle`);
    if (!rr) return [];
    const selectedAux = aux ? model.auxiliaryOptions[index][aux.index] : undefined;
    const selectedVehicle = vehicle ? model.vehicleOptions[index][vehicle.index] : undefined;
    return [{ tripId: trip.id, rrIndex: plans[index].candidates.indexOf(model.rrOptions[index][rr.index]), auxiliary: selectedAux,
      driver: selectedVehicle?.driver, plate: selectedVehicle?.plate.toUpperCase(), capacity: selectedVehicle?.capacity || 0,
      viable: Boolean(selectedAux && selectedVehicle && rounded(model.rrOptions[index][rr.index].zki + selectedAux.zki) >= minimumZki) }];
  });
}
