/**
 * File: signedOutQuality.test.ts
 * Path: src/renderer/src/shared/utils/signedOutQuality.test.ts
 * Description: AF2-2 and AF2-3 rules from youtubeConnection.ts. A skipped user's first Cut must ask
 * for a quality the engine will serve (360p), the user's own choice returns on sign-in, and the help
 * button and drawer are not offered while the sign-in gate (which makes them inert) is up.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { isSignedOut, isSignInGateUp, signedOutQuality } from "./youtubeConnection";

test("signed out at the default Best: the request goes out at 360p, the choice is remembered", () => {
  assert.deepEqual(signedOutQuality({ signedOut: true, format: "mp4", quality: "best", held: null }), { quality: "360", held: "best" });
  assert.deepEqual(signedOutQuality({ signedOut: true, format: "mp4", quality: "1080", held: null }), { quality: "360", held: "1080" });
});

test("already 360p or lower, or audio: untouched", () => {
  assert.deepEqual(signedOutQuality({ signedOut: true, format: "mp4", quality: "360", held: null }), { quality: "360", held: null });
  assert.deepEqual(signedOutQuality({ signedOut: true, format: "mp3", quality: "320", held: null }), { quality: "320", held: null });
});

test("signing in gives the held choice back, but never overrides a quality picked since", () => {
  assert.deepEqual(signedOutQuality({ signedOut: false, format: "mp4", quality: "360", held: "best" }), { quality: "best", held: null });
  assert.deepEqual(signedOutQuality({ signedOut: false, format: "mp4", quality: "720", held: "best" }), { quality: "720", held: null });
  assert.deepEqual(signedOutQuality({ signedOut: false, format: "mp4", quality: "best", held: null }), { quality: "best", held: null });
});

test("what counts as signed out, and as the gate being up", () => {
  assert.equal(isSignedOut({ connected: false, restoring: false }), true);
  assert.equal(isSignedOut({ connected: false, restoring: true }), false, "a launch-time restore is not signed out yet");
  assert.equal(isSignedOut({ connected: true, restoring: false }), false);
  assert.equal(isSignInGateUp({ connected: false, restoring: false, skipped: false }), true);
  assert.equal(isSignInGateUp({ connected: false, restoring: false, skipped: true }), false);
  assert.equal(isSignInGateUp({ connected: false, restoring: true, skipped: false }), false);
  assert.equal(isSignInGateUp({ connected: true, restoring: false, skipped: false }), false);
});

test("useClipperController applies the signed-out quality rule", () => {
  const src = readFileSync(new URL("../../modules/clipper/hooks/useQualityRulesEffects.ts", import.meta.url), "utf8");
  assert.match(src, /signedOutQuality\(/);
  assert.match(src, /isSignedOut\(connection\)/);
});

test("AF2-3: the help button and drawer both withdraw while the gate is up", () => {
  for (const file of ["../../features/help/components/HelpButton.tsx", "../../features/help/components/HelpDrawer.tsx"]) {
    const src = readFileSync(new URL(file, import.meta.url), "utf8");
    assert.match(src, /isSignInGateUp\(useYouTubeConnection\(\)\)/, `${file} does not read the gate`);
    assert.match(src, /gateUp/, `${file} ignores the gate`);
  }
  const btn = readFileSync(new URL("../../features/help/components/HelpButton.tsx", import.meta.url), "utf8");
  assert.match(btn, /slot && !gateUp/);
  const drawer = readFileSync(new URL("../../features/help/components/HelpDrawer.tsx", import.meta.url), "utf8");
  assert.match(drawer, /if \(!open \|\| gateUp\) return null/);
});
