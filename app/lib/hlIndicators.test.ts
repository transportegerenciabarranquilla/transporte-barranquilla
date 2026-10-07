import test from "node:test";
import assert from "node:assert/strict";
import { CONTRACTORS, contractorForEmail, canEditRangeReasons, isAdminRangoExcludedContractor, isAdminRefusalExcludedContractor, isMigratedContractor, isOperationalContractor } from "./contractors.ts";
import { allowedContractors, canAccessContractor } from "./adminScope.ts";

test("HL permanece deshabilitado y Surti vuelve al alcance operativo", () => {
  assert.equal(contractorForEmail("hllogistica@gmail.com"), "HL Logisticos");
  for (const name of ["HL Logisticos", "HL Logistica", "HL Logísticos"]) {
    assert.ok(isMigratedContractor(name));
    assert.equal(isOperationalContractor(name), false);
    assert.equal(canEditRangeReasons(name), false);
    assert.equal(canAccessContractor({ email: "hllogistica@gmail.com", contractor: name, isAdmin: false }, name), false);
  }
  assert.deepEqual(allowedContractors({ email: "hllogistica@gmail.com", contractor: "HL Logisticos", isAdmin: false }), []);
  assert.equal(CONTRACTORS.some((name) => isMigratedContractor(name)), false);
  assert.equal(allowedContractors({ email: "admin@bavaria-seguimiento.com", contractor: "Admin", isAdmin: true }).some((name) => isMigratedContractor(name)), false);
  assert.equal(contractorForEmail("surticervezas@bavaria-seguimiento.com"), "Surti Cervezas");
  assert.equal(isMigratedContractor("Surti Cervezas"), false);
  assert.equal(isOperationalContractor("Surti Cervezas"), true);
  assert.equal(canEditRangeReasons("Surti Cervezas"), true);
  assert.equal(canAccessContractor({ email: "surticervezas@bavaria-seguimiento.com", contractor: "Surti Cervezas", isAdmin: false }, "Surti Cervezas"), true);
  assert.ok(allowedContractors({ email: "admin@bavaria-seguimiento.com", contractor: "Admin", isAdmin: true }).includes("Surti Cervezas"));
});

test("los indicadores administrativos excluyen HL pero incluyen Surti", () => {
  for (const name of ["HL Logisticos", "HL Logistica", "HL Logísticos", "HL"]) {
    assert.ok(isAdminRefusalExcludedContractor(name));
    assert.ok(isAdminRangoExcludedContractor(name));
  }
  for (const name of ["Logisticos", "Surti Cervezas"]) {
    assert.equal(isAdminRefusalExcludedContractor(name), false);
    assert.equal(isAdminRangoExcludedContractor(name), false);
  }
});
