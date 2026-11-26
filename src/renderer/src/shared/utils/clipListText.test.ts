import assert from "node:assert/strict";
import test from "node:test";
import { clipTranscriptText, exportListText, hms, historyListText, listFileName, singleClipText, transcriptFor } from "./clipListText";
import { historyClipCount, historyGroups } from "./historyListText";
import type { DownloadEntry } from "./downloads";

test("Copy list: the Export text is the title, the link, then numbered clips with a link that opens at the start", () => {
  const text = exportListText({
    videoId: "q2xKd81Lw0c",
    title: "Podcast #214, the long talk",
    clips: [
      { name: "Honest Version", segments: [{ start: 4324, end: 4366 }] },
      { name: "Big Deal", segments: [{ start: 2470, end: 2511 }] },
    ],
  });
  assert.equal(
    text,
    [
      "Podcast #214, the long talk",
      "https://youtu.be/q2xKd81Lw0c",
      "",
      "1. Honest Version · 1:12:04 to 1:12:46 (0:42)",
      "   https://youtu.be/q2xKd81Lw0c?t=4324",
      "2. Big Deal · 0:41:10 to 0:41:51 (0:41)",
      "   https://youtu.be/q2xKd81Lw0c?t=2470",
    ].join("\n"),
  );
});

test("Copy list: a clip of several sections lists each, and the link opens at the first", () => {
  const text = exportListText({ videoId: "abc", title: "T", clips: [{ name: "Two Parts", segments: [{ start: 10, end: 20 }, { start: 100, end: 130 }] }] });
  assert.match(text, /1\. Two Parts · 0:00:10 to 0:00:20 \+ 0:01:40 to 0:02:10 \(0:40\)\n   https:\/\/youtu\.be\/abc\?t=10$/);
});

const entry = (over: Partial<DownloadEntry>): DownloadEntry => ({ id: "x", kind: "clip", label: "A.mp4", path: "", dir: null, savedAt: Date.UTC(2026, 10, 25, 12), ...over });

test("Copy list: History groups by day and campaign, videos inside, and a clip's dubs count once", () => {
  const groups = historyGroups([
    entry({ id: "1", label: "Honest Version.mp4", campaign: "Acme", campaignId: "a", videoId: "v1", videoTitle: "Podcast", clipId: "c1", segments: [{ start: 4324, end: 4366 }], savedAt: Date.UTC(2026, 10, 25, 12) }),
    entry({ id: "2", label: "Honest Version ES.mp4", campaign: "Acme", campaignId: "a", videoId: "v1", videoTitle: "Podcast", clipId: "c1", segments: [{ start: 4324, end: 4366 }], savedAt: Date.UTC(2026, 10, 25, 12) }),
    entry({ id: "3", label: "Night Shift.mp4", campaign: "Nova", campaignId: "n", videoId: "v2", videoTitle: "Night Shift Interview", clipId: "c2", segments: [{ start: 1335, end: 1363 }], savedAt: Date.UTC(2026, 10, 24, 12) }),
  ]);
  assert.equal(groups.length, 2);
  assert.match(groups[0].heading, /Acme$/);
  assert.equal(historyClipCount(groups), 2);
  const text = historyListText(groups);
  assert.match(text, /Podcast\nhttps:\/\/youtu\.be\/v1\n\n1\. Honest Version · /);
  assert.match(text, /Nova\n\nNight Shift Interview\nhttps:\/\/youtu\.be\/v2/);
});

test("Copy list: times read h:mm:ss and file names are safe", () => {
  assert.equal(hms(4324), "1:12:04");
  assert.equal(hms(482), "0:08:02");
  assert.equal(listFileName('Podcast: "the" long/talk', "Clipr clips"), "Podcast the long talk.txt");
  assert.equal(listFileName(undefined, "Clipr history"), "Clipr history.txt");
});

const L = (start: number, end: number, text: string) => ({ start, end, text });
const talk = [L(4320, 4324, "before it"), L(4324, 4330, "this is the point"), L(4324, 4330, "This is  the point"), L(4330, 4340, "and here is why"), L(4400, 4410, "after it")];

test("Copy with transcript: a clip's words are the caption lines in its range, a repeated line once", () => {
  assert.equal(clipTranscriptText(talk, [{ start: 4324, end: 4340 }]), "this is the point\nand here is why");
});

test("Copy with transcript: the list text puts each clip's words under it, and says plainly when there are none", () => {
  const segs = [{ start: 4324, end: 4340 }];
  const text = exportListText({
    videoId: "q2xKd81Lw0c",
    title: "Talk",
    clips: [
      { name: "Honest Version", segments: segs, transcript: transcriptFor({ lines: talk, error: null }, segs) },
      { name: "Silent", segments: [{ start: 100, end: 110 }], transcript: transcriptFor({ lines: talk, error: null }, [{ start: 100, end: 110 }]) },
    ],
  });
  assert.match(text, /1\. Honest Version · 1:12:04 to 1:12:20 \(0:16\)\n {3}https:\/\/youtu\.be\/q2xKd81Lw0c\?t=4324\n\n {3}this is the point\n {3}and here is why\n\n2\. Silent/);
  assert.match(text, /No words in this part\./);
  assert.deepEqual(transcriptFor({ lines: [], error: null }, segs), { none: "no-transcript" });
  assert.deepEqual(transcriptFor({ lines: [], error: "x" }, segs), { none: "failed" });
});

test("Copy one clip: its line without a number, its link and its transcript range only", () => {
  const segs = [{ start: 4324, end: 4340 }];
  const one = singleClipText({ name: "Honest Version", segments: segs, transcript: transcriptFor({ lines: talk, error: null }, segs) }, "q2xKd81Lw0c");
  assert.equal(one, "Honest Version · 1:12:04 to 1:12:20 (0:16)\n   https://youtu.be/q2xKd81Lw0c?t=4324\n\n   this is the point\n   and here is why");
  assert.doesNotMatch(singleClipText({ name: "A", segments: segs, transcript: { none: "no-transcript" } }, "v"), /^1\./);
  assert.match(singleClipText({ name: "A", segments: segs, transcript: { none: "no-transcript" } }, "v"), /No transcript for this video\./);
});

test("Copy with transcript: a clip of two sections lists each section's own words", () => {
  const segs = [{ start: 4324, end: 4330 }, { start: 4400, end: 4410 }];
  assert.equal(clipTranscriptText(talk, segs), "1:12:04 to 1:12:10\nthis is the point\n\n1:13:20 to 1:13:30\nafter it");
  assert.match(clipTranscriptText(talk, [{ start: 4324, end: 4330 }, { start: 100, end: 110 }]), /0:01:40 to 0:01:50\nNo words in this part\.$/);
});
