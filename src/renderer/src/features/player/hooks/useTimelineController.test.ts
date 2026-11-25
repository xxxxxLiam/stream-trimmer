/**
 * File: useTimelineController.test.ts
 * Description: Source-level guards for how the lane answers the pointer (the hook needs a DOM to run):
 *   the pointer tool seeks on press and scrubs on drag and never sets a range; the scissors set the range
 *   and never seek; the lane listens for the wheel.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const src = readFileSync(new URL("./useTimelineController.ts", import.meta.url), "utf8");
const lane = readFileSync(new URL("../components/Timeline.tsx", import.meta.url), "utf8");
const effects = readFileSync(new URL("./useTimelineEffects.ts", import.meta.url), "utf8");
const sourceLane = readFileSync(new URL("../components/SourceLane.tsx", import.meta.url), "utf8");
const down = src.slice(src.indexOf("const onLanePointerDown"), src.indexOf("const onLanePointerMove"));

test("pointer tool: a press moves the playhead and starts a scrub, with no range drag", () => {
  const after = down.slice(down.indexOf("The pointer only moves the playhead"));
  assert.match(after, /kind: "scrub"/);
  assert.match(after, /requestSeek/);
  assert.doesNotMatch(after, /kind: "range"/);
});

test("scissors: a press marks a start or an end and does not seek or drag", () => {
  const clip = down.slice(down.indexOf('tools.tool === "clip"'), down.indexOf('tools.tool === "range"'));
  assert.match(clip, /scissorsClick/);
  assert.doesNotMatch(clip, /requestSeek|kind: "range"/);
});

test("select range: a press starts a range drag and does not seek", () => {
  const range = down.slice(down.indexOf('tools.tool === "range"'), down.indexOf("The pointer only moves"));
  assert.match(range, /kind: "range"/);
  assert.doesNotMatch(range, /requestSeek/);
});

test("the tools act on the whole timeline area, not only the Source lane", () => {
  assert.match(lane, /data-timeline-area[\s\S]*onPointerDown=\{c\.onLanePointerDown\}/);
  assert.doesNotMatch(sourceLane, /onPointerDown=\{c\.onLanePointerDown\}/);
});

test("the Source lane takes the height the timeline gains", () => {
  assert.match(lane, /sourceLaneHeight\(height\)/);
});

test("the lane listens for the wheel with a non-passive listener", () => {
  assert.match(lane, /addEventListener\("wheel"[\s\S]*passive: false/);
});

test("the cursor follows the tool over the whole timeline, not only the Source lane", () => {
  assert.match(lane, /TOOL_CURSORS\[c\.tool\]/);
});

test("the Source outline wraps the filmstrip instead of sitting on it", () => {
  assert.match(sourceLane, /left: x - 3/);
});

test("zooming does not snap the view back to the playhead: only the playhead moving does", () => {
  const follow = effects.slice(effects.indexOf("the window follows the playhead"));
  const deps = follow.slice(0, follow.indexOf("publishTimelineView")).match(/\}, \[([^\]]*)\]\)/g) ?? [];
  assert.deepEqual(deps, ["}, [a.playhead])"]);
});

test("tool keys are wired, and the tool buttons show them in their tooltips", () => {
  assert.match(effects, /toolForKey\(e\)[\s\S]*setTool\(t\)/);
  const bar = readFileSync(new URL("../../../modules/layout/components/BottomBar.tsx", import.meta.url), "utf8");
  assert.match(bar, /title=\{`\$\{label\} \(\$\{TOOL_KEYS\[t\]\.toUpperCase\(\)\}\)`\}/);
});
