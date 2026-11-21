/**
 * File: useSegments.test.ts
 * Path: src/hooks/useSegments.test.ts
 * Description: Pins the per-tab clip store: B-2 (tabs share nothing), C-1 (a banked-range
 *   write by one tab cannot disturb or loop with another) and B-7 (no edits mid-cut).
 */
import assert from "node:assert/strict";
import test from "node:test";
import { createSegmentStore } from "./useSegments";

const seg = (start: number, end: number) => ({ start, end });

test("B-2: syncVideo and edits in one tab store leave another tab's clip alone", () => {
  const tab1 = createSegmentStore();
  const tab2 = createSegmentStore();
  tab1.syncVideo("AAA");
  tab1.add(seg(10, 20));
  tab1.add(seg(60, 90));
  assert.equal(tab1.get().segments.length, 2);

  // A new tab mounts with no video and syncs; then loads BBB and marks a range.
  tab2.syncVideo(null);
  tab2.syncVideo("BBB");
  tab2.add(seg(120, 125));

  assert.deepEqual(tab1.get().segments, [seg(10, 20), seg(60, 90)]);
  assert.equal(tab1.get().videoId, "AAA");
  assert.deepEqual(tab2.get().segments, [seg(120, 125)]);
});

test("C-1: two stores publishing different banked plans never notify each other", () => {
  const a = createSegmentStore();
  const b = createSegmentStore();
  let aNotes = 0;
  a.subscribe(() => aNotes++);
  a.setBanked([{ start: 60, end: 90, clipId: "A01" }]);
  const before = aNotes;
  b.setBanked([]);
  b.setBanked([{ start: 1, end: 2 }]);
  assert.equal(aNotes, before);
  assert.equal(a.get().banked.length, 1);
  assert.equal(b.get().banked.length, 1);
});

test("C-1: publishing an identical plan again does not notify (no render loop)", () => {
  const s = createSegmentStore();
  const plan = [{ start: 60, end: 90, clipId: "A01" }];
  s.setBanked(plan);
  let notes = 0;
  s.subscribe(() => notes++);
  s.setBanked([{ start: 60, end: 90, clipId: "A01" }]);
  s.setBanked([]);
  s.setBanked([]);
  assert.equal(notes, 1); // only the real change to empty
});

test("B-7: remove, move, load and add are refused while locked; clear still works", () => {
  const s = createSegmentStore();
  s.add(seg(2, 5));
  s.add(seg(20, 24));
  s.add(seg(10, 13));
  s.setLocked(true);
  s.remove(1);
  s.move(0, 2);
  s.load([seg(1, 2)]);
  assert.equal(s.add(seg(50, 60)).ok, false);
  assert.deepEqual(s.get().segments, [seg(2, 5), seg(20, 24), seg(10, 13)]);
  s.clear(); // the finished cut empties its own clip
  assert.equal(s.get().segments.length, 0);
  s.setLocked(false);
  assert.equal(s.add(seg(1, 2)).ok, true);
});

test("restore puts back segments with their video so syncVideo of that video keeps them", () => {
  const s = createSegmentStore();
  s.restore("AAA", [seg(10, 20)]);
  s.syncVideo("AAA");
  assert.deepEqual(s.get().segments, [seg(10, 20)]);
  s.syncVideo("BBB");
  assert.equal(s.get().segments.length, 0);
});
