import assert from "node:assert/strict";
import test from "node:test";

import { dedupeUpsertRows } from "./seguimientoUpsert.ts";

test("deduplica rows que comparten el mismo record_id dentro del mismo lote", () => {
  const rows = [
    { record_id: "seguimiento:punto-corona:dt123:2026-09-17", updated_at: "2026-09-17T10:00:00.000Z", data: { transporte: "123", fechaDespacho: "2026-09-17", clientes: 10 } },
    { record_id: "seguimiento:punto-corona:dt123:2026-09-17", updated_at: "2026-09-17T11:00:00.000Z", data: { transporte: "123", fechaDespacho: "2026-09-17", clientes: 25 } },
    { record_id: "seguimiento:punto-corona:dt456:2026-09-17", updated_at: "2026-09-17T12:00:00.000Z", data: { transporte: "456", fechaDespacho: "2026-09-17", clientes: 5 } },
  ];

  const deduped = dedupeUpsertRows(rows);

  assert.deepEqual(deduped.map((row) => row.record_id), [
    "seguimiento:punto-corona:dt123:2026-09-17",
    "seguimiento:punto-corona:dt456:2026-09-17",
  ]);
  assert.equal(deduped[0].data.clientes, 25);
});
