import test from "node:test";
import assert from "node:assert/strict";
import { parseBarcodePeople } from "./barcodePeople.ts";
import { contractorForEmail, isAdminEmail, isPeopleEmail, isEffectiveRestEmail } from "./contractors.ts";
import { getVisiblePortalModules } from "../components/portalModules.ts";

test("la cuenta de ingreso solo recibe descanso y no permisos People o Admin", () => {
  const email = " Honor-GL@gmail.com ";
  assert.equal(isEffectiveRestEmail(email), true);
  assert.equal(isAdminEmail(email), false);
  assert.equal(isPeopleEmail(email), false);
  assert.deepEqual(getVisiblePortalModules({ contractor: contractorForEmail(email)! }).map((m) => m.href), ["/descanso-efectivo"]);
  assert.equal(getVisiblePortalModules({ isPeople: true }).some((m) => m.href.includes("descanso-efectivo")), false);
  assert.equal(isEffectiveRestEmail("honor-gl@gmail.com.ejemplo.com"), false);
});

test("Excel conserva ceros, normaliza separadores y elimina duplicados", () => {
  const result = parseBarcodePeople([["Cédula", "Nombre"], ["001234", "Ana"], ["72.123.456", "Luis"], ["72123456", "Luis"], ["001234", "Otro nombre"], ["", ""]]);
  assert.deepEqual(result.people, [{ document: "001234", name: "Ana" }, { document: "72123456", name: "Luis" }]);
  assert.equal(result.duplicates, 2);
  assert.equal(result.issues.length, 1);
});

test("rechaza valores ambiguos o incompletos y detecta columnas faltantes", () => {
  const result = parseBarcodePeople([["CC", "Nombre completo"], ["1.2E+9", "Ana"], [-123, "Luis"], ["123", ""], ["abc123", "Ana"], [123.5, "Ana"], ["1234567890123456", "Ana"]]);
  assert.equal(result.people.length, 0);
  assert.equal(result.issues.length, 6);
  assert.throws(() => parseBarcodePeople([["Nombre"], ["Ana"]]), /columnas/);
});
