import { test } from "node:test";
import assert from "node:assert/strict";
import { verifyImportedSession } from "./verifyImport";

const reply = (body: unknown) => async () => ({ ok: true, json: async () => body });

test("signed_in from the engine is a signed-in verdict", async () => {
  const v = await verifyImportedSession(1234, { fetch: reply({ status: "signed_in" }) });
  assert.equal(v.verify, "signed_in");
});

test("signed_out is rejected with a plain reason", async () => {
  const v = await verifyImportedSession(1234, { fetch: reply({ status: "signed_out" }) });
  assert.equal(v.verify, "rejected");
  assert.match(v.message, /fresh cookies file/);
});

test("throttled, timed out or unreachable is unverified, never rejected", async () => {
  for (const status of ["rate_limited", "timeout", "inconclusive", "probe_unavailable"]) {
    assert.equal((await verifyImportedSession(1234, { fetch: reply({ status }) })).verify, "unverified", status);
  }
  const boom = async () => { throw new Error("ECONNREFUSED"); };
  assert.equal((await verifyImportedSession(1234, { fetch: boom as any })).verify, "unverified");
  assert.equal((await verifyImportedSession(undefined, { fetch: reply({ status: "signed_in" }) })).verify, "unverified");
});

test("a hung check is cut off and reported unverified", async () => {
  const hang = (_u: string, i: { signal: AbortSignal }) =>
    new Promise<never>((_, rej) => i.signal.addEventListener("abort", () => rej(new Error("aborted"))));
  const v = await verifyImportedSession(1234, { fetch: hang as any, timeoutMs: 20 });
  assert.equal(v.verify, "unverified");
});
