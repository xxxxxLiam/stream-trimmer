/**
 * File: clipDestination.test.ts
 * Path: src/renderer/src/features/player/utils/clipDestination.test.ts
 * Description: Where clips go (the Clip arrow menu), and why Clip can be dimmed.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { openInFor, DESTINATIONS, availableDestinations, clipReason, clipSections, normalizeDestination, sectionsLength, toAfterCutting } from "./clipDestination";

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

test("Final Cut sends a project; the other editors open with the saved clip; folder does neither", () => {
  assert.equal(toAfterCutting("folder"), "nothing");
  assert.equal(toAfterCutting("finalcut"), "finalcut");
  assert.equal(toAfterCutting("premiere"), "nothing");
  assert.equal(openInFor("premiere"), "premiere");
  assert.equal(openInFor("resolve"), "resolve");
  assert.equal(openInFor("capcut"), "capcut");
  assert.equal(openInFor("folder"), undefined);
  assert.equal(openInFor("finalcut"), undefined);
});

test("Clip says why it can't run", () => {
  const reason = "Set an end first: click the timeline or press O";
  assert.equal(clipReason({ hasRange: false, segments: 0 }), reason);
  assert.equal(clipReason({ hasRange: true, segments: 0 }), null);
  assert.equal(clipReason({ hasRange: false, segments: 2 }), null);
  // A clip being made is not a reason: Clip stays live and the next clip joins the line.
  assert.equal(clipReason({ hasRange: true, segments: 0 }), null);
});

test("the choice is sticky and shared by every Clip button", async () => {
  const { getClipDestination, setClipDestination } = await import("../hooks/useClipDestination");
  assert.equal(getClipDestination(), "folder");
  setClipDestination("capcut");
  assert.equal(getClipDestination(), "capcut");
  setClipDestination("folder");
});

test("Clip makes the locked sections then the marked part; a repeat of the last is not added twice", () => {
  const a = { start: 10, end: 28 };
  const b = { start: 600, end: 616 };
  assert.deepEqual(clipSections([a], b), [a, b]);
  assert.deepEqual(clipSections([a], a), [a]);
  assert.deepEqual(clipSections([], b), [b]);
  assert.deepEqual(clipSections([a], null), [a]);
  assert.deepEqual(clipSections([], { start: 5, end: 5 }), []);
  assert.equal(sectionsLength([a, b]), 34);
});

test("A4-4: with no campaign the Clip button says to make one", () => {
  assert.match(clipReason({ hasRange: true, segments: 0, noCampaign: true }) ?? "", /Make a campaign first/);
  assert.equal(clipReason({ hasRange: true, segments: 0 }), null);
});

import { readFileSync } from "node:fs";

test("Premiere Pro is listed but coming soon: it can never be the chosen destination, even from an old saved choice", () => {
  assert.equal(DESTINATIONS.find((d) => d.id === "premiere")?.soon, true);
  assert.equal(DESTINATIONS.filter((d) => d.soon).length, 1, "only Premiere is marked");
  assert.equal(normalizeDestination("premiere"), "folder");
  assert.equal(normalizeDestination("premiere", ["premiere", "resolve", "capcut"]), "folder");
  assert.equal(normalizeDestination("resolve", ["premiere", "resolve", "capcut"]), "resolve", "the others are untouched");
});

test("the Clip arrow menu shows Premiere Pro disabled with 'Coming soon', and picking it does nothing", () => {
  const menu = readFileSync(new URL("../components/ClipButton.tsx", import.meta.url), "utf8");
  assert.match(menu, /disabled=\{d\.soon\}[\s\S]*trailing=\{d\.soon \? "Coming soon" :/);
  const ctl = readFileSync(new URL("../hooks/useClipController.ts", import.meta.url), "utf8");
  assert.match(ctl, /\?\.soon\) return; \/\/ coming soon: not selectable, opens no setup/);
});

test("the footer's middle sentence and its two pickers are gone; the Clip arrow carries Where clips go and Audio as pages", () => {
  const bar = readFileSync(new URL("../components/ExportBar.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(bar, /makesText\(|ui-footer-clips|Audio languages/);
  assert.match(bar, /Sign in for 1080p/);
  assert.match(bar, /<ClipButton listenForKey openUp options=\{\{/);
  const menu = readFileSync(new URL("../components/ClipButton.tsx", import.meta.url), "utf8");
  assert.match(menu, /setPage\("where"\)/);
  assert.match(menu, /setPage\("audio"\)/);
  assert.match(menu, /setPage\("root"\)/);
  assert.match(menu, /\{hasDubs \? \(/, "the Audio row is absent when the video has no dubs");
  assert.match(menu, /"Folder on this computer"/);
});
