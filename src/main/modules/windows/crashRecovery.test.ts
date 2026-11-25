/**
 * File: crashRecovery.test.ts
 * Path: src/main/modules/windows/crashRecovery.test.ts
 * Description: A page death becomes an address: the crash screen first, the static fallback on a second death inside a
 *   minute, nothing for a deliberate close. (The real forced-crash run is in the PR; the page clears ?crashed=1 once it
 *   has read it, so the window's own address does not show it afterwards.)
 */
import assert from "node:assert/strict";
import test from "node:test";
import { createCrashRecovery, crashedUrl, pageAfterDeath, RELOAD_WINDOW_MS } from "./crashRecovery";

const APP = "http://127.0.0.1:4321/?tab=2";
const FALLBACK = "data:text/html,fallback";

test("E3-2: the first death reloads the app on the crash screen address", () => {
  const r = createCrashRecovery(() => 1_000);
  const url = pageAfterDeath(r, "crashed", APP, () => FALLBACK);
  assert.equal(url, crashedUrl(APP));
  assert.equal(new URL(url!).searchParams.get("crashed"), "1");
});

test("E3-2: a second death inside a minute loads the static fallback; after a minute it reloads again", () => {
  let t = 1_000;
  const r = createCrashRecovery(() => t);
  assert.equal(pageAfterDeath(r, "oom", APP, () => FALLBACK), crashedUrl(APP));
  t += 5_000;
  assert.equal(pageAfterDeath(r, "crashed", APP, () => FALLBACK), FALLBACK);
  t += RELOAD_WINDOW_MS;
  assert.equal(pageAfterDeath(r, "crashed", APP, () => FALLBACK), crashedUrl(APP));
});

test("E3-2: a deliberate close loads nothing and does not start the one-minute window", () => {
  const r = createCrashRecovery(() => 1_000);
  assert.equal(pageAfterDeath(r, "clean-exit", APP, () => FALLBACK), null);
  assert.equal(pageAfterDeath(r, "crashed", APP, () => FALLBACK), crashedUrl(APP));
});

test("E3-2: the fallback address is only built when it is needed", () => {
  let built = 0;
  const r = createCrashRecovery(() => 1_000);
  pageAfterDeath(r, "crashed", APP, () => (built++, FALLBACK));
  assert.equal(built, 0);
  pageAfterDeath(r, "crashed", APP, () => (built++, FALLBACK));
  assert.equal(built, 1);
});
