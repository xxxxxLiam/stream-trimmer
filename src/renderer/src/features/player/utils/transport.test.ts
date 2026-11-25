/**
 * File: transport.test.ts
 * Path: src/renderer/src/features/player/utils/transport.test.ts
 * Description: Preview transport rules: speed cycle, J K L keys, loop over a joined clip,
 *   hover labels with their keys, and which end card shows.
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  spacePresses,
  SPEEDS,
  clipPosition,
  clipToVideo,
  clockTime,
  endCardKind,
  hoverLabel,
  keyAction,
  loopSeek,
  nextSpeed,
  stepTarget,
} from "./transport";

test("speed cycles 1x, 1.5x, 2x and back", () => {
  assert.deepEqual([...SPEEDS], [1, 1.5, 2]);
  assert.equal(nextSpeed(1), 1.5);
  assert.equal(nextSpeed(1.5), 2);
  assert.equal(nextSpeed(2), 1);
  assert.equal(nextSpeed(0.75), 1);
});

test("clock time drops the leading zero hour like the board", () => {
  assert.equal(clockTime(4351), "1:12:31");
  assert.equal(clockTime(8073), "2:14:33");
  assert.equal(clockTime(65), "0:01:05");
  assert.equal(clockTime(Number.NaN), "0:00:00");
});

test("step moves 5 seconds and stays inside the video", () => {
  assert.equal(stepTarget(100, -5, 600), 95);
  assert.equal(stepTarget(3, -5, 600), 0);
  assert.equal(stepTarget(598, 5, 600), 600);
});

test("J, K, L map to back, stop, forward; L and J hold to shuttle", () => {
  assert.deepEqual(keyAction("j", false, false), { kind: "step", by: -5 });
  assert.deepEqual(keyAction("J", false, false), { kind: "step", by: -5 });
  assert.deepEqual(keyAction("k", false, false), { kind: "pause" });
  assert.deepEqual(keyAction("l", false, false), { kind: "step", by: 5 });
  assert.deepEqual(keyAction("l", false, true), { kind: "shuttle", dir: 1 });
  assert.deepEqual(keyAction("j", false, true), { kind: "shuttle", dir: -1 });
  assert.deepEqual(keyAction(" ", false, false), { kind: "toggle" });
});

test("Cmd or Ctrl L loops the range instead of stepping", () => {
  assert.deepEqual(keyAction("l", true, false), { kind: "loop" });
  assert.equal(keyAction("x", false, false), null);
});

test("loop keeps playback inside one range", () => {
  const one = [{ start: 100, end: 140 }];
  assert.equal(loopSeek(one, 120), null);
  assert.equal(loopSeek(one, 140), 100);
  assert.equal(loopSeek(one, 90), 100);
});

test("a joined clip plays its sections in order and skips the gap", () => {
  const joined = [
    { start: 100, end: 120 },
    { start: 500, end: 530 },
  ];
  assert.equal(loopSeek(joined, 110), null);
  assert.equal(loopSeek(joined, 120), 500);
  assert.equal(loopSeek(joined, 300), 500);
  assert.equal(loopSeek(joined, 530), 100);
  assert.equal(loopSeek([], 10), null);
});

test("hover labels carry the key", () => {
  assert.equal(hoverLabel("play", false), "Play or pause  Space");
  assert.equal(hoverLabel("forward", false), "Forward 5 s · hold L to shuttle  L");
  assert.equal(hoverLabel("back", false), "Back 5 s · hold J to shuttle  J");
  assert.equal(hoverLabel("loop", true), "Loop the range  ⌘L");
  assert.equal(hoverLabel("loop", false), "Loop the range  Ctrl L");
  assert.equal(hoverLabel("speed", false), "Speed");
  assert.equal(hoverLabel("fullscreen", false), "Full screen");
});

test("end card: next video, done for today, or nothing waiting", () => {
  assert.equal(endCardKind({ next: { title: "B", waiting: 3 }, made: 1, quota: 3 }), "next");
  assert.equal(endCardKind({ next: null, made: 3, quota: 3 }), "done");
  assert.equal(endCardKind({ next: null, made: 2, quota: 3 }), "nothing");
  assert.equal(endCardKind({ next: null, made: 0, quota: null }), "nothing");
});

test("a joined clip counts the playhead in clip time, skipped parts left out", () => {
  const two = [{ start: 72, end: 90 }, { start: 604, end: 620 }];
  assert.deepEqual(clipPosition(two, 81), { at: 9, total: 34 });
  assert.deepEqual(clipPosition(two, 610), { at: 24, total: 34 });
  // In the skipped part it reads the end of the section before; before the first it reads 0; after all, the total.
  assert.equal(clipPosition(two, 300).at, 18);
  assert.equal(clipPosition(two, 10).at, 0);
  assert.equal(clipPosition(two, 700).at, 34);
  assert.deepEqual(clipPosition([], 5), { at: 0, total: 0 });
});

test("clipToVideo is the way back from clip time", () => {
  const two = [{ start: 72, end: 90 }, { start: 604, end: 620 }];
  assert.equal(clipToVideo(two, 9), 81);
  assert.equal(clipToVideo(two, 24), 610);
  assert.equal(clipToVideo(two, 99), 620);
  for (const t of [72, 85, 604, 619]) assert.equal(clipToVideo(two, clipPosition(two, t).at), t);
});

test("Space is play and pause from anywhere; it only keeps its own job in fields, switches, boxes and menu or list choices", () => {
  const el = (tagName: string, role?: string) => ({ tagName, getAttribute: (n: string) => (n === "role" && role ? role : null) });
  // Anywhere: a plain button, a link, a tab, a panel row, the timeline, the page.
  for (const e of [el("BUTTON"), el("A"), el("DIV", "tab"), el("DIV", "button"), el("DIV", "slider"), el("DIV"), el("BODY")]) assert.equal(spacePresses(e), false, `${e.tagName} ${e.getAttribute("role")}`);
  assert.equal(spacePresses(null), false);
  // Where Space means something else.
  for (const e of [el("INPUT"), el("TEXTAREA"), el("SELECT"), el("DIV", "switch"), el("DIV", "checkbox"), el("DIV", "menuitemradio"), el("DIV", "option"), el("DIV", "textbox")]) assert.equal(spacePresses(e), true, `${e.tagName} ${e.getAttribute("role")}`);
  assert.equal(spacePresses({ tagName: "DIV", isContentEditable: true }), true);
});

import { joinedStep, SECTION_LEAD } from "./transport";

test("a joined clip plays only its sections: gaps are jumped, the last section loops or stops", () => {
  const two = [{ start: 100, end: 130 }, { start: 400, end: 420 }];
  // Inside a section: left alone.
  assert.equal(joinedStep(two, 110, false), null);
  assert.equal(joinedStep(two, 410, true), null);
  // Reaching the first section's end jumps over the gap to the second.
  assert.deepEqual(joinedStep(two, 130 - SECTION_LEAD + 0.01, false), { kind: "seek", to: 400 });
  assert.deepEqual(joinedStep(two, 131, false), { kind: "seek", to: 400 });
  // Inside the gap or before the first section: forward to the next start.
  assert.deepEqual(joinedStep(two, 200, false), { kind: "seek", to: 400 });
  assert.deepEqual(joinedStep(two, 10, false), { kind: "seek", to: 100 });
  // After the last: wraps to the first when looping, else stops at the end.
  assert.deepEqual(joinedStep(two, 420 - SECTION_LEAD + 0.01, true), { kind: "seek", to: 100 });
  assert.deepEqual(joinedStep(two, 421, true), { kind: "seek", to: 100 });
  assert.deepEqual(joinedStep(two, 421, false), { kind: "stop", at: 420 });
  assert.deepEqual(joinedStep(two, 420 - SECTION_LEAD + 0.01, false), { kind: "stop", at: 420 });
  // Three sections in order.
  const three = [...two, { start: 900, end: 910 }];
  assert.deepEqual(joinedStep(three, 419.9, false), { kind: "seek", to: 900 });
  // No section: not its job. (One section is covered by the single-range test below.)
  assert.equal(joinedStep([], 5, false), null);
});

test("one picked range plays alone: play starts at its start, runs to its end, then stops (or loops); no range plays the whole video", () => {
  const one = [{ start: 100, end: 130 }];
  assert.deepEqual(joinedStep(one, 10, false), { kind: "seek", to: 100 }, "before the range: jump to its start");
  assert.equal(joinedStep(one, 110, false), null, "inside it: play on");
  assert.deepEqual(joinedStep(one, 131, false), { kind: "stop", at: 130 }, "past its end: stop at the end");
  assert.deepEqual(joinedStep(one, 131, true), { kind: "seek", to: 100 }, "looping: back to the start");
  assert.equal(joinedStep([], 50, false), null);
});
