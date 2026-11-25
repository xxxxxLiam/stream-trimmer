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
const lane = readFileSync(new URL("../components/SourceLane.tsx", import.meta.url), "utf8");
const down = src.slice(src.indexOf("const onLanePointerDown"), src.indexOf("const onLanePointerMove"));

test("pointer tool: a press moves the playhead and starts a scrub, with no range drag", () => {
  const after = down.slice(down.indexOf("The pointer only moves the playhead"));
  assert.match(after, /kind: "scrub"/);
  assert.match(after, /requestSeek/);
  assert.doesNotMatch(after, /kind: "range"/);
});

test("scissors: a press starts a range drag and does not seek", () => {
  const clip = down.slice(down.indexOf('tools.tool === "clip"'), down.indexOf("The pointer only moves"));
  assert.match(clip, /kind: "range"/);
  assert.doesNotMatch(clip, /requestSeek/);
});

test("the lane listens for the wheel with a non-passive listener", () => {
  assert.match(lane, /addEventListener\("wheel"[\s\S]*passive: false/);
});
