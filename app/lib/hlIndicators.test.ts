import test from "node:test";
import assert from "node:assert/strict";
import { CONTRACTORS, contractorForEmail, canEditRangeReasons, isAdminRangoExcludedContractor, isAdminRefusalExcludedContractor, isMigratedContractor, isOperationalContractor } from "./contractors.ts";
import { allowedContractors, canAccessContractor } from "./adminScope.ts";

test("HL y Surti quedan fuera del acceso y del alcance administrativo", () => {
  assert.equal(contractorForEmail("hllogistica@gmail.com"), "HL Logisticos");
  for (const name of ["HL Logisticos", "HL Logistica", "HL Logísticos", "Surti Cervezas"]) {
    assert.ok(isMigratedContractor(name));
    assert.equal(isOperationalContractor(name), false);
    assert.equal(canEditRangeReasons(name), false);
    assert.equal(canAccessContractor({ email: "hllogistica@gmail.com", contractor: name, isAdmin: false }, name), false);
  }
  assert.deepEqual(allowedContractors({ email: "hllogistica@gmail.com", contractor: "HL Logisticos", isAdmin: false }), []);
  assert.equal(CONTRACTORS.some((name) => isMigratedContractor(name)), false);
  assert.equal(allowedContractors({ email: "admin@bavaria-seguimiento.com", contractor: "Admin", isAdmin: true }).some((name) => isMigratedContractor(name)), false);
});

test("los indicadores administrativos excluyen HL y Surti", () => {
  for (const name of ["HL Logisticos", "HL Logistica", "HL Logísticos", "HL"]) {
    assert.ok(isAdminRefusalExcludedContractor(name));
    assert.ok(isAdminRangoExcludedContractor(name));
  }
  assert.ok(isAdminRefusalExcludedContractor("Surti Cervezas"));
  assert.ok(isAdminRangoExcludedContractor("Surti Cervezas"));
  for (const name of ["Logisticos"]) {
    assert.equal(isAdminRefusalExcludedContractor(name), false);
    assert.equal(isAdminRangoExcludedContractor(name), false);
  }
});
