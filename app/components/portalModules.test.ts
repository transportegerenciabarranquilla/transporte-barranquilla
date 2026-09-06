import test from "node:test";
import assert from "node:assert/strict";
import { getVisiblePortalModules } from "./portalModules.ts";
import { canManageComplaint, complaintUploadContractor, contractorForEmail, isComplaintsContractor } from "../lib/contractors.ts";

test("Logisticos Arenosa recibe los mismos módulos que Galapa y su seguimiento propio", () => {
  const contractor = contractorForEmail(" LogisticosAre@gmail.com ");
  assert.equal(contractor, "Logisticos Arenosa");
  const arenosa = getVisiblePortalModules({ contractor: contractor! });
  const galapa = getVisiblePortalModules({ contractor: "Logisticos" });
  assert.deepEqual(arenosa.map(({ id }) => id), galapa.map(({ id }) => id));
  assert.equal(arenosa.find(({ id }) => id === 1)?.href, "/seguimiento/arenosa/logisticos");
  assert.equal(galapa.find(({ id }) => id === 1)?.href, "/seguimiento");
  assert.equal(isComplaintsContractor(contractor), true);
  assert.equal(contractorForEmail("logisticos@transporte.com"), contractor);
});

test("Punto Corona Arenosa tiene SIC Gráficas sin recibir los módulos exclusivos de Logísticos", () => {
  const contractor = contractorForEmail("corona@transporte.com");
  assert.equal(contractor, "Punto Corona Arenosa");
  const modules = getVisiblePortalModules({ contractor: contractor! });
  assert.equal(modules.filter(({ href }) => href === "/sic/graficas").length, 1);
  assert.equal(modules.find(({ id }) => id === 1)?.href, "/seguimiento/arenosa/corona");
  assert.equal(modules.some(({ href }) => href === "/preventa"), false);
  assert.equal(modules.some(({ href }) => href === "/admin/graficas"), false);
  assert.equal(modules.some(({ href }) => href === "/quejas"), true);
});

test("correos no asignados siguen sin acceso a una contratista", () => {
  assert.equal(contractorForEmail("desconocido@gmail.com"), null);
  assert.equal(isComplaintsContractor("Desconocido"), false);
});

test("Logísticos administra quejas solo de su sede y Corona solo las propias", () => {
  assert.equal(canManageComplaint("Logisticos Arenosa", "Punto Corona Arenosa"), true);
  assert.equal(canManageComplaint("Logisticos Arenosa", "Logisticos Arenosa"), true);
  assert.equal(canManageComplaint("Logisticos Arenosa", "Punto Corona"), false);
  assert.equal(canManageComplaint("Logisticos", "Punto Corona Arenosa"), false);
  assert.equal(canManageComplaint("Logisticos", "Punto Corona"), true);
  assert.equal(canManageComplaint("Punto Corona Arenosa", "Logisticos Arenosa"), false);
  assert.equal(canManageComplaint("Punto Corona Arenosa", "Punto Corona Arenosa"), true);
});

test("plantillas de Arenosa resuelven nombres de contratistas en su sede", () => {
  assert.equal(complaintUploadContractor("Punto Corona", "Logisticos Arenosa"), "Punto Corona Arenosa");
  assert.equal(complaintUploadContractor("Logisticos", "Logisticos Arenosa"), "Logisticos Arenosa");
  assert.equal(complaintUploadContractor("Punto Corona", "Logisticos"), "Punto Corona");
});
