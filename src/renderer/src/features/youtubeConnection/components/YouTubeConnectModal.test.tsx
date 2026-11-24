/**
 * File: YouTubeConnectModal.test.tsx
 * Description: A-1 / H-2. The gate must offer an honest way past it (the
 * trap's focus/inert behaviour is DOM-only and was verified in the real app).
 * Plus the progressive sign-in: checking, then not found, then failed, each
 * reached only when the one before has actually failed (docs/signin-progressive.md).
 */
import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { register } from "node:module";
import { renderToStaticMarkup } from "react-dom/server";

// framer-motion resolves a second copy of React under this runner when
// node_modules is a symlink, so its hooks cannot run in a static render. The
// progress bar's animation is not under test: resolve it to a plain element.
const stub =
  "data:text/javascript," +
  encodeURIComponent(
    "export const motion = { div: () => null };",
  );
register(
  "data:text/javascript," +
    encodeURIComponent(
      `export async function resolve(s, c, n) { if (s === "framer-motion") return { url: ${JSON.stringify(stub)}, shortCircuit: true }; return n(s, c); }`,
    ),
);

let importResult: { ok: boolean; error?: string } = { ok: false, error: "That file is not a cookies.txt." };
const pending: Array<(status: string) => void> = [];

const g = globalThis as any;
g.window = {
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  electronAPI: {
    probeYouTube: async () => ({ connected: false }),
    importYouTubeCookies: async () => importResult,
    getBrowserOrder: async () => ({ browsers: ["firefox"] }),
    readDiagnostics: async () => ({ text: "", path: null }),
  },
};
g.fetch = () =>
  new Promise((resolve) => {
    pending.push((status) =>
      resolve({ ok: true, headers: { get: () => "application/json" }, text: async () => JSON.stringify({ status }), json: async () => ({ status }) }),
    );
  });
const tick = () => new Promise((r) => setTimeout(r, 0));

// What none of the first screen may mention.
const MANUAL = /cookies\.txt|LOCALLY|extension|private window|Choose cookies|Drop the file|Check browsers again|Diagnostics|Not found automatically/;

test("modal offers a labelled signed-out route and hides once it is taken", async () => {
  const lib = await import("../../../shared/utils/youtubeConnection");
  const { default: Modal } = await import("./YouTubeConnectModal");
  await lib.restoreConnection();
  const html = renderToStaticMarkup(<Modal open />);
  assert.match(html, /role="dialog"/);
  assert.match(html, /aria-modal="true"/);
  assert.match(html, /tabindex="-1"/, "dialog can take initial focus");
  assert.match(html, /Continue without signing in \(360p\)/);
  lib.continueSignedOut();
  assert.equal(renderToStaticMarkup(<Modal open />), "", "dismissed modal renders nothing");
  lib.resumeSignIn();
  assert.match(renderToStaticMarkup(<Modal open />), /role="dialog"/);
});

test("connectPhase: each state is reached only when the previous one has failed", async () => {
  const { connectPhase } = await import("./YouTubeConnectModal");
  const base = { busy: false, sweepEnded: false, importRejected: false };
  assert.equal(connectPhase(base, true), "checking", "restore done, sweep not yet started");
  assert.equal(connectPhase({ ...base, busy: true }, false), "checking", "sweep running");
  assert.equal(connectPhase({ ...base, busy: true, importRejected: false }, false), "checking");
  assert.equal(connectPhase({ ...base, sweepEnded: true }, false), "notFound");
  assert.equal(connectPhase({ ...base, sweepEnded: true, busy: true }, false), "notFound", "a re-check keeps the manual route up");
  assert.equal(connectPhase(base, false), "notFound", "no sweep will ever run (browser preview)");
  assert.equal(connectPhase({ ...base, sweepEnded: true, importRejected: true }, false), "failed");
  assert.equal(connectPhase({ ...base, sweepEnded: true, importRejected: true, busy: true }, false), "notFound", "retrying an import leaves failed");
});

test("first screen is only the headline, the reason, progress and the exit; the manual route and diagnostics come later", async () => {
  const lib = await import("../../../shared/utils/youtubeConnection");
  const { default: Modal } = await import("./YouTubeConnectModal");

  // Sweep about to start (the launch restore has finished).
  let html = renderToStaticMarkup(<Modal open />);
  assert.match(html, /Checking your browsers/);
  assert.doesNotMatch(html, MANUAL);
  assert.match(html, /Continue without signing in \(360p\)/);

  // Sweep running.
  const sweep = lib.sweepBrowsers();
  await tick();
  html = renderToStaticMarkup(<Modal open />);
  assert.match(html, /Checking firefox/);
  assert.doesNotMatch(html, MANUAL);
  assert.match(html, /Continue without signing in \(360p\)/);

  // Sweep ends empty: the manual route appears, one step at a time.
  pending.shift()!("signed_out");
  await sweep;
  html = renderToStaticMarkup(<Modal open />);
  assert.match(html, /Not found automatically/);
  assert.match(html, /Install cookies\.txt \(by Lennon Hill\) in Firefox/);
  assert.match(html, /exactly this name/, "the malware warning is kept");
  assert.doesNotMatch(html, /private window/, "step 2 waits for step 1");
  assert.doesNotMatch(html, /Choose cookies|Drop the file/, "the drop target belongs to step 3");
  assert.doesNotMatch(html, /Copy log|Diagnostics/);
  assert.match(html, /Continue without signing in \(360p\)/);
  assert.doesNotMatch(html, /role="alert"/, "an empty sweep is not a failure");

  // A rejected file is the failed state, and the only place diagnostics appear.
  await lib.importCookies();
  html = renderToStaticMarkup(<Modal open />);
  assert.match(html, /role="alert"/);
  assert.match(html, /That file is not a cookies\.txt/);
  assert.match(html, /Choose cookies\.txt/);
  assert.match(html, /private window/, "the private-window advice is kept");
  assert.match(html, /Diagnostics/);
  assert.match(html, /Continue without signing in \(360p\)/);

  // Trying again leaves it.
  importResult = { ok: true };
  void lib.importCookies();
  await tick();
  assert.doesNotMatch(renderToStaticMarkup(<Modal open />), /role="alert"/);
});
