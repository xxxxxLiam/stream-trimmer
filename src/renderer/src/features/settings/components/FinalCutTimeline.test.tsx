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

test("changing the kind never rewrites the frame rate (vertical follows the video)", () => {
  const drawer = readFileSync(new URL("./SettingsDrawer.tsx", import.meta.url), "utf8");
  assert.match(drawer, /timelineFormat: \{ \.\.\.fcp\.timelineFormat, kind \}/);
  assert.doesNotMatch(drawer, /=== "source" \? "30"/);
  const handoff = readFileSync(new URL("../../handoff/components/EditorHandoff.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(handoff, /=== "source" \? "30"/);
  assert.match(handoff, /timelineFormat: \{ \.\.\.settings\.timelineFormat, kind \}/);
});
