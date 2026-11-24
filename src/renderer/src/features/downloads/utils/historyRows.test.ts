import assert from "node:assert/strict";
import test from "node:test";
import type { DownloadEntry } from "../../../shared/utils/downloads";
import { countText, dayLabel, filterHistory, groupByDay, historyClips, rowMeta } from "./historyRows";

const at = (y: number, mo: number, d: number, h = 9, mi = 12) => new Date(y, mo - 1, d, h, mi).getTime();
const NOW = at(2026, 11, 24, 15);
const entry = (id: string, savedAt: number, over: Partial<DownloadEntry> = {}): DownloadEntry => ({
  id,
  kind: "clip",
  label: id,
  path: `/c/${id}.mp4`,
  dir: "/c",
  savedAt,
  ...over,
});

test("only clips are in History", () => {
  const list = [entry("a", NOW), entry("b", NOW, { kind: "comments" }), entry("c", NOW, { kind: "export" })];
  assert.deepEqual(historyClips(list).map((e) => e.id), ["a"]);
});

test("days are Today, Yesterday, then a dated heading", () => {
  assert.equal(dayLabel(at(2026, 11, 24, 1), NOW), "Today");
  assert.equal(dayLabel(at(2026, 11, 23, 23), NOW), "Yesterday");
  assert.match(dayLabel(at(2026, 11, 20), NOW), /20/);
});

test("rows group by day, newest first", () => {
  const groups = groupByDay([entry("old", at(2026, 11, 23)), entry("a", at(2026, 11, 24, 8)), entry("b", at(2026, 11, 24, 9))], NOW);
  assert.deepEqual(groups.map((g) => [g.label, g.entries.map((e) => e.id)]), [
    ["Today", ["b", "a"]],
    ["Yesterday", ["old"]],
  ]);
});

test("pills combine: every pill has to match", () => {
  const list = [
    entry("Honest Version", NOW, { campaign: "Acme" }),
    entry("Big Deal", NOW, { campaign: "Acme" }),
    entry("Honest Take", NOW, { campaign: "Beta" }),
  ];
  assert.deepEqual(filterHistory(list, ["acme"]).map((e) => e.label), ["Honest Version", "Big Deal"]);
  assert.deepEqual(filterHistory(list, ["acme", "honest"]).map((e) => e.label), ["Honest Version"]);
  assert.equal(filterHistory(list, []).length, 3);
});

test("the row line is length, campaign, time", () => {
  assert.equal(rowMeta(entry("a", at(2026, 11, 24, 9, 12), { seconds: 42, campaign: "Acme" })), "0:42 · Acme · 09:12");
  assert.equal(rowMeta(entry("a", at(2026, 11, 24, 9, 12))), "09:12");
  assert.equal(countText(12), "12 clips");
  assert.equal(countText(1), "1 clip");
});
