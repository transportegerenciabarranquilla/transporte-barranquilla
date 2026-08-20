import test from "node:test";
import assert from "node:assert/strict";
import { complaintClosingDeadline, complaintDateKey, complaintIdentityKey, normalizeComplaintDt } from "./complaints.ts";

test("normaliza DT con prefijos y separadores", () => {
  assert.equal(normalizeComplaintDt("DT 008008894126"), "8008894126");
  assert.equal(normalizeComplaintDt("10 8008894126"), "8008894126");
});

test("detecta IDs duplicados aunque cambien separadores o mayusculas", () => {
  assert.equal(complaintIdentityKey(" Queja-Á 001 "), complaintIdentityKey("QUEJA A001"));
});

test("el cierre vence exactamente 48 horas despues de cargar", () => {
  assert.equal(complaintClosingDeadline("2026-08-18T15:30:00.000Z"), "2026-08-20T15:30:00.000Z");
});

test("normaliza fecha de creacion de la plantilla", () => {
  assert.equal(complaintDateKey("18/08/2026"), "2026-08-18");
  assert.equal(complaintDateKey("2026-08-18T10:00:00Z"), "2026-08-18");
});
