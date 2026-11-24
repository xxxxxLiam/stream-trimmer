/**
 * File: segments.test.ts
 * Path: src/renderer/src/shared/utils/segments.test.ts
 * Description: Pins the segment model: add/remove/reorder, stitched total, overlap
 *   detection, campaign band and timecode round-trips.
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  addSegment,
  bandStatus,
  checkRange,
  findOverlaps,
  findSegmentOverlaps,
  findSelfOverlaps,
  formatLength,
  formatRange,
  formatTimecode,
  lineAtTime,
  moveSegment,
  parseTimecode,
  removeSegment,
  sortSegments,
  totalDuration,
} from "./segments";

const band = { targetMinSec: 30, targetMaxSec: 60, hardMaxSec: 90 };

test("total of zero segments is 0", () => {
  assert.equal(totalDuration([]), 0);
});

test("total of a single segment is its length", () => {
  assert.equal(totalDuration([{ start: 60, end: 120 }]), 60);
});

test("total sums segments whatever order they are in", () => {
  const a = { start: 600, end: 660 };
  const b = { start: 60, end: 90 };
  assert.equal(totalDuration([a, b]), 90);
  assert.equal(totalDuration([b, a]), 90);
});

test("a reversed segment contributes 0, not a negative length", () => {
  assert.equal(
    totalDuration([
      { start: 10, end: 20 },
      { start: 50, end: 40 },
    ]),
    10,
  );
});

test("addSegment appends in order and does not mutate the input", () => {
  const base = [{ start: 0, end: 10 }];
  const r = addSegment(base, { start: 100, end: 110 });
  assert.ok(r.ok);
  assert.deepEqual(r.segments, [
    { start: 0, end: 10 },
    { start: 100, end: 110 },
  ]);
  assert.equal(base.length, 1);
});

test("addSegment keeps out-of-order input in list order (stitch order is the user's)", () => {
  const r = addSegment([{ start: 500, end: 520 }], { start: 10, end: 20 });
  assert.ok(r.ok);
  assert.deepEqual(r.segments.map((s) => s.start), [500, 10]);
});

test("addSegment refuses an end before its start and leaves the list unchanged", () => {
  const r = addSegment([{ start: 0, end: 10 }], { start: 30, end: 20 });
  assert.equal(r.ok, false);
  assert.equal(!r.ok && r.reason, "end-before-start");
  assert.equal(r.segments.length, 1);
});

test("addSegment refuses an empty range", () => {
  const r = addSegment([], { start: 5, end: 5 });
  assert.equal(!r.ok && r.reason, "empty");
});

test("addSegment refuses a range past the video duration, accepts one ending exactly at it", () => {
  const past = addSegment([], { start: 90, end: 101 }, { duration: 100 });
  assert.equal(!past.ok && past.reason, "past-duration");
  const exact = addSegment([], { start: 90, end: 100 }, { duration: 100 });
  assert.ok(exact.ok);
});

test("addSegment can insert at an index, clamped", () => {
  const base = [
    { start: 0, end: 1 },
    { start: 2, end: 3 },
  ];
  const mid = addSegment(base, { start: 4, end: 5 }, { index: 1 });
  assert.ok(mid.ok);
  assert.equal(mid.segments[1].start, 4);
  const far = addSegment(base, { start: 4, end: 5 }, { index: 99 });
  assert.ok(far.ok);
  assert.equal(far.segments[2].start, 4);
});

test("removeSegment drops one, ignores a bad index", () => {
  const base = [
    { start: 0, end: 1 },
    { start: 2, end: 3 },
  ];
  assert.deepEqual(removeSegment(base, 0), [{ start: 2, end: 3 }]);
  assert.deepEqual(removeSegment(base, 5), base);
  assert.deepEqual(removeSegment(base, -1), base);
  assert.deepEqual(removeSegment([], 0), []);
});

test("moveSegment reorders, clamps and is a no-op for a bad source", () => {
  const s = [
    { start: 0, end: 1 },
    { start: 2, end: 3 },
    { start: 4, end: 5 },
  ];
  assert.deepEqual(moveSegment(s, 0, 2).map((x) => x.start), [2, 4, 0]);
  assert.deepEqual(moveSegment(s, 2, 0).map((x) => x.start), [4, 0, 2]);
  assert.deepEqual(moveSegment(s, 0, 99).map((x) => x.start), [2, 4, 0]);
  assert.deepEqual(moveSegment(s, 9, 0), s);
  assert.deepEqual(moveSegment(s, 1, 1), s);
});

test("sortSegments orders by source position without mutating", () => {
  const s = [
    { start: 50, end: 60 },
    { start: 5, end: 9 },
  ];
  assert.deepEqual(sortSegments(s).map((x) => x.start), [5, 50]);
  assert.equal(s[0].start, 50);
});

test("overlap: shared time is found with the shared stretch", () => {
  const used = [{ start: 100, end: 200, clipId: "A-01" }];
  const hits = findOverlaps({ start: 150, end: 250 }, used);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].start, 150);
  assert.equal(hits[0].end, 200);
  assert.equal(hits[0].seconds, 50);
  assert.equal(hits[0].used.clipId, "A-01");
});

test("overlap: touching but not overlapping is clean, both sides", () => {
  const used = [{ start: 100, end: 200 }];
  assert.equal(findOverlaps({ start: 50, end: 100 }, used).length, 0);
  assert.equal(findOverlaps({ start: 200, end: 260 }, used).length, 0);
});

test("overlap: one second of shared time at the boundary IS an overlap", () => {
  const used = [{ start: 100, end: 200 }];
  assert.equal(findOverlaps({ start: 50, end: 101 }, used).length, 1);
  assert.equal(findOverlaps({ start: 199, end: 260 }, used).length, 1);
});

test("overlap: an identical range and a contained range both overlap", () => {
  const used = [{ start: 100, end: 200 }];
  assert.equal(findOverlaps({ start: 100, end: 200 }, used).length, 1);
  assert.equal(findOverlaps({ start: 120, end: 130 }, used).length, 1);
  assert.equal(findOverlaps({ start: 0, end: 500 }, used).length, 1);
});

test("overlap: empty used list and an invalid candidate give nothing", () => {
  assert.deepEqual(findOverlaps({ start: 0, end: 10 }, []), []);
  const used = [{ start: 0, end: 100 }];
  assert.deepEqual(findOverlaps({ start: 50, end: 40 }, used), []);
  assert.deepEqual(findOverlaps({ start: 5, end: 5 }, used), []);
});

test("overlap: a candidate past the video duration is still checked against used ranges", () => {
  const used = [{ start: 90, end: 100 }];
  assert.equal(findOverlaps({ start: 95, end: 5000 }, used).length, 1);
});

test("overlap: an unsorted used list is reported in its own order", () => {
  const used = [
    { start: 300, end: 400, clipId: "late" },
    { start: 100, end: 200, clipId: "early" },
  ];
  const hits = findOverlaps({ start: 0, end: 1000 }, used);
  assert.deepEqual(hits.map((h) => h.used.clipId), ["late", "early"]);
});

test("findSegmentOverlaps lists only the segments that hit, by index", () => {
  const used = [{ start: 600, end: 660, clipId: "X" }];
  const r = findSegmentOverlaps(
    [
      { start: 0, end: 60 },
      { start: 630, end: 700 },
    ],
    used,
  );
  assert.equal(r.length, 1);
  assert.equal(r[0].index, 1);
});

test("findSelfOverlaps catches two segments covering the same moment but not touching ones", () => {
  assert.deepEqual(
    findSelfOverlaps([
      { start: 0, end: 10 },
      { start: 5, end: 15 },
    ]),
    [[0, 1]],
  );
  assert.deepEqual(
    findSelfOverlaps([
      { start: 0, end: 10 },
      { start: 10, end: 20 },
    ]),
    [],
  );
});

test("band: none, empty, under, in (both edges), over, over-hard", () => {
  assert.equal(bandStatus(45, null).status, "none");
  assert.equal(bandStatus(0, band).status, "empty");
  const under = bandStatus(20, band);
  assert.equal(under.status, "under");
  assert.equal(under.deltaSec, 10);
  assert.equal(bandStatus(30, band).status, "in");
  assert.equal(bandStatus(60, band).status, "in");
  const over = bandStatus(75, band);
  assert.equal(over.status, "over");
  assert.equal(over.deltaSec, 15);
  assert.equal(bandStatus(90, band).status, "over");
  const hard = bandStatus(100, band);
  assert.equal(hard.status, "over-hard");
  assert.equal(hard.deltaSec, 10);
});

test("band is judged on the stitched total, not on one segment", () => {
  const segs = [
    { start: 0, end: 20 },
    { start: 100, end: 120 },
  ];
  assert.equal(bandStatus(totalDuration(segs), band).status, "in");
});

test("formatTimecode: HH:MM:SS, floors, clamps", () => {
  assert.equal(formatTimecode(0), "00:00:00");
  assert.equal(formatTimecode(72), "00:01:12");
  assert.equal(formatTimecode(3725.9), "01:02:05");
  assert.equal(formatTimecode(-4), "00:00:00");
  assert.equal(formatTimecode(Number.NaN), "00:00:00");
  assert.equal(formatTimecode(360000), "100:00:00");
});

test("parseTimecode accepts SS, M:SS, H:MM:SS and fractions", () => {
  assert.equal(parseTimecode("45"), 45);
  assert.equal(parseTimecode("1:12"), 72);
  assert.equal(parseTimecode("38:43"), 2323);
  assert.equal(parseTimecode("1:12:04"), 4324);
  assert.equal(parseTimecode("00:01:12"), 72);
  assert.equal(parseTimecode("00:01:12.5"), 72.5);
  assert.equal(parseTimecode(" 0:05:40 "), 340);
});

test("parseTimecode rejects junk, empties and impossible minutes/seconds", () => {
  for (const bad of ["", "  ", "abc", "1:2:3:4", "1:75", "1:61:00", "-5", "1::2", null, undefined]) {
    assert.equal(parseTimecode(bad as string | null | undefined), null, String(bad));
  }
});

test("timecode round-trips", () => {
  for (const s of [0, 1, 59, 60, 3599, 3600, 86399]) {
    assert.equal(parseTimecode(formatTimecode(s)), s);
  }
});

test("formatRange and formatLength", () => {
  assert.equal(formatRange({ start: 72, end: 90 }), "00:01:12 to 00:01:30");
  assert.equal(formatLength(65), "1:05");
  assert.equal(formatLength(3723), "1:02:03");
  assert.equal(formatLength(Number.NaN), "0:00");
});

test("checkRange reports each problem", () => {
  assert.deepEqual(checkRange({ start: 1, end: 2 }), { ok: true });
  assert.deepEqual(checkRange({ start: Number.NaN, end: 2 }), { ok: false, reason: "not-a-number" });
  assert.deepEqual(checkRange({ start: -1, end: 2 }), { ok: false, reason: "negative" });
  assert.deepEqual(checkRange({ start: 3, end: 2 }), { ok: false, reason: "end-before-start" });
  assert.deepEqual(checkRange({ start: 2, end: 2 }), { ok: false, reason: "empty" });
  assert.deepEqual(checkRange({ start: 1, end: 11 }, 10), { ok: false, reason: "past-duration" });
});

test("lineAtTime finds the playing line, the line before a gap, and handles empties", () => {
  const lines = [
    { start: 0, end: 5, text: "a" },
    { start: 5, end: 9, text: "b" },
    { start: 20, end: 25, text: "c" },
  ];
  assert.equal(lineAtTime(lines, 0)?.text, "a");
  assert.equal(lineAtTime(lines, 5)?.text, "b");
  assert.equal(lineAtTime(lines, 12)?.text, "b");
  assert.equal(lineAtTime(lines, 22)?.text, "c");
  assert.equal(lineAtTime(lines, 999)?.text, "c");
  assert.equal(lineAtTime([{ start: 10, end: 12, text: "x" }], 3), null);
  assert.equal(lineAtTime([], 3), null);
  assert.equal(lineAtTime(null, 3), null);
  assert.equal(lineAtTime([...lines].reverse(), 12)?.text, "b");
});

test("negative indexes are clamped to the front, not read from the end", () => {
  const s = [
    { start: 0, end: 1 },
    { start: 2, end: 3 },
    { start: 4, end: 5 },
  ];
  assert.deepEqual(moveSegment(s, 2, -1).map((x) => x.start), [4, 0, 2]);
  const r = addSegment(s, { start: 9, end: 10 }, { index: -1 });
  assert.ok(r.ok);
  assert.equal(r.segments[0].start, 9);
});
