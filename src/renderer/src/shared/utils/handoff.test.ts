import test from "node:test";
import assert from "node:assert/strict";
import {
  buildClipId,
  buildHandoffBlocks,
  canonicalSourceUrl,
  formatClipIdAndFilename,
  formatDownloadRanges,
  formatScriptLines,
  formatSegmentTranscript,
  formatTimecode,
  formatTranscript,
  formatUsedMaterial,
  addSessionClip,
  sessionClipsFor,
  type SessionClipsByCampaign,
} from "./handoff";

const ID = "dQw4w9WgXcQ";
const CANON = `https://www.youtube.com/watch?v=${ID}`;

test("canonical: youtu.be becomes full youtube.com form", () => {
  assert.equal(canonicalSourceUrl(`https://youtu.be/${ID}`), CANON);
  assert.equal(canonicalSourceUrl(`https://youtu.be/${ID}?t=42&si=abc`), CANON);
});

test("canonical: strips list, index, t, start and tracking params", () => {
  const u = `https://www.youtube.com/watch?v=${ID}&list=PLxyz&index=4&t=90s&start=90&si=tok&feature=share&utm_source=x&pp=abc`;
  assert.equal(canonicalSourceUrl(u), CANON);
  assert.equal(canonicalSourceUrl(`https://m.youtube.com/watch?t=5&v=${ID}`), CANON);
  assert.equal(canonicalSourceUrl(`https://www.youtube.com/shorts/${ID}?feature=share`), CANON);
});

test("canonical: missing or invalid video id gives null", () => {
  assert.equal(canonicalSourceUrl("https://www.youtube.com/watch?list=PL1"), null);
  assert.equal(canonicalSourceUrl("https://example.com/watch?v=" + ID), null);
  assert.equal(canonicalSourceUrl(""), null);
  assert.equal(canonicalSourceUrl(null), null);
  assert.equal(canonicalSourceUrl("not a url"), null);
});

test("timecode is HH:MM:SS and floors", () => {
  assert.equal(formatTimecode(72.9), "00:01:12");
  assert.equal(formatTimecode(3 * 3600 + 5), "03:00:05");
  assert.equal(formatTimecode(-4), "00:00:00");
});

const lines = [
  { start: 0, end: 5, text: "intro" },
  { start: 72, end: 80, text: "first line" },
  { start: 80, end: 90, text: "second\nline" },
  { start: 604, end: 620, text: "far away" },
  { start: 700, end: 710, text: "outside" },
];

test("transcript formats [HH:MM:SS] text with source timecodes", () => {
  assert.equal(formatTranscript(lines.slice(1, 3)), "[00:01:12] first line\n[00:01:20] second line");
});

test("single segment keeps only overlapping lines", () => {
  assert.equal(
    formatSegmentTranscript(lines, [{ start: 72, end: 90 }]),
    "[00:01:12] first line\n[00:01:20] second line",
  );
});

test("multi-segment follows segment order, not video order", () => {
  const out = formatSegmentTranscript(lines, [
    { start: 604, end: 620 },
    { start: 72, end: 80 },
  ]);
  assert.equal(out, "[00:10:04] far away\n[00:01:12] first line");
});

test("script lines: speaker, source timecode, segment order", () => {
  const out = formatScriptLines(
    lines,
    [{ start: 604, end: 620 }, { start: 72, end: 80 }],
    "HOST",
  );
  assert.equal(out, "[HOST, 00:10:04] far away\n[HOST, 00:01:12] first line");
});

test("speaker label containing a comma is kept whole", () => {
  const out = formatScriptLines(lines, [{ start: 72, end: 80 }], "Smith, Dr. Ann");
  assert.equal(out, "[Smith, Dr. Ann, 00:01:12] first line");
});

test("non-Latin text passes through untouched", () => {
  const ar = [{ start: 61, end: 65, text: "بسم الله الرحمن الرحيم" }];
  assert.equal(formatTranscript(ar), "[00:01:01] بسم الله الرحمن الرحيم");
  assert.equal(formatScriptLines(ar, [{ start: 60, end: 66 }]), "[SPEAKER, 00:01:01] بسم الله الرحمن الرحيم");
});

test("em dashes never survive into output", () => {
  const l = [{ start: 1, end: 2, text: "wait\u2014what \u2014 really" }];
  const t = formatTranscript(l);
  assert.ok(!t.includes("\u2014"));
  assert.equal(t, "[00:00:01] wait - what - really");
});

test("download ranges: multi and single", () => {
  assert.equal(
    formatDownloadRanges([{ start: 72, end: 90 }, { start: 604, end: 620 }]),
    "00:01:12 to 00:01:30; 00:10:04 to 00:10:20",
  );
  assert.equal(formatDownloadRanges([{ start: 72, end: 90 }]), "00:01:12 to 00:01:30");
});

test("used-material line", () => {
  assert.equal(
    formatUsedMaterial(ID, [{ start: 72, end: 90 }, { start: 604, end: 620 }], "M-dQw4w9WgXcQ-05"),
    `${ID} (video): 00:01:12 to 00:01:30; 00:10:04 to 00:10:20 (M-dQw4w9WgXcQ-05)`,
  );
});

test("clip id from a campaign pattern", () => {
  const r = buildClipId("{prefix}-{videoId}-{nn}", { prefix: "M", videoId: ID, index: 5 });
  assert.equal(r.id, `M-${ID}-05`);
  assert.deepEqual(r.unresolved, []);
  assert.equal(buildClipId("{prefix}-{nn}", { index: 3 }).unresolved[0], "{prefix}");
  assert.equal(
    formatClipIdAndFilename("A/B: c", "mp4"),
    "A/B: c\nA-B- c.mp4",
  );
});

test("blocks: all seven, never concatenated, unavailable ones say why", () => {
  const blocks = buildHandoffBlocks({
    url: `https://youtu.be/${ID}?list=PL1&t=9`,
    lines,
    segments: [{ start: 72, end: 90 }, { start: 604, end: 620 }],
    clipIdPattern: "{prefix}-{videoId}-{nn}",
    clipPrefix: "T1",
    clipIndex: 1,
  });
  assert.equal(blocks.length, 7);
  assert.equal(blocks[0].text, CANON);
  assert.equal(blocks[4].text, "00:01:12 to 00:01:30; 00:10:04 to 00:10:20");
  assert.equal(blocks[5].text, `${ID} (video): 00:01:12 to 00:01:30; 00:10:04 to 00:10:20 (T1-${ID}-01)`);
  assert.ok(blocks.every((b) => b.available));
});

test("blocks: missing video id disables source and used lines", () => {
  const blocks = buildHandoffBlocks({
    url: "https://www.youtube.com/watch?list=PL1",
    lines,
    segments: [{ start: 1, end: 2 }],
    clipId: "X-1",
  });
  assert.equal(blocks[0].available, false);
  assert.match(blocks[0].reason ?? "", /video id/);
  assert.equal(blocks[5].available, false);
  assert.equal(blocks[4].available, true);
});

test("blocks: no segments disables segment blocks", () => {
  const blocks = buildHandoffBlocks({ url: CANON, lines, segments: [], clipId: "X" });
  for (const i of [2, 3, 4, 5]) assert.equal(blocks[i].available, false);
  assert.equal(blocks[1].available, true);
});

test("CD2-3: a campaign is offered only its own session clips", () => {
  let all: SessionClipsByCampaign<{ id: string; path: string }> = {};
  all = addSessionClip(all, "a", { id: "AAA-01", path: "/A clips/AAA-01.mp4" });
  all = addSessionClip(all, "a", { id: "AAA-02", path: "/A clips/AAA-02.mp4" });
  assert.deepEqual(sessionClipsFor(all, "a").map((c) => c.id), ["AAA-01", "AAA-02"]);
  assert.deepEqual(sessionClipsFor(all, "b"), [], "nothing cut for B: nothing to send or copy");
  assert.deepEqual(sessionClipsFor(all, null), [], "no campaign is not a campaign");
  all = addSessionClip(all, "b", { id: "BBB-01", path: "/B clips/BBB-01.mp4" });
  all = addSessionClip(all, "a", { id: "AAA-01", path: "/A clips/AAA-01 2.mp4" });
  assert.deepEqual(sessionClipsFor(all, "b").map((c) => c.path), ["/B clips/BBB-01.mp4"]);
  assert.deepEqual(sessionClipsFor(all, "a").map((c) => c.path), ["/A clips/AAA-02.mp4", "/A clips/AAA-01 2.mp4"], "a re-cut replaces, never duplicates");
});

test("CD2-3: a clip cut with no campaign stays apart from every campaign", () => {
  const all = addSessionClip({}, null, { id: "clip-1", path: "/x.mp4" });
  assert.equal(sessionClipsFor(all, null).length, 1);
  assert.equal(sessionClipsFor(all, "a").length, 0);
  assert.equal(sessionClipsFor(all, "").length, 1, "an empty id is the same as none");
});
