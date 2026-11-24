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

test("a video that was never prepared gets the title plus a number, then 2", () => {
  assert.deepEqual(ask(), { ok: true, name: "My Show 1" });
  assert.deepEqual(ask({ existing: ["My Show 1"] }), { ok: true, name: "My Show 2" });
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

test("only the latest few videos are kept", () => {
  for (const id of ["a", "b", "c", "d", "e"]) prepareNames(id, lines);
  assert.equal(suggestName({ videoId: "a", ranges: [{ start: 0, end: 20 }], videoTitle: "T" }).name, "T 1");
  assert.equal(suggestName({ videoId: "e", ranges: [{ start: 0, end: 20 }], videoTitle: "T" }).name, "Red Shirt");
});
