/**
 * File: campaigns.test.ts
 * Path: src/lib/campaigns.test.ts
 * Description: Pins campaign CRUD, clip id generation, used ranges and persisted-data loading.
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  addUsedRanges,
  clipNumber,
  countUsedRanges,
  createCampaign,
  defaultDataDir,
  defaultPrefix,
  formatClipId,
  nextClipId,
  normalizeCampaigns,
  removeCampaign,
  removeUsedRangesFor,
  resolveActiveId,
  sameFolder,
  updateCampaign,
  usedRangesFor,
  validateCampaign,
  type Campaign,
} from "./campaigns";

function make(name = "Daily Shorts", extra = {}): Campaign {
  return createCampaign([], { name, clipsDir: "/v/clips", ...extra }).campaign;
}

test("first run starts with no campaigns", () => {
  assert.deepEqual(normalizeCampaigns(undefined), []);
  assert.deepEqual(normalizeCampaigns([]), []);
});

test("create gives unique ids and defaults dataDir to a sibling channel-data", () => {
  const a = createCampaign([], { name: "Daily Shorts", clipsDir: "/v/clips" });
  const b = createCampaign(a.campaigns, { name: "Daily Shorts", clipsDir: "/v/other" });
  assert.equal(a.campaign.id, "daily-shorts");
  assert.equal(b.campaign.id, "daily-shorts-2");
  assert.equal(a.campaign.dataDir, "/v/channel-data");
  assert.equal(b.campaigns.length, 2);
});

test("create keeps the band ordered", () => {
  const c = make("X", { targetMinSec: 60, targetMaxSec: 30, hardMaxSec: 10 });
  assert.equal(c.targetMinSec, 60);
  assert.equal(c.targetMaxSec, 60);
  assert.equal(c.hardMaxSec, 60);
});

test("update patches one campaign and never the id or used ranges", () => {
  const a = make("A");
  const b = createCampaign([a], { name: "B", clipsDir: "/b" });
  const next = updateCampaign(b.campaigns, "a", {
    name: "  Renamed ",
    id: "hack",
    usedRanges: { v: [] },
  } as never);
  assert.equal(next[0].name, "Renamed");
  assert.equal(next[0].id, "a");
  assert.deepEqual(next[0].usedRanges, {});
  assert.equal(next[1], b.campaigns[1]);
});

test("remove and resolveActiveId", () => {
  const a = make("A");
  const both = createCampaign([a], { name: "B", clipsDir: "/b" }).campaigns;
  const left = removeCampaign(both, "a");
  assert.deepEqual(left.map((c) => c.id), ["b"]);
  assert.equal(resolveActiveId(left, "a"), "b");
  assert.equal(resolveActiveId(left, "b"), "b");
  assert.equal(resolveActiveId([], "a"), null);
});

test("defaultDataDir is a sibling of clipsDir, separator-aware", () => {
  assert.equal(defaultDataDir("/Users/me/Clips/"), "/Users/me/channel-data");
  assert.equal(defaultDataDir("C:\\Users\\me\\Clips"), "C:\\Users\\me\\channel-data");
  assert.equal(defaultDataDir("/clips"), "/channel-data");
});

test("clips and data folders may not be the same", () => {
  assert.ok(sameFolder("/a/b/", "/A/B"));
  assert.deepEqual(
    validateCampaign({ name: "x", clipsDir: "/a", dataDir: "/a/", clipIdPattern: "{nn}" }),
    ["folders-same"],
  );
  assert.deepEqual(
    validateCampaign({ name: " ", clipsDir: "/a", dataDir: "/b", clipIdPattern: "x" }),
    ["name-empty", "pattern-no-number"],
  );
  assert.deepEqual(validateCampaign(make()), []);
});

test("defaultPrefix", () => {
  assert.equal(defaultPrefix("Daily Shorts"), "DS");
  assert.equal(defaultPrefix("Moments"), "MO");
  assert.equal(defaultPrefix("!!!"), "C");
});

test("formatClipId pads to two digits and grows past 99", () => {
  const c = make("Daily Shorts", { prefix: "M" });
  assert.equal(formatClipId(c, "aBcDeFg", 5), "M-aBcDeFg-05");
  assert.equal(formatClipId(c, "aBcDeFg", 123), "M-aBcDeFg-123");
});

test("nextClipId starts at 01 and takes the next free number", () => {
  let c = make("Daily Shorts", { prefix: "M" });
  assert.equal(nextClipId(c, "vid"), "M-vid-01");
  c = addUsedRanges(c, "vid", [{ start: 0, end: 5 }], "M-vid-01");
  c = addUsedRanges(c, "vid", [{ start: 10, end: 15 }], "M-vid-03");
  assert.equal(nextClipId(c, "vid"), "M-vid-04");
  // Another video is independent.
  assert.equal(nextClipId(c, "other"), "M-other-01");
  // Ids the caller knows about (bank, saved clips) count too.
  assert.equal(nextClipId(c, "vid", ["M-vid-09"]), "M-vid-10");
});

test("nextClipId ignores ids from other prefixes and handles ids with dashes", () => {
  let c = make("Daily Shorts", { prefix: "M" });
  c = addUsedRanges(c, "a-b_c", [{ start: 0, end: 5 }], "X-a-b_c-07");
  assert.equal(nextClipId(c, "a-b_c"), "M-a-b_c-01");
  assert.equal(clipNumber(c, "a-b_c", "M-a-b_c-02"), 2);
  assert.equal(clipNumber(c, "a-b_c", "M-a-b_c-02x"), null);
});

test("custom patterns work", () => {
  const c = make("X", { clipIdPattern: "{videoId}_{n}", prefix: "Z" });
  assert.equal(nextClipId(c, "v1"), "v1_1");
  assert.equal(clipNumber(c, "v1", "v1_12"), 12);
});

test("addUsedRanges appends, skips empties and exact duplicates; query by video", () => {
  let c = make();
  c = addUsedRanges(c, "v", [{ start: 10, end: 20 }, { start: 5, end: 5 }], "DS-v-01");
  c = addUsedRanges(c, "v", [{ start: 10, end: 20 }], "DS-v-01");
  c = addUsedRanges(c, "w", [{ start: 1, end: 2 }], "DS-w-01");
  assert.deepEqual(usedRangesFor(c, "v"), [{ start: 10, end: 20, clipId: "DS-v-01" }]);
  assert.deepEqual(usedRangesFor(c, "none"), []);
  assert.deepEqual(usedRangesFor(null, "v"), []);
  assert.equal(countUsedRanges(c), 2);
});

test("addUsedRanges does not mutate its input", () => {
  const c = make();
  addUsedRanges(c, "v", [{ start: 1, end: 2 }], "id");
  assert.deepEqual(c.usedRanges, {});
});

test("removeUsedRangesFor drops one clip's ranges and prunes empty videos", () => {
  let c = make();
  c = addUsedRanges(c, "v", [{ start: 1, end: 2 }], "a");
  c = addUsedRanges(c, "v", [{ start: 3, end: 4 }], "b");
  c = removeUsedRangesFor(c, "v", "a");
  assert.deepEqual(usedRangesFor(c, "v").map((r) => r.clipId), ["b"]);
  c = removeUsedRangesFor(c, "v", "b");
  assert.equal("v" in c.usedRanges, false);
});

test("normalizeCampaigns drops junk, dedupes ids and repairs fields", () => {
  const out = normalizeCampaigns([
    null,
    { id: "a", name: "A", targetMinSec: 90, targetMaxSec: 10, usedRanges: { v: [{ start: 1, end: 2, clipId: "x" }, { bad: 1 }] } },
    { id: "a", name: "dupe" },
    { name: "no id" },
    { id: "b", name: "B", format: "weird" },
  ]);
  assert.deepEqual(out.map((c) => c.id), ["a", "b"]);
  assert.equal(out[0].targetMaxSec, 90);
  assert.deepEqual(out[0].usedRanges.v, [{ start: 1, end: 2, clipId: "x" }]);
  assert.equal(out[1].format, "mp4");
});
