/**
 * File: updatePill.test.ts
 * Description: The update pill follows UpdateReady, and a refused restart says why.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { restartRefusal, updatePillFor } from "./updatePill";

test("nothing ready, no pill; restart mode says Restart app to update", () => {
  assert.equal(updatePillFor(null), null);
  assert.deepEqual(updatePillFor({ version: "3.4.0", mode: "restart" }), { kind: "restart", label: "Restart app to update" });
});

test("the unsigned Mac build gets Get version x with the installer link", () => {
  assert.deepEqual(updatePillFor({ version: "3.4.0", mode: "download", url: "https://example.test/i.dmg" }), {
    kind: "download",
    label: "Get version 3.4.0",
    url: "https://example.test/i.dmg",
  });
});

test("a restart refused while a clip is made explains itself; success says nothing", () => {
  assert.equal(restartRefusal({ ok: true }), null);
  assert.equal(restartRefusal({ ok: true, waiting: true }), null);
  assert.equal(restartRefusal({ ok: false, reason: "nothing-ready" }), null);
  assert.ok(restartRefusal({ ok: false, reason: "failed" }));
});

test("F-16: the download shows a quiet pill with its percent, fed by the status channel", async () => {
  const { readFileSync } = await import("node:fs");
  const { downloadingLabel } = await import("./updatePill");
  assert.equal(downloadingLabel(42.4), "Downloading update 42%");
  assert.equal(downloadingLabel(140), "Downloading update 100%");
  const hook = readFileSync(new URL("../hooks/useUpdateStatusEffects.ts", import.meta.url), "utf8");
  assert.match(hook, /api\.onUpdateStatus\?\.\(/);
  assert.match(hook, /s\.state === "downloading"/);
  const pill = readFileSync(new URL("../components/UpdatePill.tsx", import.meta.url), "utf8");
  assert.match(pill, /!pill && downloading !== null/);
});

test("F3-4: no percent never reads NaN, and checking keeps the last good state and an error ends it (F4-1)", async () => {
  const { readFileSync } = await import("node:fs");
  const { downloadingLabel } = await import("./updatePill");
  assert.equal(downloadingLabel(Number.NaN), "Downloading update");
  assert.equal(downloadingLabel(-1), "Downloading update");
  const hook = readFileSync(new URL("../hooks/useUpdateStatusEffects.ts", import.meta.url), "utf8");
  assert.match(hook, /Number\.isFinite\(s\.percent\)/);
  assert.match(hook, /else if \(s\.state === "ready" \|\| s\.state === "none"/);
  assert.doesNotMatch(hook, /s\.state === "checking"/, "checking leaves it alone");
  assert.match(hook, /s\.state === "error"\) setDownloading\(null\)/, "F4-1: a failed download clears the percent");
});

test("Liam 25 Nov: the update pills are bright Frost, and a restart waiting for a clip says so and can be cancelled", async () => {
  const { readFileSync } = await import("node:fs");
  const { waitingLabel } = await import("./updatePill");
  assert.equal(waitingLabel("Cold Open"), "Restarts after Cold Open");
  assert.equal(waitingLabel(null), "Restarts after the clip");
  const pill = readFileSync(new URL("../components/UpdatePill.tsx", import.meta.url), "utf8");
  assert.match(pill, /border border-frost bg-frost[^"]*text-bg shadow-saved/);
  assert.match(pill, /border border-frost bg-frost-tint-08 px-\[14px\] text-body font-medium text-frost/);
  assert.doesNotMatch(pill, /border-ice|text-ice/);
  assert.match(pill, /cancelRestartToUpdate/);
  const hook = readFileSync(new URL("../hooks/useUpdateStatusEffects.ts", import.meta.url), "utf8");
  assert.match(hook, /onRestartWaiting/);
});
