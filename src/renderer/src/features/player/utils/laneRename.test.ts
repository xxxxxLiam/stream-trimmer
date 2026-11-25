/**
 * File: laneRename.test.ts
 * Path: src/renderer/src/features/player/utils/laneRename.test.ts
 * Description: Renaming on the Clips lane follows the one naming rule, and Enter saves, Esc cancels.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { finishRename, renameKey } from "./laneRename";

test("a valid two-word name is saved, tidied", () => {
  assert.deepEqual(finishRename("  Raw   Truth ", "Honest Version"), { kind: "save", name: "Raw Truth" });
});

test("the same name changes nothing", () => {
  assert.deepEqual(finishRename("Honest Version", "Honest Version"), { kind: "same" });
});

test("a name the rule forbids gets the rule's plain error, not a save", () => {
  const one = finishRename("Honest", "Honest Version");
  assert.equal(one.kind, "error");
  assert.match(one.kind === "error" ? one.reason : "", /exactly two/);
  assert.equal(finishRename("Bad/Name Here", "Honest Version").kind, "error");
  assert.equal(finishRename("", "Honest Version").kind, "error");
});

test("Enter saves and Escape cancels", () => {
  assert.equal(renameKey("Enter"), "save");
  assert.equal(renameKey("Escape"), "cancel");
  assert.equal(renameKey("a"), null);
});
