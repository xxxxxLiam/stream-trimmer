/**
 * File: campaigns.test.ts
 * Path: src/renderer/src/shared/utils/campaigns.test.ts
 * Description: Pins campaign CRUD, clip id generation, used ranges and persisted-data loading.
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  folderNameOf,
  campaignClipsDir,
  addUsedRanges,
  clipNumber,
  clipsMadeToday,
  todayCount,
  countUsedRanges,
  createCampaign,
  DATA_FOLDER_NAME,
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
  campaignNameProblems,
  validateCampaign,
  type Campaign,
  CLIP_ID_PRESETS,
  SAMPLE_VIDEO_ID,
  applyDefaultFolders,
  clipIdExample,
  dataFolderVisible,
  needsDefaultFolders,
  presetForPattern,
  reconcileDataDir,
} from "./campaigns";

function make(name = "Daily Shorts", extra = {}): Campaign {
  return createCampaign([], { name, clipsDir: "/v/clips", ...extra }).campaign;
}

test("first run starts with no campaigns", () => {
  assert.deepEqual(normalizeCampaigns(undefined), []);
  assert.deepEqual(normalizeCampaigns([]), []);
});

test("create gives unique ids and defaults dataDir to a sibling data folder", () => {
  const a = createCampaign([], { name: "Daily Shorts", clipsDir: "/v/clips" });
  const b = createCampaign(a.campaigns, { name: "Daily Shorts", clipsDir: "/v/other" });
  assert.notEqual(a.campaign.id, b.campaign.id);
  assert.equal(b.campaign.name, "Daily Shorts 2");
  assert.equal(a.campaign.dataDir, `/v/${DATA_FOLDER_NAME}`);
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
  const next = updateCampaign(b.campaigns, a.id, {
    name: "  Renamed ",
    id: "hack",
    usedRanges: { v: [] },
  } as never);
  assert.equal(next[0].name, "Renamed");
  assert.equal(next[0].id, a.id);
  assert.deepEqual(next[0].usedRanges, {});
  assert.equal(next[1], b.campaigns[1]);
});

test("remove and resolveActiveId", () => {
  const a = make("A");
  const b = createCampaign([a], { name: "B", clipsDir: "/b" });
  const left = removeCampaign(b.campaigns, a.id);
  assert.deepEqual(left.map((c) => c.id), [b.campaign.id]);
  assert.equal(resolveActiveId(left, a.id), b.campaign.id);
  assert.equal(resolveActiveId(left, b.campaign.id), b.campaign.id);
  assert.equal(resolveActiveId([], a.id), null);
});

test("defaultDataDir is a sibling of clipsDir, separator-aware", () => {
  assert.equal(defaultDataDir("/Users/me/Clips/"), `/Users/me/${DATA_FOLDER_NAME}`);
  assert.equal(defaultDataDir("C:\\Users\\me\\Clips"), `C:\\Users\\me\\${DATA_FOLDER_NAME}`);
  assert.equal(defaultDataDir("/clips"), `/${DATA_FOLDER_NAME}`);
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
  c = addUsedRanges(c, "v", [{ start: 10, end: 20 }, { start: 5, end: 5 }], "DS-v-01", 111);
  c = addUsedRanges(c, "v", [{ start: 10, end: 20 }], "DS-v-01", 222);
  c = addUsedRanges(c, "w", [{ start: 1, end: 2 }], "DS-w-01", 333);
  assert.deepEqual(usedRangesFor(c, "v"), [{ start: 10, end: 20, clipId: "DS-v-01", at: 111 }]);
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
    { id: "b", name: "B", format: "mp3", quality: "360" },
  ]);
  assert.deepEqual(out.map((c) => c.id), ["a", "b"]);
  assert.equal(out[0].targetMaxSec, 90);
  assert.deepEqual(out[0].usedRanges.v, [{ start: 1, end: 2, clipId: "x" }]);
  // A-1: format and quality are not stored per campaign; old values are ignored.
  assert.equal("format" in out[1], false);
  assert.equal("quality" in out[1], false);
  // A-2: every campaign has a daily quota; an older one without gets the default 3.
  assert.equal(out[1].dailyQuota, 3);
});

test("a new campaign's id is not a function of its name, so a reused name never reuses an id", () => {
  const a = createCampaign([], { name: "Acme Q4" }).campaign;
  const { campaign: b } = createCampaign([], { name: "Acme Q4" });
  assert.notEqual(a.id, "acme-q4");
  assert.notEqual(a.id, b.id);
  // Collisions with a taken id are skipped.
  const seq = ["x", "x", "y"];
  const { campaign: c } = createCampaign([{ ...a, id: "x" }], { name: "Other" }, () => seq.shift()!);
  assert.equal(c.id, "y");
});

test("ids already stored (slugs from older versions) load and update unchanged", () => {
  const old = normalizeCampaigns([{ id: "acme-q4", name: "Acme Q4", usedRanges: {} }]);
  assert.equal(old[0].id, "acme-q4");
  assert.equal(updateCampaign(old, "acme-q4", { clipsDir: "/z" })[0].id, "acme-q4");
});

test("two campaigns cannot carry the same name (create, rename, validation)", () => {
  const first = createCampaign([], { name: "Acme Q4" });
  const second = createCampaign(first.campaigns, { name: "acme q4" });
  assert.equal(second.campaign.name, "acme q4 2");
  const beta = createCampaign(first.campaigns, { name: "Beta" });
  const renamed = updateCampaign(beta.campaigns, beta.campaign.id, { name: "Acme Q4" });
  assert.equal(renamed[1].name, "Acme Q4 2");
  assert.equal(updateCampaign(first.campaigns, first.campaign.id, { name: "Acme Q4" })[0].name, "Acme Q4", "own name is fine");
  const base = { clipsDir: "", dataDir: "", clipIdPattern: "{nn}" };
  assert.deepEqual(validateCampaign({ ...base, name: "Acme Q4" }, first.campaigns), ["name-taken"]);
  assert.deepEqual(validateCampaign({ ...base, name: "Acme Q4" }), []);
});

test("a build without the exporter does not name it in the suggested folder", () => {
  assert.equal(DATA_FOLDER_NAME, "data"); // tests run in the public shape
  assert.equal(defaultDataDir("/v/clips"), "/v/data");
});

test("every ready-made pattern only uses tokens the code can expand, and numbers its clips", () => {
  for (const p of CLIP_ID_PRESETS) {
    const left = p.pattern.replace(/\{(prefix|videoId|nn|n)\}/g, "");
    assert.ok(!/[{}]/.test(left), `${p.pattern} has a token formatClipId cannot expand`);
    assert.deepEqual(validateCampaign({ name: "x", clipsDir: "", dataDir: "", clipIdPattern: p.pattern }), []);
    // The example round-trips: the number it shows is the number clipNumber reads back.
    const id = clipIdExample(p.pattern, "SHD", 7);
    assert.equal(clipNumber({ clipIdPattern: p.pattern, prefix: "SHD" }, SAMPLE_VIDEO_ID, id), 7);
  }
});

test("pattern examples use the campaign's own prefix and a sample video id", () => {
  assert.equal(clipIdExample("{prefix}-{videoId}-{nn}", "SHD"), "SHD-9xK2mQ-01");
  assert.equal(clipIdExample("{prefix}-{nn}", "SHD"), "SHD-01");
  assert.equal(clipIdExample("{prefix}-{nn}", ""), "XX-01");
  assert.equal(presetForPattern(" {prefix}-{nn} ")?.id, "prefix-number");
  assert.equal(presetForPattern("{prefix}_{nn}"), null, "hand-written patterns are not presets");
  // No date token exists, so no preset may claim one.
  assert.ok(CLIP_ID_PRESETS.every((p) => !/date|year|\{yy/i.test(p.pattern)));
  assert.equal(clipIdExample("{prefix}-{date}-{nn}", "A"), "A-{date}-01", "an unknown token is left as typed");
});

test("first-run folder defaults fill gaps and never replace a choice", () => {
  const offered = { clipsDir: "/v/Clipr/Clips", dataDir: "/v/Clipr/Data" };
  assert.deepEqual(applyDefaultFolders({ clipsDir: "", dataDir: "" }, offered), offered);
  assert.equal(applyDefaultFolders({ clipsDir: "/mine", dataDir: "" }, offered), null);
  assert.deepEqual(applyDefaultFolders({ clipsDir: "", dataDir: "/keep" }, offered)?.dataDir, "/keep");
  assert.equal(applyDefaultFolders({ clipsDir: "", dataDir: "" }, null), null);
  assert.equal(applyDefaultFolders({ clipsDir: "", dataDir: "" }, { clipsDir: "/a", dataDir: "/a/" })?.dataDir, "/data");
  assert.equal(needsDefaultFolders({ clipsDir: "  " }), true);
});

test("the Data folder shows only with the exporter built in and owner access", () => {
  assert.equal(dataFolderVisible(false, true), false);
  assert.equal(dataFolderVisible(true, false), false);
  assert.equal(dataFolderVisible(true, true), true);
});

test("a hidden Data folder is moved aside instead of clashing; a visible one is left for the form to report", () => {
  assert.equal(reconcileDataDir("/a/clips", "/a/clips/", false), "/a/data");
  assert.equal(reconcileDataDir("/a/clips", "/a/clips", true), "/a/clips");
  assert.equal(reconcileDataDir("/a/clips", "/b/data", false), "/b/data");
});

test("today count: a joined clip counts once, yesterday and unstamped clips do not, no quota shows nothing", () => {
  const noon = new Date(2026, 10, 24, 12, 0, 0).getTime();
  const yesterday = noon - 24 * 3600 * 1000;
  let c = createCampaign([], { name: "Acme" }).campaign;
  c = addUsedRanges(c, "vid", [{ start: 10, end: 20 }, { start: 40, end: 50 }], "AC-1", noon - 1000);
  c = addUsedRanges(c, "vid", [{ start: 60, end: 70 }], "AC-2", noon);
  c = addUsedRanges(c, "vid", [{ start: 80, end: 90 }], "AC-0", yesterday);
  c.usedRanges["other"] = [{ start: 1, end: 2, clipId: "AC-OLD" }];
  assert.equal(clipsMadeToday(c, noon), 2);
  assert.equal(todayCount(c, noon), "2 of 3 today", "every campaign has a quota, default 3");
  assert.equal(todayCount({ ...c, dailyQuota: 3 }, noon), "2 of 3 today");
  assert.equal(todayCount(null, noon), null);
});

test("daily quota and the time a clip was made survive a reload", () => {
  const noon = new Date(2026, 10, 24, 12, 0, 0).getTime();
  let c = createCampaign([], { name: "Acme" }).campaign;
  c = { ...addUsedRanges(c, "vid", [{ start: 1, end: 2 }], "AC-1", noon), dailyQuota: 4 };
  const back = normalizeCampaigns(JSON.parse(JSON.stringify([c])))[0];
  assert.equal(back.dailyQuota, 4);
  assert.equal(back.usedRanges.vid[0].at, noon);
  assert.equal(normalizeCampaigns([{ ...c, dailyQuota: -2 }])[0].dailyQuota, 3, "a bad quota falls back to the default");
});

test("A-2: a new campaign has Clips a day (default 3, or the form's value)", () => {
  assert.equal(createCampaign([], { name: "Acme" }).campaign.dailyQuota, 3);
  assert.equal(createCampaign([], { name: "Acme", dailyQuota: 5 }).campaign.dailyQuota, 5);
});

test("A-3: a campaign's folder is a folder named after it inside the Clips folder, unless it chose its own", () => {
  assert.equal(campaignClipsDir({ name: "Acme", clipsDir: "" }, "/Users/me/Downloads/Clipr"), "/Users/me/Downloads/Clipr/Acme");
  assert.equal(campaignClipsDir({ name: "Acme", clipsDir: "/x/own" }, "/Users/me/Downloads/Clipr"), "/x/own");
  assert.equal(campaignClipsDir({ name: "A/B: C", clipsDir: "" }, "C:\\Clips\\"), "C:\\Clips\\A-B- C");
  assert.equal(campaignClipsDir({ name: "Acme", clipsDir: "" }, ""), "");
  assert.equal(createCampaign([], { name: "Acme" }).campaign.clipsDir, "", "a new campaign has no folder of its own until it chooses one");
});

test("A3-5, A4-2: Windows-reserved names are refused for a campaign, with a plain sentence", () => {
  for (const bad of ["CON", "nul.", "COM1", "con.txt", "lpt9", "AUX ", ".con", "..nul"]) {
    assert.match(campaignNameProblems(bad, [])[0] ?? "", /Windows can't use that name/, bad);
  }
  for (const ok of ["Acme", "Console", "COM10", "Nova 2", "A.B", "Dr. Pepper Inc.", "Acme."]) assert.deepEqual(campaignNameProblems(ok, []), [], ok);
  assert.deepEqual(validateCampaign({ name: "NUL", clipsDir: "/a", dataDir: "/b", clipIdPattern: "{nn}" }), ["name-reserved"]);
});

test("A4-3: look-alike names are the same campaign; A4-5: a final dot is dropped from the folder", () => {
  const cafe = "Caf\u00e9";
  assert.match(campaignNameProblems(cafe.normalize("NFD"), [{ id: "1", name: cafe }])[0] ?? "", /already has that name/);
  assert.match(campaignNameProblems("Acme\u200b", [{ id: "1", name: "Acme" }])[0] ?? "", /already has that name/);
  assert.equal(folderNameOf("Dr. Pepper Inc."), "Dr. Pepper Inc");
  assert.equal(folderNameOf("Acme\u200b"), "Acme");
  assert.equal(folderNameOf(cafe.normalize("NFD")), folderNameOf(cafe));
});
