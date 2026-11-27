/**
 * File: bank.test.ts
 * Path: src/renderer/src/shared/utils/bank.test.ts
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
  clearRanPastEnd,
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

test("a re-paste updates a banked clip; a clip that was made has left the bank", () => {
  const first = importClips({}, C, V, parse("A1 1:00-2:00 old\nA2 3:00-4:00 old"));
  const cut = markCut(first.data, C, V, "A2")!.data;
  assert.deepEqual(clipsFor(cut, C, V).map((c) => c.id), ["A1"], "the made clip is gone from the bank");
  const r = importClips(cut, C, V, parse("A1 1:00-2:30 new [hook]"));
  assert.equal(r.updated, 1);
  const [a1] = clipsFor(r.data, C, V);
  assert.equal(a1.label, "new");
  assert.equal(a1.category, "hook");
  assert.deepEqual(a1.segments, [{ start: 60, end: 150 }]);
});

test("markCut takes the clip out of the bank and returns every range", () => {
  const d = seeded();
  const r = markCut(d, C, V, "T1-A02")!;
  assert.equal(clipsFor(r.data, C, V).find((c) => c.id === "T1-A02"), undefined, "a made clip no longer sits in the bank");
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
  assert.deepEqual(r.campaign.usedRanges[V].map(({ at, ...rest }) => ({ ...rest, stamped: typeof at === "number" })), [
    { start: 120, end: 150, clipId: "T1-A02", stamped: true },
    { start: 300, end: 320, clipId: "T1-A02", stamped: true },
  ]);
  assert.equal(clipsFor(r.data, C, V).find((c) => c.id === "T1-A02"), undefined);
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
  a.importClips(C, V, parse("Hooks:\nT1-A1 1:00-2:00; 5:00-5:30 hi\nT1-A2 8:00-8:30 other"));
  a.markCut(C, V, "T1-A2");
  assert.equal(notified, 2);
  const b = createBankStore(io); // "app restarted"
  const [clip, ...rest] = clipsFor(b.get(), C, V);
  assert.equal(rest.length, 0, "the made clip stayed gone after a restart");
  assert.equal(clip.id, "T1-A1");
  assert.equal(clip.status, "banked");
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

test("ranPastEnd is kept on import and goes when the clip is opened", () => {
  const parsed = parseBankImport("Big Deal 0:59:00-1:05:00", { duration: 3600 }).clips;
  const imported = importClips({}, C, V, parsed).data;
  assert.equal(clipsFor(imported, C, V)[0].ranPastEnd, 3600);
  const again = normalizeBank(JSON.parse(JSON.stringify(imported)));
  assert.equal(clipsFor(again, C, V)[0].ranPastEnd, 3600, "survives saving");
  const opened = clearRanPastEnd(imported, C, V, clipsFor(imported, C, V)[0].id);
  assert.equal(clipsFor(opened, C, V)[0].ranPastEnd, undefined);
});

test("Liam 26 Nov: trimming a loaded bank clip edits that bank item, and Clip then matches it as the same moment", async () => {
  const { setClipSegments } = await import("./bank");
  const { matchingMoment } = await import("../../features/clips/utils/finishBankedCut");
  const d0 = importClips({}, "c1", "v1", parse("A1 1:00-2:00")).data;
  const item = clipsFor(d0, "c1", "v1")[0];
  const d1 = setClipSegments(d0, "c1", "v1", item.id, [{ start: 55, end: 130 }]);
  const edited = clipsFor(d1, "c1", "v1");
  assert.equal(edited.length, 1, "no second clip is created");
  assert.deepEqual(edited[0].segments, [{ start: 55, end: 130 }]);
  assert.equal(matchingMoment(edited, [{ start: 55, end: 130 }])?.id, item.id, "Clip on the edited range is that bank item");
  assert.equal(matchingMoment(clipsFor(d0, "c1", "v1"), [{ start: 55, end: 130 }]), undefined, "without the edit it would not match");
  assert.equal(setClipSegments(d0, "c1", "v1", "nope", [{ start: 1, end: 2 }]), d0);
  assert.equal(setClipSegments(d0, "c1", "v1", item.id, []), d0, "an empty edit never wipes the item");
});

test("setClips puts a video's list back as it was, including after its last clip was deleted", async () => {
  const { setClips, removeClip, clipsFor } = await import("./bank");
  const before = importClips({}, "C", "V", [{ line: 1, id: "A1", label: "A", segments: [{ start: 1, end: 5 }] }]).data;
  const gone = removeClip(before, "C", "V", clipsFor(before, "C", "V")[0].id);
  assert.deepEqual(gone, {});
  assert.deepEqual(setClips(gone, "C", "V", clipsFor(before, "C", "V")), before);
  assert.deepEqual(setClips(before, "C", "V", []), {});
});

test("Undo of a made clip puts the moment back where it was, waiting; a clip never cut here is left alone", () => {
  let disk: unknown = undefined;
  const store = createBankStore({ load: () => JSON.parse(JSON.stringify(disk ?? {})), save: (d: BankData) => void (disk = JSON.parse(JSON.stringify(d))) });
  store.importClips(C, V, parse("A1 1:00-2:00 one\nA2 3:00-4:00 two\nA3 5:00-6:00 three"));
  store.markCut(C, V, "A2");
  assert.deepEqual(clipsFor(store.get(), C, V).map((c) => c.id), ["A1", "A3"]);
  store.restoreCut(C, V, "A2");
  const back = clipsFor(store.get(), C, V);
  assert.deepEqual(back.map((c) => c.id), ["A1", "A2", "A3"], "same place");
  assert.equal(back[1].status, "banked");
  assert.equal(back[1].label, "two");
  store.restoreCut(C, V, "A2");
  assert.equal(clipsFor(store.get(), C, V).length, 3, "restoring twice adds nothing");
  store.restoreCut(C, V, "never-cut");
  assert.equal(clipsFor(store.get(), C, V).length, 3);
});
