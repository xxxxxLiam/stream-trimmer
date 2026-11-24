/**
 * File: clipDestination.test.ts
 * Path: src/renderer/src/features/player/utils/clipDestination.test.ts
 * Description: Where clips go (the Clip arrow menu), and why Clip can be dimmed.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { DESTINATIONS, availableDestinations, clipReason, normalizeDestination, toAfterCutting } from "./clipDestination";

test("the menu lists folder first, then the four editors, with no default editor", () => {
  assert.deepEqual(
    DESTINATIONS.map((d) => d.label),
    ["Save to folder", "Premiere Pro", "Final Cut Pro", "DaVinci Resolve", "CapCut"],
  );
  assert.equal(normalizeDestination(undefined), "folder");
  assert.equal(normalizeDestination("nonsense"), "folder");
  assert.equal(normalizeDestination("resolve"), "resolve");
});

test("Final Cut is not offered where the system doesn't list it", () => {
  const win = availableDestinations(["premiere", "resolve", "capcut"]).map((d) => d.id);
  assert.deepEqual(win, ["folder", "premiere", "resolve", "capcut"]);
  assert.equal(availableDestinations(undefined).length, 5);
});

test("a stored choice that is no longer offered falls back to folder", () => {
  assert.equal(normalizeDestination("finalcut", ["premiere"]), "folder");
});

test("only Save to folder and Final Cut have a hand-off that exists today", () => {
  assert.equal(toAfterCutting("folder"), "nothing");
  assert.equal(toAfterCutting("finalcut"), "finalcut");
  assert.equal(toAfterCutting("premiere"), "nothing");
});

test("Clip says why it can't run", () => {
  const reason = "Set an end first: click the timeline or press O";
  assert.equal(clipReason({ hasRange: false, segments: 0, busy: false }), reason);
  assert.equal(clipReason({ hasRange: true, segments: 0, busy: false }), null);
  assert.equal(clipReason({ hasRange: false, segments: 2, busy: false }), null);
  assert.equal(clipReason({ hasRange: true, segments: 0, busy: true }), "A clip is being made. Clip is ready when it's done.");
});

test("the choice is sticky and shared by every Clip button", async () => {
  const { getClipDestination, setClipDestination } = await import("../hooks/useClipDestination");
  assert.equal(getClipDestination(), "folder");
  setClipDestination("capcut");
  assert.equal(getClipDestination(), "capcut");
  setClipDestination("folder");
});
