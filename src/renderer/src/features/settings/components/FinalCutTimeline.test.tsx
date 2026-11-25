/**
 * File: FinalCutTimeline.test.tsx
 * Description: The Timeline switch on the Final Cut page: vertical by default, From your look greyed until a
 *   look exists, the format line, the no-crop note, and that uploading a look switches it on.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import FinalCutTimeline, { timelineLine } from "./FinalCutTimeline";
import { normalizeTimeline, resolveTimeline } from "../../../shared/utils/fcpxml";
import { addSavedLook } from "../../../shared/utils/fcpLooks";

const noop = () => {};
const html = (p: Partial<Parameters<typeof FinalCutTimeline>[0]> = {}) =>
  renderToStaticMarkup(<FinalCutTimeline kind="vertical" lookName="" lookFormat={null} onPick={noop} {...p} />);

test("no look: Vertical is on, From your look is greyed and says to upload one", () => {
  const h = html();
  assert.match(h, /aria-checked="true"[^>]*>Vertical 9:16</);
  assert.match(h, /aria-disabled="true"[^>]*>From your look</);
  assert.match(h, /1080 × 1920\. Frame rate follows the video\. Upload a look to use its timeline instead\./);
  assert.match(h, /Clipr never crops: a wide video sits in the middle of a vertical timeline, and your look&#x27;s zoom fills it\./);
});

test("with a look: From your look is on and names the format found", () => {
  const h = html({ kind: "look", lookName: "Acme grade", lookFormat: { width: 1080, height: 1920, fps: "25" } });
  assert.match(h, /aria-checked="true"[^>]*>From your look</);
  assert.doesNotMatch(h, /aria-disabled/);
  assert.equal(timelineLine({ kind: "look", lookName: "Acme grade", lookFormat: { width: 1080, height: 1920, fps: "25" } }), "1080 × 1920 · 25p, from Acme grade.");
});

test("a look choice whose look is gone shows Vertical, and Same as video says so", () => {
  assert.match(html({ kind: "look" }), /aria-checked="true"[^>]*>Vertical 9:16</);
  assert.match(html({ kind: "source" }), /The video&#x27;s own size and frame rate\./);
});

test("the new kind is stored, and until Engine reads the look it makes a vertical project", () => {
  assert.equal(normalizeTimeline({ kind: "look" }).kind, "look");
  const r = resolveTimeline({ kind: "look", width: 1, height: 1, fps: "30" }, { width: 1920, height: 1080, fps: { num: 25, den: 1 } } as never);
  assert.deepEqual([r.width, r.height], [1080, 1920]);
});

test("uploading a look switches the timeline to it, and the editor page shows the switch", () => {
  const drawer = readFileSync(new URL("./SettingsDrawer.tsx", import.meta.url), "utf8");
  assert.match(drawer, /timelineFormat: \{ \.\.\.activeFcp\.timelineFormat, kind: "look" \}/);
  assert.match(readFileSync(new URL("../hooks/useFinalCutLook.ts", import.meta.url), "utf8"), /onUploaded\?\.\(\)/);
  assert.match(readFileSync(new URL("./SettingsEditor.tsx", import.meta.url), "utf8"), /<FinalCutTimeline \{\.\.\.fc\.timeline\}/);
});

test("picking a kind makes the rate follow the video, never 30 (the switch has no rate control)", () => {
  const drawer = readFileSync(new URL("./SettingsDrawer.tsx", import.meta.url), "utf8");
  assert.match(drawer, /timelineFormat: \{ \.\.\.fcp\.timelineFormat, kind, fps: "source" \}/);
  assert.doesNotMatch(drawer, /=== "source" \? "30"/);
  const handoff = readFileSync(new URL("../../handoff/components/EditorHandoff.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(handoff, /=== "source" \? "30"/);
  assert.match(handoff, /timelineFormat: \{ \.\.\.settings\.timelineFormat, kind \}/);
});

test("V18-F-5: an older custom size is shown as it is, with no choice ticked", () => {
  const h = html({ kind: "custom", custom: { width: 1280, height: 720, fps: "24" } });
  assert.doesNotMatch(h, /aria-checked="true"/);
  assert.match(h, /1280 × 720 at 24 fps, set in an older version\. Pick one above to change it\./);
});

test("D3-1: a look saved before its size was read says so instead of claiming a size", () => {
  const line = timelineLine({ kind: "look", lookName: "Acme grade", lookFormat: null });
  assert.match(line, /Acme grade has no size saved, so the project is 1080 × 1920 for now\. Choose its Final Cut export again to read it\./);
});

test("D3-1: choosing the same file again gives an older saved look its size, and keeps one look", () => {
  const old = { id: "l-1", name: "Acme grade", addedAt: 1, look: { version: "1.10", clip: "<c/>", effects: [], found: ["Scale"] } };
  const again = { fileName: "Acme grade.fcpxml", look: { ...old.look, format: { width: 1080, height: 1920, fps: "25" } } };
  const r = addSavedLook([old], again);
  assert.equal(r.looks.length, 1);
  assert.equal(r.saved.id, "l-1");
  assert.deepEqual(r.saved.look.format, { width: 1080, height: 1920, fps: "25" });
  assert.deepEqual(addSavedLook([r.saved], { fileName: "x", look: old.look }).saved.look.format, { width: 1080, height: 1920, fps: "25" }, "a file without a size never removes it");
});

test("D3-2: a stored legacy rate of 30 follows the video; a custom size keeps its own rate", () => {
  assert.equal(normalizeTimeline({ kind: "source", fps: "30" }).fps, "source");
  assert.equal(normalizeTimeline({ kind: "vertical", fps: "30" }).fps, "source");
  assert.equal(normalizeTimeline({ kind: "look", fps: "30" }).fps, "source");
  assert.equal(normalizeTimeline({ kind: "custom", fps: "30" }).fps, "30");
  assert.equal(normalizeTimeline({ kind: "vertical", fps: "24" }).fps, "24");
});
