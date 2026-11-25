/**
 * File: updatePill.test.ts
 * Description: The update pill follows UpdateReady, and a refused restart says why.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { restartRefusal, updatePillFor } from "./updatePill";

test("nothing ready, no pill; restart mode says Restart to update", () => {
  assert.equal(updatePillFor(null), null);
  assert.deepEqual(updatePillFor({ version: "3.4.0", mode: "restart" }), { kind: "restart", label: "Restart to update" });
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
  assert.match(restartRefusal({ ok: false, reason: "busy" }) ?? "", /clip is being made/);
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
