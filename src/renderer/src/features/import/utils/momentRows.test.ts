/**
 * File: momentRows.test.ts
 * Description: Sheet rows become moments grouped by video; untrustworthy rows are flagged with the
 *   reason and one action (Swap times or Skip), and the person's choices decide what gets banked.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { COPY_FORMAT, parseMoments, resolveRows } from "./momentRows";

const A = "https://www.youtube.com/watch?v=aaaaaaaaaaa";
const B = "https://youtu.be/bbbbbbbbbbb";
const ctx = { openVideoId: "aaaaaaaaaaa", openDuration: 8073 };
const header = "video\tstart\tend\tname\trating\ttopic\ttier\tcampaign";

test("a sheet with a header: two videos, names, rating, topic, tier and campaign", () => {
  const rows = parseMoments(
    [header, `${A}\t1:31:40\t1:32:18\tHard Truth\t9.1\tMoney\tT1\tOrbit`, `${B}\t0:12:30\t0:13:05\tFirst Hire\t8.8\t\t2\t`].join("\n"),
    ctx,
  );
  assert.equal(rows.length, 2);
  assert.deepEqual([rows[0].videoId, rows[0].start, rows[0].end, rows[0].name], ["aaaaaaaaaaa", 5500, 5538, "Hard Truth"]);
  assert.deepEqual([rows[0].rating, rows[0].category, rows[0].tier, rows[0].campaign], [9.1, "Money", "1", "Orbit"]);
  assert.equal(rows[1].videoId, "bbbbbbbbbbb");
  assert.equal(rows[1].problem, undefined);
});

test("columns in any order, named by their header", () => {
  const rows = parseMoments(["name,end,start,video", `Pay Cut,1:48:46,1:48:02,${A}`].join("\n"), ctx);
  assert.deepEqual([rows[0].name, rows[0].start, rows[0].end], ["Pay Cut", 6482, 6526]);
});

test("end before start is flagged with Swap times; a cut-off link with Skip", () => {
  const rows = parseMoments([header, `${A}\t0:40:00\t0:39:20\tCold Open\t\t\t\t`, "https://www.youtube.com/watch?\t0:01:00\t0:01:30\tLate Night\t\t\t\t"].join("\n"), ctx);
  assert.deepEqual(rows[0].problem, { reason: "end before start", fix: "swap" });
  assert.deepEqual(rows[1].problem, { reason: "link cut off", fix: "skip" });
});

test("a moment past the end of the open video is flagged", () => {
  const rows = parseMoments([header, `${A}\t2:20:00\t2:21:00\tToo Late\t\t\t\t`].join("\n"), ctx);
  assert.equal(rows[0].problem?.reason, "past the end of the video");
});

test("rows with no header still read in the Copy format order", () => {
  const rows = parseMoments(`${A}\t0:08:02\t0:08:35\tHot Take\t7\tMoney\t3\t`, ctx);
  assert.deepEqual([rows[0].name, rows[0].rating, rows[0].tier], ["Hot Take", 7, "3"]);
});

test("plain lines belong to the open video", () => {
  const rows = parseMoments("1:12:04-1:12:46 Honest Version", ctx);
  assert.equal(rows.length, 1);
  assert.deepEqual([rows[0].videoId, rows[0].start, rows[0].end, rows[0].name], ["aaaaaaaaaaa", 4324, 4366, "Honest Version"]);
  assert.equal(parseMoments("1:12:04-1:12:46 Honest Version", { openVideoId: null })[0].problem?.reason, "no video link");
});

test("choices decide what is banked: swap fixes a row, skip removes one, flagged rows stay out", () => {
  const rows = parseMoments([header, `${A}\t0:40:00\t0:39:20\tCold Open\t\t\t\t`, `${A}\t0:10:00\t0:10:30\tGood One\t\t\t\t`, `${B}\t0:01:00\t0:01:40\tOther Video\t\t\t\tOrbit`, "bad link\t0:01:00\t0:01:30\tLate Night\t\t\t\t"].join("\n"), ctx);
  const none = resolveRows(rows, new Set(), new Set());
  assert.equal(none.good.length, 2);
  assert.equal(none.flagged.length, 2);
  assert.deepEqual(none.groups.map((g) => g.videoId), ["aaaaaaaaaaa", "bbbbbbbbbbb"]);
  assert.deepEqual(none.campaigns, ["Orbit"]);
  const swapped = resolveRows(rows, new Set([rows[0].key]), new Set([rows[3].key]));
  assert.equal(swapped.good.length, 3);
  assert.equal(swapped.flagged.length, 0);
  const fixed = swapped.good.find((r) => r.name === "Cold Open")!;
  assert.deepEqual([fixed.start, fixed.end], [2360, 2400]);
});

test("a swap is only honoured on a row whose fix is Swap times", () => {
  const rows = parseMoments([header, "bad\t0:01:00\t0:01:30\tLate Night\t\t\t\t"].join("\n"), ctx);
  assert.equal(resolveRows(rows, new Set([rows[0].key]), new Set()).good.length, 0);
});

test("Copy format names every column", () => {
  for (const c of ["video", "start", "end", "name", "rating", "topic", "tier", "campaign"]) assert.ok(COPY_FORMAT.includes(c));
});

import { planBank } from "./momentRows";
import { importClips } from "../../../shared/utils/bank";
// placeholder from "../../../shared/utils/bank";

test("planBank groups by campaign and video, unnamed rows to the active campaign", () => {
  const rows = parseMoments(
    ["video\tstart\tend\tname\tcampaign",
     "https://youtu.be/AAAAAAAAAAA\t0:10\t0:40\tOne Two\tOrbit",
     "https://youtu.be/AAAAAAAAAAA\t1:10\t1:40\tThree Four\torbit",
     "https://youtu.be/BBBBBBBBBBB\t0:10\t0:40\tFive Six\t"].join("\n"),
    { openVideoId: null },
  );
  const plan = planBank(resolveRows(rows, new Set(), new Set()).good);
  assert.deepEqual(plan.map((b) => [b.campaignName, b.videoId, b.rows.length]), [["Orbit", "AAAAAAAAAAA", 2], [null, "BBBBBBBBBBB", 1]]);
});

test("a rating on a pasted row is kept in the bank", () => {
  const res = importClips({}, "c1", "v1", [{ line: 1, id: null, label: "One Two", segments: [{ start: 1, end: 9 }], rating: 8 }]);
  assert.equal(res.data.c1.v1[0].rating, 8);
});
