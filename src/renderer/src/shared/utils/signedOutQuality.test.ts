/**
 * File: signedOutQuality.test.ts
 * Path: src/renderer/src/shared/utils/signedOutQuality.test.ts
 * Description: AF2-2 and AF2-3 rules from youtubeConnection.ts. A skipped user's first Cut must ask
 * for a quality the engine will serve (360p), the user's own choice returns on sign-in, and the help
 * app has no sign-in gate any more (the footer pill opens the Help sign-in page).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { isSignedOut, requestedQuality } from "./youtubeConnection";

test("A-1: signed out the request goes out at 360p, signed in it asks for 1080p, audio is untouched", () => {
  assert.equal(requestedQuality({ signedOut: true, format: "mp4", quality: "best" }), "360");
  assert.equal(requestedQuality({ signedOut: false, format: "mp4", quality: "360" }), "1080", "the held 360 does not stick after sign-in");
  assert.equal(requestedQuality({ signedOut: false, format: "mp4", quality: "best" }), "1080");
  assert.equal(requestedQuality({ signedOut: true, format: "mp3", quality: "320" }), "320");
});

test("what counts as signed out, and as the gate being up", () => {
  assert.equal(isSignedOut({ connected: false, restoring: false }), true);
  assert.equal(isSignedOut({ connected: false, restoring: true }), false, "a launch-time restore is not signed out yet");
  assert.equal(isSignedOut({ connected: true, restoring: false }), false);
});

test("useClipperController applies the signed-out quality rule", () => {
  const src = readFileSync(new URL("../../modules/clipper/hooks/useQualityRulesEffects.ts", import.meta.url), "utf8");
  assert.match(src, /requestedQuality\(/);
  assert.match(src, /isSignedOut\(connection\)/);
  // A-1: nothing the clipper asks for is written back to the campaign.
  const app = readFileSync(new URL("../../routes/App.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(app, /update\(campaign\.id, \{ format, quality \}\)/);
  assert.doesNotMatch(app, /campaign\.quality|campaign\.format/);
});

test("there is no sign-in gate: Help is never withdrawn for one, and the footer pill opens Settings instead", () => {
  const btn = readFileSync(new URL("../../features/help/components/HelpButton.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(btn, /isSignInGateUp|gateUp/);
  const app = readFileSync(new URL("../../routes/App.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(app, /YouTubeConnectModal/);
});

test("A-1: the browser sweep runs at launch and its result is reported, so the pill can show", async () => {
  const { runLaunchSignIn } = await import("./launchSignIn");
  const calls: string[] = [];
  const reports: boolean[] = [];
  // No saved cookies.txt session: the browsers are tried, and nothing works -> reported as not usable.
  assert.equal(await runLaunchSignIn({ restore: async () => (calls.push("restore"), false), sweep: async () => (calls.push("sweep"), false), report: (u) => void reports.push(u) }), false);
  assert.deepEqual(calls, ["restore", "sweep"]);
  assert.deepEqual(reports, [false]);
  // A browser sign-in works -> usable.
  assert.equal(await runLaunchSignIn({ restore: async () => false, sweep: async () => true, report: (u) => void reports.push(u) }), true);
  // A saved cookies.txt session works -> the browsers are not tried.
  const tried: string[] = [];
  await runLaunchSignIn({ restore: async () => true, sweep: async () => (tried.push("sweep"), false), report: () => {} });
  assert.deepEqual(tried, []);
  // A throw in the sweep still reports (as not usable) and never rejects.
  assert.equal(await runLaunchSignIn({ restore: async () => false, sweep: async () => { throw new Error("x"); }, report: (u) => void reports.push(u) }), false);
  const shell = readFileSync(new URL("../../routes/App.tsx", import.meta.url), "utf8");
  assert.match(shell, /runLaunchSignIn\(\{[\s\S]*sweep: sweepBrowsers/);
});

test("A-1: the 'Downloaded at 360p' toast offers the same Sign in for 1080p action as the footer pill", () => {
  const app = readFileSync(new URL("../../routes/App.tsx", import.meta.url), "utf8");
  assert.match(app, /\{onSignIn && lowQualityDetail\(savedNotice\.detail\) && \(/);
  assert.match(app, /<SavedToast onSignIn=\{openSignIn\} \/>/);
  assert.match(app, /onSignIn=\{openSignIn\}/);
  assert.match(app, /return \/at 360p\\b\/\.test\(detail \?\? ""\)/);
});
