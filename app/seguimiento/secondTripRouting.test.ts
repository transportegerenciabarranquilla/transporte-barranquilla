import assert from "node:assert/strict";
import test from "node:test";

import { hasRecargueValue, isSecondTripRecord } from "./utils.ts";

test("una ruta marcada con recargue aparece en segundos viajes sin cambiar su viaje", () => {
  assert.equal(isSecondTripRecord({ viaje: "1", recargue: "Si" }), true);
  assert.equal(isSecondTripRecord({ viaje: "1", recargue: "No" }), false);
  assert.equal(hasRecargueValue("Si"), true);
});

test("los viajes 11 existentes siguen apareciendo y las marcas pendientes no cuentan", () => {
  assert.equal(isSecondTripRecord({ viaje: "Viaje 11", recargue: "Pendiente" }), true);
  assert.equal(isSecondTripRecord({ viaje: "11", recargue: "" }), true);
  assert.equal(isSecondTripRecord({ viaje: "1", recargue: "Pendiente" }), false);
});
