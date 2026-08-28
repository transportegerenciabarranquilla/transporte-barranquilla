import test from "node:test";
import assert from "node:assert/strict";
import type { AsistenciaRegistro } from "../../lib/asistenciaStorage.ts";
import type { Vehiculo } from "../../seguimiento/types.ts";
import { calculateDriverAdherence } from "./adherence.ts";

test("cruza el VH real por DT aunque seguimiento tenga otra fecha", () => {
  const attendance = {
    id: "1",
    contratista: "Logisticos",
    dt: "8008914058",
    cedulaResponsable: "",
    cedulaAuxiliar1: "123",
    cedulaAuxiliar2: "",
    nombreAuxiliar1: "Conductor Uno",
    llave: "LOGISTICOS-8008914058-2026-08-27",
    createdAt: "2026-08-27T10:00:00Z",
  } satisfies AsistenciaRegistro;
  const vehicle = {
    transporte: "DT 8008914058",
    vehiculo: "COVEO276",
    fechaDespacho: "2026-08-26",
  } as Vehiculo;

  const [result] = calculateDriverAdherence(
    [{ "Nombre conductor": "Conductor Uno", "Cedula conductor": "123", Placa: "VEO276" }],
    [attendance],
    [vehicle],
    "2026-08-27",
    [{ plate: "VEO276", driver: "Conductor Uno", driverId: "123" }],
  );

  assert.equal(result.actualPlate, "VEO276");
  assert.equal(result.status, "Cumplió");
  assert.equal(result.adherent, true);
  assert.equal(result.habitualVehicle, true);
  assert.equal(result.habitualPlate, "VEO276");
});

test("prefiere el registro del DT correspondiente a la fecha auditada", () => {
  const attendance = {
    id: "1", contratista: "Logisticos", dt: "99", cedulaResponsable: "", cedulaAuxiliar1: "123", cedulaAuxiliar2: "",
    nombreAuxiliar1: "Conductor Uno", llave: "LOGISTICOS-99-2026-08-27", createdAt: "2026-08-27T10:00:00Z",
  } satisfies AsistenciaRegistro;
  const vehicles = [
    { transporte: "99", vehiculo: "AAA111", fechaDespacho: "2026-08-26" },
    { transporte: "99", vehiculo: "BBB222", fechaDespacho: "2026-08-27" },
  ] as Vehiculo[];

  const [result] = calculateDriverAdherence(
    [{ Conductor: "Conductor Uno", "Cedula conductor": "123", Placa: "BBB222" }],
    [attendance],
    vehicles,
    "2026-08-27",
  );

  assert.equal(result.actualPlate, "BBB222");
  assert.equal(result.status, "Cumplió");
});

test("unifica el cambio de VH como VH salido con otro conductor", () => {
  const attendance = {
    id: "1", contratista: "Logisticos", dt: "99", cedulaResponsable: "", cedulaAuxiliar1: "123", cedulaAuxiliar2: "",
    nombreAuxiliar1: "Conductor Uno", llave: "LOGISTICOS-99-2026-08-27", createdAt: "2026-08-27T10:00:00Z",
  } satisfies AsistenciaRegistro;
  const vehicle = { transporte: "99", vehiculo: "BBB222", fechaDespacho: "2026-08-27" } as Vehiculo;

  const [result] = calculateDriverAdherence(
    [{ Conductor: "Conductor Uno", "Cedula conductor": "123", Placa: "AAA111" }],
    [attendance],
    [vehicle],
    "2026-08-27",
  );

  assert.equal(result.adherent, false);
  assert.equal(result.status, "VH salió con otro conductor");
});

test("informa cuando el VH planeado salió con otro conductor", () => {
  const vehicle = {
    transporte: "8008914041",
    vehiculo: "COLCM500",
    fechaDespacho: "2026-08-27",
    cedulaAuxiliar1: "72044918",
    nombreAuxiliar1: "Escorcia Fernandez Fernando Alberto",
  } as Vehiculo;

  const [result] = calculateDriverAdherence(
    [{ Conductor: "Quiroz Castro Celso Manuel", Placa: "LCM500" }],
    [],
    [vehicle],
    "2026-08-27",
  );

  assert.equal(result.actualPlate, "LCM500");
  assert.equal(result.dt, "8008914041");
  assert.equal(result.adherent, false);
  assert.equal(result.status, "VH salió con otro conductor");
});

test("marca cumplimiento si seguimiento confirma conductor y VH aunque falte la fila de asistencia", () => {
  const vehicle = {
    transporte: "8008914045",
    vehiculo: "COLJS618",
    fechaDespacho: "2026-08-27",
    cedulaAuxiliar1: "72139943",
    nombreAuxiliar1: "Navarro Medina Luis Fernando",
  } as Vehiculo;

  const [result] = calculateDriverAdherence(
    [{ Conductor: "NAVARRO MEDINA LUIS FERNANDO", "Cedula conductor": "72139943", Placa: "LJS618" }],
    [],
    [vehicle],
    "2026-08-27",
  );

  assert.equal(result.actualPlate, "LJS618");
  assert.equal(result.dt, "8008914045");
  assert.equal(result.adherent, true);
  assert.equal(result.status, "Cumplió");
});

test("calcula adherencia separada de conductor, RR, auxiliar y tripulación completa", () => {
  const vehicle = {
    transporte: "8008914001", vehiculo: "COAAA111", fechaDespacho: "2026-08-27",
    cedulaResponsable: "100", nombreResponsable: "Responsable Uno",
    cedulaAuxiliar1: "200", nombreAuxiliar1: "Conductor Uno",
    cedulaAuxiliar2: "300", nombreAuxiliar2: "Auxiliar Uno",
  } as Vehiculo;

  const [result] = calculateDriverAdherence(
    [{
      "Nombre responsable": "Responsable Uno", "Cedula responsable": "100",
      "Nombre conductor": "Conductor Uno", "Cedula conductor": "200",
      "Nombre auxiliar": "Auxiliar Uno", "Cedula auxiliar": "300", Placa: "AAA111",
    }],
    [],
    [vehicle],
    "2026-08-27",
  );

  assert.equal(result.adherent, true);
  assert.equal(result.responsibleAdherent, true);
  assert.equal(result.auxiliaryAdherent, true);
  assert.equal(result.crewAdherent, true);
});

test("cumple si el conductor planeado aparece como RR en el VH asignado", () => {
  const vehicle = {
    transporte: "8008914999", vehiculo: "COAAA111", fechaDespacho: "2026-08-27",
    cedulaResponsable: "200", nombreResponsable: "Conductor Uno",
    cedulaAuxiliar1: "100", nombreAuxiliar1: "Responsable Uno",
  } as Vehiculo;

  const [result] = calculateDriverAdherence(
    [{ Conductor: "Conductor Uno", "Cedula conductor": "200", Placa: "AAA111" }],
    [],
    [vehicle],
    "2026-08-27",
  );

  assert.equal(result.adherent, true);
  assert.equal(result.status, "Cumplió");
});

test("cumple la tripulación aunque conductor y RR intercambien roles", () => {
  const vehicle = {
    transporte: "8008914998", vehiculo: "COAAA111", fechaDespacho: "2026-08-27",
    cedulaResponsable: "200", nombreResponsable: "Conductor Uno",
    cedulaAuxiliar1: "100", nombreAuxiliar1: "Responsable Uno",
    cedulaAuxiliar2: "300", nombreAuxiliar2: "Auxiliar Uno",
  } as Vehiculo;

  const [result] = calculateDriverAdherence(
    [{
      Responsable: "Responsable Uno", "Cedula responsable": "100",
      Conductor: "Conductor Uno", "Cedula conductor": "200",
      Auxiliar: "Auxiliar Uno", "Cedula auxiliar": "300", Placa: "AAA111",
    }],
    [],
    [vehicle],
    "2026-08-27",
  );

  assert.equal(result.adherent, true);
  assert.equal(result.responsibleAdherent, true);
  assert.equal(result.auxiliaryAdherent, true);
  assert.equal(result.crewAdherent, true);
});

test("cruza cada persona contra el VH planeado aunque el conductor tenga asistencia en otro DT", () => {
  const attendance = {
    id: "1", contratista: "Logisticos", dt: "DT-OTRO", cedulaResponsable: "", cedulaAuxiliar1: "200", cedulaAuxiliar2: "",
    nombreAuxiliar1: "Conductor Uno", llave: "LOGISTICOS-DT-OTRO-2026-08-27", createdAt: "2026-08-27T10:00:00Z",
  } satisfies AsistenciaRegistro;
  const vehicles = [
    {
      transporte: "DT-PLANEADO", vehiculo: "COAAA111", fechaDespacho: "2026-08-27",
      cedulaResponsable: "100", nombreResponsable: "Responsable Uno",
      cedulaAuxiliar1: "200", nombreAuxiliar1: "Conductor Uno",
    },
    { transporte: "DT-OTRO", vehiculo: "COBBB222", fechaDespacho: "2026-08-27", cedulaAuxiliar1: "999" },
  ] as Vehiculo[];

  const [result] = calculateDriverAdherence(
    [{
      Responsable: "Responsable Uno", "Cedula responsable": "100",
      Conductor: "Conductor Uno", "Cedula conductor": "200", Placa: "AAA111",
    }],
    [attendance],
    vehicles,
    "2026-08-27",
  );

  assert.equal(result.actualPlate, "AAA111");
  assert.equal(result.adherent, true);
  assert.equal(result.responsibleAdherent, true);
});
