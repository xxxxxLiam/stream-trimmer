/**
 * File: signInSkip.test.ts
 * Description: Items 5 and 6 — skipping the sign-in persists across launches, signing in
 * clears it, and the header chip has a "Sign in…" item that calls resumeSignIn.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const store = new Map<string, string>();
const g = globalThis as any;
g.window = {
  localStorage: {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  },
  electronAPI: undefined,
};

async function boot(tag: string) {
  // A fresh module instance = a fresh launch (reads the saved setting on load).
  return (await import(`./youtubeConnection?launch=${tag}`)) as typeof import("./youtubeConnection");
}

async function snapshot(lib: typeof import("./youtubeConnection")) {
  let snap: any;
  const React = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  renderToStaticMarkup(
    React.createElement(function Probe() {
      snap = lib.useYouTubeConnection();
      return null;
    }),
  );
  return snap;
}

test("skipping persists: the next launch does not meet the gate", async () => {
  const first = await boot("1");
  assert.equal((await snapshot(first)).skipped, false, "a fresh install still meets the gate");
  first.continueSignedOut();
  assert.equal(store.get("clipper.signInSkipped"), "true");
  const second = await boot("2");
  const s = await snapshot(second);
  assert.equal(s.skipped, true, "skip survived the relaunch");
  assert.equal(s.connected, false, "and the user is still not signed in");
});

test("resumeSignIn forgets the skip for the next launch too", async () => {
  const lib = await boot("3");
  assert.equal((await snapshot(lib)).skipped, true);
  lib.resumeSignIn();
  assert.equal((await snapshot(lib)).skipped, false);
  assert.equal(store.has("clipper.signInSkipped"), false);
  assert.equal((await snapshot(await boot("4"))).skipped, false);
});

