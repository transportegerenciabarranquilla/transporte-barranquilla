import test from "node:test";
import assert from "node:assert/strict";
import { assignCompatibleVehicles, assignDriverVehiclePairs, assignUniqueResponsibles, capacityMap, DEFAULT_ZKI_SETTINGS, enforceUniqueAssignedCrew, parseCrewHistory, parseTrips, parseZkiVisits, rankCandidates, type Candidate } from "./zkiEngine.ts";

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

test("calcula frecuencia y profundidad desde el histórico compactado", () => {
  const [trip] = parseTrips([{ Número: 1, Nombre: "Zona", Peso: 1000, Clientes: 2, "Placa Asignada": "VH-1", "Peso Máximo": 2000 }]);
  const history = parseCrewHistory([{ nombreResponsable: "RR Uno", vehiculo: "VH-1" }]);
  const visits = parseZkiVisits([
    { Codigo: 100, Nombre: "RR Uno", Cargo: "Responsable", Visitas: 5 },
    { Codigo: 101, Nombre: "RR Uno", Cargo: "Responsable", Visitas: 1 },
  ]);
  const [candidate] = rankCandidates(trip, history, visits, ["100", "101"], capacityMap([trip.raw]), DEFAULT_ZKI_SETTINGS);
  assert.equal(candidate.frequency, 3);
  assert.equal(candidate.depth, 50);
});

test("omite cargos distintos de Responsable en el histórico ZKI", () => {
  const visits = parseZkiVisits([{ Codigo: 12518871, Nombre: "Conductor Ejemplo", Cargo: "Conductor" }]);
  assert.equal(visits.length, 0);
});

test("bloquea la combinación cuando el vehículo habitual no soporta el peso", () => {
  const [trip] = parseTrips([{ Nombre: "El Triunfo", Peso: 9500, Clientes: 20, Vehículo: "VH-1", "Peso Máximo": 8600 }]);
  const history = parseCrewHistory([{ nombreResponsable: "RR 1", nombreAuxiliar1: "Conductor 1", vehiculo: "VH-1", territorio: "El Triunfo", clientes: 20, visitados: 20, fechaDespacho: "2026-08-01" }]);
  const visits = [{ rr: "RR 1", client: "C1", zone: "El Triunfo", driver: "Conductor 1", vehicle: "VH-1" }];
  const [candidate] = rankCandidates(trip, history, visits, ["C1"], capacityMap([trip.raw]), DEFAULT_ZKI_SETTINGS);
  assert.equal(candidate.viable, false);
  assert.match(candidate.reason, /Bloqueado/);
});

test("un ZKI de 11 por ciento nunca es viable", () => {
  const [trip] = parseTrips([{ Número: 1, Nombre: "Zona", Viaje: 1, Peso: 1000, Clientes: 1, "Placa Asignada": "AAA111" }]);
  const history = parseCrewHistory([{ nombreResponsable: "RR Bajo", nombreAuxiliar1: "Conductor", vehiculo: "AAA111" }]);
  const visits = parseZkiVisits([{ Codigo: 100, Nombre: "RR Bajo", Cargo: "Responsable" }]);
  const settings = { ...DEFAULT_ZKI_SETTINGS, minimumZki: 80, coverageWeight: 100, frequencyWeight: 0, depthWeight: 0 };
  const [candidate] = rankCandidates(trip, history, visits, Array.from({ length: 9 }, (_, index) => String(100 + index)), new Map([["aaa111", 2000]]), settings);
  assert.equal(Math.round(candidate.zki), 11);
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

test("cruza el mismo RR aunque ZKI y seguimiento ordenen distinto sus nombres", () => {
  const [trip] = parseTrips([{ Número: 1, Nombre: "El Triunfo", Peso: 8000, Clientes: 1, "Placa Asignada": "VH-1", "Peso Máximo": 9000 }]);
  const history = parseCrewHistory([{ nombreResponsable: "Gustavo Mendoza Salcedo", nombreAuxiliar1: "Conductor 1", vehiculo: "VH-1", territorio: "El Triunfo", clientes: 1, visitados: 1, fechaDespacho: "2026-08-01" }]);
  const visits = parseZkiVisits([{ Codigo: 12518871, Nombre: "Mendoza Salcedo Gustavo", Cargo: "Responsable" }]);
  const [candidate] = rankCandidates(trip, history, visits, ["12518871"], capacityMap([trip.raw]), DEFAULT_ZKI_SETTINGS);
  assert.equal(candidate.rr, "Gustavo Mendoza Salcedo");
  assert.equal(candidate.driver, "Conductor 1");
  assert.equal(candidate.vehicle, "VH-1");
  assert.equal(candidate.hasKnowledge, true);
  assert.equal(candidate.viable, false);
  assert.match(candidate.reason, /ZKI/);
});

test("frecuencia usa clientes únicos atendidos y no todos los del territorio", () => {
  const [trip] = parseTrips([{ Número: 1, Nombre: "Zona", Peso: 1000, Clientes: 20, "Placa Asignada": "VH-1", "Peso Máximo": 2000 }]);
  const history = parseCrewHistory([{ nombreResponsable: "RR Uno", nombreAuxiliar1: "Conductor", vehiculo: "VH-1" }]);
  const visits = parseZkiVisits(Array.from({ length: 5 }, (_, index) => ({ Codigo: 100 + index, Nombre: "RR Uno", Cargo: "Responsable" })));
  const clients = Array.from({ length: 20 }, (_, index) => String(100 + index));
  const [candidate] = rankCandidates(trip, history, visits, clients, capacityMap([trip.raw]), DEFAULT_ZKI_SETTINGS);
  assert.equal(candidate.coverage, 25);
  assert.equal(candidate.frequency, 1);
  assert.equal(candidate.frequencyScore, 20);
  assert.equal(candidate.depth, 0);
  assert.equal(candidate.zki, 20);
});

test("profundidad se calcula sobre clientes únicos atendidos", () => {
  const [trip] = parseTrips([{ Número: 1, Nombre: "Zona", Peso: 1000, Clientes: 20, "Placa Asignada": "VH-1", "Peso Máximo": 2000 }]);
  const history = parseCrewHistory([{ nombreResponsable: "RR Uno", vehiculo: "VH-1" }]);
  const visits = parseZkiVisits([
    ...Array.from({ length: 5 }, () => ({ Codigo: 100, Nombre: "RR Uno", Cargo: "Responsable" })),
    ...Array.from({ length: 5 }, () => ({ Codigo: 101, Nombre: "RR Uno", Cargo: "Responsable" })),
    { Codigo: 102, Nombre: "RR Uno", Cargo: "Responsable" },
    { Codigo: 103, Nombre: "RR Uno", Cargo: "Responsable" },
  ]);
  const clients = Array.from({ length: 20 }, (_, index) => String(100 + index));
  const [candidate] = rankCandidates(trip, history, visits, clients, capacityMap([trip.raw]), DEFAULT_ZKI_SETTINGS);
  assert.equal(candidate.coverage, 20);
  assert.equal(candidate.frequency, 3);
  assert.equal(candidate.depth, 50);
});

test("reproduce el ZKI 90,05 de la matriz SKI para territorio 2", () => {
  const [trip] = parseTrips([{ Número: 2, Nombre: "Territorio 2", Viaje: 1, Peso: 8471.91, Clientes: 22, "Placa Asignada": "COVEK261", "Peso Máximo": 9710 }]);
  const history = parseCrewHistory([{ nombreResponsable: "Rodriguez Bayona Julian", nombreAuxiliar1: "Lopez Lidueña Luis Eduardo", vehiculo: "COVEK261" }]);
  const visitRows: Array<Record<string, unknown>> = [];
  for (let client = 0; client < 20; client += 1) {
    const count = client < 14 ? 12 : 1;
    for (let visit = 0; visit < count; visit += 1) visitRows.push({ Codigo: 1000 + client, Nombre: "Rodriguez Bayona Julian", Cargo: "Responsable" });
  }
  visitRows.push({ Codigo: 1000, Nombre: "Rodriguez Bayona Julian", Cargo: "Responsable" });
  const clients = Array.from({ length: 22 }, (_, index) => String(1000 + index));
  const [candidate] = rankCandidates(trip, history, parseZkiVisits(visitRows), clients, capacityMap([trip.raw]), DEFAULT_ZKI_SETTINGS);
  assert.equal(candidate.coverage, 90.91);
  assert.equal(candidate.frequency, 8.75);
  assert.equal(candidate.frequencyScore, 100);
  assert.equal(candidate.depth, 70);
  assert.equal(candidate.zki, 90.05);
});

test("conserva como respaldo un RR sin conocimiento del territorio", () => {
  const [trip] = parseTrips([{ Número: 1, Nombre: "Zona", Viaje: 1, Peso: 1000, Clientes: 2, "Placa Asignada": "VH-1", "Peso Máximo": 2000 }]);
  const history = parseCrewHistory([{ nombreResponsable: "RR Sin Historial", vehiculo: "VH-1" }]);
  const visits = parseZkiVisits([{ Codigo: 999, Nombre: "Otro RR", Cargo: "Responsable" }]);
  const candidates = rankCandidates(trip, history, visits, ["100", "101"], capacityMap([trip.raw]), DEFAULT_ZKI_SETTINGS);
  assert.equal(candidates.length, 2);
  assert.equal(candidates.find((candidate) => candidate.rr === "RR Sin Historial")?.hasKnowledge, false);
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
  const responsibleVisits = parseZkiVisits([{ Codigo: 100, Nombre: "RR Uno", Cargo: "Responsable" }]);
  const auxiliaryRoster = parseZkiVisits([{ Codigo: 999, Nombre: "Auxiliar Reserva", Cedula: 123, Cargo: "Auxiliar" }]);
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
