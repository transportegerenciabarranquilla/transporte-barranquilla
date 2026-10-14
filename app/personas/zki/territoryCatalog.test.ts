import assert from "node:assert/strict";
import test from "node:test";
import { parseTerritoryClients, tripsFromTerritoryClients } from "./zkiEngine.ts";

test("un solo catálogo forma territorios y conserva códigos y barrios", () => {
  const rows = [
    { "id territory": 1, Barrio: "SANTA MARIA", "Codigos de cliente": 12173010 },
    { "id territory": 1, Barrio: "Santa María", "Codigos de cliente": 12310187 },
    { "id territory": 1, Barrio: "20 de Julio", "Codigos de cliente": 14534218 },
    { "id territory": 1, Barrio: "20 DE JULIO", "Codigos de cliente": 14534218 },
    { "id territory": 2, Barrio: "Carrizal", "Codigos de cliente": 10360139 },
  ];
  assert.deepEqual(parseTerritoryClients(rows).map((row) => row.client), ["12173010", "12310187", "14534218", "14534218", "10360139"]);
  const trips = tripsFromTerritoryClients(rows);
  assert.equal(trips.length, 2);
  assert.equal(trips[0].territoryId, "1");
  assert.equal(trips[0].clients, 3);
  assert.equal(trips[0].weight, 0);
  assert.match(trips[0].zone, /20 de Julio/i);
});

test("recupera el barrio faltante de ZKI usando el código exacto del cliente", () => {
  const trips = tripsFromTerritoryClients(
    [{ "id territory": 810, Barrio: null, "Codigos de cliente": 11432250 }],
    [{ rr: "Responsable", client: "11432250", neighborhood: "EL MANANTIAL", zone: "", driver: "", vehicle: "" }],
  );
  assert.equal(trips[0].zone, "EL MANANTIAL");
  assert.deepEqual(trips[0].raw.neighborhoods, ["EL MANANTIAL"]);
});
