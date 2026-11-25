/**
 * File: persistRefused.test.ts
 * Description: E2-4. A save the app refuses (too large) or fails must reach the page, not vanish.
 */
import assert from "node:assert/strict";
import test from "node:test";

const results: unknown[] = [];
(globalThis as unknown as { window: unknown }).window = {
  electronAPI: { settingsSnapshot: {}, setSetting: () => Promise.resolve(results.shift()) },
};

test("E2-4: a refused or failed write tells the listeners which key and why; an accepted one stays quiet", async () => {
  const { onSaveRefused, writeSetting } = await import("./persist");
  const seen: [string, string][] = [];
  const stop = onSaveRefused((k, r) => seen.push([k, r]));
  results.push({ ok: true }, { ok: false, reason: "too-large" }, { ok: false }, undefined);
  writeSetting("clipper.bank", [1]);
  writeSetting("clipper.bank", [1, 2]);
  writeSetting("clipper.workspaces", {});
  writeSetting("clipper.flags", {});
  await new Promise((r) => setTimeout(r, 10));
  assert.deepEqual(seen, [["clipper.bank", "too-large"], ["clipper.workspaces", "write-failed"]]);
  stop();
  results.push({ ok: false, reason: "too-large" });
  writeSetting("clipper.bank", [3]);
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(seen.length, 2, "a removed listener hears nothing");
});

test("E2-4: a rejected write is also reported", async () => {
  (globalThis as unknown as { window: { electronAPI: { setSetting: () => Promise<never> } } }).window.electronAPI.setSetting = () => Promise.reject(new Error("ipc gone"));
  const { onSaveRefused, writeSetting } = await import("./persist");
  const seen: string[] = [];
  onSaveRefused((k, r) => seen.push(`${k}:${r}`));
  writeSetting("clipper.bank", [1]);
  await new Promise((r) => setTimeout(r, 10));
  assert.deepEqual(seen, ["clipper.bank:write-failed"]);
});
