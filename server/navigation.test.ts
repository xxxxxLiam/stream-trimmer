/**
 * File: navigation.test.ts
 * Path: server/navigation.test.ts
 * Description: Verifies a superseded sign-in navigation is never mistaken for
 * a failed sign-in — the defect that broke every in-app connect attempt.
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const {
  isSupersededNavigation,
  isBenignLoadFailure,
}: {
  isSupersededNavigation: (message: unknown) => boolean;
  isBenignLoadFailure: (code: unknown) => boolean;
} = require("../electron/navigation.cjs");

test("a superseded navigation is not a failed sign-in", () => {
  // The exact rejection observed in the diagnostic log on every attempt.
  assert.equal(
    isSupersededNavigation(
      "ERR_ABORTED (-3) loading 'https://www.youtube.com/signin_prompt?next=https%3A%2F%2Fwww.youtube.com%2F%3Fpli%3D1&themeRefresh=1'",
    ),
    true,
  );
  assert.equal(isSupersededNavigation("ERR_ABORTED"), true);
  assert.equal(isSupersededNavigation("(-3)"), true);
});

test("real load failures are still treated as failures", () => {
  assert.equal(isSupersededNavigation("ERR_NAME_NOT_RESOLVED (-105)"), false);
  assert.equal(isSupersededNavigation("ERR_INTERNET_DISCONNECTED (-106)"), false);
  assert.equal(isSupersededNavigation("ERR_CONNECTION_REFUSED (-102)"), false);
  assert.equal(isSupersededNavigation(""), false);
  assert.equal(isSupersededNavigation(undefined), false);
  assert.equal(isSupersededNavigation(null), false);
});

test("only ERR_ABORTED is a benign did-fail-load code", () => {
  assert.equal(isBenignLoadFailure(-3), true);
  assert.equal(isBenignLoadFailure("-3"), true);
  assert.equal(isBenignLoadFailure(-105), false);
  assert.equal(isBenignLoadFailure(0), false);
  assert.equal(isBenignLoadFailure(undefined), false);
});
