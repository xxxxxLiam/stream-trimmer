/**
 * File: clipNameSession.test.ts
 * Path: src/main/features/engine/services/clipNames/clipNameSession.test.ts
 * Description: Pins the per-video name session behind the IPC: a prepared transcript is used for later
 *   suggestions, an unprepared video falls back to its title plus a number, bad input is refused, and
 *   only the latest few videos are kept.
 */
import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";
import { clearNameSessions, prepareNames, suggestName } from "./clipNameSession";

beforeEach(() => clearNameSessions());

const lines = [
  { start: 0, end: 10, text: "He wore a red shirt, a red shirt to the court" },
  ...Array.from({ length: 12 }, (_, i) => ({ start: 40 + i * 30, end: 50 + i * 30, text: "weather today is fine" })),
];
const ask = (extra = {}) => suggestName({ videoId: "v1", ranges: [{ start: 0, end: 20 }], videoTitle: "My Show", existing: [], ...extra });

test("a prepared transcript names the range from what is said in it", () => {
  assert.deepEqual(prepareNames("v1", lines), { ok: true });
  assert.deepEqual(ask(), { ok: true, name: "Red Shirt" });
});

test("a video that was never prepared gets two words of the title, then 2", () => {
  assert.deepEqual(ask(), { ok: true, name: "Show" });
  assert.deepEqual(ask({ existing: ["Show"] }), { ok: true, name: "Show 2" });
});

test("repeats get a quiet number, and skip walks to the next suggestion", () => {
  prepareNames("v1", lines);
  assert.equal(ask({ existing: ["Red Shirt"] }).name, "Red Shirt 2");
  assert.notEqual(ask({ skip: 1 }).name, "Red Shirt");
});

test("bad input is refused, not thrown", () => {
  assert.equal(prepareNames("", lines).ok, false);
  assert.equal(prepareNames("v1", [{ start: "x" }]).ok, false);
  assert.equal(prepareNames("v1", "nope").ok, false);
  assert.equal(suggestName({ videoId: "v1", ranges: [] }).ok, false);
  assert.equal(suggestName({ videoId: "v1", ranges: [{ start: 1 }] }).ok, false);
});

const nameFor = (id: string) => suggestName({ videoId: id, ranges: [{ start: 0, end: 20 }], videoTitle: "Tiny Title" }).name;

test("seven videos open: the open one still gets its transcript name (C-2)", () => {
  for (const id of ["a", "b", "c", "d", "e", "f", "g"]) prepareNames(id, lines);
  assert.equal(nameFor("a"), "Red Shirt", "the first video loaded is the open one, and it was not dropped");
  assert.equal(nameFor("g"), "Red Shirt");
});

test("many videos open: the least recently used go, the one being named never does", () => {
  prepareNames("open", lines);
  assert.equal(nameFor("open"), "Red Shirt");
  for (let i = 0; i < 30; i++) prepareNames(`other${i}`, lines);
  assert.equal(nameFor("open"), "Red Shirt", "still there after 30 more were loaded");
  assert.equal(nameFor("other0"), "Tiny Title", "the oldest of the others was dropped");
  assert.equal(nameFor("other29"), "Red Shirt");
});

test("the title fallback is two words, without # or commas (C-2)", () => {
  const long = { videoTitle: "Podcast #214, the long talk about everything" };
  assert.equal(ask(long).name, "Podcast Long");
  assert.equal(ask({ ...long, existing: ["Podcast Long"] }).name, "Podcast Long 2");
  assert.equal(ask({ videoTitle: "#### !!!" }).name, "Clip");
});
