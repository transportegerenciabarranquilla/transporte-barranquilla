import assert from "node:assert/strict";
import test from "node:test";
import { isRejectedAuthResponse, sharePendingAuthRequests } from "./authResponse.ts";

test("temporary authentication failures are not treated as invalid credentials", () => {
  for (const status of [429, 500, 502, 503, 504]) {
    for (const refresh of [false, true]) {
      assert.throws(() => isRejectedAuthResponse({ ok: false, status }, refresh), /verificar la sesión/);
    }
  }
  assert.equal(isRejectedAuthResponse({ ok: true, status: 200 }), false);
  assert.equal(isRejectedAuthResponse({ ok: false, status: 401 }), true);
  assert.equal(isRejectedAuthResponse({ ok: false, status: 403 }), true);
  assert.equal(isRejectedAuthResponse({ ok: false, status: 400 }, true), true);
});

test("parallel refreshes share one request, without reusing completed credentials", async () => {
  const shared = sharePendingAuthRequests<string>();
  let calls = 0;
  const load = async () => { calls++; return "refreshed"; };
  const first = shared("session-a", load);
  assert.equal(shared("session-a", load), first);
  assert.equal(await first, "refreshed");
  assert.equal(calls, 1);
  await shared("session-a", load);
  assert.equal(calls, 2);
});

test("different sessions stay separate and failed refreshes can retry", async () => {
  const shared = sharePendingAuthRequests<string>();
  const first = shared("a", async () => { throw new Error("offline"); });
  assert.equal(await shared("b", async () => "other session"), "other session");
  await assert.rejects(first, /offline/);
  assert.equal(await shared("a", async () => "recovered"), "recovered");
});
