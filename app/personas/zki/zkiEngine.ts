export type RawRow = Record<string, unknown>;

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
  zki: number;
  auxiliary: string;
  auxiliaryId: string;
  auxiliaryZki: number;
  totalZki: number;
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
};

export const DEFAULT_ZKI_SETTINGS: ZkiSettings = {
  coverageWeight: 60,
  frequencyWeight: 25,
  depthWeight: 15,
  frequencyCap: 5,
  minimumZki: 80,
  depthThreshold: 5,
};

export function assignUniqueResponsibles(plans: Array<{ tripId: string; candidates: Candidate[] }>) {
  const rrKeys = Array.from(new Set(plans.flatMap((plan) => plan.candidates.map((candidate) => normalizePersonName(candidate.rr))))).filter(Boolean);
  const columnCount = Math.max(plans.length, rrKeys.length);
  if (!plans.length || !columnCount) return new Map<string, Candidate>();
  const rrIndex = new Map(rrKeys.map((key, index) => [key, index]));
  const candidateMatrix = plans.map((plan) => {
    const row = new Array<Candidate | undefined>(columnCount);
    plan.candidates.forEach((candidate) => {
      const index = rrIndex.get(normalizePersonName(candidate.rr));
      if (index !== undefined) row[index] = candidate;
    });
    return row;
  });
  const weights = candidateMatrix.map((row) => row.map((candidate) => candidate ? candidate.totalZki + (candidate.viable ? 1_000 : 0) : 0));
  const assignment = maximumWeightAssignment(weights);
  const result = new Map<string, Candidate>();
  assignment.forEach((column, row) => {
    const candidate = column >= 0 ? candidateMatrix[row][column] : undefined;
    if (candidate) result.set(plans[row].tripId, candidate);
  });
  return result;
}

export function assignCompatibleVehicles<T extends { trip: Trip; recommendation?: Candidate }>(plans: T[], capacities: Map<string, number>) {
  const available = Array.from(capacities, ([key, capacity]) => ({ key, capacity })).filter((item) => item.capacity > 0);
  const used = new Set<string>();
  const result = new Map<string, Candidate>();
  [...plans].sort((a, b) => b.trip.weight - a.trip.weight).forEach(({ trip, recommendation }) => {
    if (!recommendation) return;
    const assignedKey = normalizeVehicleKey(trip.assignedPlate);
    // La placa del archivo solo es autoritativa si existe en el catálogo
    // validado por el llamador (tabla `placas`). Una placa escrita en el Excel
    // o heredada del historial nunca debe crear un vehículo nuevo de facto.
    if (assignedKey && capacities.has(assignedKey)) {
      const assignedCapacity = capacities.get(assignedKey) || 0;
      const alreadyUsed = used.has(assignedKey);
      if (!alreadyUsed) used.add(assignedKey);
      const fits = assignedCapacity > 0 && assignedCapacity >= trip.weight && !alreadyUsed;
      const reason = alreadyUsed
        ? `Bloqueado: la placa asignada ${assignedKey.toUpperCase()} aparece en más de un viaje.`
        : !assignedCapacity
          ? `Bloqueado: no se encontró la capacidad de la placa asignada ${assignedKey.toUpperCase()}.`
          : assignedCapacity < trip.weight
            ? `Bloqueado: ${formatKg(trip.weight)} kg superan la capacidad de la placa asignada ${assignedKey.toUpperCase()} (${formatKg(assignedCapacity)} kg).`
            : `Viable: conserva la placa asignada ${assignedKey.toUpperCase()} del archivo de planeación.`;
      result.set(trip.id, {
        ...recommendation,
        vehicle: assignedKey.toUpperCase(),
        capacity: assignedCapacity,
        viable: fits,
        habitualVehicle: assignedKey === normalizeVehicleKey(recommendation.vehicle),
        reason,
      });
      return;
    }
    const habitualKey = normalizeVehicleKey(recommendation.vehicle);
    const habitualCapacity = capacities.get(habitualKey) || 0;
    const habitualFits = habitualKey && !used.has(habitualKey) && habitualCapacity >= trip.weight;
    const selected = habitualFits
      ? { key: habitualKey, capacity: habitualCapacity }
      : available.filter((item) => !used.has(item.key) && item.capacity >= trip.weight).sort((a, b) => a.capacity - b.capacity)[0];
    if (!selected) {
      result.set(trip.id, { ...recommendation, vehicle: "Sin placa compatible", capacity: 0, viable: false, reason: `Bloqueado: no hay un vehículo disponible que soporte ${formatKg(trip.weight)} kg.` });
      return;
    }
    used.add(selected.key);
    const originalPlate = recommendation.vehicle;
    result.set(trip.id, { ...recommendation, vehicle: selected.key.toUpperCase(), capacity: selected.capacity, viable: true, habitualVehicle: selected.key === habitualKey, reason: selected.key === habitualKey ? recommendation.reason : `Viable por peso: se cambió ${originalPlate || "el vehículo habitual"} por ${selected.key.toUpperCase()} (${formatKg(selected.capacity)} kg).` });
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
  return rows.filter((raw) => hasOperationalTripData(raw) && isFirstTrip(raw)).map((raw, index) => {
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
      trip: text(read(raw, ["Viaje", "Número viaje", "Numero viaje"])),
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
  history: CrewHistory[],
  visits: ZkiVisit[],
  territoryClientCodes: string[],
  capacities: Map<string, number>,
  settings: ZkiSettings,
): Candidate[] {
  const byRr = new Map<string, CrewHistory[]>();
  history.forEach((row) => {
    const key = normalizePersonName(row.rr);
    byRr.set(key, [...(byRr.get(key) || []), row]);
  });

  const rrNames = new Map<string, string>();
  history.forEach((row) => rrNames.set(normalizePersonName(row.rr), row.rr));
  visits.filter(isResponsibleVisit).forEach((row) => rrNames.set(normalizePersonName(row.rr), row.rr));
  const configuredClients = new Set(territoryClientCodes.map(normalize).filter(Boolean));
  const territoryVisits = configuredClients.size
    ? visits.filter((row) => configuredClients.has(normalize(row.client)))
    : visits.filter((row) => !row.zone || sameZone(row.zone, trip.zone));
  const territoryClientSet = configuredClients.size
    ? configuredClients
    : new Set(territoryVisits.map((row) => normalize(row.client)).filter(Boolean));

  return Array.from(rrNames, ([rrKey, rrName]) => {
    const rrRows = byRr.get(rrKey) || [];
    const latest = [...rrRows].sort((a, b) => b.date.localeCompare(a.date))[0];
    const rrVisits = territoryVisits.filter((row) => isResponsibleVisit(row) && normalizePersonName(row.rr) === rrKey);
    const visitsByClient = new Map<string, number>();
    rrVisits.forEach((row) => {
      const client = normalize(row.client);
      if (client) visitsByClient.set(client, (visitsByClient.get(client) || 0) + visitCount(row));
    });
    const uniqueVisited = visitsByClient.size;
    const territoryClients = Math.max(trip.clients, territoryClientSet.size);
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
    const auxiliary = bestAuxiliary(territoryVisits, territoryClients, settings, rrKey);
    const visitIdentity = rrVisits.find((row) => row.driver || row.vehicle);
    const rr = latest?.rr || rrName;
    const rrId = latest?.rrId || rrVisits.find((row) => row.rrId)?.rrId || "";
    const driver = latest?.driver || visitIdentity?.driver || "Sin conductor identificado";
    const driverId = latest?.driverId || "";
    const vehicle = latest?.vehicle || visitIdentity?.vehicle || "Sin vehículo identificado";
    const capacity = capacities.get(normalizeVehicleKey(vehicle)) || 0;
    const hasKnowledge = rrVisits.length > 0;
    const hasCapacity = capacity > 0;
    const viable = hasKnowledge && hasCapacity && trip.weight <= capacity;
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
      zki,
      auxiliary: auxiliary.name,
      auxiliaryId: auxiliary.id,
      auxiliaryZki: auxiliary.zki,
      totalZki: Math.round((zki + auxiliary.zki) * 100) / 100,
      capacity,
      viable,
      hasKnowledge,
      habitualVehicle: true,
      reason: !hasKnowledge
        ? "No evaluable: el RR no tiene visitas ZKI para los clientes de este territorio."
        : !hasCapacity
          ? "Bloqueado: no se encontró la capacidad del vehículo habitual."
          : !viable
            ? `Bloqueado: ${formatKg(trip.weight)} kg superan ${formatKg(capacity)} kg.`
        : zki >= settings.minimumZki
          ? "Viable: conserva RR, conductor y vehículo habitual."
          : `Viable con alerta: ZKI menor a ${settings.minimumZki}%.`,
    };
  })
    // Se prueban todos los RR, pero una combinación sin una sola visita no es
    // una probabilidad útil. No se presenta como ZKI 0; la ruta queda marcada
    // sin historial si ningún RR conoce sus clientes.
    .filter((candidate) => candidate.hasKnowledge && candidate.zki > 0)
    .sort((left, right) => Number(right.viable) - Number(left.viable) || right.totalZki - left.totalZki);
}

function bestAuxiliary(visits: ZkiVisit[], territoryClients: number, settings: ZkiSettings, responsibleKey: string) {
  const grouped = new Map<string, ZkiVisit[]>();
  visits.filter(isAuxiliaryVisit).forEach((visit) => {
    const key = normalizePersonName(visit.rr);
    if (!key || key === responsibleKey) return;
    grouped.set(key, [...(grouped.get(key) || []), visit]);
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
    return { name: rows[0].rr, id: rows[0].rrId || "", zki };
  }).sort((left, right) => right.zki - left.zki)[0] || { name: "Sin auxiliar con historial", id: "", zki: 0 };
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
  return normalize(value).replace(/^vh/, "");
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

function isFirstTrip(row: RawRow) {
  const value = text(read(row, ["Viaje", "Número viaje", "Numero viaje"]));
  // Se incluyen 1, "1 UDH", "1UDH", etc. Se excluyen 11 y cualquier
  // segundo viaje (2, "2 SV PM", ...). Si el archivo no trae la columna,
  // se conserva la fila para no romper formatos históricos.
  if (!value) return true;
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
