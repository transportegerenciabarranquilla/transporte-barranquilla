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

export type TerritoryClient = { territoryId: string; client: string };

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
  coverageWeight: 60,
  frequencyWeight: 25,
  depthWeight: 15,
  frequencyCap: 5,
  minimumZki: 80,
  depthThreshold: 5,
  crewRetentionPercent: 70,
};

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

  [...plans]
    .sort((left, right) => {
      const score = (plan: typeof left) => plan.candidates.filter((candidate) => pairByResponsible.has(personIdentity(candidate.rrId, candidate.rr))).length;
      return score(left) - score(right);
    })
    .some((plan) => {
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

  const remaining = plans
    .filter((plan) => !result.has(plan.tripId))
    .map((plan) => ({ ...plan, candidates: plan.candidates.filter((candidate) => !usedRr.has(personIdentity(candidate.rrId, candidate.rr))) }));
  assignUniqueResponsibles(remaining, minimumZki).forEach((candidate, tripId) => result.set(tripId, candidate));
  return result;
}

export function assignUniqueResponsibles(plans: Array<{ tripId: string; candidates: Candidate[] }>, minimumZki = DEFAULT_ZKI_SETTINGS.minimumZki) {
  const rrKeys = Array.from(new Set(plans.flatMap((plan) => plan.candidates.map((candidate) => personIdentity(candidate.rrId, candidate.rr))))).filter(Boolean);
  const columnCount = Math.max(plans.length, rrKeys.length);
  if (!plans.length || !columnCount) return new Map<string, Candidate>();
  const rrIndex = new Map(rrKeys.map((key, index) => [key, index]));
  const candidateMatrix = plans.map((plan) => {
    const row = new Array<Candidate | undefined>(columnCount);
    plan.candidates.forEach((candidate) => {
      const index = rrIndex.get(personIdentity(candidate.rrId, candidate.rr));
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
  const weights = candidateMatrix.map((row) => row.map((candidate) => candidate
    ? 10_000
      + candidate.totalZki
      + (candidate.workloadAdjustment || 0)
      // Primero maximiza cuántas rutas quedan con conocimiento real; solo
      // después compara el puntaje ZKI y usa responsables de respaldo.
      + (candidate.zki > 0 ? 2_000 : 0)
      + (candidate.hasKnowledge && candidate.totalZki >= minimumZki * 2 ? 1_000 : 0)
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
  return result;
}

function candidatePriority(candidate: Candidate, minimumZki: number) {
  return (candidate.zki > 0 ? 1_000_000 : 0)
    + (candidate.hasKnowledge ? 100_000 : 0)
    + (candidate.totalZki >= minimumZki * 2 ? 10_000 : 0)
    + candidate.totalZki
    + (candidate.workloadAdjustment || 0);
}

export function enforceUniqueAssignedCrew(plans: Array<{ tripId: string; recommendation?: Candidate }>, minimumZki = DEFAULT_ZKI_SETTINGS.minimumZki) {
  const assignments = new Map(plans.flatMap((plan) => plan.recommendation ? [[plan.tripId, plan.recommendation] as const] : []));
  return removeRepeatedAuxiliaries(assignments, minimumZki);
}

export function assignDriverVehiclePairs<T extends { trip: Trip; recommendation?: Candidate }>(
  plans: T[],
  pairs: DriverVehiclePair[],
  capacities: Map<string, number>,
  minimumZki = DEFAULT_ZKI_SETTINGS.minimumZki,
  retentionPercent = DEFAULT_ZKI_SETTINGS.crewRetentionPercent,
) {
  const available = [...new Map(pairs
    .filter((pair) => pair.plate && pair.driver)
    .map((pair) => [normalizeVehicleKey(pair.plate), pair])).entries()]
    .map(([key, pair]) => ({ ...pair, key, capacity: capacities.get(key) || 0 }));
  const used = new Set<string>();
  const result = new Map<string, Candidate>();
  // La pareja RR-conductor es la unidad habitual que se debe conservar. El
  // auxiliar es intercambiable y se distribuye luego segun disponibilidad.
  const effectiveRetention = Math.max(0, Math.min(100, retentionPercent));
  const retentionTarget = Math.ceil(plans.length * effectiveRetention / 100);
  const reservedPairByTrip = new Map<string, (typeof available)[number]>();
  const reservedPairKeys = new Set<string>();
  plans
    .filter(({ recommendation }) => Boolean(recommendation))
    .sort((left, right) => Number(Boolean(right.recommendation?.hasKnowledge)) - Number(Boolean(left.recommendation?.hasKnowledge)) || right.trip.weight - left.trip.weight)
    .some(({ trip, recommendation }) => {
      const pair = available.find((item) => !reservedPairKeys.has(item.key)
        && samePerson(item.responsibleId, item.responsible, recommendation?.rrId, recommendation?.rr));
      if (!pair) return false;
      reservedPairByTrip.set(trip.id, pair);
      reservedPairKeys.add(pair.key);
      return reservedPairByTrip.size >= retentionTarget;
    });

  [...plans].sort((left, right) => {
    const leftReserved = reservedPairByTrip.has(left.trip.id);
    const rightReserved = reservedPairByTrip.has(right.trip.id);
    const leftTeamViable = Boolean(left.recommendation?.hasKnowledge && left.recommendation.totalZki >= minimumZki * 2);
    const rightTeamViable = Boolean(right.recommendation?.hasKnowledge && right.recommendation.totalZki >= minimumZki * 2);
    return Number(rightReserved) - Number(leftReserved) || Number(rightTeamViable) - Number(leftTeamViable) || right.trip.weight - left.trip.weight;
  }).forEach(({ trip, recommendation }) => {
    if (!recommendation) return;
    const assignedKey = normalizeVehicleKey(trip.assignedPlate || trip.vehicle);
    const habitualKey = normalizeVehicleKey(recommendation.vehicle);
    const unused = available.filter((pair) => !used.has(pair.key));
    const selected = reservedPairByTrip.get(trip.id)
      || unused.find((pair) => assignedKey && pair.key === assignedKey)
      || unused.find((pair) => habitualKey && pair.key === habitualKey)
      || unused.filter((pair) => !reservedPairKeys.has(pair.key) && pair.capacity >= trip.weight).sort((left, right) => left.capacity - right.capacity)[0]
      || unused.filter((pair) => !reservedPairKeys.has(pair.key)).sort((left, right) => right.capacity - left.capacity)[0];

    if (!selected) {
      result.set(trip.id, {
        ...recommendation,
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
    const fits = selected.capacity > 0 && selected.capacity >= trip.weight;
    result.set(trip.id, {
      ...recommendation,
      driver: selected.driver,
      driverId: selected.driverId,
      vehicle: selected.plate.toUpperCase(),
      capacity: selected.capacity,
      viable: recommendation.hasKnowledge && recommendation.totalZki >= minimumZki * 2 && fits,
      habitualVehicle: selected.key === habitualKey,
      reason: !selected.capacity
        ? `Pendiente: falta registrar la capacidad de ${selected.plate.toUpperCase()}.`
        : !fits
          ? `Pendiente: ${formatKg(trip.weight)} kg superan la capacidad de ${selected.plate.toUpperCase()} (${formatKg(selected.capacity)} kg).`
        : !recommendation.hasKnowledge
            ? "Pendiente: la tripulación está completa, pero el RR no tiene historial suficiente en el territorio."
            : recommendation.totalZki < minimumZki * 2
              ? `No viable: el ZKI combinado es ${Math.round(recommendation.totalZki)} y requiere ${minimumZki * 2}.`
              : recommendation.hasKnowledge
            ? "Viable: RR asignado por ZKI y pareja conductor–vehículo disponible."
            : "Pendiente: la tripulación está completa, pero el RR no tiene historial suficiente en el territorio.",
    });
  });
  return result;
}

function removeRepeatedAuxiliaries(assignments: Map<string, Candidate>, minimumZki: number) {
  const used = new Set<string>();
  assignments.forEach((candidate) => {
    used.add(personIdentity(candidate.rrId, candidate.rr));
    if (!normalizePersonName(candidate.driver).startsWith("sin conductor")) used.add(personIdentity(candidate.driverId, candidate.driver));
  });
  const usedDrivers = new Set<string>();
  const ordered = Array.from(assignments.entries()).sort((left, right) => right[1].auxiliaryZki - left[1].auxiliaryZki);
  const result = new Map<string, Candidate>();
  ordered.forEach(([tripId, candidate]) => {
    const driverKey = personIdentity(candidate.driverId, candidate.driver);
    const isRealDriver = driverKey && !normalizePersonName(candidate.driver).startsWith("sin conductor");
    if (isRealDriver && usedDrivers.has(driverKey)) return;
    if (isRealDriver) usedDrivers.add(driverKey);
    const key = personIdentity(candidate.auxiliaryId, candidate.auxiliary);
    const isRealAuxiliary = key && !normalizePersonName(candidate.auxiliary).startsWith("sin auxiliar");
    if (!isRealAuxiliary || !used.has(key)) {
      if (isRealAuxiliary) used.add(key);
      result.set(tripId, candidate);
      return;
    }
    const replacement = candidate.auxiliaryOptions?.find((option) => {
      const optionKey = personIdentity(option.id, option.name);
      return optionKey && !used.has(optionKey);
    });
    if (replacement) {
      used.add(personIdentity(replacement.id, replacement.name));
      const totalZki = Math.round((candidate.zki + replacement.zki) * 100) / 100;
      result.set(tripId, {
        ...candidate,
        auxiliary: replacement.name,
        auxiliaryId: replacement.id,
        auxiliaryZki: replacement.zki,
        totalZki,
        viable: candidate.hasKnowledge && candidate.capacity > 0 && totalZki >= minimumZki * 2,
      });
      return;
    }
    const totalZki = Math.round(candidate.zki * 100) / 100;
    result.set(tripId, {
      ...candidate,
      auxiliary: "Sin auxiliar disponible",
      auxiliaryId: "",
      auxiliaryZki: 0,
      totalZki,
      viable: candidate.hasKnowledge && candidate.capacity > 0 && totalZki >= minimumZki * 2,
      reason: `${candidate.reason} El auxiliar habitual ya fue asignado a otro viaje.`,
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

function samePerson(leftId: string | undefined, leftName: string | undefined, rightId: string | undefined, rightName: string | undefined) {
  const cleanLeftId = String(leftId || "").replace(/\D/g, "");
  const cleanRightId = String(rightId || "").replace(/\D/g, "");
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
    const leftTeamViable = Boolean(left.recommendation?.hasKnowledge && left.recommendation.totalZki >= minimumZki * 2);
    const rightTeamViable = Boolean(right.recommendation?.hasKnowledge && right.recommendation.totalZki >= minimumZki * 2);
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
          viable: recommendation.hasKnowledge && recommendation.totalZki >= minimumZki * 2,
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
      territoryId: tripNumber,
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
    client: text(read(row, ["Codigo", "Código", "Cliente", "ID cliente", "Código cliente", "Codigo cliente", "Cuenta", "Establecimiento"])),
    zone: text(read(row, ["Zona", "Población", "Poblacion", "Territorio", "Ruta", "Nombre ruta"])),
    neighborhood: text(read(row, ["Barrio", "Neighborhood"])),
    driver: text(read(row, ["Conductor", "Nombre conductor", "nombreAuxiliar1"])),
    vehicle: text(read(row, ["Vehículo", "Vehiculo", "Placa"])),
    role: text(read(row, ["Cargo", "Rol", "Role"])),
    count: Math.max(1, number(read(row, ["Visitas", "Cantidad", "Frecuencia"]))),
  })).filter((row) => {
    const role = normalize(row.role);
    return row.rr && row.client && (!role || role.includes("responsable") || role.includes("auxiliar"));
  });
}

export function parseTerritoryClients(rows: RawRow[]): TerritoryClient[] {
  return rows.map((row) => ({
    territoryId: text(read(row, ["id territory", "territory", "territorio", "id territorio", "Número", "Numero"])),
    client: text(read(row, ["Codigos de cliente", "Códigos de cliente", "Codigo de cliente", "Código de cliente", "Cliente"])),
  })).filter((row) => row.territoryId && row.client);
}

export function rankCandidates(
  trip: Trip,
  _history: CrewHistory[],
  visits: ZkiVisit[],
  territoryClientCodes: string[],
  capacities: Map<string, number>,
  settings: ZkiSettings,
  auxiliaryRoster: ZkiVisit[] = visits,
): Candidate[] {
  const rrNames = new Map<string, string>();
  visits.filter(isResponsibleVisit).forEach((row) => rrNames.set(normalizePersonName(row.rr), row.rr));
  const configuredClients = new Set(territoryClientCodes.map(normalize).filter(Boolean));
  const territoryVisits = configuredClients.size
    ? visits.filter((row) => configuredClients.has(normalize(row.client)))
    : visits.filter((row) => !row.zone || sameZone(row.zone, trip.zone));
  const territoryClientSet = configuredClients.size
    ? configuredClients
    : new Set(territoryVisits.map((row) => normalize(row.client)).filter(Boolean));
  const responsibleVisitsByRr = new Map<string, ZkiVisit[]>();
  territoryVisits.forEach((row) => {
    if (!isResponsibleVisit(row)) return;
    const key = normalizePersonName(row.rr);
    if (!key) return;
    const current = responsibleVisitsByRr.get(key);
    if (current) current.push(row);
    else responsibleVisitsByRr.set(key, [row]);
  });
  const territoryClients = Math.max(trip.clients, territoryClientSet.size);
  const scoredAuxiliaries = rankAuxiliaries(territoryVisits, territoryClients, settings);
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
      const client = normalize(row.client);
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
    const depthClients = Array.from(visitsByClient.values()).filter((count) => count >= settings.depthThreshold).length;
    // Profundidad: de los clientes únicos atendidos, qué porcentaje alcanzó el
    // número mínimo de visitas configurado.
    const depth = uniqueVisited > 0 ? clamp((depthClients / uniqueVisited) * 100) : 0;
    const weightTotal = settings.coverageWeight + settings.frequencyWeight + settings.depthWeight || 100;
    const zki = clamp(
      (coverage * settings.coverageWeight + frequencyScore * settings.frequencyWeight + depth * settings.depthWeight) / weightTotal,
    );
    const auxiliaryOptions = auxiliaries
      .filter((item) => item.key !== rrKey)
      .sort((left, right) => zki >= settings.minimumZki ? left.zki - right.zki : right.zki - left.zki);
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
    const meetsCombinedZki = zki + auxiliary.zki >= settings.minimumZki * 2;
    const viable = hasKnowledge && hasCapacity && meetsCombinedZki && trip.weight <= capacity;
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
      reason: !hasKnowledge
        ? "No evaluable: el RR no tiene visitas ZKI para los clientes de este territorio."
        : !meetsCombinedZki
            ? `No viable: el ZKI combinado es ${Math.round(zki + auxiliary.zki)} y requiere ${settings.minimumZki * 2}.`
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

function rankAuxiliaries(visits: ZkiVisit[], territoryClients: number, settings: ZkiSettings) {
  const grouped = new Map<string, ZkiVisit[]>();
  visits.forEach((visit) => {
    if (!isAuxiliaryVisit(visit)) return;
    const key = normalizePersonName(visit.rr);
    if (!key) return;
    const current = grouped.get(key);
    if (current) current.push(visit);
    else grouped.set(key, [visit]);
  });
  const weightTotal = settings.coverageWeight + settings.frequencyWeight + settings.depthWeight || 100;
  return Array.from(grouped.values()).map((rows) => {
    const byClient = new Map<string, number>();
    rows.forEach((row) => {
      const client = normalize(row.client);
      if (client) byClient.set(client, (byClient.get(client) || 0) + visitCount(row));
    });
    const unique = byClient.size;
    const coverage = territoryClients > 0 ? clamp((unique / territoryClients) * 100) : 0;
    const totalVisits = rows.reduce((total, row) => total + visitCount(row), 0);
    const frequency = unique > 0 ? round2(totalVisits / unique) : 0;
    const frequencyScore = clamp((frequency / Math.max(1, settings.frequencyCap)) * 100);
    const deep = Array.from(byClient.values()).filter((count) => count >= settings.depthThreshold).length;
    const depth = unique > 0 ? clamp((deep / unique) * 100) : 0;
    const zki = clamp((coverage * settings.coverageWeight + frequencyScore * settings.frequencyWeight + depth * settings.depthWeight) / weightTotal);
    return { key: normalizePersonName(rows[0].rr), name: rows[0].rr, id: rows[0].rrId || "", zki };
  }).sort((left, right) => right.zki - left.zki);
}

function isResponsibleVisit(visit: ZkiVisit) {
  const role = normalize(visit.role);
  return !role || role.includes("responsable");
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

function sameZone(left: string, right: string) {
  const a = normalize(left);
  const b = normalize(right);
  return Boolean(a && b && (a === b || a.includes(b) || b.includes(a)));
}

function normalize(value: unknown) {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
}

function normalizePersonName(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .sort()
    .join("");
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
