import test from "node:test";
import assert from "node:assert/strict";
import { allowedContractors, canAccessContractor, scopeQuery } from "./adminScope.ts";
import { contractorForEmail, isAdminEmail, isSecurityOwnerEmail } from "./contractors.ts";
import { getVisiblePortalModules } from "../components/portalModules.ts";

const site = { email: "adminare@gmail.com", contractor: "Admin Arenosa", isAdmin: true };

test("administrador Arenosa tiene las dos contratistas, sin acceso global ni de seguridad", () => {
  assert.equal(contractorForEmail(site.email), site.contractor);
  assert.equal(isAdminEmail(site.email), true);
  assert.equal(isSecurityOwnerEmail(site.email), false);
  assert.deepEqual(allowedContractors(site), ["Logisticos Arenosa", "Punto Corona Arenosa"]);
  for (const name of ["Logisticos", "Punto Corona", "Surti Cervezas", "", "Admin"]) assert.equal(canAccessContractor(site, name), false);
  assert.equal(canAccessContractor(site, "Logísticos Arenosa"), true);
  assert.equal(canAccessContractor(site, "Punto Corona Arenosa"), true);
});

test("un parámetro de URL no amplía los permisos de la sesión", () => {
  const params = new URLSearchParams({ contractor: "eq.Logisticos", or: "(contractor.eq.Logisticos,contractor.eq.Punto Corona)" });
  scopeQuery(params, site);
  assert.equal(params.get("contractor"), "eq.Logisticos");
  assert.equal(params.get("and"), '(contractor.in.("Logisticos Arenosa","Punto Corona Arenosa"))');
  const people = scopeQuery(new URLSearchParams(), site, "CONTRATISTA");
  assert.match(people.get("and")!, /^\(CONTRATISTA\.in/);
});

test("administrador global mantiene su alcance y contratistas no ganan privilegios", () => {
  assert.equal(allowedContractors({ email: "admin@bavaria-seguimiento.com", contractor: "Admin", isAdmin: true }).length, 5);
  assert.deepEqual(allowedContractors({ email: "corona@transporte.com", contractor: "Punto Corona Arenosa", isAdmin: false }), ["Punto Corona Arenosa"]);
});

test("mismo menú admin para Arenosa y NPS retirado de People", () => {
  assert.deepEqual(getVisiblePortalModules(site).map((item) => item.id), getVisiblePortalModules({ contractor: "Admin", isAdmin: true }).map((item) => item.id));
  const people = getVisiblePortalModules({ isPeople: true });
  assert.equal(people.some((item) => item.href === "/personas/nps"), false);
  assert.equal(people.length, 7);
});
