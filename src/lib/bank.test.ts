/**
 * File: bank.test.ts
 * Path: src/lib/bank.test.ts
 * Description: Pins the clip bank: import merge, persistence round trip, status on cut,
 *   usedRanges append, collected facets, filter and sort.
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  applyCut,
  bankedRanges,
  clipBand,
  clipsFor,
  compareTier,
  createBankStore,
  facets,
  filterClips,
  importClips,
  removeCampaignBank,
  markCut,
  nextBankId,
  normalizeBank,
  removeClip,
  sortClips,
  type BankData,
  type BankedClip,
} from "./bank";
import { parseBankImport } from "./bankImport";
import { createCampaign } from "./campaigns";

const parse = (t: string) => parseBankImport(t).clips;
const C = "camp";
const V = "vid1";

function seeded(): BankData {
  return importClips(
    {},
    C,
    V,
    parse(
      [
        "Hooks:",
        "T2-A01 1:00-1:40 first",
        "T1-A02 2:00-2:30; 5:00-5:20 second",
        "Payoff:",
        "A03 10:00-10:10 third",
        "A04 20:00-20:45 [quiet] t: gold fourth",
      ].join("\n"),
    ),
  ).data;
}

test("import adds clips in order with status banked", () => {
  const r = importClips({}, C, V, parse("A1 1:00-2:00 a\nA2 3:00-4:00 b"));
  assert.equal(r.added, 2);
  assert.deepEqual(clipsFor(r.data, C, V).map((c) => [c.id, c.status]), [
    ["A1", "banked"],
    ["A2", "banked"],
  ]);
});

test("clips without ids get unique ids and never collide with written ones", () => {
  const r = importClips({}, C, V, parse("B01 1:00-2:00\n3:00-4:00\n5:00-6:00"));
  assert.deepEqual(clipsFor(r.data, C, V).map((c) => c.id), ["B01", "B02", "B03"]);
  assert.equal(nextBankId([{ id: "b01" }]), "B02");
});

test("banks are kept apart per campaign and per video", () => {
  let d = importClips({}, "c1", "v1", parse("A1 1:00-2:00")).data;
  d = importClips(d, "c1", "v2", parse("B1 1:00-2:00")).data;
  d = importClips(d, "c2", "v1", parse("C1 1:00-2:00")).data;
  assert.deepEqual(clipsFor(d, "c1", "v1").map((c) => c.id), ["A1"]);
  assert.deepEqual(clipsFor(d, "c1", "v2").map((c) => c.id), ["B1"]);
  assert.deepEqual(clipsFor(d, "c2", "v1").map((c) => c.id), ["C1"]);
  assert.deepEqual(clipsFor(d, "c2", "v2"), []);
});

test("re-pasting the same list changes nothing, by id or by range", () => {
  const text = "A1 1:00-2:00 a\n3:00-4:00 no id";
  const first = importClips({}, C, V, parse(text));
  const again = importClips(first.data, C, V, parse(text));
  assert.equal(again.added, 0);
  assert.equal(again.updated, 2);
  assert.deepEqual(clipsFor(again.data, C, V), clipsFor(first.data, C, V));
});

test("a re-paste updates a banked clip but never rewrites a cut one", () => {
  const first = importClips({}, C, V, parse("A1 1:00-2:00 old\nA2 3:00-4:00 old"));
  const cut = markCut(first.data, C, V, "A2")!.data;
  const r = importClips(cut, C, V, parse("A1 1:00-2:30 new [hook]\nA2 9:00-9:30 new"));
  assert.equal(r.updated, 1);
  assert.equal(r.skipped, 1);
  const [a1, a2] = clipsFor(r.data, C, V);
  assert.equal(a1.label, "new");
  assert.equal(a1.category, "hook");
  assert.deepEqual(a1.segments, [{ start: 60, end: 150 }]);
  assert.equal(a2.label, "old");
  assert.equal(a2.status, "cut");
  assert.deepEqual(a2.segments, [{ start: 180, end: 240 }]);
});

test("markCut flips status and returns every range", () => {
  const d = seeded();
  const r = markCut(d, C, V, "T1-A02")!;
  assert.equal(clipsFor(r.data, C, V).find((c) => c.id === "T1-A02")!.status, "cut");
  assert.equal(clipsFor(r.data, C, V).find((c) => c.id === "T2-A01")!.status, "banked");
  assert.deepEqual(r.ranges, [
    { start: 120, end: 150 },
    { start: 300, end: 320 },
  ]);
  assert.equal(clipsFor(d, C, V).find((c) => c.id === "T1-A02")!.status, "banked", "input not mutated");
  assert.equal(markCut(d, C, V, "nope"), null);
});

test("applyCut appends all ranges to the campaign usedRanges under the clip id", () => {
  const { campaign } = createCampaign([], { name: "Shorts" });
  const r = applyCut(seeded(), { ...campaign, id: C }, V, "T1-A02")!;
  assert.deepEqual(r.campaign.usedRanges[V], [
    { start: 120, end: 150, clipId: "T1-A02" },
    { start: 300, end: 320, clipId: "T1-A02" },
  ]);
  assert.equal(clipsFor(r.data, C, V).find((c) => c.id === "T1-A02")!.status, "cut");
  assert.equal(applyCut(seeded(), { ...campaign, id: C }, V, "nope"), null);
});

test("facets are collected from imports, per campaign, nothing preset", () => {
  assert.deepEqual(facets({}, C), { categories: [], tiers: [] });
  const d = seeded();
  assert.deepEqual(facets(d, C), { categories: ["Hooks", "Payoff", "quiet"], tiers: ["1", "2", "gold"] });
  assert.deepEqual(facets(d, "other"), { categories: [], tiers: [] });
  const d2 = importClips(d, C, "vid2", parse("Z1 1:00-2:00 [hooks] t: 10")).data;
  const f = facets(d2, C);
  assert.deepEqual(f.categories, ["Hooks", "Payoff", "quiet"], "case-insensitive, first spelling wins");
  assert.deepEqual(f.tiers, ["1", "2", "10", "gold"]);
});

test("filter: text, category and tier combine", () => {
  const all = clipsFor(seeded(), C, V);
  assert.equal(filterClips(all, {}).length, 4);
  assert.deepEqual(filterClips(all, { text: "SECOND" }).map((c) => c.id), ["T1-A02"]);
  assert.deepEqual(filterClips(all, { categories: ["hooks"] }).map((c) => c.id), ["T2-A01", "T1-A02"]);
  assert.deepEqual(filterClips(all, { tiers: ["1"] }).map((c) => c.id), ["T1-A02"]);
  assert.deepEqual(filterClips(all, { categories: ["Hooks"], tiers: ["2"] }).map((c) => c.id), ["T2-A01"]);
  assert.deepEqual(filterClips(all, { categories: ["Hooks"], text: "first" }).map((c) => c.id), ["T2-A01"]);
  assert.deepEqual(filterClips(all, { categories: ["Hooks"], text: "third" }), []);
  assert.deepEqual(filterClips(all, { categories: ["Hooks", "Payoff"] }).length, 3);
  assert.deepEqual(filterClips(all, { tiers: ["gold"] }).map((c) => c.id), ["A04"]);
});

test("sort by tier is numeric-aware, empties last, stable", () => {
  const all = clipsFor(seeded(), C, V);
  assert.deepEqual(sortClips(all, "tier").map((c) => c.id), ["T1-A02", "T2-A01", "A04", "A03"]);
  assert.deepEqual(sortClips(all, "order").map((c) => c.id), all.map((c) => c.id));
  assert.deepEqual(sortClips(all, "time").map((c) => c.id), ["T2-A01", "T1-A02", "A03", "A04"]);
  assert.ok(compareTier("2", "10") < 0);
  assert.ok(compareTier("10", "gold") < 0);
  assert.ok(compareTier(undefined, "1") > 0);
});

test("banked ranges for the timeline exclude cut clips", () => {
  const d = markCut(seeded(), C, V, "T1-A02")!.data;
  const r = bankedRanges(clipsFor(d, C, V));
  assert.equal(r.length, 3);
  assert.ok(!r.some((x) => x.clipId === "T1-A02"));
});

test("band check on a clip", () => {
  const band = { targetMinSec: 30, targetMaxSec: 60, hardMaxSec: 90 };
  const c = (s: number, e: number): Pick<BankedClip, "segments"> => ({ segments: [{ start: s, end: e }] });
  assert.equal(clipBand(c(0, 45), band).status, "in");
  assert.equal(clipBand(c(0, 10), band).status, "under");
  assert.equal(clipBand(c(0, 75), band).status, "over");
  assert.equal(clipBand(c(0, 45), null).status, "none");
});

test("remove drops the clip and an empty video disappears", () => {
  const d = importClips({}, C, V, parse("A1 1:00-2:00")).data;
  assert.deepEqual(removeClip(d, C, V, "A1"), {});
});

test("normalizeBank survives garbage", () => {
  assert.deepEqual(normalizeBank(null), {});
  assert.deepEqual(normalizeBank("x"), {});
  const d = normalizeBank({
    c: {
      v: [
        { id: "ok", label: 5, segments: [{ start: 1, end: 2 }], status: "weird", tier: "1" },
        { id: "bad", segments: [{ start: 5, end: 2 }] },
        { id: "ok", segments: [{ start: 1, end: 2 }] },
        null,
      ],
      w: "nope",
    },
  });
  assert.deepEqual(d, { c: { v: [{ id: "ok", label: "", segments: [{ start: 1, end: 2 }], status: "banked", tier: "1" }] } });
});

test("persistence: a new store over the same storage sees the same bank", () => {
  let disk: unknown = undefined;
  const io = { load: () => JSON.parse(JSON.stringify(disk ?? {})), save: (d: BankData) => void (disk = JSON.parse(JSON.stringify(d))) };
  const a = createBankStore(io);
  let notified = 0;
  a.subscribe(() => notified++);
  a.importClips(C, V, parse("Hooks:\nT1-A1 1:00-2:00; 5:00-5:30 hi"));
  a.markCut(C, V, "T1-A1");
  assert.equal(notified, 2);
  const b = createBankStore(io); // "app restarted"
  const [clip] = clipsFor(b.get(), C, V);
  assert.equal(clip.id, "T1-A1");
  assert.equal(clip.status, "cut");
  assert.equal(clip.category, "Hooks");
  assert.equal(clip.tier, "1");
  assert.equal(clip.segments.length, 2);
  a.remove(C, V, "nope");
  assert.equal(notified, 2, "a no-op does not notify or save");
});

test("removeCampaignBank drops one campaign's whole bank and leaves the rest", () => {
  const d: BankData = { ...seeded(), other: { [V]: [{ id: "Z", label: "", segments: [{ start: 1, end: 2 }], status: "banked" as const }] } };
  const next = removeCampaignBank(d, C);
  assert.equal(C in next, false);
  assert.equal(next.other[V].length, 1);
  assert.ok(C in d, "input not mutated");
  assert.equal(removeCampaignBank(d, "absent"), d);
});
