import test from "node:test";
import assert from "node:assert/strict";
import { calculatePendingRefusalBoxes } from "./refusalCalculation.ts";

test("el detalle descuenta las cajas reubicadas cuando no hay check-in", () => {
  assert.equal(calculatePendingRefusalBoxes("65", "20"), 45);
  assert.equal(calculatePendingRefusalBoxes("14", "14"), 0);
  assert.equal(calculatePendingRefusalBoxes("12", "20"), 0);
});

test("el check-in sigue siendo el valor final cuando está registrado", () => {
  assert.equal(calculatePendingRefusalBoxes(65, 20, 9), 9);
  assert.equal(calculatePendingRefusalBoxes(65, 20, 0), 0);
});
