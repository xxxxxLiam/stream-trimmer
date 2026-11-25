import assert from "node:assert/strict";
import test from "node:test";
import { exportListText, hms, historyListText, listFileName } from "./clipListText";
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
