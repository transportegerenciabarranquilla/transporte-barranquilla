export type RawRow = Record<string, unknown>;
export type DriverVehiclePair = { plate: string; driver: string; driverId: string; responsible?: string; responsibleId?: string };

export type Trip = {
  id: string;
  territoryId: string;
  date: string;
  zone: string;
  vehicle: string;
  assignedPlate: string;
  weight: number;
  maximumWeight: number;
  cubicage: number;
  clients: number;
  trip: string;
  raw: RawRow;
};

export type CrewHistory = {
  rr: string;
  rrId: string;
  driver: string;
  driverId: string;
  vehicle: string;
  zone: string;
  clients: number;
  visited: number;
  date: string;
};

export type ZkiVisit = {
  rr: string;
  rrId?: string;
  client: string;
  zone: string;
  neighborhood?: string;
  driver: string;
  vehicle: string;
  role?: string;
  count?: number;
};

export type TerritoryClient = { territoryId: string; client: string; neighborhood: string; weight: number };

export type Candidate = {
  rr: string;
  rrId: string;
  driver: string;
  driverId: string;
  vehicle: string;
  coverage: number;
  frequency: number;
  frequencyScore: number;
  depth: number;
  uniqueClients?: number;
  territoryClients?: number;
  zki: number;
  auxiliary: string;
  auxiliaryId: string;
  auxiliaryZki: number;
  auxiliaryOptions?: Array<{ name: string; id: string; zki: number }>;
  totalZki: number;
  previousClients?: number;
  workloadAdjustment?: number;
  capacity: number;
  viable: boolean;
  hasKnowledge: boolean;
  habitualVehicle: boolean;
  reason: string;
};

export type ZkiSettings = {
  coverageWeight: number;
  frequencyWeight: number;
  depthWeight: number;
  frequencyCap: number;
  minimumZki: number;
  depthThreshold: number;
  crewRetentionPercent: number;
};

export const DEFAULT_ZKI_SETTINGS: ZkiSettings = {
  coverageWeight: 0,
  frequencyWeight: 0,
  depthWeight: 100,
  frequencyCap: 5,
  minimumZki: 75,
  depthThreshold: 5,
  crewRetentionPercent: 70,
};

// El RR elegido por ZKI no depende de su pareja histórica.
export function assignFreeResponsiblesToDriverVehicles<T extends { trip: Trip; candidates?: Candidate[]; recommendation?: Candidate }>(
  plans: T[], pairs: DriverVehiclePair[], capacities: Map<string, number>, minimumZki = DEFAULT_ZKI_SETTINGS.minimumZki,
) {
  const fixedPairs = pairs.map(({ plate, driver, driverId }) => ({ plate, driver, driverId }));
  return assignDriverVehiclePairs(plans, fixedPairs, capacities, minimumZki, 0);
}

// El conductor conserva su placa habitual si está habilitada. Solo cuando
// ninguna de sus placas habituales está habilitada puede usar otro VH.
export function assignFlexibleDriversToVehicles<T extends { trip: Trip; recommendation?: Candidate }>(
  plans: T[],
  drivers: Array<{ name: string; id: string }>,
  pairs: DriverVehiclePair[],
  capacities: Map<string, number>,
  minimumZki = DEFAULT_ZKI_SETTINGS.minimumZki,
) {
  const occupied = plans.flatMap(({ recommendation }) => recommendation
    ? [{ id: recommendation.rrId, name: recommendation.rr }, { id: recommendation.auxiliaryId, name: recommendation.auxiliary }]
    : []);
  const freeDrivers: Array<{ name: string; id: string; habitualPlates: string[]; canUseAnotherVehicle: boolean }> = [];
  drivers.forEach((driver) => {
    if (!driver.name || !driver.id || occupied.some((person) => samePerson(person.id, person.name, driver.id, driver.name))) return;
    if (freeDrivers.some((person) => samePerson(person.id, person.name, driver.id, driver.name))) return;
    const habitualPlates = [...new Set(pairs
      .filter((pair) => samePerson(pair.driverId, pair.driver, driver.id, driver.name))
      .map((pair) => normalizeVehicleKey(pair.plate))
      .filter(Boolean))];
    if (!habitualPlates.length) return;
    freeDrivers.push({ ...driver, habitualPlates, canUseAnotherVehicle: habitualPlates.every((plate) => !capacities.has(plate)) });
  });
  const vehicles = [...capacities.entries()]
    .filter(([, capacity]) => capacity > 0)
    .map(([plate, capacity]) => ({ plate, capacity }));
  const reservedHabitual = new Set(freeDrivers.flatMap((driver) => driver.habitualPlates.filter((plate) => capacities.has(plate))));
  // Primero se forman parejas conductor-VH válidas. El puntaje prioriza
  // cantidad de parejas y luego la placa habitual frente al reemplazo.
  const columns = Math.max(freeDrivers.length, vehicles.length);
  const weights = freeDrivers.map((driver) => Array.from({ length: columns }, (_, column) => {
    const vehicle = vehicles[column];
    if (!vehicle || (!driver.canUseAnotherVehicle && !driver.habitualPlates.includes(vehicle.plate))
      || (driver.canUseAnotherVehicle && reservedHabitual.has(vehicle.plate))) return 0;
    return 1_000_000 + (driver.habitualPlates.includes(vehicle.plate) ? 1_000 : 0) + vehicle.capacity / 100_000;
  }));
  const assignment = maximumWeightAssignment(weights);
  const usablePairs = freeDrivers.flatMap((driver, index) => {
    const column = assignment[index];
    const vehicle = column >= 0 ? vehicles[column] : undefined;
    if (!vehicle || weights[index][column] <= 0) return [];
    return [{ plate: vehicle.plate, driver: driver.name, driverId: driver.id, key: vehicle.plate, capacity: vehicle.capacity }];
  });
  const result = assignFreeDriverPairsGlobally(plans, usablePairs, minimumZki);
  result.forEach((candidate, tripId) => {
    if (!candidate.driverId) return;
    const driver = freeDrivers.find((person) => samePerson(person.id, person.name, candidate.driverId, candidate.driver));
    const habitual = Boolean(driver?.habitualPlates.includes(normalizeVehicleKey(candidate.vehicle)));
    result.set(tripId, {
      ...candidate,
      habitualVehicle: habitual,
      reason: candidate.totalZki >= minimumZki
        ? habitual ? "Viable: conductor con su placa habitual habilitada." : "Viable: placa habitual indisponible; conductor en otro VH habilitado."
        : candidate.reason,
    });
  });
  return result;
}

export function assignResponsiblesWithCrewRetention(
  plans: Array<{ tripId: string; candidates: Candidate[] }>,
  pairs: DriverVehiclePair[],
  retentionPercent: number,
  minimumZki = DEFAULT_ZKI_SETTINGS.minimumZki,
) {
  const pairByResponsible = new Map<string, DriverVehiclePair[]>();
  pairs.forEach((pair) => {
    const key = personIdentity(pair.responsibleId || "", pair.responsible || "");
    if (key) pairByResponsible.set(key, [...(pairByResponsible.get(key) || []), pair]);
  });
  const target = Math.min(plans.length, Math.ceil(plans.length * Math.max(0, Math.min(100, retentionPercent)) / 100));
  if (!target) return assignUniqueResponsibles(plans, minimumZki);
  const result = new Map<string, Candidate>();
  const usedRr = new Set<string>();
  const usedPlates = new Set<string>();

  // Se parte de la mejor distribuciÃ³n ZKI global. De esa cadena se reservan
  // las parejas habituales necesarias, evitando que el porcentaje de
  // retenciÃ³n deje un RR en un territorio peor solo por el orden de las filas.
  const optimal = assignUniqueResponsibles(plans, minimumZki);
  [...optimal.entries()]
    .sort((left, right) => candidatePriority(right[1], minimumZki) - candidatePriority(left[1], minimumZki))
    .some(([tripId, selected]) => {
      const rrKey = personIdentity(selected.rrId, selected.rr);
      const pair = (pairByResponsible.get(rrKey) || []).find((item) => !usedPlates.has(normalizeVehicleKey(item.plate)));
      if (!pair) return false;
      result.set(tripId, selected);
      usedRr.add(rrKey);
      usedPlates.add(normalizeVehicleKey(pair.plate));
      return result.size >= target;
    });

  // Si la soluciÃ³n global no alcanza el objetivo porque alguno de sus RR no
  // tiene pareja catalogada, completa la reserva con la mejor alternativa.
  if (result.size < target) {
    plans.filter((plan) => !result.has(plan.tripId)).some((plan) => {
      const selected = plan.candidates.find((candidate) => {
        const rrKey = personIdentity(candidate.rrId, candidate.rr);
        return rrKey && !usedRr.has(rrKey) && (pairByResponsible.get(rrKey) || []).some((pair) => !usedPlates.has(normalizeVehicleKey(pair.plate)));
      });
      if (!selected) return false;
      const rrKey = personIdentity(selected.rrId, selected.rr);
      const pair = (pairByResponsible.get(rrKey) || []).find((item) => !usedPlates.has(normalizeVehicleKey(item.plate)));
      if (!pair) return false;
      result.set(plan.tripId, selected);
      usedRr.add(rrKey);
      usedPlates.add(normalizeVehicleKey(pair.plate));
      return result.size >= target;
    });
  }

  const remaining = plans
    .filter((plan) => !result.has(plan.tripId))
    .map((plan) => ({ ...plan, candidates: plan.candidates.filter((candidate) => !usedRr.has(personIdentity(candidate.rrId, candidate.rr))) }));
  assignUniqueResponsibles(remaining, minimumZki).forEach((candidate, tripId) => result.set(tripId, candidate));
  return result;
}

export function assignUniqueResponsibles(plans: Array<{ tripId: string; candidates: Candidate[] }>, minimumZki = DEFAULT_ZKI_SETTINGS.minimumZki) {
  const responsibleKey = responsibleIdentityFor(plans);
  const rrKeys = Array.from(new Set(plans.flatMap((plan) => plan.candidates.map(responsibleKey)))).filter(Boolean);
  const columnCount = Math.max(plans.length, rrKeys.length);
  if (!plans.length || !columnCount) return new Map<string, Candidate>();
  const rrIndex = new Map(rrKeys.map((key, index) => [key, index]));
  const candidateMatrix = plans.map((plan) => {
    const row = new Array<Candidate | undefined>(columnCount);
    plan.candidates.forEach((candidate) => {
      const index = rrIndex.get(responsibleKey(candidate));
      if (index === undefined) return;
      const current = row[index];
      // Un registro de respaldo de Conductores-placas puede representar al
      // mismo RR que un candidato histórico. Nunca debe borrar su ZKI real.
      if (!current || candidatePriority(candidate, minimumZki) > candidatePriority(current, minimumZki)) row[index] = candidate;
    });
    return row;
  });
  // La viabilidad de RR + auxiliar se optimiza sin amarrarla al VH histórico:
  // los vehículos se redistribuyen después según peso y disponibilidad.
  // Cada nivel debe pesar más que la suma de todos los niveles inferiores.
  // Primero se conservan las rutas asignadas y después se maximiza cuántas
  // cumplen el umbral combinado sin perder el historial del responsable.
  const scoreBound = Math.max(1, ...plans.flatMap(plan => plan.candidates.map(candidate => Math.abs(candidate.totalZki) + Math.abs(candidate.workloadAdjustment || 0))));
  const knowledgeBonus = plans.length * scoreBound * 2 + 1;
  const viableBonus = plans.length * (knowledgeBonus + scoreBound * 2) + 1;
  const assignedBonus = plans.length * (viableBonus + knowledgeBonus + scoreBound * 2) + 1;
  const weights = candidateMatrix.map((row) => row.map((candidate) => candidate
    ? assignedBonus
      + candidate.totalZki
      + (candidate.workloadAdjustment || 0)
      + candidate.coverage / 100
      // El historial y el ZKI total resuelven los empates de viabilidad.
      + (candidate.hasKnowledge ? knowledgeBonus : 0)
      + (candidate.totalZki >= minimumZki ? viableBonus : 0)
    : 0));
  const assignment = maximumWeightAssignment(weights);
  const result = new Map<string, Candidate>();
  assignment.forEach((column, row) => {
    const candidate = column >= 0 ? candidateMatrix[row][column] : undefined;
    if (candidate) result.set(plans[row].tripId, candidate);
  });
  // En esta etapa solo se optimizan los RR. La tripulación histórica del
  // candidato no puede eliminar rutas porque conductor y vehículo se asignan
  // después desde el catálogo Conductores-placas.
  return improveResponsibleDistribution(plans, result, minimumZki, responsibleKey);
}

function responsibleIdentityFor(plans: Array<{ candidates: Candidate[] }>) {
  const parents = new Map<string, string>();
  const find = (key: string): string => {
    const parent = parents.get(key);
    if (!parent) { parents.set(key, key); return key; }
    if (parent === key) return key;
    const root = find(parent);
    parents.set(key, root);
    return root;
  };
  plans.forEach(({ candidates }) => candidates.forEach((candidate) => {
    const id = String(candidate.rrId || "").replace(/\D/g, "").replace(/^0+(?=\d)/, "");
    const name = normalizePersonName(candidate.rr || "");
    if (!id || !name || name.startsWith("sin")) return;
    const idKey = `id:${id}`;
    const nameKey = `name:${name}`;
    parents.set(find(nameKey), find(idKey));
  }));
  return (candidate: Candidate) => {
    const id = String(candidate.rrId || "").replace(/\D/g, "").replace(/^0+(?=\d)/, "");
    const name = normalizePersonName(candidate.rr || "");
    if (id) return find(`id:${id}`);
    return name && !name.startsWith("sin") ? find(`name:${name}`) : "";
  };
}

function candidatePriority(candidate: Candidate, minimumZki: number) {
  return (candidate.totalZki >= minimumZki ? 1_000_000 : 0)
    + (candidate.hasKnowledge ? 100_000 : 0)
    + candidate.totalZki
    + (candidate.workloadAdjustment || 0)
    + candidate.coverage / 100;
}

function improveResponsibleDistribution(
  plans: Array<{ tripId: string; candidates: Candidate[] }>,
  initial: Map<string, Candidate>,
  minimumZki: number,
  responsibleKey: (candidate: Candidate) => string,
) {
  if (plans.length < 2) return initial;
  const options = new Map(plans.map((plan) => {
    const byResponsible = new Map<string, Candidate>();
    plan.candidates.forEach((candidate) => {
      const key = responsibleKey(candidate);
      const current = byResponsible.get(key);
      if (key && (!current || candidatePriority(candidate, minimumZki) > candidatePriority(current, minimumZki))) byResponsible.set(key, candidate);
    });
    return [plan.tripId, byResponsible] as const;
  }));
  const score = (assignments: Map<string, Candidate>) => {
    const matched = removeRepeatedAuxiliaries(assignments, minimumZki);
    let viable = 0;
    let complete = 0;
    let balancedTotal = 0;
    let total = 0;
    let coveredClients = 0;
    matched.forEach((candidate) => {
      const hasAuxiliary = Boolean(candidate.auxiliary && !normalize(candidate.auxiliary).startsWith("sin"));
      if (hasAuxiliary) complete += 1;
      if (hasAuxiliary && candidate.totalZki >= minimumZki) viable += 1;
      const combined = hasAuxiliary ? candidate.totalZki : candidate.zki;
      balancedTotal += Math.min(combined, Math.max(100, minimumZki * 2));
      total += combined;
      coveredClients += candidate.uniqueClients || 0;
    });
    return [viable, complete, Math.round(balancedTotal * 100), Math.round(total * 100), coveredClients];
  };
  const better = (left: number[], right: number[]) => {
    for (let index = 0; index < left.length; index += 1) {
      if (left[index] !== right[index]) return left[index] > right[index];
    }
    return false;
  };
  let selected = initial;
  let selectedScore = score(selected);
  if (plans.length > 1) {
    const responsibleKeys = Array.from(new Set(plans.flatMap((plan) => plan.candidates.map(responsibleKey)))).filter(Boolean);
    const columnCount = Math.max(plans.length, responsibleKeys.length);
    const responsibleIndex = new Map(responsibleKeys.map((key, index) => [key, index]));
    const knowledgeBonus = plans.length * 200 + 1;
    const viableBonus = plans.length * (knowledgeBonus + 200) + 1;
    const assignedBonus = plans.length * (viableBonus + knowledgeBonus + 200) + 1;
    const matrix = plans.map((plan) => {
      const row = new Array<Candidate | undefined>(columnCount);
      options.get(plan.tripId)?.forEach((candidate, key) => {
        const index = responsibleIndex.get(key);
        if (index !== undefined) row[index] = candidate;
      });
      return row;
    });
    const weightsFor = (matched: Map<string, Candidate>) => matrix.map((row, rowIndex) => row.map((candidate) => {
      if (!candidate) return 0;
      const selectedAuxiliary = matched.get(plans[rowIndex].tripId);
      const auxiliary = candidate.auxiliaryOptions?.find((option) =>
        selectedAuxiliary && samePerson(option.id, option.name, selectedAuxiliary.auxiliaryId, selectedAuxiliary.auxiliary))
        || (selectedAuxiliary && samePerson(candidate.auxiliaryId, candidate.auxiliary, selectedAuxiliary.auxiliaryId, selectedAuxiliary.auxiliary)
          ? { name: candidate.auxiliary, id: candidate.auxiliaryId, zki: candidate.auxiliaryZki } : undefined);
      const hasAuxiliary = Boolean(auxiliary && !samePerson(candidate.rrId, candidate.rr, auxiliary.id, auxiliary.name));
      const combined = candidate.zki + (hasAuxiliary ? auxiliary!.zki : 0);
      return assignedBonus
        + (hasAuxiliary && combined >= minimumZki ? viableBonus : 0)
        + (candidate.hasKnowledge ? knowledgeBonus : 0)
        + Math.min(combined, Math.max(100, minimumZki * 2))
        + candidate.coverage / 100;
    }));
    for (let pass = 0; pass < 4; pass += 1) {
      const matched = removeRepeatedAuxiliaries(selected, minimumZki);
      const columns = maximumWeightAssignment(weightsFor(matched));
      const trial = new Map<string, Candidate>();
      columns.forEach((column, row) => {
        const candidate = column >= 0 ? matrix[row][column] : undefined;
        if (candidate) trial.set(plans[row].tripId, candidate);
      });
      const trialScore = score(trial);
      if (!better(trialScore, selectedScore)) break;
      selected = trial;
      selectedScore = trialScore;
    }
    // Fijar temporalmente un RR en una ruta pendiente permite mover al RR
    // desplazado a una tercera ruta. Después se redistribuyen TODOS los
    // auxiliares y solo se acepta una mejora real del número de rutas viables.
    for (let pass = 0; pass < 2; pass += 1) {
      const matched = removeRepeatedAuxiliaries(selected, minimumZki);
      const baseWeights = weightsFor(matched);
      let best = selected;
      let bestScore = selectedScore;
      for (let row = 0; row < plans.length; row += 1) {
        const tripId = plans[row].tripId;
        const current = matched.get(tripId);
        if (current?.auxiliary && !normalize(current.auxiliary).startsWith("sin") && current.totalZki >= minimumZki) continue;
        const alternatives = matrix[row]
          .flatMap((candidate, column) => candidate ? [{ candidate, column }] : [])
          .filter(({ candidate }) => candidate.zki + Math.max(candidate.auxiliaryZki, ...(candidate.auxiliaryOptions || []).map((option) => option.zki)) >= minimumZki)
          .sort((left, right) => right.candidate.zki - left.candidate.zki || candidatePriority(right.candidate, minimumZki) - candidatePriority(left.candidate, minimumZki));
        for (const { column } of alternatives) {
          if (selected.get(tripId) === matrix[row][column]) continue;
          const trialWeights = baseWeights.map((weights, otherRow) => weights.map((weight, otherColumn) =>
            otherRow === row ? (otherColumn === column ? weight : -1e12) : otherColumn === column ? -1e12 : weight));
          const columns = maximumWeightAssignment(trialWeights);
          const trial = new Map<string, Candidate>();
          columns.forEach((assignedColumn, assignedRow) => {
            const candidate = assignedColumn >= 0 ? matrix[assignedRow][assignedColumn] : undefined;
            if (candidate) trial.set(plans[assignedRow].tripId, candidate);
          });
          if (trial.get(tripId) !== matrix[row][column]) continue;
          const trialScore = score(trial);
          if (better(trialScore, bestScore)) {
            best = trial;
            bestScore = trialScore;
          }
        }
      }
      if (!better(bestScore, selectedScore)) break;
      selected = best;
      selectedScore = bestScore;
    }
    return selected;
  }
  return selected;
}

export function enforceUniqueAssignedCrew(plans: Array<{ tripId: string; recommendation?: Candidate }>, minimumZki = DEFAULT_ZKI_SETTINGS.minimumZki) {
  const selected = plans.flatMap((plan) => plan.recommendation ? [{ tripId: plan.tripId, candidate: plan.recommendation }] : []);
  const keep = new Set(selected.map((item) => item.tripId));
  selected.forEach((left, index) => {
    if (!keep.has(left.tripId)) return;
    selected.slice(index + 1).forEach((right) => {
      if (!keep.has(left.tripId) || !keep.has(right.tripId)
        || !samePerson(left.candidate.rrId, left.candidate.rr, right.candidate.rrId, right.candidate.rr)) return;
      if (candidatePriority(right.candidate, minimumZki) > candidatePriority(left.candidate, minimumZki)) keep.delete(left.tripId);
      else keep.delete(right.tripId);
    });
  });
  const assignments = new Map(selected.flatMap(({ tripId, candidate }) => keep.has(tripId) ? [[tripId, candidate] as const] : []));
  return removeRepeatedAuxiliaries(assignments, minimumZki);
}

export function assignDriverVehiclePairs<T extends { trip: Trip; candidates?: Candidate[]; recommendation?: Candidate }>(
  plans: T[],
  pairs: DriverVehiclePair[],
  capacities: Map<string, number>,
  minimumZki = DEFAULT_ZKI_SETTINGS.minimumZki,
  retentionPercent = DEFAULT_ZKI_SETTINGS.crewRetentionPercent,
) {
  const available = [...new Map(pairs
    .filter((pair) => pair.plate && pair.driver)
    .map((pair) => [normalizeVehicleKey(pair.plate), pair])).entries()]
    // `capacities` contiene exclusivamente los VH habilitados para ZKI. La
    // pareja conductor-VH es indivisible: un VH indisponible no puede aportar
    // su conductor para usarlo luego con otra placa.
    .filter(([key]) => capacities.has(key))
    .map(([key, pair]) => ({ ...pair, key, capacity: capacities.get(key) || 0 }));
  if (available.some((pair) => pair.responsible || pair.responsibleId)) {
    return assignCatalogPairsGlobally(plans, available, minimumZki, retentionPercent);
  }
  if (retentionPercent === 0) return assignFreeDriverPairsGlobally(plans, available, minimumZki);
  const used = new Set<string>();
  const usedDrivers: Array<{ driver: string; driverId: string }> = [];
  const assignedResponsibles = plans.flatMap(({ recommendation }) => recommendation ? [{ id: recommendation.rrId, name: recommendation.rr }] : []);
  const result = new Map<string, Candidate>();
  // La pareja RR-conductor es la unidad habitual que se debe conservar. El
  // auxiliar es intercambiable y se distribuye luego segun disponibilidad.
  const effectiveRetention = Math.max(0, Math.min(100, retentionPercent));
  const retentionTarget = Math.ceil(plans.length * effectiveRetention / 100);
  const reservedPairByTrip = new Map<string, (typeof available)[number]>();
  const reservedPairKeys = new Set<string>();
  plans
    .filter(({ recommendation }) => Boolean(recommendation))
    .sort((left, right) => crewAssignmentPriority(right.recommendation, minimumZki) - crewAssignmentPriority(left.recommendation, minimumZki) || right.trip.weight - left.trip.weight)
    .some(({ trip, recommendation }) => {
      const pair = available.find((item) => !reservedPairKeys.has(item.key)
        && item.capacity >= trip.weight
        && samePerson(item.responsibleId, item.responsible, recommendation?.rrId, recommendation?.rr));
      if (!pair) return false;
      reservedPairByTrip.set(trip.id, pair);
      reservedPairKeys.add(pair.key);
      return reservedPairByTrip.size >= retentionTarget;
    });

  [...plans].sort((left, right) => {
    const leftReserved = reservedPairByTrip.has(left.trip.id);
    const rightReserved = reservedPairByTrip.has(right.trip.id);
    return Number(rightReserved) - Number(leftReserved)
      || (effectiveRetention === 0 ? right.trip.weight - left.trip.weight : 0)
      || crewAssignmentPriority(right.recommendation, minimumZki) - crewAssignmentPriority(left.recommendation, minimumZki)
      || right.trip.weight - left.trip.weight;
  }).forEach(({ trip, candidates = [], recommendation }) => {
    if (!recommendation) return;
    const assignedKey = normalizeVehicleKey(trip.assignedPlate || trip.vehicle);
    const habitualKey = normalizeVehicleKey(recommendation.vehicle);
    const unused = available.filter((pair) => !used.has(pair.key)
      && !assignedResponsibles.some(person => samePerson(person.id, person.name, pair.driverId, pair.driver))
      && !usedDrivers.some(driver => samePerson(driver.driverId, driver.driver, pair.driverId, pair.driver)));
    const fitting = unused.filter((pair) => pair.capacity >= trip.weight);
    const hasResponsibleCatalog = available.some((pair) => pair.responsible || pair.responsibleId);
    let activeRecommendation = recommendation;
    let selected = reservedPairByTrip.get(trip.id)
      || fitting.find((pair) => samePerson(pair.responsibleId, pair.responsible, recommendation.rrId, recommendation.rr));

    // Si la pareja del RR inicialmente recomendado no está disponible, se
    // cambia la pareja completa. El nuevo RR debe ser candidato real del
    // territorio; nunca se inserta solamente el conductor de otra persona.
    if (!selected && hasResponsibleCatalog) {
      const alternative = candidates
        .flatMap((candidate) => {
          const pair = fitting.find((item) => samePerson(item.responsibleId, item.responsible, candidate.rrId, candidate.rr));
          return pair ? [{ candidate, pair }] : [];
        })
        .sort((left, right) => candidatePriority(right.candidate, minimumZki) - candidatePriority(left.candidate, minimumZki))[0];
      if (alternative) {
        activeRecommendation = alternative.candidate;
        selected = alternative.pair;
      }
    }
    if (!selected && !hasResponsibleCatalog) {
      selected = (effectiveRetention > 0 ? fitting.find((pair) => assignedKey && pair.key === assignedKey)
        || fitting.find((pair) => habitualKey && pair.key === habitualKey) : undefined)
        || fitting.filter((pair) => !reservedPairKeys.has(pair.key)).sort((left, right) => left.capacity - right.capacity)[0]
        || (effectiveRetention > 0 ? unused.filter((pair) => !reservedPairKeys.has(pair.key)).sort((left, right) => right.capacity - left.capacity)[0] : undefined);
    }

    if (!selected) {
      result.set(trip.id, {
        ...activeRecommendation,
        driver: "Sin conductor disponible",
        driverId: "",
        vehicle: "Sin placa",
        capacity: 0,
        viable: false,
        reason: "Pendiente: no queda otra pareja conductor–vehículo disponible para esta ruta.",
      });
      return;
    }

    used.add(selected.key);
    usedDrivers.push(selected);
    const fits = selected.capacity > 0 && selected.capacity >= trip.weight;
    result.set(trip.id, {
      ...activeRecommendation,
      driver: selected.driver,
      driverId: selected.driverId,
      vehicle: selected.plate.toUpperCase(),
      capacity: selected.capacity,
      viable: activeRecommendation.totalZki >= minimumZki && fits,
      habitualVehicle: selected.key === habitualKey,
      reason: !selected.capacity
        ? `Pendiente: falta registrar la capacidad de ${selected.plate.toUpperCase()}.`
        : !fits
          ? `Pendiente: ${formatKg(trip.weight)} kg superan la capacidad de ${selected.plate.toUpperCase()} (${formatKg(selected.capacity)} kg).`
        : activeRecommendation.totalZki < minimumZki
              ? `No viable: el ZKI combinado es ${Math.round(activeRecommendation.totalZki)} y requiere ${minimumZki}.`
              : "Viable: RR asignado por ZKI y pareja conductor–vehículo disponible.",
    });
  });
  // Si se agotan las parejas operativas, conserva al menos un RR único en las
  // rutas restantes. No se inventa conductor ni vehículo: esos recursos quedan
  // explícitamente pendientes, pero el conocimiento territorial no desaparece.
  const usedResponsibles = new Set(Array.from(result.values(), (candidate) => personIdentity(candidate.rrId, candidate.rr)));
  plans.forEach(({ trip, candidates = [], recommendation }) => {
    if (result.has(trip.id)) return;
    const territoryCandidates = candidates.length ? candidates : recommendation ? [recommendation] : [];
    const candidate = territoryCandidates
      .filter((item) => !usedResponsibles.has(personIdentity(item.rrId, item.rr)))
      .sort((left, right) => candidatePriority(right, minimumZki) - candidatePriority(left, minimumZki))[0];
    if (!candidate) return;
    usedResponsibles.add(personIdentity(candidate.rrId, candidate.rr));
    result.set(trip.id, {
      ...candidate,
      driver: "Sin conductor disponible",
      driverId: "",
      vehicle: "Sin vehículo disponible",
      capacity: 0,
      viable: false,
      habitualVehicle: false,
      reason: "RR asignado por conocimiento territorial; falta una pareja conductor–vehículo disponible para completar la ruta.",
    });
  });
  return result;
}

function assignFreeDriverPairsGlobally<T extends { trip: Trip; recommendation?: Candidate }>(
  plans: T[],
  pairs: Array<DriverVehiclePair & { key: string; capacity: number }>,
  minimumZki: number,
) {
  const responsibles = plans.flatMap(({ recommendation }) => recommendation ? [{ id: recommendation.rrId, name: recommendation.rr }] : []);
  const drivers: Array<Array<(typeof pairs)[number]>> = [];
  pairs.forEach((pair) => {
    if (responsibles.some((person) => samePerson(person.id, person.name, pair.driverId, pair.driver))) return;
    const group = drivers.find((items) => samePerson(items[0].driverId, items[0].driver, pair.driverId, pair.driver));
    if (group) group.push(pair);
    else drivers.push([pair]);
  });
  const columnCount = Math.max(plans.length, drivers.length);
  if (!columnCount) return new Map<string, Candidate>();
  const choices = plans.map(({ trip }) => drivers.map((group) => group
    .filter((pair) => pair.capacity >= trip.weight)
    .sort((left, right) => left.capacity - right.capacity)[0]));
  const viableBonus = plans.length * 201 + 1;
  const assignedBonus = plans.length * (viableBonus + 201) + 1;
  const weights = plans.map(({ recommendation }, row) => Array.from({ length: columnCount }, (_, column) => {
    const pair = choices[row][column];
    if (!recommendation || !pair) return 0;
    return assignedBonus
      + (recommendation.totalZki >= minimumZki ? viableBonus : 0)
      + Math.min(200, recommendation.totalZki)
      - (pair.capacity - plans[row].trip.weight) / 100_000;
  }));
  const columns = maximumWeightAssignment(weights);
  const result = new Map<string, Candidate>();
  plans.forEach(({ trip, recommendation }, row) => {
    if (!recommendation) return;
    const column = columns[row];
    const pair = column >= 0 ? choices[row][column] : undefined;
    if (!pair) {
      result.set(trip.id, {
        ...recommendation,
        driver: "Sin conductor disponible", driverId: "",
        vehicle: "Sin placa", capacity: 0, viable: false,
        reason: "Pendiente: no queda una pareja conductor–vehículo habilitada con capacidad para esta ruta.",
      });
      return;
    }
    const viable = recommendation.totalZki >= minimumZki;
    result.set(trip.id, {
      ...recommendation,
      driver: pair.driver, driverId: pair.driverId,
      vehicle: pair.plate.toUpperCase(), capacity: pair.capacity,
      viable, habitualVehicle: pair.key === normalizeVehicleKey(recommendation.vehicle),
      reason: viable
        ? "Viable: RR y auxiliar cumplen el ZKI; el conductor conserva su placa habilitada."
        : `No viable: el ZKI combinado es ${Math.round(recommendation.totalZki)} y requiere ${minimumZki}.`,
    });
  });
  return result;
}

function assignCatalogPairsGlobally<T extends { trip: Trip; candidates?: Candidate[]; recommendation?: Candidate }>(
  plans: T[],
  pairs: Array<DriverVehiclePair & { key: string; capacity: number }>,
  minimumZki: number,
  retentionPercent: number,
) {
  const columnCount = Math.max(plans.length, pairs.length);
  if (!plans.length || !columnCount) return new Map<string, Candidate>();
  const options = plans.map(({ trip, candidates = [], recommendation }) => {
    const territoryCandidates = candidates.length ? candidates : recommendation ? [recommendation] : [];
    const row = new Array<{ candidate: Candidate; pair: (typeof pairs)[number] } | undefined>(columnCount);
    pairs.forEach((pair, index) => {
      if (pair.capacity < trip.weight) return;
      const candidate = territoryCandidates
        .filter((item) => samePerson(pair.responsibleId, pair.responsible, item.rrId, item.rr))
        .sort((left, right) => candidatePriority(right, minimumZki) - candidatePriority(left, minimumZki))[0];
      if (candidate) row[index] = { candidate, pair };
    });
    return row;
  });
  const retentionBonus = Math.max(0, Math.min(100, retentionPercent)) * 100;
  const weights = options.map((row, rowIndex) => row.map((option) => {
    if (!option) return 0;
    const initial = plans[rowIndex].recommendation;
    const keepsInitialPair = initial && samePerson(option.pair.responsibleId, option.pair.responsible, initial.rrId, initial.rr);
    return candidatePriority(option.candidate, minimumZki) + (keepsInitialPair ? retentionBonus : 0);
  }));
  const assignment = maximumWeightAssignment(weights);
  const result = new Map<string, Candidate>();
  const usedPairKeys = new Set<string>();
  assignment.forEach((column, row) => {
    const option = column >= 0 ? options[row][column] : undefined;
    if (!option) return;
    const { candidate, pair } = option;
    usedPairKeys.add(pair.key);
    const viable = candidate.totalZki >= minimumZki;
    result.set(plans[row].trip.id, {
      ...candidate,
      driver: pair.driver,
      driverId: pair.driverId,
      vehicle: pair.plate.toUpperCase(),
      capacity: pair.capacity,
      viable,
      habitualVehicle: true,
      reason: candidate.totalZki < minimumZki
          ? `No viable: el ZKI combinado es ${Math.round(candidate.totalZki)} y requiere ${minimumZki}.`
          : "Viable: pareja RR–conductor asignada globalmente al territorio con mejor ZKI.",
    });
  });
  // Si se agotan las parejas operativas, conserva un RR único en cada ruta
  // restante y deja conductor/vehículo explícitamente pendientes.
  const usedResponsibles = new Set(Array.from(result.values(), (candidate) => personIdentity(candidate.rrId, candidate.rr)));
  plans.forEach(({ trip, candidates = [], recommendation }) => {
    if (result.has(trip.id)) return;
    const territoryCandidates = candidates.length ? candidates : recommendation ? [recommendation] : [];
    const candidate = territoryCandidates
      .filter((item) => !usedResponsibles.has(personIdentity(item.rrId, item.rr)))
      .sort((left, right) => candidatePriority(right, minimumZki) - candidatePriority(left, minimumZki))[0];
    if (!candidate) return;
    usedResponsibles.add(personIdentity(candidate.rrId, candidate.rr));
    const freePair = pairs
      .filter((pair) => !usedPairKeys.has(pair.key) && pair.capacity >= trip.weight)
      .sort((left, right) => left.capacity - right.capacity)[0];
    if (freePair) {
      usedPairKeys.add(freePair.key);
      const viable = candidate.totalZki >= minimumZki;
      result.set(trip.id, {
        ...candidate,
        driver: freePair.driver,
        driverId: freePair.driverId,
        vehicle: freePair.plate.toUpperCase(),
        capacity: freePair.capacity,
        viable,
        habitualVehicle: false,
        reason: candidate.totalZki < minimumZki
            ? `No viable: tripulación completa, pero el ZKI combinado es ${Math.round(candidate.totalZki)} y requiere ${minimumZki}.`
            : "Viable: RR y pareja conductor-placa disponibles, reasignados para completar la ruta.",
      });
      return;
    }
    result.set(trip.id, {
      ...candidate,
      driver: "Sin conductor disponible",
      driverId: "",
      vehicle: "Sin vehículo disponible",
      capacity: 0,
      viable: false,
      habitualVehicle: false,
      reason: "RR asignado por conocimiento territorial; falta una pareja conductor–vehículo disponible para completar la ruta.",
    });
  });
  return result;
}

function crewAssignmentPriority(candidate: Candidate | undefined, minimumZki: number) {
  if (!candidate) return 0;
  // El conductor no tiene ZKI propio. Si faltan parejas, la viabilidad
  // combinada del RR y auxiliar tiene prioridad.
  return (candidate.totalZki >= minimumZki ? 1_000_000 : 0)
    + (candidate.hasKnowledge ? 100_000 : 0)
    + candidate.zki * 1_000
    + candidate.totalZki;
}

function removeRepeatedAuxiliaries(assignments: Map<string, Candidate>, minimumZki: number) {
  const responsibles = [...assignments.values()].map(candidate => ({ id: candidate.rrId, name: candidate.rr }));
  const usedDrivers: Candidate[] = [];
  const rows = Array.from(assignments.entries()).map(([tripId, candidate]): [string, Candidate] => {
    const isRealDriver = candidate.driver.trim() && !normalize(candidate.driver).startsWith("sin");
    if (!isRealDriver) return [tripId, candidate];
    if (responsibles.some(person => samePerson(person.id, person.name, candidate.driverId, candidate.driver))
      || usedDrivers.some(driver => samePerson(driver.driverId, driver.driver, candidate.driverId, candidate.driver))) {
      // Conserva el territorio y su RR; no oculta la ruta por falta de conductor.
      return [tripId, { ...candidate, driver: "Sin conductor disponible", driverId: "", vehicle: "Sin placa", capacity: 0, viable: false, reason: "Pendiente: el conductor ya está asignado como responsable o conductor; se requiere otra pareja conductor–vehículo." }];
    }
    usedDrivers.push(candidate);
    return [tripId, candidate];
  });
  const unavailable = [...responsibles, ...rows.flatMap(([, candidate]) => normalize(candidate.driver).startsWith("sin") ? [] : [{ id: candidate.driverId, name: candidate.driver }])];
  const normalizedId = (id: string) => id.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
  const unavailableIds = new Set(unavailable.map((person) => normalizedId(person.id)).filter(Boolean));
  const unavailableNames = new Set(unavailable.map((person) => normalizePersonName(person.name)).filter(Boolean));
  const auxiliaryById = new Map<string, string>();
  const auxiliaryByName = new Map<string, string>();
  let auxiliaryCount = 0;
  const optionMaps = rows.map(([, candidate]) => {
    const options = [
      ...(candidate.auxiliaryOptions || []),
      { name: candidate.auxiliary, id: candidate.auxiliaryId, zki: candidate.auxiliaryZki },
    ];
    const result = new Map<string, (typeof options)[number]>();
    options.forEach((option) => {
      if (!option.name.trim() || normalize(option.name).startsWith("sin")) return;
      const id = normalizedId(option.id);
      const name = normalizePersonName(option.name);
      if ((id && unavailableIds.has(id)) || (name && unavailableNames.has(name))) return;
      const key = (id && auxiliaryById.get(id)) || (name && auxiliaryByName.get(name)) || `aux:${auxiliaryCount++}`;
      if (id) auxiliaryById.set(id, key);
      if (name) auxiliaryByName.set(name, key);
      result.set(key, option);
    });
    return result;
  });
  const auxiliaryKeys = Array.from(new Set(optionMaps.flatMap((options) => Array.from(options.keys()))));
  // Primero maximiza las rutas que alcanzan el umbral; después completa
  // tripulaciones y suma el mejor ZKI posible con auxiliares únicos.
  const assignedBonus = rows.length * 200 + 1;
  const viableBonus = rows.length * (assignedBonus + 200) + 1;
  const weights = optionMaps.map((options, rowIndex) => [
    ...auxiliaryKeys.map((key) => {
      const option = options.get(key);
      if (!option) return 0;
      const candidate = rows[rowIndex][1];
      const rrZki = candidate.zki;
      const combined = rrZki + option.zki;
      const balanced = Math.min(combined, Math.max(100, minimumZki * 2));
      const unused = Math.max(0, option.zki - Math.max(0, minimumZki - rrZki));
      return (combined >= minimumZki ? viableBonus : 0)
        + assignedBonus + balanced - unused / 100;
    }),
    ...new Array(rows.length).fill(0),
  ]);
  const selectedColumns = maximumWeightAssignment(weights);
  const result = new Map<string, Candidate>();
  rows.forEach(([tripId, candidate], rowIndex) => {
    const column = selectedColumns[rowIndex];
    const replacement = column >= 0 && column < auxiliaryKeys.length
      ? optionMaps[rowIndex].get(auxiliaryKeys[column])
      : undefined;
    if (!replacement) {
      const totalZki = Math.round(candidate.zki * 100) / 100;
      result.set(tripId, {
        ...candidate,
        auxiliary: "Sin auxiliar disponible",
        auxiliaryId: "",
        auxiliaryZki: 0,
        totalZki,
        viable: false,
        reason: `${candidate.reason} No quedó un auxiliar disponible para completar la tripulación.`,
      });
      return;
    }
    const totalZki = Math.round((candidate.zki + replacement.zki) * 100) / 100;
    const viable = candidate.capacity > 0 && totalZki >= minimumZki;
    result.set(tripId, {
      ...candidate,
      auxiliary: replacement.name,
      auxiliaryId: replacement.id,
      auxiliaryZki: replacement.zki,
      totalZki,
      viable,
      reason: candidate.capacity <= 0
        ? candidate.reason
        : totalZki < minimumZki
          ? `No viable: el ZKI combinado es ${Math.round(totalZki)} y requiere ${minimumZki}.`
          : candidate.habitualVehicle
            ? "Viable: tripulación completa y ZKI combinado suficiente."
            : "Viable: tripulación alternativa completa y ZKI combinado suficiente.",
    });
  });
  return result;
}

function personIdentity(id: string | undefined, name: string | undefined) {
  const normalizedName = normalizePersonName(name || "");
  if (normalizedName && !normalizedName.startsWith("sin")) return `name:${normalizedName}`;
  const normalizedId = String(id || "").replace(/\D/g, "").replace(/^0+/, "");
  return normalizedId ? `id:${normalizedId}` : "";
}

export function samePerson(leftId: string | undefined, leftName: string | undefined, rightId: string | undefined, rightName: string | undefined) {
  const cleanLeftId = String(leftId || "").replace(/\D/g, "").replace(/^0+(?=\d)/, "");
  const cleanRightId = String(rightId || "").replace(/\D/g, "").replace(/^0+(?=\d)/, "");
  if (cleanLeftId && cleanRightId && cleanLeftId === cleanRightId) return true;
  const cleanLeftName = normalizePersonName(leftName || "");
  const cleanRightName = normalizePersonName(rightName || "");
  return Boolean(cleanLeftName && cleanRightName && cleanLeftName === cleanRightName);
}

export function assignCompatibleVehicles<T extends { trip: Trip; recommendation?: Candidate }>(plans: T[], capacities: Map<string, number>, minimumZki = DEFAULT_ZKI_SETTINGS.minimumZki) {
  const used = new Set<string>();
  const result = new Map<string, Candidate>();
  const assignFallback = (trip: Trip, recommendation: Candidate, reason: string): Candidate => {
    const habitualKey = normalizeVehicleKey(recommendation.vehicle);
    return {
      ...recommendation,
      vehicle: habitualKey ? habitualKey.toUpperCase() : "Sin VH habitual",
      capacity: capacities.get(habitualKey) || 0,
      viable: false,
      habitualVehicle: true,
      reason: `${reason} El conductor conserva su VH habitual; se debe cambiar el RR o dejar el viaje sin asignar.`,
    };
  };
  [...plans].sort((left, right) => {
    const leftTeamViable = Boolean(left.recommendation && left.recommendation.totalZki >= minimumZki);
    const rightTeamViable = Boolean(right.recommendation && right.recommendation.totalZki >= minimumZki);
    return Number(rightTeamViable) - Number(leftTeamViable) || right.trip.weight - left.trip.weight;
  }).forEach(({ trip, recommendation }) => {
    if (!recommendation) return;
    const assignedKey = normalizeVehicleKey(trip.assignedPlate);
    // La placa del archivo solo es autoritativa si existe en el catálogo
    // validado por el llamador (tabla `placas`). Una placa escrita en el Excel
    // o heredada del historial nunca debe crear un vehículo nuevo de facto.
    const recommendedVehicleKey = normalizeVehicleKey(recommendation.vehicle);
    if (assignedKey && assignedKey === recommendedVehicleKey && !used.has(assignedKey) && (capacities.get(assignedKey) || 0) >= trip.weight) {
      const assignedCapacity = capacities.get(assignedKey) || 0;
      used.add(assignedKey);
      const fits = true;
      const reason = `Viable: conserva la placa asignada ${assignedKey.toUpperCase()} del archivo de planeación.`;
      result.set(trip.id, {
        ...recommendation,
        vehicle: assignedKey.toUpperCase(),
        capacity: assignedCapacity,
        viable: recommendation.viable && fits,
        habitualVehicle: assignedKey === normalizeVehicleKey(recommendation.vehicle),
        reason,
      });
      return;
    }
    const habitualKey = normalizeVehicleKey(recommendation.vehicle);
    const habitualCapacity = capacities.get(habitualKey) || 0;
    // El conductor y su VH son una unidad fija. Un ZKI bajo puede cambiar al
    // RR, pero nunca debe mover al conductor a otra placa. El VH histórico
    // solo puede volver a la planeación si sigue en el catálogo disponible.
    if (habitualKey) {
      if (!capacities.has(habitualKey) || habitualCapacity < trip.weight || used.has(habitualKey)) {
        const replacementCause = used.has(habitualKey)
          ? `ya fue utilizado en otro viaje`
          : !capacities.has(habitualKey)
          ? `está indisponible o fuera de la planeación`
          : `solo soporta ${formatKg(habitualCapacity)} y la carga es ${formatKg(trip.weight)}`;
        const replacement = [...capacities.entries()]
          .filter(([key, capacity]) => key !== habitualKey && !used.has(key) && capacity > 0 && capacity >= trip.weight)
          .sort((left, right) => left[1] - right[1])[0];
        if (!replacement) {
          result.set(trip.id, {
            ...recommendation,
            vehicle: "Sin placa",
            capacity: 0,
            viable: false,
            habitualVehicle: false,
            reason: `Bloqueado: el VH habitual ${habitualKey.toUpperCase()} ${replacementCause} y no hay otro VH con capacidad suficiente.`,
          });
          return;
        }
        const [replacementKey, replacementCapacity] = replacement;
        used.add(replacementKey);
        result.set(trip.id, {
          ...recommendation,
          vehicle: replacementKey.toUpperCase(),
          capacity: replacementCapacity,
          viable: recommendation.totalZki >= minimumZki,
          habitualVehicle: false,
          reason: `Viable: el VH habitual ${habitualKey.toUpperCase()} ${replacementCause}; el conductor conserva su asignación y cambia al VH ${replacementKey.toUpperCase()}.`,
        });
        return;
      }
      used.add(habitualKey);
      const fits = habitualCapacity >= trip.weight;
      result.set(trip.id, {
        ...recommendation,
        vehicle: habitualKey.toUpperCase(),
        capacity: habitualCapacity,
        viable: recommendation.viable && fits,
        habitualVehicle: true,
        reason: !habitualCapacity
            ? `Bloqueado: falta capacidad para el VH fijo ${habitualKey.toUpperCase()}; no se cambió al conductor.`
            : habitualCapacity < trip.weight
              ? `Bloqueado: el VH fijo ${habitualKey.toUpperCase()} no soporta ${formatKg(trip.weight)}; no se cambió al conductor.`
              : !recommendation.viable
                ? recommendation.reason
                : recommendation.reason,
      });
      return;
    }
    result.set(trip.id, assignFallback(trip, recommendation, "No se identificó un VH habitual disponible."));
  });
  return result;
}

// Algoritmo húngaro O(n³): maximiza el puntaje de toda la planeación, no el
// mejor valor aislado de cada territorio. Las columnas adicionales representan
// asignaciones vacías cuando hay menos RR que viajes.
function maximumWeightAssignment(weights: number[][]) {
  const rows = weights.length;
  const columns = weights[0]?.length || 0;
  const maximum = Math.max(0, ...weights.flat());
  const u = new Array(rows + 1).fill(0);
  const v = new Array(columns + 1).fill(0);
  const p = new Array(columns + 1).fill(0);
  const way = new Array(columns + 1).fill(0);
  for (let i = 1; i <= rows; i += 1) {
    p[0] = i;
    let column0 = 0;
    const minValue = new Array(columns + 1).fill(Number.POSITIVE_INFINITY);
    const used = new Array(columns + 1).fill(false);
    do {
      used[column0] = true;
      const row0 = p[column0];
      let delta = Number.POSITIVE_INFINITY;
      let column1 = 0;
      for (let j = 1; j <= columns; j += 1) {
        if (used[j]) continue;
        const current = maximum - (weights[row0 - 1][j - 1] || 0) - u[row0] - v[j];
        if (current < minValue[j]) {
          minValue[j] = current;
          way[j] = column0;
        }
        if (minValue[j] < delta) {
          delta = minValue[j];
          column1 = j;
        }
      }
      for (let j = 0; j <= columns; j += 1) {
        if (used[j]) {
          u[p[j]] += delta;
          v[j] -= delta;
        } else minValue[j] -= delta;
      }
      column0 = column1;
    } while (p[column0] !== 0);
    do {
      const column1 = way[column0];
      p[column0] = p[column1];
      column0 = column1;
    } while (column0 !== 0);
  }
  const result = new Array(rows).fill(-1);
  for (let column = 1; column <= columns; column += 1) {
    if (p[column] > 0 && p[column] <= rows) result[p[column] - 1] = column - 1;
  }
  return result;
}

export function parseTrips(rows: RawRow[]): Trip[] {
  const sheetHasTripColumn = rows.some(hasTripColumn);
  return rows.filter((raw) => hasOperationalTripData(raw) && isFirstTrip(raw, sheetHasTripColumn)).map((raw, index) => {
    const tripNumber = text(read(raw, ["Número", "Numero", "N°", "No"]));
    const date = dateText(read(raw, ["Fecha de entrega", "Fecha entrega", "Fecha", "Fecha de despacho"]));
    const zone = text(read(raw, ["Nombre", "Zona", "Población", "Poblacion", "Territorio", "Ruta"]));
    return {
      id: `${date}:${tripNumber || index + 1}:${normalize(zone)}`,
      territoryId: normalizeZkiCode(tripNumber),
      date,
      zone: zone || `Viaje ${tripNumber || index + 1}`,
      vehicle: text(read(raw, ["Vehículo", "Vehiculo", "VH"])),
      assignedPlate: text(read(raw, ["Placa Asignada", "Placa", "Vehículo asignado"])),
      weight: number(read(raw, ["Peso", "Peso viaje", "Peso real"])),
      maximumWeight: number(read(raw, ["Peso Máximo", "Peso Maximo", "Capacidad", "Capacidad peso"])),
      cubicage: number(read(raw, ["Cubicaje", "Volumen"])),
      clients: number(read(raw, ["Clientes", "Clientes territorio", "Total clientes"])),
      trip: text(readTripValue(raw)),
      raw,
    };
  });
}

export function parseCrewHistory(rows: RawRow[]): CrewHistory[] {
  return rows.map((row) => ({
    rr: text(read(row, ["nombreResponsable", "Nombre RR", "Responsable", "RR"])),
    rrId: text(read(row, ["cedulaResponsable", "Cedula RR", "Cédula RR"])),
    driver: text(read(row, ["nombreAuxiliar1", "Nombre conductor", "Conductor", "Auxiliar 1"])),
    driverId: text(read(row, ["cedulaAuxiliar1", "Cedula conductor", "Cédula conductor"])),
    vehicle: text(read(row, ["vehiculo", "Vehículo", "Placa"])),
    zone: text(read(row, ["territorio", "Zona", "Nombre", "Población", "Ruta"])),
    clients: number(read(row, ["clientes", "Clientes", "Clientes territorio"])),
    visited: number(read(row, ["visitados", "Clientes únicos", "Clientes unicos"])),
    date: dateText(read(row, ["fechaDespacho", "Fecha", "Fecha de despacho"])),
  })).filter((row) => row.rr);
}

export function parseZkiVisits(rows: RawRow[]): ZkiVisit[] {
  return rows.map((row) => ({
    rr: text(read(row, ["Nombre RR", "RR", "Responsable", "nombreResponsable", "Nombre", "Vendedor", "Repartidor"])),
    rrId: text(read(row, ["Cedula", "Cédula", "Cedula RR", "Documento RR"])),
    client: normalizeZkiCode(read(row, ["Codigo", "Código", "Cliente", "ID cliente", "Código cliente", "Codigo cliente", "Cuenta", "Establecimiento"])),
    zone: text(read(row, ["Zona", "Población", "Poblacion", "Territorio", "Ruta", "Nombre ruta"])),
    neighborhood: text(read(row, ["Barrio", "Neighborhood"])),
    driver: text(read(row, ["Conductor", "Nombre conductor", "nombreAuxiliar1"])),
    vehicle: text(read(row, ["Vehículo", "Vehiculo", "Placa"])),
    role: text(read(row, ["Cargo", "Rol", "Role"])),
    count: Math.max(1, number(read(row, ["Visitas", "Cantidad", "Frecuencia"]))),
  })).filter((row) => {
    return row.rr && row.client && (isResponsibleVisit(row) || isAuxiliaryVisit(row));
  });
}

export function parseTerritoryClients(rows: RawRow[]): TerritoryClient[] {
  return rows.map((row) => ({
    territoryId: normalizeZkiCode(read(row, ["id territory", "territory", "territorio", "id territorio", "Número", "Numero"])),
    client: normalizeZkiCode(read(row, ["Codigos de cliente", "Códigos de cliente", "Codigo de cliente", "Código de cliente", "Cliente"])),
    neighborhood: text(read(row, ["Barrio", "Neighborhood"])),
    weight: number(read(row, ["Peso Territorio", "Peso del Territorio", "Peso territorio", "Peso total"])),
  })).filter((row) => row.territoryId && row.client);
}

export function tripsFromTerritoryClients(rows: RawRow[], historicalVisits: ZkiVisit[] = []): Trip[] {
  const historicalNeighborhoods = new Map<string, string>();
  historicalVisits.forEach((visit) => {
    const client = normalizeZkiCode(visit.client);
    if (client && visit.neighborhood && !historicalNeighborhoods.has(client)) historicalNeighborhoods.set(client, visit.neighborhood);
  });
  const grouped = new Map<string, { clients: Set<string>; neighborhoods: Map<string, { label: string; count: number }>; weight: number }>();
  parseTerritoryClients(rows).forEach(({ territoryId, client, neighborhood, weight }) => {
    const entry = grouped.get(territoryId) || { clients: new Set<string>(), neighborhoods: new Map<string, { label: string; count: number }>(), weight: 0 };
    entry.clients.add(client);
    if (weight > 0) entry.weight = weight;
    const effectiveNeighborhood = normalize(neighborhood) && normalize(neighborhood) !== "barrio" ? neighborhood : historicalNeighborhoods.get(client) || "";
    const key = normalize(effectiveNeighborhood)
      .replace(/^(veinte|20)dejulio$/, "20dejulio")
      .replace(/^(siete|7)deabril$/, "7deabril");
    if (key) {
      const current = entry.neighborhoods.get(key);
      entry.neighborhoods.set(key, { label: current?.label || effectiveNeighborhood, count: (current?.count || 0) + 1 });
    }
    grouped.set(territoryId, entry);
  });
  return [...grouped].map(([territoryId, entry]) => ({
    id: `territorio:${territoryId}`,
    territoryId,
    date: "",
    zone: [...entry.neighborhoods.values()].sort((left, right) => right.count - left.count).slice(0, 3).map((item) => item.label).join(", ") || `Territorio ${territoryId}`,
    vehicle: "",
    assignedPlate: "",
    weight: entry.weight,
    maximumWeight: 0,
    cubicage: 0,
    clients: entry.clients.size,
    trip: "1",
    raw: { territoryId, weightKnown: entry.weight > 0, neighborhoods: [...entry.neighborhoods.values()].sort((left, right) => right.count - left.count).map((item) => item.label) },
  }));
}

export function rankCandidates(
  trip: Trip,
  _history: CrewHistory[],
  visits: ZkiVisit[],
  territoryClientCodes: string[],
  capacities: Map<string, number>,
  settings: ZkiSettings,
  auxiliaryRoster: ZkiVisit[] = visits,
  responsibleRoster: ZkiVisit[] = visits,
): Candidate[] {
  const rrNames = new Map<string, string>();
  responsibleRoster.filter(isResponsibleVisit).forEach((row) => rrNames.set(normalizePersonName(row.rr), row.rr));
  const configuredClients = new Set(territoryClientCodes.map(normalizeZkiCode).filter(Boolean));
  const matchedClientVisits = visits.filter((row) => configuredClients.has(normalizeZkiCode(row.client)));
  const territoryClientSet = configuredClients;
  const responsibleVisitsByRr = new Map<string, ZkiVisit[]>();
  matchedClientVisits.forEach((row) => {
    if (!isResponsibleVisit(row)) return;
    const key = normalizePersonName(row.rr);
    if (!key) return;
    const current = responsibleVisitsByRr.get(key);
    if (current) current.push(row);
    else responsibleVisitsByRr.set(key, [row]);
  });
  const territoryClients = Math.max(trip.clients, territoryClientSet.size);
  const scoredAuxiliaries = rankAuxiliaries(matchedClientVisits, settings);
  const scoredAuxiliaryKeys = new Set(scoredAuxiliaries.map((item) => item.key));
  const reserveAuxiliaries = auxiliaryRoster.flatMap((visit) => {
    if (!isAuxiliaryVisit(visit)) return [];
    const key = normalizePersonName(visit.rr);
    if (!key || scoredAuxiliaryKeys.has(key)) return [];
    scoredAuxiliaryKeys.add(key);
    return [{ key, name: visit.rr, id: visit.rrId || "", zki: 0 }];
  });
  const auxiliaries = [...scoredAuxiliaries, ...reserveAuxiliaries];

  return Array.from(rrNames, ([rrKey, rrName]) => {
    const rrVisits = responsibleVisitsByRr.get(rrKey) || [];
    const visitsByClient = new Map<string, number>();
    rrVisits.forEach((row) => {
      const client = normalizeZkiCode(row.client);
      if (client) visitsByClient.set(client, (visitsByClient.get(client) || 0) + visitCount(row));
    });
    const uniqueVisited = visitsByClient.size;
    const coverage = territoryClients > 0 ? clamp((uniqueVisited / territoryClients) * 100) : 0;
    // La frecuencia mide la intensidad sobre los clientes que el RR sí conoce,
    // no sobre toda la población. Así, 5 visitas a 5 clientes dan frecuencia 1
    // aunque el territorio completo tenga 20 clientes.
    const totalVisits = rrVisits.reduce((total, row) => total + visitCount(row), 0);
    const frequency = uniqueVisited > 0 ? round2(totalVisits / uniqueVisited) : 0;
    const frequencyScore = clamp((frequency / Math.max(1, settings.frequencyCap)) * 100);
    // Profundidad: porcentaje de clientes atendidos que alcanzaron el mínimo
    // de visitas, contando solo códigos del catálogo de esta ruta.
    const deepClients = [...visitsByClient.values()].filter((count) => count >= settings.depthThreshold).length;
    const depth = uniqueVisited > 0 ? clamp((deepClients / uniqueVisited) * 100) : 0;
    const zki = depth;
    const auxiliaryOptions = auxiliaries
      .filter((item) => item.key !== rrKey)
      .sort((left, right) => right.zki - left.zki);
    const auxiliary = auxiliaryOptions[0] || { name: "Sin auxiliar con historial", id: "", zki: 0 };
    const rr = rrName;
    const rrId = rrVisits.find((row) => row.rrId)?.rrId || "";
    const driver = "Sin conductor identificado";
    const driverId = "";
    const vehicle = "Sin vehículo identificado";
    const capacity = capacities.get(normalizeVehicleKey(vehicle)) || 0;
    const previousClients = 0;
    const hasKnowledge = rrVisits.length > 0;
    const hasCapacity = capacity > 0;
    const meetsCombinedZki = zki + auxiliary.zki >= settings.minimumZki;
    const viable = hasCapacity && meetsCombinedZki && trip.weight <= capacity;
    return {
      rr,
      rrId,
      driver,
      driverId,
      vehicle,
      coverage,
      frequency,
      frequencyScore,
      depth,
      uniqueClients: uniqueVisited,
      territoryClients,
      zki,
      auxiliary: auxiliary.name,
      auxiliaryId: auxiliary.id,
      auxiliaryZki: auxiliary.zki,
      auxiliaryOptions: auxiliaryOptions.map(({ name, id, zki }) => ({ name, id, zki })),
      totalZki: Math.round((zki + auxiliary.zki) * 100) / 100,
      previousClients,
      workloadAdjustment: 0,
      capacity,
      viable,
      hasKnowledge,
      habitualVehicle: true,
      reason: !meetsCombinedZki
            ? `No viable: el ZKI combinado es ${Math.round(zki + auxiliary.zki)} y requiere ${settings.minimumZki}.`
          : !hasCapacity
            ? "Pendiente: conductor y placa se asignan desde el catálogo Conductores-placas."
          : trip.weight > capacity
            ? `Bloqueado: ${formatKg(trip.weight)} kg superan ${formatKg(capacity)} kg.`
        : "Viable: conserva RR, conductor y vehículo habitual.",
    };
  })
    // Los RR con conocimiento tienen prioridad, pero los demás permanecen
    // como respaldo para completar todas las tripulaciones disponibles.
    .filter((candidate) => candidate.rr && candidate.driver && candidate.vehicle)
    .sort((left, right) => Number(right.viable) - Number(left.viable) || Number(right.hasKnowledge) - Number(left.hasKnowledge) || (right.totalZki + (right.workloadAdjustment || 0)) - (left.totalZki + (left.workloadAdjustment || 0)));
}

export function rankTerritoryAuxiliaries(_trip: Trip, visits: ZkiVisit[], codes: string[], settings: ZkiSettings) {
  const configured = new Set(codes.map(normalizeZkiCode).filter(Boolean));
  const relevant = visits.filter((row) => configured.has(normalizeZkiCode(row.client)));
  return rankAuxiliaries(relevant, settings).map(({ name, id, zki }) => ({ name, id, zki }));
}

function rankAuxiliaries(visits: ZkiVisit[], settings: ZkiSettings) {
  const grouped = new Map<string, ZkiVisit[]>();
  visits.forEach((visit) => {
    if (!isAuxiliaryVisit(visit)) return;
    const key = normalizePersonName(visit.rr);
    if (!key) return;
    const current = grouped.get(key);
    if (current) current.push(visit);
    else grouped.set(key, [visit]);
  });
  return Array.from(grouped.values()).map((rows) => {
    const visitsByClient = new Map<string, number>();
    rows.forEach((row) => {
      const client = normalizeZkiCode(row.client);
      if (client) visitsByClient.set(client, (visitsByClient.get(client) || 0) + visitCount(row));
    });
    const deepClients = [...visitsByClient.values()].filter((count) => count >= settings.depthThreshold).length;
    const depth = visitsByClient.size > 0 ? clamp((deepClients / visitsByClient.size) * 100) : 0;
    const zki = depth;
    return { key: normalizePersonName(rows[0].rr), name: rows[0].rr, id: rows[0].rrId || "", zki };
  }).sort((left, right) => right.zki - left.zki);
}

function isResponsibleVisit(visit: ZkiVisit) {
  const role = normalize(visit.role);
  return !role || role === "rr" || role.includes("responsable") || role === "liderderuta";
}

function isAuxiliaryVisit(visit: ZkiVisit) {
  return normalize(visit.role).includes("auxiliar");
}

function visitCount(visit: ZkiVisit) {
  return Math.max(1, visit.count || 1);
}

export function capacityMap(rows: RawRow[]) {
  const result = new Map<string, number>();
  rows.forEach((row) => {
    const sources = [row, ...Object.values(row).filter((value): value is RawRow => Boolean(value) && typeof value === "object" && !Array.isArray(value))];
    const vehicle = sources.map((source) => text(read(source, ["Placa Asignada", "Placa", "Vehículo asignado", "Vehículo", "Vehiculo", "vehicle", "plate", "VH"]))).find(Boolean) || "";
    const capacity = sources.map((source) => number(read(source, ["Peso Máximo", "Peso Maximo", "Peso máximo kg", "Capacidad", "capacidad", "capacidad_carga", "CapacidadCarga", "Capacidad de carga", "Carga", "Peso"]))).find((value) => value > 0) || 0;
    // Se conserva la placa aunque aún no tenga capacidad configurada para que
    // pueda clasificarse y administrarse desde ZKI.
    if (vehicle) result.set(normalizeVehicleKey(vehicle), capacity);
  });
  return result;
}

function normalizeVehicleKey(value: unknown) {
  const raw = normalize(value).replace(/^vh/, "");
  return /^co[a-z]{3}\d{3}$/.test(raw) ? raw.slice(2) : raw;
}

export function read(row: RawRow, aliases: string[]) {
  const normalized = new Map(Object.entries(row).map(([key, value]) => [normalize(key), value]));
  for (const alias of aliases) {
    const value = normalized.get(normalize(alias));
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return undefined;
}

function hasOperationalTripData(row: RawRow) {
  return Boolean(
    read(row, ["Nombre", "Zona", "Población", "Poblacion", "Ruta"]) ||
    read(row, ["Peso", "Peso viaje", "Peso real"]) ||
    read(row, ["Vehículo", "Vehiculo", "Placa Asignada", "Placa"]) ||
    read(row, ["Cubicaje", "HL", "KM"]),
  );
}

const TRIP_ALIASES = ["Viaje", "Número viaje", "Numero viaje", "Número de viaje", "Numero de viaje", "Nro viaje", "Nro de viaje", "No viaje", "Tipo de viaje", "Vje"];

function readTripValue(row: RawRow) {
  return read(row, TRIP_ALIASES);
}

function hasTripColumn(row: RawRow) {
  const keys = new Set(Object.keys(row).map(normalize));
  return TRIP_ALIASES.some((alias) => keys.has(normalize(alias)));
}

function isFirstTrip(row: RawRow, sheetHasTripColumn: boolean) {
  const value = text(readTripValue(row)).trim();
  // Se incluyen 1, "1 UDH", "1UDH", etc. Se excluyen 11 y cualquier
  // segundo viaje (2, "2 SV PM", ...). Si la hoja sí trae la columna,
  // una celda vacía no puede convertirse accidentalmente en una ruta.
  if (!value) return !sheetHasTripColumn;
  return /^1(?:$|\D)/.test(value);
}

function normalize(value: unknown) {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
}

export function normalizePersonName(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .sort()
    .join("");
}

export function normalizeZkiCode(value: unknown) {
  const raw = String(value ?? "").trim();
  // Excel suele convertir identificadores enteros a 123.0 o conservar ceros
  // de relleno. No se usan coincidencias parciales entre clientes distintos.
  if (/^\d+(?:[.,]0+)?$/.test(raw)) return raw.replace(/[.,]0+$/, "").replace(/^0+(?=\d)/, "");
  return normalize(raw);
}

function text(value: unknown) {
  return String(value ?? "").trim();
}

function number(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const raw = String(value ?? "").trim().replace(/\s/g, "");
  const normalized = raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw;
  const parsed = Number(normalized.replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function dateText(value: unknown) {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString().slice(0, 10);
  return text(value);
}

function clamp(value: number) {
  return Math.max(0, Math.min(100, round2(value)));
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function formatKg(value: number) {
  return Math.round(value).toLocaleString("es-CO");
}
