import test from "node:test";
import assert from "node:assert/strict";
import { complaintClosingDeadline, complaintDateKey, complaintElapsedClock, complaintIdentityKey, normalizeComplaintDt } from "./complaints.ts";

test("normaliza DT con prefijos y separadores", () => {
  assert.equal(normalizeComplaintDt("DT 008008894126"), "8008894126");
  assert.equal(normalizeComplaintDt("10 8008894126"), "8008894126");
});

test("detecta IDs duplicados aunque cambien separadores o mayusculas", () => {
  assert.equal(complaintIdentityKey(" Queja-Á 001 "), complaintIdentityKey("QUEJA A001"));
});

test("el cierre vence al terminar el dia de creacion en Bogota", () => {
  assert.equal(complaintClosingDeadline("2026-10-05"), "2026-10-06T05:00:00.000Z");
  assert.equal(complaintClosingDeadline("2026-10-06"), "2026-10-07T05:00:00.000Z");
});

test("el reloj asciende y muestra el vencimiento desde la medianoche siguiente", () => {
  const start = "2026-10-06T15:00:00.000Z";
  const deadline = complaintClosingDeadline("2026-10-06");
  const started = Date.parse(start);
  assert.deepEqual(complaintElapsedClock(start, deadline, started), { elapsedSeconds: 0, overdueSeconds: 0, overdue: false, approximate: false });
  assert.deepEqual(complaintElapsedClock(start, deadline, started + 1_000), { elapsedSeconds: 1, overdueSeconds: 0, overdue: false, approximate: false });
  assert.deepEqual(complaintElapsedClock(start, deadline, Date.parse(deadline)), { elapsedSeconds: 50400, overdueSeconds: 0, overdue: true, approximate: false });
  assert.deepEqual(complaintElapsedClock(start, deadline, Date.parse(deadline) + 5_000), { elapsedSeconds: 50405, overdueSeconds: 5, overdue: true, approximate: false });
});

test("el reloj acepta quejas antiguas con solo la fecha de creacion", () => {
  const deadline = complaintClosingDeadline("2026-10-05");
  assert.deepEqual(complaintElapsedClock("", deadline, Date.parse(deadline) + 60_000, "2026-10-05"), { elapsedSeconds: 86460, overdueSeconds: 60, overdue: true, approximate: true });
  assert.deepEqual(complaintElapsedClock("2026-10-05T21:20:06.834Z", "expired", Date.parse(deadline) + 60_000, "2026-10-05"), { elapsedSeconds: 27653, overdueSeconds: 60, overdue: true, approximate: false });
});

test("normaliza fecha de creacion de la plantilla", () => {
  assert.equal(complaintDateKey("18/08/2026"), "2026-08-18");
  assert.equal(complaintDateKey("2026-08-18T10:00:00Z"), "2026-08-18");
});

test("IDs equivalentes tienen una sola clave y los IDs distintos se conservan", () => {
  const ids = [" Q-123 ", "q123", "Q 123", "Q_123"];
  assert.equal(new Set(ids.map(complaintIdentityKey)).size, 1);
  assert.notEqual(complaintIdentityKey("123"), complaintIdentityKey("124"));
  assert.equal(complaintIdentityKey("---"), "");
  assert.equal(complaintIdentityKey("   "), "");
});
