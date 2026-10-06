import test from "node:test";
import assert from "node:assert/strict";
import { CONTRACTORS, contractorForEmail, canEditRangeReasons, isAdminRangoExcludedContractor, isAdminRefusalExcludedContractor, isOperationalContractor } from "./contractors.ts";
import { allowedContractors, canAccessContractor } from "./adminScope.ts";

test("HL conserva cuenta, alcance y permisos operativos", () => {
  assert.equal(contractorForEmail("hllogistica@gmail.com"), "HL Logisticos");
  assert.ok(CONTRACTORS.includes("HL Logisticos"));
  for (const name of ["HL Logisticos", "HL Logistica", "HL Logísticos"]) {
    assert.ok(isOperationalContractor(name));
    assert.ok(canEditRangeReasons(name));
    assert.ok(canAccessContractor({ email: "hllogistica@gmail.com", contractor: "HL Logisticos", isAdmin: false }, name));
  }
  assert.ok(allowedContractors({ email: "admin@bavaria-seguimiento.com", contractor: "Admin", isAdmin: true }).includes("HL Logisticos"));
});

test("solo los indicadores administrativos excluyen las variantes de HL", () => {
  for (const name of ["HL Logisticos", "HL Logistica", "HL Logísticos", "HL"]) {
    assert.ok(isAdminRefusalExcludedContractor(name));
    assert.ok(isAdminRangoExcludedContractor(name));
  }
  for (const name of ["Logisticos", "Surti Cervezas"]) {
    assert.equal(isAdminRefusalExcludedContractor(name), false);
    assert.equal(isAdminRangoExcludedContractor(name), false);
  }
});
