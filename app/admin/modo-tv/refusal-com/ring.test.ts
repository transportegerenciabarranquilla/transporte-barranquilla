import test from "node:test";
import assert from "node:assert/strict";

import { getVisibleRingPercent } from "./ring";

test("mantiene un arco visible aunque el porcentaje sea muy bajo", () => {
  assert.equal(getVisibleRingPercent(0.73), 6);
  assert.equal(getVisibleRingPercent(1.18), 6);
  assert.equal(getVisibleRingPercent(0.51), 6);
  assert.equal(getVisibleRingPercent(12), 12);
  assert.equal(getVisibleRingPercent(0), 0);
});
