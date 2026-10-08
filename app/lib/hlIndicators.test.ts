import test from "node:test";
import assert from "node:assert/strict";
import { CONTRACTORS, contractorForEmail, canEditRangeReasons, isAdminRangoExcludedContractor, isAdminRefusalExcludedContractor, isAppAccessRevoked, isOperationalContractor, usesPowerAppsInstead } from "./contractors.ts";
import { allowedContractors, canAccessContractor } from "./adminScope.ts";

test("HL usa Power Apps y la cuenta de Surti tiene el acceso revocado", () => {
  assert.equal(usesPowerAppsInstead("hllogistica@gmail.com"), true);
  assert.equal(contractorForEmail("hllogistica@gmail.com"), null);
  assert.equal(usesPowerAppsInstead("surticervezas@bavaria-seguimiento.com"), false);
  assert.equal(isAppAccessRevoked("SURTICERVEZAS@BAVARIA-SEGUIMIENTO.COM"), true);
  assert.equal(contractorForEmail("surticervezas@bavaria-seguimiento.com"), null);
  assert.equal(usesPowerAppsInstead("logisticos@bavaria-seguimiento.com"), false);
  assert.equal(contractorForEmail("logisticos@bavaria-seguimiento.com"), "Logisticos");
  for (const name of ["HL Logisticos", "HL Logistica", "HL Logísticos"]) {
    assert.equal(isOperationalContractor(name), true);
    assert.equal(canEditRangeReasons(name), true);
    assert.equal(canAccessContractor({ email: "hllogistica@gmail.com", contractor: "HL Logisticos", isAdmin: false }, name), true);
  }
  assert.deepEqual(allowedContractors({ email: "hllogistica@gmail.com", contractor: "HL Logisticos", isAdmin: false }), ["HL Logisticos"]);
  assert.ok(CONTRACTORS.includes("HL Logisticos"));
  assert.ok(allowedContractors({ email: "admin@bavaria-seguimiento.com", contractor: "Admin", isAdmin: true }).includes("HL Logisticos"));
  assert.equal(isOperationalContractor("Surti Cervezas"), true);
  assert.equal(canEditRangeReasons("Surti Cervezas"), false);
  assert.equal(canAccessContractor({ email: "surticervezas@bavaria-seguimiento.com", contractor: "Surti Cervezas", isAdmin: false }, "Surti Cervezas"), false);
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
