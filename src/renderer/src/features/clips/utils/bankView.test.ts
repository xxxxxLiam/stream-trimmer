import assert from "node:assert/strict";
import test from "node:test";
import type { BankedClip } from "../../../shared/utils/bank";
import { DEFAULT_VIEW, activeFilters, applyView } from "./bankView";

const c = (id: string, start: number, extra: Partial<BankedClip> = {}): BankedClip => ({ id, label: id, segments: [{ start, end: start + 30 }], status: "banked", ...extra });
const bank = [c("a", 300, { rating: 7, category: "Money", tier: "1" }), c("b", 100, { rating: 9, category: "Story", tier: "2" }), c("n", 50), c("d", 200, { rating: 8.5, category: "Money", tier: "2" })];
const ids = (v: Partial<typeof DEFAULT_VIEW>) => applyView(bank, { ...DEFAULT_VIEW, ...v }).map((x) => x.id);

test("bank view: rating high to low by default, unrated last; low to high; order in the video", () => {
  assert.deepEqual(ids({}), ["b", "d", "a", "n"]);
  assert.deepEqual(ids({ sort: "rating-asc" }), ["a", "d", "b", "n"]);
  assert.deepEqual(ids({ sort: "order" }), ["n", "b", "d", "a"]);
});

test("bank view: topic, tier and rating filter independently; search words narrow too", () => {
  assert.deepEqual(ids({ topics: ["Money"] }), ["d", "a"]);
  assert.deepEqual(ids({ tiers: ["2"] }), ["b", "d"]);
  assert.deepEqual(ids({ minRating: 8 }), ["b", "d"]);
  assert.deepEqual(ids({ topics: ["Money"], tiers: ["2"], minRating: 8 }), ["d"]);
  assert.deepEqual(ids({ words: ["story"] }), ["b"]);
  assert.equal(activeFilters({ ...DEFAULT_VIEW, topics: ["Money"], minRating: 9 }), 2);
});
