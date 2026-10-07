import test from "node:test";
import assert from "node:assert/strict";
import { getVisiblePortalModules } from "./portalModules.ts";
import { canAccessDeliveryCompliance, canManageComplaint, complaintUploadContractor, contractorForEmail, isComplaintsContractor, normalizeContractorName } from "../lib/contractors.ts";
import { canAccessContractor } from "../lib/adminScope.ts";

test("Route Tracking tiene módulo propio solo para administradores", () => {
  for (const contractor of ["Admin", "Admin Arenosa"]) {
    const modules = getVisiblePortalModules({ contractor, isAdmin: true });
    assert.equal(modules.filter(({ href }) => href === "/admin/analisis-rutas").length, 1);
    assert.equal(modules.find(({ href }) => href === "/admin/analisis-rutas")?.title, "Route Tracking");
    assert.equal(new Set(modules.map(({ id }) => id)).size, modules.length);
  }
  for (const session of [{ contractor: "Surti Cervezas" }, { contractor: "HL Logisticos" }, { isPeople: true }]) {
    assert.equal(getVisiblePortalModules(session).some(({ href }) => href === "/admin/analisis-rutas"), false);
  }
});

test("Promedio RR solo aparece en administración", () => {
  for (const contractor of ["Admin", "Admin Arenosa"]) {
    const modules = getVisiblePortalModules({ contractor, isAdmin: true });
    assert.equal(modules.find(module => module.href === "/admin/promedio-rr")?.title, "Promedio RR");
  }
  assert.equal(getVisiblePortalModules({ contractor: "Logisticos" }).some(module => module.href === "/admin/promedio-rr"), false);
  assert.equal(getVisiblePortalModules({ isPeople: true }).some(module => module.href === "/admin/promedio-rr"), false);
});

test("HL no recibe módulos ni acceso operativo, Surti sí", () => {
  const contractor = contractorForEmail(" HLLogistica@gmail.com ");
  assert.equal(contractor, "HL Logisticos");
  assert.equal(normalizeContractorName("HL Logistica"), normalizeContractorName(contractor));
  const modules = getVisiblePortalModules({ contractor: contractor! });
  const surti = getVisiblePortalModules({ contractor: "Surti Cervezas" });
  assert.deepEqual(modules, []);
  assert.ok(surti.some(({ href }) => href === "/modulacion"));
  assert.ok(surti.some(({ href }) => href === "/seguimiento"));
  assert.equal(isComplaintsContractor(contractor), false);
  assert.equal(canManageComplaint(contractor, "Surti Cervezas"), false);
  assert.equal(canManageComplaint(contractor, contractor), false);
  const session = { email: "hllogistica@gmail.com", contractor: contractor!, isAdmin: false };
  assert.equal(canAccessContractor(session, contractor), false);
  assert.equal(canAccessContractor(session, "Surti Cervezas"), false);
  assert.equal(canAccessContractor(session, "Logisticos"), false);
  assert.equal(canAccessContractor({ email: "surticervezas@bavaria-seguimiento.com", contractor: "Surti Cervezas", isAdmin: false }, "Surti Cervezas"), true);
});

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

test("cumplimiento de entregas no está disponible para HL, Logísticos ni Surti", () => {
  for (const contractor of ["HL Logisticos", "HL Logistica", "Logísticos", "Surti Cervezas"]) {
    const session = { contractor, isAdmin: false, isPeople: false };
    assert.equal(canAccessDeliveryCompliance(session), false);
    assert.equal(getVisiblePortalModules(session).some(({ href }) => href === "/cumplimiento-entregas"), false);
  }
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
