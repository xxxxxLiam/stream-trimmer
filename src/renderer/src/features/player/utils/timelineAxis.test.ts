/**
 * File: timelineAxis.test.ts
 * Path: src/renderer/src/features/player/utils/timelineAxis.test.ts
 * Description: The timeline's time to pixel mapping: zoom windows, Fit, ruler ticks, and the fold
 *   for joined sections that sit far apart.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { axisDuringDrag, axisTicks, fitWindow, foldedAxis, linearAxis, rulerTicks, toT, toX, windowFor, zoomForSpan } from "./timelineAxis";

test("zoom 0 shows the whole video, more zoom shows less around the focus", () => {
  assert.deepEqual(windowFor(1000, 0, 500), { start: 0, end: 1000 });
  const z = windowFor(1000, 100, 500);
  assert.ok(z.end - z.start >= 30 && z.end - z.start < 100);
  assert.ok(z.start <= 500 && z.end >= 500);
  const edge = windowFor(1000, 80, 2);
  assert.equal(edge.start, 0);
  const far = windowFor(1000, 80, 999);
  assert.equal(far.end, 1000);
});

test("Fit frames the range with room either side", () => {
  const w = fitWindow({ start: 4324, end: 4366 }, 8073);
  assert.ok(w.start < 4324 && w.end > 4366);
  assert.ok(Math.abs(w.start - 4310) < 0.5 && Math.abs(w.end - 4390) < 1, "the board: 1:11:50 to 1:13:10");
  assert.ok(w.end - w.start >= 30);
  const whole = fitWindow(null, 8073);
  assert.deepEqual(whole, { start: 0, end: 8073 });
});

test("linear axis maps time to x and back", () => {
  const a = linearAxis({ start: 100, end: 200 }, 1000);
  assert.equal(toX(a, 100), 0);
  assert.equal(toX(a, 150), 500);
  assert.equal(toX(a, 200), 1000);
  assert.equal(toT(a, 250), 125);
});

test("ruler ticks are round times with a minimum gap, labelled with the hour", () => {
  const t = rulerTicks({ start: 4310, end: 4380 }, 1000, 100);
  assert.ok(t.length >= 4 && t.length <= 10);
  assert.ok(t.every((x) => x.t % 10 === 0));
  assert.equal(t[0].label.split(":").length, 3);
  for (let i = 1; i < t.length; i++) assert.ok(toX(linearAxis({ start: 4310, end: 4380 }, 1000), t[i].t) - toX(linearAxis({ start: 4310, end: 4380 }, 1000), t[i - 1].t) >= 100);
});

test("sections close together don't fold", () => {
  assert.equal(foldedAxis([{ start: 100, end: 120 }, { start: 200, end: 230 }], 1200, 1200), null);
  assert.equal(foldedAxis([{ start: 100, end: 120 }], 1200, 1200), null);
});

test("sections far apart fold the skipped part into a marked strip", () => {
  const f = foldedAxis([{ start: 64, end: 82 }, { start: 600, end: 616 }], 3600, 1200);
  assert.ok(f);
  assert.equal(f!.fold.length, 1);
  assert.equal(f!.fold[0].width, 100);
  // Each section sits centred in a 52 s stretch: 64 to 82 gets 17 s either side, 600 to 616 gets 18 s (the stretches are 47 to 99 and 582 to 634).
  assert.equal(f!.fold[0].skipped, 582 - 99);
  assert.equal(f!.fold[0].gap, 600 - 82);
  // Both sections sit left and right of the fold, in order, at one scale.
  const a = toX(f!.axis, 64);
  const b = toX(f!.axis, 82);
  const c = toX(f!.axis, 600);
  const d = toX(f!.axis, 616);
  assert.ok(a < b && b < f!.fold[0].x && f!.fold[0].x + 100 <= c && c < d);
  assert.ok(Math.abs((b - a) / 18 - (d - c) / 16) < 1e-9);
  // A pixel inside a section maps back to its time; inside the fold it maps to nothing.
  assert.ok(Math.abs((toT(f!.axis, b) ?? NaN) - 82) < 1e-6);
  assert.equal(toT(f!.axis, f!.fold[0].x + 50), null);
  // The axis fills the width.
  assert.ok(Math.abs(f!.axis.width - 1200) < 1e-6);
});

test("ruler ticks cover each shown stretch and jump across the fold", () => {
  const f = foldedAxis([{ start: 64, end: 82 }, { start: 600, end: 616 }], 3600, 1200)!;
  const ticks = axisTicks(f.axis);
  const foldX = f.fold[0].x;
  assert.ok(ticks.length > 3);
  assert.ok(ticks.every((t) => t.x < foldX || t.x >= foldX + f.fold[0].width));
  assert.ok(ticks.some((t) => t.t < 200) && ticks.some((t) => t.t > 500));
});

test("zoomForSpan is the inverse of windowFor", () => {
  const z = zoomForSpan(3600, 240);
  const w = windowFor(3600, z, 1800);
  assert.ok(Math.abs(w.end - w.start - 240) < 60);
  assert.equal(zoomForSpan(3600, 3600), 0);
});

test("a drag keeps the axis it began on, so a range made far from a locked section is not measured on a folded axis", () => {
  const locked = [{ start: 3600, end: 3660 }];
  const duration = 15300; // 4:15:00
  const width = 1000;
  const before = { axis: linearAxis(windowFor(duration, 0, 12000), width), folded: false };
  const pointerEndX = (12045 / duration) * width;
  const anchor = 12000;
  // Mid-drag the range exists, so the live axis would be folded.
  const live = foldedAxis([...locked, { start: anchor, end: anchor + 1 }], duration, width);
  assert.ok(live, "the live axis folds once the drag has made a range");
  const frozen = axisDuringDrag(before, { axis: live.axis, folded: true });
  assert.equal(frozen, before);
  assert.equal(Math.round(toT(frozen.axis, pointerEndX) ?? -1), 12045);
  assert.notEqual(Math.round(toT(live.axis, pointerEndX) ?? -1), 12045);
  assert.equal(axisDuringDrag(null, before), before);
});

test("a ruler label that would run past the right edge is left out", () => {
  const ticks = rulerTicks({ start: 4310, end: 4390 }, 1262);
  assert.ok(ticks.some((t) => t.label === "1:13:00"));
  assert.ok(!ticks.some((t) => t.label === "1:13:10"), "1:13:10 sits on the edge");
});

test("a tick that sits within half a second of the window start is kept", () => {
  const ticks = rulerTicks({ start: 4310.2, end: 4390 }, 1262);
  assert.equal(ticks[0]?.label, "1:11:50");
});

import { focusForAnchor, windowFor as windowForAnchor } from "./timelineAxis";

test("V18-T-2: zooming into a point keeps the time under the pointer, step after step", () => {
  const width = 1262;
  for (const duration of [600, 8073, 14400]) {
    for (const frac of [0.05, 0.3, 0.5, 0.9]) {
      let zoom = 0;
      let win = windowForAnchor(duration, zoom, duration / 2);
      const t = win.start + frac * (win.end - win.start); // the time under the pointer to begin with
      for (let step = 0; step < 8; step++) {
        zoom = Math.min(100, zoom + 12);
        win = windowForAnchor(duration, zoom, focusForAnchor(duration, zoom, t, frac));
        const under = win.start + frac * (win.end - win.start);
        const onePixel = (win.end - win.start) / width;
        // Allowed to move only when the window is pushed against the start or end of the video.
        const pushed = win.start === 0 || Math.abs(win.end - duration) < 1e-6;
        if (!pushed) assert.ok(Math.abs(under - t) <= onePixel, `${duration}s frac ${frac} step ${step}: ${under} vs ${t}`);
      }
    }
  }
});

test("V18-T-1: a zoomed view that keeps its centre does not follow the playhead around", () => {
  const duration = 8073;
  const zoom = 80;
  const centreNow = (playhead: number) => {
    const w = windowForAnchor(duration, zoom, playhead);
    return w.start + (w.end - w.start) / 2;
  };
  const kept = centreNow(3000);
  // Setting the centre from the window it shows changes nothing about the window...
  assert.deepEqual(windowForAnchor(duration, zoom, kept), windowForAnchor(duration, zoom, 3000));
  // ...and later playhead moves inside it leave the window alone (a null centre would have followed).
  const w = windowForAnchor(duration, zoom, kept);
  for (const p of [w.start + 5, w.end - 5, kept]) assert.deepEqual(windowForAnchor(duration, zoom, kept), w, `playhead ${p}`);
  assert.notDeepEqual(windowForAnchor(duration, zoom, w.end - 5), w, "centring on the playhead each move is what slid it");
});

import { spanFor as spanOf } from "./timelineAxis";

test("V18-T-9: every zoom step changes the view, and 100 is the closest stretch", () => {
  for (const duration of [600, 8073, 14400]) {
    let prev = spanOf(duration, 0);
    assert.equal(prev, duration);
    for (let z = 10; z <= 100; z += 10) {
      const now = spanOf(duration, z);
      assert.ok(now < prev, `${duration}s zoom ${z}: ${now} should be under ${prev}`);
      prev = now;
    }
    assert.equal(spanOf(duration, 100), 30);
  }
});
