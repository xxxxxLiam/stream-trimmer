/**
 * File: updatePill.test.ts
 * Description: The update pill: only ready and manual updates show one, and a restart never runs mid-clip.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { updatePillFor } from "./updatePill";

test("a ready update offers Restart to update, and not while a clip is being made", () => {
  assert.deepEqual(updatePillFor({ state: "ready", version: "3.4.0" }, false), { kind: "restart", label: "Restart to update" });
  const busy = updatePillFor({ state: "ready" }, true);
  assert.equal(busy?.kind, "restart");
  assert.ok(busy && "disabledReason" in busy && busy.disabledReason);
});

test("the unsigned Mac build gets a download pill with the installer link", () => {
  assert.deepEqual(updatePillFor({ state: "manual", version: "3.4.0", url: "https://example.test/i.dmg" }, true), {
    kind: "download",
    label: "Get version 3.4.0",
    url: "https://example.test/i.dmg",
  });
});

test("checking, downloading, none, errors and idle show no pill", () => {
  for (const s of [{ state: "checking" }, { state: "available" }, { state: "downloading", percent: 4 }, { state: "none" }, { state: "error", message: "x" }, { state: "idle" }] as const) {
    assert.equal(updatePillFor(s, false), null);
  }
});
