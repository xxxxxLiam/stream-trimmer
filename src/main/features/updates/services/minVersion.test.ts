/**
 * File: minVersion.test.ts
 * Path: src/main/features/updates/services/minVersion.test.ts
 * Description: The minimum-version gate: blocks only an older copy with a valid answer, and fails open on every kind of
 *   bad or missing answer.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { checkMinVersion, isBelow, parseVersion } from "./minVersion";

const answer = (body: unknown, status = 200) =>
  (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

test("versions compare as numbers, not text", () => {
  assert.deepEqual(parseVersion("v19.5.1"), [19, 5, 1]);
  assert.equal(parseVersion("19.5"), null);
  assert.equal(parseVersion("latest"), null);
  assert.equal(isBelow("19.5.1", "19.6.0"), true);
  assert.equal(isBelow("19.9.0", "19.10.0"), true);
  assert.equal(isBelow("19.6.0", "19.6.0"), false);
  assert.equal(isBelow("20.0.0", "19.9.9"), false);
});

test("an older copy is blocked, with the version it needs", async () => {
  const r = await checkMinVersion({ appVersion: "19.5.1", relayUrl: "https://r.test", fetchFn: answer({ minVersion: "19.6.0" }) });
  assert.deepEqual(r, { blocked: true, required: "19.6.0", current: "19.5.1" });
});

test("a copy at or above the minimum runs", async () => {
  for (const v of ["19.6.0", "19.7.2", "20.0.0"]) {
    const r = await checkMinVersion({ appVersion: v, relayUrl: "https://r.test", fetchFn: answer({ minVersion: "19.6.0" }) });
    assert.equal(r.blocked, false, v);
  }
});

test("fails open: an empty, missing, malformed or error answer never blocks", async () => {
  const cases: Array<[string, typeof fetch]> = [
    ["empty", answer({ minVersion: "" })],
    ["missing", answer({})],
    ["not a version", answer({ minVersion: "soon" })],
    ["a number", answer({ minVersion: 20 })],
    ["server error", answer({ minVersion: "99.0.0" }, 500)],
    ["not json", (async () => new Response("<html>", { status: 200 })) as unknown as typeof fetch],
    ["network down", (async () => { throw new TypeError("fetch failed"); }) as unknown as typeof fetch],
  ];
  for (const [name, fetchFn] of cases) {
    const r = await checkMinVersion({ appVersion: "1.0.0", relayUrl: "https://r.test", fetchFn });
    assert.equal(r.blocked, false, name);
  }
});

test("fails open when the relay never answers (short timeout)", async () => {
  const hang = ((_u: unknown, init: { signal: AbortSignal }) =>
    new Promise((_res, rej) => init.signal.addEventListener("abort", () => rej(new Error("aborted"))))) as unknown as typeof fetch;
  const t0 = Date.now();
  const r = await checkMinVersion({ appVersion: "1.0.0", relayUrl: "https://r.test", fetchFn: hang, timeoutMs: 50 });
  assert.equal(r.blocked, false);
  assert.ok(Date.now() - t0 < 2000);
});

test("sends the fixed client header and asks the min-version path", async () => {
  let seen: { url: string; header: string | null } = { url: "", header: null };
  const spy = (async (url: string, init: { headers: Record<string, string> }) => {
    seen = { url, header: init.headers["X-Clipr-Client"] ?? null };
    return new Response(JSON.stringify({ minVersion: "" }));
  }) as unknown as typeof fetch;
  await checkMinVersion({ appVersion: "1.0.0", relayUrl: "https://r.test/", fetchFn: spy });
  assert.deepEqual(seen, { url: "https://r.test/min-version", header: "clipr-app" });
});
