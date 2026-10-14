import test from "node:test";
import assert from "node:assert/strict";
import { rankTerritoryAuxiliaries } from "./zkiEngine.ts";

function visitsInTerritory(rows: Array<Record<string, unknown>>, territory: string) {
  return parseZkiVisits(rows.map((row) => ({ ...row, Barrio: territory })));
}

test("no asigna como conductor a un responsable de otra ruta y busca reemplazo", () => {
  const trips = parseTrips([{ Numero: 1, Nombre: "A", Peso: 1000 }, { Numero: 2, Nombre: "B", Peso: 1000 }]);
  const plans = trips.map((trip, index) => ({ trip, recommendation: { ...fakeCandidate(index ? "Jimenez Mosquera Omar Jose" : "Otro RR", 90), rrId: index ? "123" : "456", vehicle: "" } }));
  const assigned = assignFreeResponsiblesToDriverVehicles(plans, [
    { plate: "AAA111", driver: "Jimenez Mosquera Omar Jose", driverId: "123" },
    { plate: "BBB222", driver: "Conductor libre uno", driverId: "789" },
    { plate: "CCC333", driver: "Conductor libre dos", driverId: "987" },
  ], new Map([["aaa111", 2000], ["bbb222", 2000], ["ccc333", 2000]]));
  assert.equal(assigned.size, 2);
  assert.deepEqual([...assigned.values()].map(row => row.driverId), ["789", "987"]);
});

test("controla responsable-conductor-auxiliar por cédula aunque el nombre cambie", () => {
  const assigned = enforceUniqueAssignedCrew([
    { tripId: "T1", recommendation: { ...fakeCandidate("Omar Jimenez Mosquera", 90), rrId: "123", driver: "Conductor libre", driverId: "456", auxiliary: "Omar Jose Jimenez", auxiliaryId: "00123", auxiliaryZki: 70, auxiliaryOptions: [{ name: "Auxiliar libre", id: "789", zki: 50 }] } },
    { tripId: "T2", recommendation: { ...fakeCandidate("Otro responsable", 80), rrId: "321", driver: "Jimenez Mosquera Omar Jose", driverId: "123" } },
  ]);
  assert.equal(assigned.get("T1")?.auxiliaryId, "789");
  assert.equal(assigned.get("T2")?.driverId, "");
  assert.equal(assigned.get("T2")?.viable, false);
  assert.equal(assigned.size, 2);
});

test("no repite auxiliares con la misma cédula y variantes de nombre", () => {
  const assigned = enforceUniqueAssignedCrew([
    { tripId: "T1", recommendation: { ...fakeCandidate("RR uno", 90), auxiliary: "Luis Diaz", auxiliaryId: "123", auxiliaryZki: 60 } },
    { tripId: "T2", recommendation: { ...fakeCandidate("RR dos", 80), auxiliary: "Luis Alberto Diaz", auxiliaryId: "00123", auxiliaryZki: 70 } },
  ]);
  assert.equal([...assigned.values()].filter(row => row.auxiliaryId).length, 1);
  assert.equal(assigned.size, 2);
});

test("un conductor con dos placas solo se usa una vez y se elige otro conductor libre", () => {
  const trips = parseTrips([{ Numero: 1, Nombre: "A", Peso: 1000 }, { Numero: 2, Nombre: "B", Peso: 1000 }]);
  const plans = trips.map((trip, index) => ({ trip, recommendation: { ...fakeCandidate(`RR ${index}`, 90), driverId: "", vehicle: "" } }));
  const assigned = assignFreeResponsiblesToDriverVehicles(plans, [
    { plate: "AAA111", driver: "Juan Perez", driverId: "00123" },
    { plate: "BBB222", driver: "Perez Juan Carlos", driverId: "123" },
    { plate: "CCC333", driver: "Luis Diaz", driverId: "456" },
  ], new Map([["aaa111", 2000], ["bbb222", 2000], ["ccc333", 2000]]));
  assert.equal(assigned.size, 2);
  assert.deepEqual([...assigned.values()].map(row => row.driver), ["Juan Perez", "Luis Diaz"]);
});

test("el control final reconoce la misma cédula con distinto nombre y conserva la ruta pendiente", () => {
  const assigned = enforceUniqueAssignedCrew([
    { tripId: "T1", recommendation: { ...fakeCandidate("RR 1", 90), driver: "Juan Perez", driverId: "00123" } },
    { tripId: "T2", recommendation: { ...fakeCandidate("RR 2", 80), driver: "Juan Carlos Perez", driverId: "123" } },
  ]);
  assert.equal(assigned.size, 2);
  assert.equal(assigned.get("T1")?.driverId, "00123");
  assert.equal(assigned.get("T2")?.driverId, "");
  assert.equal(assigned.get("T2")?.driver, "Sin conductor disponible");
  assert.equal(assigned.get("T2")?.capacity, 0);
  assert.equal(assigned.get("T2")?.viable, false);
  assert.match(assigned.get("T2")?.reason || "", /ya está asignado/);
});

test("sin cédula detecta el conductor con nombres reordenados y no elimina rutas pendientes", () => {
  const assigned = enforceUniqueAssignedCrew([
    { tripId: "T1", recommendation: { ...fakeCandidate("RR 1", 90), driver: "Juan Pérez", driverId: "" } },
    { tripId: "T2", recommendation: { ...fakeCandidate("RR 2", 80), driver: "Perez Juan", driverId: "" } },
    { tripId: "T3", recommendation: { ...fakeCandidate("RR 3", 70), driver: "Sin conductor disponible", driverId: "", capacity: 0 } },
  ]);
  assert.equal(assigned.size, 3);
  assert.equal([...assigned.values()].filter(row => row.driver === "Sin conductor disponible").length, 2);
});

test("recupera el ZKI del auxiliar solo con un código del catálogo", () => {
  const trip = parseTrips([{ Numero: 1, Nombre: "Zona", Peso: 1000, Clientes: 1 }])[0];
  const visits = parseZkiVisits([{ Nombre: "Auxiliar real", Cedula: "123", Cargo: "Auxiliar", Codigo: "00100", Barrio: "Zona", Visitas: 5 }]);
  const scores = rankTerritoryAuxiliaries(trip, visits, ["100"], DEFAULT_ZKI_SETTINGS);
  assert.equal(scores.length, 1);
  assert.equal(scores[0].zki, 100);
  assert.deepEqual(rankTerritoryAuxiliaries(trip, visits, ["200"], DEFAULT_ZKI_SETTINGS), []);
  const [otherTrip] = parseTrips([{ Numero: 2, Nombre: "Carrizal", Peso: 1000 }]);
  assert.equal(rankTerritoryAuxiliaries(otherTrip, visits, ["100"], DEFAULT_ZKI_SETTINGS)[0].zki, 100);
});

test("asigna el auxiliar con historial a la ruta que puede alcanzar el umbral", () => {
  const options = [{ name: "Auxiliar experto", id: "301", zki: 30 }, { name: "Auxiliar reserva", id: "302", zki: 0 }];
  const base = { auxiliary: options[0].name, auxiliaryId: options[0].id, auxiliaryZki: 30, auxiliaryOptions: options };
  const assigned = enforceUniqueAssignedCrew([
    { tripId: "POSITIVA", recommendation: { ...fakeCandidate("RR positivo", 70), ...base, zki: 70, totalZki: 100 } },
    { tripId: "CERO", recommendation: { ...fakeCandidate("RR reserva", 0), ...base, zki: 0, hasKnowledge: false, totalZki: 30 } },
  ]);
  assert.equal(assigned.get("CERO")?.auxiliaryZki, 0);
  assert.equal(assigned.get("CERO")?.zki, 0);
  assert.equal(assigned.get("CERO")?.viable, false);
  assert.equal(assigned.get("POSITIVA")?.totalZki, 100);
  assert.equal(assigned.get("POSITIVA")?.viable, true);
  assert.equal(new Set([...assigned.values()].map(row => row.auxiliaryId)).size, 2);
});
import { assignFreeResponsiblesToDriverVehicles, assignCompatibleVehicles, assignDriverVehiclePairs, assignResponsiblesWithCrewRetention, assignUniqueResponsibles, capacityMap, DEFAULT_ZKI_SETTINGS, enforceUniqueAssignedCrew, parseCrewHistory, parseTrips, parseZkiVisits, rankCandidates, type Candidate } from "./zkiEngine.ts";

test("cruza códigos numéricos de Excel y reconoce RR y líder de ruta", () => {
  const trip = parseTrips([{ Numero: "007.0", Nombre: "Zona", Peso: 500, Clientes: 1 }])[0];
  assert.equal(trip.territoryId, "7");
  const visits = parseZkiVisits([
    { Nombre: "Ana Perez", Cargo: "RR", Codigo: "000123.0", Barrio: "Zona", Visitas: 5 },
    { Nombre: "Luis Diaz", Cargo: "Líder de Ruta", Codigo: 123, Barrio: "Zona", Visitas: 5 },
    { Nombre: "Conductor", Cargo: "Conductor", Codigo: 123, Barrio: "Zona", Visitas: 5 },
  ]);
  assert.equal(visits.length, 2);
  const ranked = rankCandidates(trip, [], visits, ["00123"], new Map(), DEFAULT_ZKI_SETTINGS);
  assert.equal(ranked.length, 2);
  assert.ok(ranked.every(candidate => candidate.zki === 100));
  assert.ok(rankCandidates(trip, [], visits, ["1234"], new Map(), DEFAULT_ZKI_SETTINGS).every(candidate => candidate.zki === 0));
});

test("prioriza las rutas que alcanzan el umbral combinado", () => {
  const plans = Array.from({ length: 5 }, (_, index) => ({
    tripId: `T${index}`,
    candidates: index < 4
      ? [fakeCandidate(`RR ${index}`, 100), fakeCandidate(`RR ${index + 1}`, 1)]
      : [fakeCandidate("RR 0", 1), { ...fakeCandidate("RR 4", 0), hasKnowledge: false }],
  }));
  const assigned = [...assignUniqueResponsibles(plans).values()];
  assert.equal(assigned.length, 5);
  assert.equal(assigned.filter(candidate => candidate.hasKnowledge && candidate.totalZki >= DEFAULT_ZKI_SETTINGS.minimumZki).length, 4);
  assert.equal(new Set(assigned.map(candidate => candidate.rr)).size, 5);
});

test("prefiere un RR con profundidad cero si el auxiliar permite superar el umbral", () => {
  const lower = { ...fakeCandidate("RR parcial", 60), zki: 20, auxiliaryZki: 40, totalZki: 60 };
  const viable = { ...fakeCandidate("RR apoyado", 80), zki: 0, auxiliaryZki: 80, totalZki: 80 };
  const assigned = assignUniqueResponsibles([{ tripId: "T1", candidates: [lower, viable] }]);
  assert.equal(assigned.get("T1")?.rr, "RR apoyado");
});

test("intercambia RR entre territorios para que auxiliares únicos completen más rutas", () => {
  const withScores = (rr: string, zki: number, first: number, second: number) => ({
    ...fakeCandidate(rr, zki + Math.max(first, second)),
    zki,
    auxiliary: first >= second ? "Auxiliar A" : "Auxiliar B",
    auxiliaryId: first >= second ? "A" : "B",
    auxiliaryZki: Math.max(first, second),
    auxiliaryOptions: [{ name: "Auxiliar A", id: "A", zki: first }, { name: "Auxiliar B", id: "B", zki: second }],
  });
  const assigned = assignUniqueResponsibles([
    { tripId: "T1", candidates: [withScores("RR 1", 60, 20, 0), withScores("RR 2", 55, 0, 20)] },
    { tripId: "T2", candidates: [withScores("RR 1", 60, 20, 0), withScores("RR 2", 60, 20, 0)] },
  ]);
  assert.equal(assigned.get("T1")?.rr, "RR 2");
  assert.equal(assigned.get("T2")?.rr, "RR 1");
  const complete = enforceUniqueAssignedCrew([...assigned].map(([tripId, recommendation]) => ({ tripId, recommendation })));
  assert.equal([...complete.values()].filter((candidate) => candidate.viable).length, 2);
});

test("interpreta las columnas operativas del Excel ZKI", () => {
  const [trip] = parseTrips([{ "Fecha de entrega": "8/6/2026", Número: 1, Nombre: "El Triunfo", Peso: "8547,08", Clientes: 20, "Peso Maximo": 9710 }]);
  assert.equal(trip.zone, "El Triunfo");
  assert.equal(trip.weight, 8547.08);
  assert.equal(trip.clients, 20);
});

test("mantiene el conductor y cambia a un VH que sí soporte el peso", () => {
  const trip = parseTrips([{ Número: 1, Nombre: "Zona", Peso: 9_500 }])[0];
  const candidate = { rr: "RR 1", rrId: "1", driver: "Conductor", driverId: "2", vehicle: "VH-PEQUENO", coverage: 90, frequency: 1, frequencyScore: 20, depth: 80, zki: 90, auxiliary: "Aux", auxiliaryId: "3", auxiliaryZki: 80, totalZki: 170, capacity: 8_000, viable: false, hasKnowledge: true, habitualVehicle: true, reason: "Sobrepeso" } satisfies Candidate;
  const assigned = assignCompatibleVehicles([{ trip, recommendation: candidate }], new Map([["pequeno", 8_000], ["grande", 10_000]])).get(trip.id);
  assert.equal(assigned?.vehicle, "GRANDE");
  assert.equal(assigned?.driver, "Conductor");
  assert.equal(assigned?.viable, true);
  assert.equal(assigned?.capacity, 10_000);
});

test("conserva el VH fijo del conductor aunque el viaje traiga otra placa", () => {
  const trip = parseTrips([{ Número: 1, Nombre: "Zona", Peso: 8_000, "Placa Asignada": "COVE-L558" }])[0];
  const candidate = { rr: "RR 1", rrId: "1", driver: "Conductor", driverId: "2", vehicle: "PLACA-EXTERNA", coverage: 90, frequency: 1, frequencyScore: 20, depth: 80, zki: 90, auxiliary: "Aux", auxiliaryId: "3", auxiliaryZki: 80, totalZki: 170, capacity: 10_000, viable: true, hasKnowledge: true, habitualVehicle: true, reason: "Viable" } satisfies Candidate;
  const assigned = assignCompatibleVehicles(
    [{ trip, recommendation: candidate }],
    new Map([["vel558", 9_000], ["placaexterna", 10_000], ["otraexterna", 12_000]]),
  ).get(trip.id);
  assert.equal(assigned?.vehicle, "PLACAEXTERNA");
  assert.equal(assigned?.capacity, 10_000);
  assert.equal(assigned?.viable, true);
});

test("cambia el VH y conserva el conductor cuando su vehículo histórico está indisponible", () => {
  const trip = parseTrips([{ Número: 1, Nombre: "Zona", Peso: 8_000, "Placa Asignada": "NO-EXISTE" }])[0];
  const candidate = { rr: "RR 1", rrId: "1", driver: "Conductor", driverId: "2", vehicle: "HISTORICA-FALSA", coverage: 90, frequency: 1, frequencyScore: 20, depth: 80, zki: 90, auxiliary: "Aux", auxiliaryId: "3", auxiliaryZki: 80, totalZki: 170, capacity: 10_000, viable: true, hasKnowledge: true, habitualVehicle: true, reason: "Viable" } satisfies Candidate;
  const assigned = assignCompatibleVehicles(
    [{ trip, recommendation: candidate }],
    new Map([["placareal", 9_000]]),
  ).get(trip.id);
  assert.equal(assigned?.vehicle, "PLACAREAL");
  assert.equal(assigned?.driver, "Conductor");
  assert.equal(assigned?.viable, true);
  assert.match(assigned?.reason || "", /indisponible/);
});

test("bloquea si el VH habitual está indisponible y no existe reemplazo con capacidad", () => {
  const trip = parseTrips([{ Número: 1, Nombre: "Zona", Peso: 10_000 }])[0];
  const candidate = { ...fakeCandidate("RR 1", 100), driver: "Conductor", vehicle: "VH-INACTIVO", viable: true };
  const assigned = assignCompatibleVehicles([{ trip, recommendation: candidate }], new Map([["pequeno", 9_000]])).get(trip.id);
  assert.equal(assigned?.vehicle, "Sin placa");
  assert.equal(assigned?.viable, false);
  assert.match(assigned?.reason || "", /no hay otro VH con capacidad suficiente/);
});

test("usa placas alternativas distintas cuando el VH habitual no está habilitado", () => {
  const trips = parseTrips([
    { Número: 1, Nombre: "Zona 1", Peso: 8_000, "Placa Asignada": "VEL588" },
    { Número: 2, Nombre: "Zona 2", Peso: 7_000, "Placa Asignada": "VEL588" },
  ]);
  const candidate = fakeCandidate("RR 1", 100);
  const assigned = assignCompatibleVehicles(
    trips.map((trip) => ({ trip, recommendation: { ...candidate } })),
    new Map([["vel588", 9_000], ["vel589", 9_000]]),
  );
  assert.equal(assigned.get(trips[0].id)?.vehicle, "VEL588");
  assert.equal(assigned.get(trips[1].id)?.vehicle, "VEL589");
  assert.equal(assigned.get(trips[1].id)?.driver, candidate.driver);
});

test("completa todas las rutas con parejas conductor y carro diferentes", () => {
  const trips = parseTrips([
    { Número: 1, Nombre: "Zona 1", Viaje: 1, Peso: 8_000 },
    { Número: 2, Nombre: "Zona 2", Viaje: 1, Peso: 7_000 },
  ]);
  const recommendations = trips.map((trip, index) => ({ trip, recommendation: fakeCandidate(`RR ${index + 1}`, 100 - index) }));
  const assigned = assignDriverVehiclePairs(recommendations, [
    { plate: "AAA111", driver: "Conductor A", driverId: "10" },
    { plate: "BBB222", driver: "Conductor B", driverId: "20" },
  ], new Map([["aaa111", 8_000], ["bbb222", 9_000]]));
  assert.equal(assigned.size, 2);
  assert.deepEqual(new Set(Array.from(assigned.values(), (row) => `${row.driver}:${row.vehicle}`)), new Set(["Conductor A:AAA111", "Conductor B:BBB222"]));
});

test("si el VH fijo no esta disponible toma otro VH disponible con su conductor", () => {
  const [trip] = parseTrips([{ Numero: 1, Nombre: "Zona", Peso: 8_000 }]);
  const recommendation = { ...fakeCandidate("RR 1", 170), driver: "Conductor fijo", vehicle: "VH-FIJO" };
  const assigned = assignDriverVehiclePairs(
    [{ trip, recommendation }],
    [
      { plate: "VH-FIJO", driver: "Conductor fijo", driverId: "10" },
      { plate: "VH-DISPONIBLE", driver: "Conductor disponible", driverId: "20" },
    ],
    // VH-FIJO no aparece: fue marcado como indisponible.
    new Map([["disponible", 9_000]]),
  ).get(trip.id);

  assert.equal(assigned?.vehicle, "VH-DISPONIBLE");
  assert.equal(assigned?.driver, "Conductor disponible");
  assert.notEqual(assigned?.driver, "Conductor fijo");
});

test("si faltan carros prioriza la ruta viable y deja la de ZKI cero sin placa", () => {
  const trips = parseTrips([
    { Número: 1, Nombre: "ZKI cero", Peso: 9_000 },
    { Número: 2, Nombre: "Viable", Peso: 8_000 },
  ]);
  const zero = { ...fakeCandidate("RR cero", 0), zki: 0, totalZki: 0, viable: false };
  const viable = { ...fakeCandidate("RR viable", 170), zki: 80, auxiliaryZki: 90, totalZki: 170 };
  const assigned = assignDriverVehiclePairs(
    [{ trip: trips[0], recommendation: zero }, { trip: trips[1], recommendation: viable }],
    [{ plate: "AAA111", driver: "Conductor A", driverId: "10" }],
    new Map([["aaa111", 10_000]]),
  );
  assert.equal(assigned.get(trips[1].id)?.vehicle, "AAA111");
  assert.equal(assigned.get(trips[0].id)?.vehicle, "Sin placa");
});

test("con RR libres reserva el conductor escaso para la ruta viable aunque pese menos", () => {
  const trips = parseTrips([
    { Numero: 1, Nombre: "Pesada sin ZKI", Peso: 9_000 },
    { Numero: 2, Nombre: "Ligera viable", Peso: 8_000 },
  ]);
  const zero = { ...fakeCandidate("RR cero", 0), zki: 0, totalZki: 0, hasKnowledge: false };
  const viable = { ...fakeCandidate("RR viable", 100), zki: 100, totalZki: 100 };
  const assigned = assignFreeResponsiblesToDriverVehicles(
    [{ trip: trips[0], recommendation: zero }, { trip: trips[1], recommendation: viable }],
    [{ plate: "AAA111", driver: "Conductor A", driverId: "10" }],
    new Map([["aaa111", 10_000]]),
  );
  assert.equal(assigned.get(trips[1].id)?.vehicle, "AAA111");
  assert.equal(assigned.get(trips[0].id)?.vehicle, "Sin placa");
});

test("si faltan parejas prioriza el mayor ZKI del RR aunque su ruta pese menos", () => {
  const trips = parseTrips([
    { Numero: 1, Nombre: "ZKI bajo", Peso: 9_000 },
    { Numero: 2, Nombre: "ZKI alto", Peso: 7_000 },
  ]);
  const low = { ...fakeCandidate("RR bajo", 40), zki: 15, totalZki: 40, viable: false };
  const high = { ...fakeCandidate("RR alto", 120), zki: 75, totalZki: 120, viable: false };
  const assigned = assignDriverVehiclePairs(
    [{ trip: trips[0], recommendation: low }, { trip: trips[1], recommendation: high }],
    [{ plate: "AAA111", driver: "Conductor A", driverId: "10" }],
    new Map([["aaa111", 10_000]]),
  );

  assert.equal(assigned.get(trips[1].id)?.vehicle, "AAA111");
  assert.equal(assigned.get(trips[0].id)?.vehicle, "Sin placa");
});

test("no interpreta el catálogo territorio-cliente como viajes", () => {
  const trips = parseTrips([{ "id territory": 1, "Codigos de cliente": 13994953 }]);
  assert.equal(trips.length, 0);
});

test("solo conserva primeros viajes y excluye viaje 11 y segundos viajes", () => {
  const trips = parseTrips([
    { Número: 1, Nombre: "Zona 1", Viaje: 1 },
    { Número: 2, Nombre: "Zona 2", Viaje: "1 UDH" },
    { Número: 3, Nombre: "Zona 3", Viaje: "1UDH" },
    { Número: 4, Nombre: "Zona 4", Viaje: 11 },
    { Número: 5, Nombre: "Zona 5", Viaje: 2 },
    { Número: 6, Nombre: "Zona 6", Viaje: "2 SV PM" },
    { Número: 7, Nombre: "Zona 7", Viaje: "11 UDH" },
    { Número: 8, Nombre: "Zona 8", Viaje: "Segundo viaje" },
    { Número: 9, Nombre: "Zona 9", Viaje: "" },
  ]);
  assert.deepEqual(trips.map((trip) => trip.zone), ["Zona 1", "Zona 2", "Zona 3"]);
});

test("reconoce encabezados alternativos y solo calcula el primer viaje", () => {
  const trips = parseTrips([
    { Número: 1, Nombre: "Zona 1", "Número de viaje": "1 AM" },
    { Número: 2, Nombre: "Zona 2", "Número de viaje": "2 PM" },
    { Número: 3, Nombre: "Zona 3", "Número de viaje": 11 },
  ]);
  assert.deepEqual(trips.map((trip) => trip.zone), ["Zona 1"]);
});

test("interpreta Codigo y Nombre de la tabla histórica ZKI", () => {
  const visits = parseZkiVisits([{ Codigo: 12518871, Poblacion: "BARRANQUILLA", Barrio: "LA GLORIA", Nombre: "RR Ejemplo", Cedula: 1010083985, Cargo: "Responsable" }]);
  assert.equal(visits.length, 1);
  assert.equal(visits[0].client, "12518871");
  assert.equal(visits[0].rr, "RR Ejemplo");
  assert.equal(visits[0].rrId, "1010083985");
  assert.equal(visits[0].count, 1);
});

test("cuenta visitas compactadas por código de cliente", () => {
  const [trip] = parseTrips([{ Número: 1, Nombre: "Zona", Peso: 1000, Clientes: 2, "Placa Asignada": "VH-1", "Peso Máximo": 2000 }]);
  const history = parseCrewHistory([{ nombreResponsable: "RR Uno", vehiculo: "VH-1" }]);
  const visits = visitsInTerritory([
    { Codigo: 100, Nombre: "RR Uno", Cargo: "Responsable", Visitas: 5 },
    { Codigo: 101, Nombre: "RR Uno", Cargo: "Responsable", Visitas: 1 },
  ], "Zona");
  const [candidate] = rankCandidates(trip, history, visits, ["100", "101"], capacityMap([trip.raw]), DEFAULT_ZKI_SETTINGS);
  assert.equal(candidate.frequency, 3);
  assert.equal(candidate.depth, 50);
  assert.equal(candidate.zki, 50);
});

test("omite cargos distintos de Responsable en el histórico ZKI", () => {
  const visits = parseZkiVisits([{ Codigo: 12518871, Nombre: "Conductor Ejemplo", Cargo: "Conductor" }]);
  assert.equal(visits.length, 0);
});

test("no usa el vehículo histórico de seguimiento para completar la combinación", () => {
  const [trip] = parseTrips([{ Nombre: "El Triunfo", Peso: 9500, Clientes: 20, Vehículo: "VH-1", "Peso Máximo": 8600 }]);
  const history = parseCrewHistory([{ nombreResponsable: "RR 1", nombreAuxiliar1: "Conductor 1", vehiculo: "VH-1", territorio: "El Triunfo", clientes: 20, visitados: 20, fechaDespacho: "2026-08-01" }]);
  const visits = [{ rr: "RR 1", client: "C1", zone: "El Triunfo", driver: "Conductor 1", vehicle: "VH-1" }];
  const [candidate] = rankCandidates(trip, history, visits, ["C1"], capacityMap([trip.raw]), DEFAULT_ZKI_SETTINGS);
  assert.equal(candidate.viable, false);
  assert.equal(candidate.vehicle, "Sin vehículo identificado");
});

test("una visita aislada no aporta profundidad al ZKI", () => {
  const [trip] = parseTrips([{ Número: 1, Nombre: "Zona", Viaje: 1, Peso: 1000, Clientes: 1, "Placa Asignada": "AAA111" }]);
  const history = parseCrewHistory([{ nombreResponsable: "RR Bajo", nombreAuxiliar1: "Conductor", vehiculo: "AAA111" }]);
  const visits = visitsInTerritory([{ Codigo: 100, Nombre: "RR Bajo", Cargo: "Responsable" }], "Zona");
  const settings = { ...DEFAULT_ZKI_SETTINGS, coverageWeight: 100, frequencyWeight: 0, depthWeight: 0 };
  const [candidate] = rankCandidates(trip, history, visits, Array.from({ length: 9 }, (_, index) => String(100 + index)), new Map([["aaa111", 2000]]), settings);
  assert.equal(Math.round(candidate.coverage), 11);
  assert.equal(candidate.zki, 0);
  assert.equal(candidate.viable, false);
  assert.match(candidate.reason, /No viable/);
});

test("normaliza frecuencia al tope configurado y nunca supera cien", () => {
  const [trip] = parseTrips([{ Nombre: "El Triunfo", Peso: 8000, Clientes: 20, Vehículo: "VH-1", "Peso Máximo": 9000 }]);
  const history = parseCrewHistory(Array.from({ length: 8 }, (_, index) => ({ nombreResponsable: "RR 1", nombreAuxiliar1: "Conductor 1", vehiculo: "VH-1", territorio: "El Triunfo", clientes: 20, visitados: 20, fechaDespacho: `2026-07-${String(index + 1).padStart(2, "0")}` })));
  const visits = Array.from({ length: 160 }, (_, index) => ({ rr: "RR 1", client: `C${index % 20}`, zone: "El Triunfo", driver: "Conductor 1", vehicle: "VH-1" }));
  const [candidate] = rankCandidates(trip, history, visits, Array.from({ length: 20 }, (_, index) => `C${index}`), capacityMap([trip.raw]), DEFAULT_ZKI_SETTINGS);
  assert.equal(candidate.frequency, 8);
  assert.equal(candidate.frequencyScore, 100);
  assert.equal(candidate.zki <= 100, true);
});

test("conserva el nombre del RR proveniente de ZKI aunque seguimiento lo ordene distinto", () => {
  const [trip] = parseTrips([{ Número: 1, Nombre: "El Triunfo", Peso: 8000, Clientes: 1, "Placa Asignada": "VH-1", "Peso Máximo": 9000 }]);
  const history = parseCrewHistory([{ nombreResponsable: "Gustavo Mendoza Salcedo", nombreAuxiliar1: "Conductor 1", vehiculo: "VH-1", territorio: "El Triunfo", clientes: 1, visitados: 1, fechaDespacho: "2026-08-01" }]);
  const visits = visitsInTerritory([{ Codigo: 12518871, Nombre: "Mendoza Salcedo Gustavo", Cargo: "Responsable" }], "El Triunfo");
  const [candidate] = rankCandidates(trip, history, visits, ["12518871"], capacityMap([trip.raw]), DEFAULT_ZKI_SETTINGS);
  assert.equal(candidate.rr, "Mendoza Salcedo Gustavo");
  assert.equal(candidate.driver, "Sin conductor identificado");
  assert.equal(candidate.vehicle, "Sin vehículo identificado");
  assert.equal(candidate.hasKnowledge, true);
  assert.equal(candidate.viable, false);
  assert.match(candidate.reason, /ZKI/);
});

test("frecuencia usa clientes únicos y el ZKI exige cinco visitas por cliente", () => {
  const [trip] = parseTrips([{ Número: 1, Nombre: "Zona", Peso: 1000, Clientes: 20, "Placa Asignada": "VH-1", "Peso Máximo": 2000 }]);
  const history = parseCrewHistory([{ nombreResponsable: "RR Uno", nombreAuxiliar1: "Conductor", vehiculo: "VH-1" }]);
  const visits = visitsInTerritory(Array.from({ length: 5 }, (_, index) => ({ Codigo: 100 + index, Nombre: "RR Uno", Cargo: "Responsable" })), "Zona");
  const clients = Array.from({ length: 20 }, (_, index) => String(100 + index));
  const [candidate] = rankCandidates(trip, history, visits, clients, capacityMap([trip.raw]), DEFAULT_ZKI_SETTINGS);
  assert.equal(candidate.coverage, 25);
  assert.equal(candidate.frequency, 1);
  assert.equal(candidate.frequencyScore, 20);
  assert.equal(candidate.depth, 0);
  assert.equal(candidate.zki, 0);
});

test("el ZKI cuenta qué proporción de clientes atendidos llegó a cinco visitas", () => {
  const [trip] = parseTrips([{ Número: 1, Nombre: "Zona", Peso: 1000, Clientes: 20, "Placa Asignada": "VH-1", "Peso Máximo": 2000 }]);
  const history = parseCrewHistory([{ nombreResponsable: "RR Uno", vehiculo: "VH-1" }]);
  const visits = visitsInTerritory([
    ...Array.from({ length: 5 }, () => ({ Codigo: 100, Nombre: "RR Uno", Cargo: "Responsable" })),
    ...Array.from({ length: 5 }, () => ({ Codigo: 101, Nombre: "RR Uno", Cargo: "Responsable" })),
    { Codigo: 102, Nombre: "RR Uno", Cargo: "Responsable" },
    { Codigo: 103, Nombre: "RR Uno", Cargo: "Responsable" },
  ], "Zona");
  const clients = Array.from({ length: 20 }, (_, index) => String(100 + index));
  const [candidate] = rankCandidates(trip, history, visits, clients, capacityMap([trip.raw]), DEFAULT_ZKI_SETTINGS);
  assert.equal(candidate.coverage, 20);
  assert.equal(candidate.frequency, 3);
  assert.equal(candidate.depth, 50);
  assert.equal(candidate.zki, 50);
});

test("RR y auxiliar se evalúan por cliente, sin juntar visitas de clientes distintos", () => {
  const [trip] = parseTrips([{ Número: 1, Nombre: "Zona", Peso: 1000, Clientes: 3 }]);
  const rows = [
    { Codigo: 100, Nombre: "RR Uno", Cargo: "Responsable", Visitas: 2 },
    { Codigo: 101, Nombre: "RR Uno", Cargo: "Responsable", Visitas: 2 },
    { Codigo: 100, Nombre: "Aux Uno", Cargo: "Auxiliar", Visitas: 2 },
    { Codigo: 101, Nombre: "Aux Uno", Cargo: "Auxiliar", Visitas: 3 },
  ];
  const four = rankCandidates(trip, [], visitsInTerritory(rows, "Zona"), ["100", "101", "102"], new Map(), DEFAULT_ZKI_SETTINGS)[0];
  assert.equal(four.zki, 0);
  assert.equal(four.auxiliaryZki, 0);
  const fiveRows = [...rows, { Codigo: 100, Nombre: "RR Uno", Cargo: "Responsable", Visitas: 3 }];
  const five = rankCandidates(trip, [], visitsInTerritory(fiveRows, "Zona"), ["100", "101", "102"], new Map(), DEFAULT_ZKI_SETTINGS)[0];
  assert.equal(five.zki, 50);
  const raised = rankCandidates(trip, [], visitsInTerritory(fiveRows, "Zona"), ["100", "101", "102"], new Map(), { ...DEFAULT_ZKI_SETTINGS, depthThreshold: 6 })[0];
  assert.equal(raised.zki, 0);
  assert.equal(raised.auxiliaryZki, 0);
});

test("el código del cliente determina el ZKI aunque cambie el barrio", () => {
  const [trip] = parseTrips([{ Numero: 1, Nombre: "Carrizal", Peso: 1000, Clientes: 1 }]);
  const visits = parseZkiVisits([
    { Nombre: "RR uno", Cargo: "Responsable", Codigo: 111, Barrio: "La Gloria", Visitas: 5 },
    { Nombre: "RR dos", Cargo: "Responsable", Codigo: 999, Barrio: "Carrizal", Visitas: 5 },
    { Nombre: "Aux uno", Cargo: "Auxiliar", Codigo: 111, Barrio: "Otra zona", Visitas: 5 },
  ]);
  const candidates = rankCandidates(trip, [], visits, ["111"], new Map(), DEFAULT_ZKI_SETTINGS);
  assert.equal(candidates.find(row => row.rr === "RR uno")?.zki, 100);
  assert.equal(candidates.find(row => row.rr === "RR dos")?.zki, 0);
  assert.equal(rankTerritoryAuxiliaries(trip, visits, ["111"], DEFAULT_ZKI_SETTINGS)[0].zki, 100);
  assert.deepEqual(rankTerritoryAuxiliaries(trip, visits, ["999"], DEFAULT_ZKI_SETTINGS), []);
});

test("sin códigos del catálogo no atribuye ZKI por el nombre de la zona", () => {
  const [trip] = parseTrips([{ Numero: 1, Nombre: "Las Mavinas, Lipaya", Peso: 1000 }]);
  const visits = parseZkiVisits([
    { Nombre: "RR uno", Cargo: "Responsable", Codigo: 111, Barrio: "LAS MALVINAS", Visitas: 5 },
    { Nombre: "Aux uno", Cargo: "Auxiliar", Codigo: 111, Barrio: "LIPAYA", Visitas: 5 },
  ]);
  const [candidate] = rankCandidates(trip, [], visits, [], new Map(), DEFAULT_ZKI_SETTINGS);
  assert.equal(candidate.zki, 0);
  assert.equal(candidate.auxiliaryZki, 0);
  assert.deepEqual(rankTerritoryAuxiliaries(trip, visits, [], DEFAULT_ZKI_SETTINGS), []);
});
test("un RR sin visitas al cliente puede completar la ruta con un auxiliar ZKI 100", () => {
  const [trip] = parseTrips([{ Número: 1, Nombre: "Carrizal", Peso: 1000 }]);
  const visits = parseZkiVisits([
    { Nombre: "RR externo", Cargo: "Responsable", Codigo: 200, Barrio: "Carrizal", Visitas: 5 },
    { Nombre: "Aux local", Cargo: "Auxiliar", Codigo: 100, Barrio: "Otro barrio", Visitas: 5 },
  ]);
  const [candidate] = rankCandidates(trip, [], visits, ["100"], new Map(), DEFAULT_ZKI_SETTINGS, visits, visits);
  assert.equal(candidate.hasKnowledge, false);
  assert.equal(candidate.zki, 0);
  assert.equal(candidate.auxiliaryZki, 100);
  const paired = assignFreeResponsiblesToDriverVehicles(
    [{ trip, recommendation: candidate }],
    [{ plate: "AAA111", driver: "Conductor uno", driverId: "10" }],
    new Map([["aaa111", 2000]]),
  );
  const unique = enforceUniqueAssignedCrew([{ tripId: trip.id, recommendation: paired.get(trip.id) }]);
  assert.equal(unique.get(trip.id)?.totalZki, 100);
  assert.equal(unique.get(trip.id)?.viable, true);
});

test("el ZKI del auxiliar puede completar el mínimo aunque el RR tenga profundidad cero", () => {
  const [trip] = parseTrips([{ Número: 1, Nombre: "Zona", Peso: 1000, Clientes: 1 }]);
  const visits = visitsInTerritory([
    { Codigo: 100, Nombre: "RR Uno", Cargo: "Responsable" },
    ...Array.from({ length: 5 }, () => ({ Codigo: 100, Nombre: "Aux Uno", Cargo: "Auxiliar" })),
  ], "Zona");
  const [candidate] = rankCandidates(trip, [], visits, ["100"], new Map(), DEFAULT_ZKI_SETTINGS);
  assert.equal(candidate.zki, 0);
  assert.equal(candidate.auxiliaryZki, 100);
  assert.equal(candidate.totalZki, 100);
  assert.equal(candidate.hasKnowledge, true);
});

test("evalúa en el territorio a RR registrados en otras zonas", () => {
  const [trip] = parseTrips([{ Número: 1, Nombre: "Zona A", Peso: 1000, Clientes: 1 }]);
  const roster = parseZkiVisits([
    { Codigo: 100, Nombre: "RR local", Cargo: "Responsable", Zona: "Zona A", Visitas: 5 },
    { Codigo: 200, Nombre: "RR externo", Cargo: "Responsable", Zona: "Zona B", Visitas: 5 },
  ]);
  const relevant = roster.filter((visit) => visit.client === "100");
  const candidates = rankCandidates(trip, [], relevant, ["100"], new Map(), DEFAULT_ZKI_SETTINGS, relevant, roster);
  assert.equal(candidates.length, 2);
  assert.equal(candidates.find((candidate) => candidate.rr === "RR local")?.zki, 100);
  assert.equal(candidates.find((candidate) => candidate.rr === "RR externo")?.zki, 0);
});

test("el ZKI usa solo la profundidad por cliente aunque se configuren otros pesos", () => {
  const [trip] = parseTrips([{ Número: 2, Nombre: "Territorio 2", Viaje: 1, Peso: 8471.91, Clientes: 22, "Placa Asignada": "COVEK261", "Peso Máximo": 9710 }]);
  const history = parseCrewHistory([{ nombreResponsable: "Rodriguez Bayona Julian", nombreAuxiliar1: "Lopez Lidueña Luis Eduardo", vehiculo: "COVEK261" }]);
  const visitRows: Array<Record<string, unknown>> = [];
  for (let client = 0; client < 20; client += 1) {
    const count = client < 14 ? 12 : 1;
    for (let visit = 0; visit < count; visit += 1) visitRows.push({ Codigo: 1000 + client, Nombre: "Rodriguez Bayona Julian", Cargo: "Responsable" });
  }
  visitRows.push({ Codigo: 1000, Nombre: "Rodriguez Bayona Julian", Cargo: "Responsable" });
  const clients = Array.from({ length: 22 }, (_, index) => String(1000 + index));
  const matrixSettings = { ...DEFAULT_ZKI_SETTINGS, coverageWeight: 60, frequencyWeight: 25, depthWeight: 15 };
  const [candidate] = rankCandidates(trip, history, visitsInTerritory(visitRows, "Territorio 2"), clients, capacityMap([trip.raw]), matrixSettings);
  assert.equal(candidate.coverage, 90.91);
  assert.equal(candidate.frequency, 8.75);
  assert.equal(candidate.frequencyScore, 100);
  assert.equal(candidate.depth, 70);
  assert.equal(candidate.zki, 70);
});

test("no incorpora responsables provenientes únicamente de seguimiento", () => {
  const [trip] = parseTrips([{ Número: 1, Nombre: "Zona", Viaje: 1, Peso: 1000, Clientes: 2, "Placa Asignada": "VH-1", "Peso Máximo": 2000 }]);
  const history = parseCrewHistory([{ nombreResponsable: "RR Sin Historial", vehiculo: "VH-1" }]);
  const visits = visitsInTerritory([{ Codigo: 999, Nombre: "Otro RR", Cargo: "Responsable" }], "Zona");
  const candidates = rankCandidates(trip, history, visits, ["100", "101"], capacityMap([trip.raw]), DEFAULT_ZKI_SETTINGS);
  assert.equal(candidates.length, 1);
  assert.equal(candidates.some((candidate) => candidate.rr === "RR Sin Historial"), false);
});

test("asigna cada RR a un solo territorio maximizando el resultado global", () => {
  const rr1Trip1 = fakeCandidate("RR 1", 100);
  const rr2Trip1 = fakeCandidate("RR 2", 99);
  const rr1Trip2 = fakeCandidate("RR 1", 98);
  const rr2Trip2 = fakeCandidate("RR 2", 1);
  const assignments = assignUniqueResponsibles([
    { tripId: "T1", candidates: [rr1Trip1, rr2Trip1] },
    { tripId: "T2", candidates: [rr1Trip2, rr2Trip2] },
  ]);
  assert.equal(assignments.get("T1")?.rr, "RR 2");
  assert.equal(assignments.get("T2")?.rr, "RR 1");
  assert.equal(new Set(Array.from(assignments.values()).map((candidate) => candidate.rr)).size, assignments.size);
});

test("mueve la pareja RR-conductor al territorio de mejor ZKI y redistribuye la desplazada", () => {
  const trips = parseTrips([
    { Numero: 1, Nombre: "Territorio 1", Peso: 8_000 },
    { Numero: 2, Nombre: "Territorio 2", Peso: 8_000 },
  ]);
  const pairs = [
    { plate: "AAA111", driver: "Conductor 1", driverId: "10", responsible: "RR 1", responsibleId: "RR 1" },
    { plate: "BBB222", driver: "Conductor 2", driverId: "20", responsible: "RR 2", responsibleId: "RR 2" },
  ];
  const responsibleAssignments = assignResponsiblesWithCrewRetention([
    { tripId: trips[0].id, candidates: [{ ...fakeCandidate("RR 1", 70), zki: 70 }, { ...fakeCandidate("RR 2", 90), zki: 90 }] },
    { tripId: trips[1].id, candidates: [{ ...fakeCandidate("RR 1", 95), zki: 95 }, { ...fakeCandidate("RR 2", 60), zki: 60 }] },
  ], pairs, 100);
  const crewAssignments = assignDriverVehiclePairs(
    trips.map((trip) => ({ trip, recommendation: responsibleAssignments.get(trip.id) })),
    pairs,
    new Map([["aaa111", 10_000], ["bbb222", 10_000]]),
    DEFAULT_ZKI_SETTINGS.minimumZki,
    100,
  );

  assert.equal(crewAssignments.get(trips[0].id)?.rr, "RR 2");
  assert.equal(crewAssignments.get(trips[0].id)?.driver, "Conductor 2");
  assert.equal(crewAssignments.get(trips[1].id)?.rr, "RR 1");
  assert.equal(crewAssignments.get(trips[1].id)?.driver, "Conductor 1");
});

test("cuando cambia conductor también cambia al RR asociado a esa pareja", () => {
  const [trip] = parseTrips([{ Numero: 1, Nombre: "Territorio", Peso: 8_000 }]);
  const unavailable = { ...fakeCandidate("RR 1", 95), zki: 95 };
  const available = { ...fakeCandidate("RR 2", 90), zki: 90 };
  const assigned = assignDriverVehiclePairs(
    [{ trip, candidates: [unavailable, available], recommendation: unavailable }],
    [{ plate: "BBB222", driver: "Conductor 2", driverId: "20", responsible: "RR 2", responsibleId: "RR 2" }],
    new Map([["bbb222", 10_000]]),
  ).get(trip.id);

  assert.equal(assigned?.rr, "RR 2");
  assert.equal(assigned?.driver, "Conductor 2");
  assert.equal(assigned?.vehicle, "BBB222");
});

test("con parejas escasas cubre globalmente territorios con ZKI positivo antes que ZKI cero", () => {
  const trips = parseTrips([
    { Numero: 1, Nombre: "Territorio cero", Peso: 8_000 },
    { Numero: 2, Nombre: "Territorio positivo", Peso: 8_000 },
  ]);
  const rr = "RR con pareja";
  const zero = { ...fakeCandidate(rr, 0), zki: 0, totalZki: 0, hasKnowledge: false };
  const positive = { ...fakeCandidate(rr, 90), zki: 90, totalZki: 90, hasKnowledge: true };
  const assigned = assignDriverVehiclePairs(
    [
      { trip: trips[0], candidates: [zero], recommendation: zero },
      { trip: trips[1], candidates: [positive], recommendation: positive },
    ],
    [{ plate: "AAA111", driver: "Conductor", driverId: "10", responsible: rr, responsibleId: rr }],
    new Map([["aaa111", 10_000]]),
  );

  assert.equal(assigned.has(trips[0].id), false);
  assert.equal(assigned.get(trips[1].id)?.rr, rr);
  assert.equal(assigned.get(trips[1].id)?.zki, 90);
});

test("conserva un RR único cuando se agotan las parejas conductor vehículo", () => {
  const trips = parseTrips([
    { Número: 1, Nombre: "Zona 1", Peso: 8_000 },
    { Número: 2, Nombre: "Zona 2", Peso: 8_000 },
  ]);
  const first = { ...fakeCandidate("RR 1", 90), zki: 90 };
  const second = { ...fakeCandidate("RR 2", 80), zki: 80 };
  const assigned = assignDriverVehiclePairs(
    [
      { trip: trips[0], candidates: [first, second], recommendation: first },
      { trip: trips[1], candidates: [second, first], recommendation: second },
    ],
    [{ plate: "AAA111", driver: "Conductor 1", driverId: "10", responsible: "RR 1", responsibleId: "RR 1" }],
    new Map([["aaa111", 10_000]]),
  );
  assert.equal(assigned.size, 2);
  assert.equal(assigned.get(trips[1].id)?.rr, "RR 2");
  assert.equal(assigned.get(trips[1].id)?.driver, "Sin conductor disponible");
  assert.equal(assigned.get(trips[1].id)?.capacity, 0);
});

test("usa una pareja conductor-placa libre para completar una ruta aunque no sea la habitual del RR", () => {
  const trips = parseTrips([
    { Número: 1, Nombre: "Zona 1", Peso: 8_000 },
    { Número: 2, Nombre: "Zona 2", Peso: 8_000 },
  ]);
  const first = { ...fakeCandidate("RR 1", 90), rrId: "1", zki: 90 };
  const second = { ...fakeCandidate("RR 2", 85), rrId: "2", zki: 85 };
  const assigned = assignDriverVehiclePairs(
    [
      { trip: trips[0], candidates: [first], recommendation: first },
      { trip: trips[1], candidates: [second], recommendation: second },
    ],
    [
      { plate: "AAA111", driver: "Conductor 1", driverId: "10", responsible: "RR 1", responsibleId: "1" },
      { plate: "BBB222", driver: "Conductor 3", driverId: "30", responsible: "RR 3", responsibleId: "3" },
    ],
    new Map([["aaa111", 10_000], ["bbb222", 10_000]]),
  );

  assert.equal(assigned.get(trips[0].id)?.vehicle, "AAA111");
  assert.equal(assigned.get(trips[1].id)?.rr, "RR 2");
  assert.equal(assigned.get(trips[1].id)?.driver, "Conductor 3");
  assert.equal(assigned.get(trips[1].id)?.vehicle, "BBB222");
  assert.equal(assigned.get(trips[1].id)?.habitualVehicle, false);
});

test("considera viable un ZKI combinado de 75 con el umbral inicial", () => {
  const [trip] = parseTrips([{ Número: 1, Nombre: "Zona", Peso: 8_000 }]);
  const candidate = {
    ...fakeCandidate("RR 1", 40),
    rrId: "1",
    zki: 40,
    auxiliaryZki: 35,
    totalZki: 75,
    hasKnowledge: true,
  };
  const assigned = assignDriverVehiclePairs(
    [{ trip, candidates: [candidate], recommendation: candidate }],
    [{ plate: "AAA111", driver: "Conductor 1", driverId: "10", responsible: "RR 1", responsibleId: "1" }],
    new Map([["aaa111", 10_000]]),
    DEFAULT_ZKI_SETTINGS.minimumZki,
  ).get(trip.id);

  assert.equal(assigned?.totalZki, 75);
  assert.equal(assigned?.viable, true);
});

test("mantiene pendiente una combinación inferior al umbral configurado", () => {
  const [trip] = parseTrips([{ Número: 1, Nombre: "Zona", Peso: 8_000 }]);
  const candidate = { ...fakeCandidate("RR 1", 40), rrId: "1", zki: 40, auxiliaryZki: 34, totalZki: 74, hasKnowledge: true };
  const pairs = [{ plate: "AAA111", driver: "Conductor 1", driverId: "10", responsible: "RR 1", responsibleId: "1" }];
  const capacities = new Map([["aaa111", 10_000]]);
  const plan = [{ trip, candidates: [candidate], recommendation: candidate }];
  assert.equal(assignDriverVehiclePairs(plan, pairs, capacities, 75).get(trip.id)?.viable, false);
  assert.equal(assignDriverVehiclePairs(plan, pairs, capacities, 80).get(trip.id)?.viable, false);
});

test("el respaldo ZKI cero no sobrescribe al mismo RR con historial positivo", () => {
  const historical = { ...fakeCandidate("Juan Perez", 85), rrId: "100", zki: 85, hasKnowledge: true };
  const fallback = { ...fakeCandidate("JUAN PEREZ", 0), rrId: "999", zki: 0, totalZki: 0, hasKnowledge: false, viable: false };
  const assignment = assignUniqueResponsibles([{ tripId: "T1", candidates: [historical, fallback] }]);
  assert.equal(assignment.get("T1")?.zki, 85);
  assert.equal(assignment.get("T1")?.rrId, "100");
});

test("no asigna el mismo auxiliar a dos viajes", () => {
  const initial = assignUniqueResponsibles([
    { tripId: "T1", candidates: [fakeCandidate("RR 1", 100)] },
    { tripId: "T2", candidates: [fakeCandidate("RR 2", 90)] },
  ]);
  const assignments = enforceUniqueAssignedCrew(Array.from(initial, ([tripId, recommendation]) => ({ tripId, recommendation })));
  assert.equal(assignments.get("T1")?.auxiliary, "Auxiliar");
  assert.equal(assignments.get("T2")?.auxiliary, "Sin auxiliar disponible");
});

test("usa el siguiente auxiliar disponible antes de dejar el viaje sin auxiliar", () => {
  const first = { ...fakeCandidate("RR 1", 100), auxiliaryId: "10", auxiliaryOptions: [{ name: "Auxiliar", id: "10", zki: 90 }] };
  const second = { ...fakeCandidate("RR 2", 90), auxiliaryId: "10", auxiliaryOptions: [{ name: "Auxiliar", id: "10", zki: 90 }, { name: "Auxiliar 2", id: "20", zki: 75 }] };
  const initial = assignUniqueResponsibles([
    { tripId: "T1", candidates: [first] },
    { tripId: "T2", candidates: [second] },
  ]);
  const assignments = enforceUniqueAssignedCrew(Array.from(initial, ([tripId, recommendation]) => ({ tripId, recommendation })));
  assert.equal(assignments.get("T1")?.auxiliary, "Auxiliar");
  assert.equal(assignments.get("T2")?.auxiliary, "Auxiliar 2");
});

test("distribuye auxiliares globalmente para evitar ZKI cero cuando existe una alternativa", () => {
  const flexible = {
    ...fakeCandidate("RR 1", 80), auxiliary: "Auxiliar A", auxiliaryId: "A", auxiliaryZki: 90,
    auxiliaryOptions: [{ name: "Auxiliar A", id: "A", zki: 90 }, { name: "Auxiliar B", id: "B", zki: 80 }],
  };
  const restricted = {
    ...fakeCandidate("RR 2", 80), auxiliary: "Auxiliar A", auxiliaryId: "A", auxiliaryZki: 70,
    auxiliaryOptions: [{ name: "Auxiliar A", id: "A", zki: 70 }, { name: "Auxiliar C", id: "C", zki: 0 }],
  };
  const assignments = enforceUniqueAssignedCrew([
    { tripId: "T1", recommendation: flexible },
    { tripId: "T2", recommendation: restricted },
  ]);
  assert.equal(assignments.get("T1")?.auxiliary, "Auxiliar B");
  assert.equal(assignments.get("T2")?.auxiliary, "Auxiliar A");
  assert.equal(Array.from(assignments.values()).filter((candidate) => candidate.auxiliaryZki === 0).length, 0);
});

test("balancea RR bajo con auxiliar alto y RR alto con auxiliar bajo", () => {
  const options = [
    { name: "Auxiliar alto", id: "A", zki: 100 },
    { name: "Auxiliar bajo", id: "B", zki: 60 },
  ];
  const rrAlto = {
    ...fakeCandidate("RR alto", 100), zki: 100,
    auxiliary: options[0].name, auxiliaryId: options[0].id, auxiliaryZki: options[0].zki, auxiliaryOptions: options,
  };
  const rrBajo = {
    ...fakeCandidate("RR bajo", 40), zki: 40,
    auxiliary: options[0].name, auxiliaryId: options[0].id, auxiliaryZki: options[0].zki, auxiliaryOptions: options,
  };
  const assignments = enforceUniqueAssignedCrew([
    { tripId: "ALTO", recommendation: rrAlto },
    { tripId: "BAJO", recommendation: rrBajo },
  ]);
  assert.equal(assignments.get("ALTO")?.auxiliary, "Auxiliar bajo");
  assert.equal(assignments.get("BAJO")?.auxiliary, "Auxiliar alto");
});

test("no concentra un auxiliar 100 en un RR 100 cuando uno menor completa el objetivo", () => {
  const options = [
    { name: "Auxiliar 100", id: "A", zki: 100 },
    { name: "Auxiliar 60", id: "B", zki: 60 },
  ];
  const rr = {
    ...fakeCandidate("RR 100", 100), zki: 100,
    auxiliary: options[0].name, auxiliaryId: options[0].id, auxiliaryZki: options[0].zki, auxiliaryOptions: options,
  };
  const assignments = enforceUniqueAssignedCrew([{ tripId: "T1", recommendation: rr }]);
  assert.equal(assignments.get("T1")?.auxiliary, "Auxiliar 60");
  assert.equal(assignments.get("T1")?.totalZki, 160);
});

test("la selección de RR no descarta rutas por compartir conductor histórico", () => {
  const first = fakeCandidate("RR 1", 100);
  const second = { ...fakeCandidate("RR 2", 90), driver: first.driver, driverId: first.driverId };
  const assignments = assignUniqueResponsibles([
    { tripId: "T1", candidates: [first] },
    { tripId: "T2", candidates: [second] },
  ]);
  assert.equal(assignments.size, 2);
  assert.equal(assignments.get("T1")?.driver, first.driver);
});

test("usa como reserva un auxiliar ZKI aunque no haya visitado el territorio", () => {
  const [trip] = parseTrips([{ Número: 1, Nombre: "Zona", Peso: 1000, Clientes: 1, "Placa Asignada": "VH-1", "Peso Máximo": 2000 }]);
  const history = parseCrewHistory([{ nombreResponsable: "RR Uno", nombreAuxiliar1: "Conductor Uno", vehiculo: "VH-1" }]);
  const responsibleVisits = visitsInTerritory([{ Codigo: 100, Nombre: "RR Uno", Cargo: "Responsable" }], "Zona");
  const auxiliaryRoster = visitsInTerritory([{ Codigo: 999, Nombre: "Auxiliar Reserva", Cedula: 123, Cargo: "Auxiliar" }], "Otro barrio");
  const [candidate] = rankCandidates(trip, history, responsibleVisits, ["100"], new Map([["1", 2000]]), DEFAULT_ZKI_SETTINGS, auxiliaryRoster);
  assert.equal(candidate.auxiliary, "Auxiliar Reserva");
  assert.equal(candidate.auxiliaryZki, 0);
});

function fakeCandidate(rr: string, totalZki: number): Candidate {
  return {
    rr, rrId: rr, driver: `Conductor ${rr}`, driverId: "", vehicle: `VH ${rr}`,
    coverage: totalZki, frequency: 1, frequencyScore: 20, depth: 0, zki: totalZki,
    auxiliary: "Auxiliar", auxiliaryId: "", auxiliaryZki: 0, totalZki,
    capacity: 10_000, viable: true, hasKnowledge: true, habitualVehicle: true, reason: "Viable",
  };
}

test("con igual ZKI elige al RR que conoce más clientes del territorio", () => {
  const narrower = { ...fakeCandidate("RR uno", 100), coverage: 10, uniqueClients: 1 };
  const broader = { ...fakeCandidate("RR dos", 100), coverage: 60, uniqueClients: 6 };
  const assigned = assignUniqueResponsibles([{ tripId: "territorio:1", candidates: [narrower, broader] }]);
  assert.equal(assigned.get("territorio:1")?.rr, "RR dos");
});

test('RR libre conserva mejor ZKI aunque su conductor habitual no pueda cargar el viaje', () => {
  const trip = parseTrips([{ Numero: 1, Nombre: 'Zona', Peso: 9000 }])[0];
  const best = { ...fakeCandidate('RR experto', 95), zki: 95, rrId: '1', vehicle: 'AAA111' };
  const lower = { ...fakeCandidate('RR habitual', 40), zki: 40, rrId: '2', vehicle: 'BBB222' };
  const pairs = [
    { plate: 'AAA111', driver: 'Conductor A', driverId: '10', responsible: best.rr, responsibleId: '1' },
    { plate: 'BBB222', driver: 'Conductor B', driverId: '20', responsible: lower.rr, responsibleId: '2' },
  ];
  const capacities = new Map([['aaa111', 5000], ['bbb222', 10000]]);
  const rr = assignUniqueResponsibles([{ tripId: trip.id, candidates: [best, lower] }]).get(trip.id);
  const result = assignFreeResponsiblesToDriverVehicles([{ trip, candidates: [best, lower], recommendation: rr }], pairs, capacities).get(trip.id);
  assert.equal(result?.rr, best.rr);
  assert.equal(result?.vehicle, 'BBB222');
  assert.equal(result?.driver, 'Conductor B');
  assert.equal(result?.driverId, '20');
});

test('RR libres distribuyen las placas fijas por capacidad antes del ZKI o la placa del archivo', () => {
  const trips = parseTrips([
    { Numero: 1, Nombre: 'Liviana', Peso: 8000, 'Placa Asignada': 'GRANDE' },
    { Numero: 2, Nombre: 'Pesada', Peso: 9000 },
  ]);
  const light = { ...fakeCandidate('RR liviano', 100), vehicle: 'GRANDE' };
  const heavy = { ...fakeCandidate('RR pesado', 75), vehicle: 'PEQUENA' };
  const pairs = [
    { plate: 'GRANDE', driver: 'Conductor grande', driverId: '10', responsible: 'Otro RR' },
    { plate: 'PEQUENA', driver: 'Conductor pequeno', driverId: '20', responsible: 'Otro RR' },
  ];
  const capacities = new Map([['grande', 9710], ['pequena', 8600]]);
  const assigned = assignFreeResponsiblesToDriverVehicles([
    { trip: trips[0], recommendation: light },
    { trip: trips[1], recommendation: heavy },
  ], pairs, capacities);
  assert.equal(assigned.get(trips[0].id)?.vehicle, 'PEQUENA');
  assert.equal(assigned.get(trips[1].id)?.vehicle, 'GRANDE');
  assert.equal(assigned.get(trips[0].id)?.viable, true);
  assert.equal(assigned.get(trips[1].id)?.viable, true);
});
