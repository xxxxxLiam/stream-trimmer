/**
 * File: clipWords.test.ts
 * Path: src/renderer/src/features/transcript/utils/clipWords.test.ts
 * Description: The clip's words, as copied or downloaded from the Transcript tab (Liam, 25 Nov: used in other
 *   sessions to refine scripts): an unsaved range, a saved clip, a clip of several sections, clean text.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parseVttTranscript } from "../../../../../main/features/engine/utils/vtt";
import { transcriptFileName } from "../../../shared/utils/saveText";
import { mergeRanges, wholeTranscriptText, wordsInRanges, type Line } from "./transcript";

const words = (start: number, text: string): Line["words"] =>
  text.split(" ").map((t, i) => ({ start: start + i, end: start + i + 1, text: t }));
const line = (start: number, text: string): Line => ({ start, end: start + text.split(" ").length, text, words: words(start, text) });

const lines: Line[] = [line(0, "welcome back everyone"), line(3, "today we talk clips"), line(7, "first the honest version"), line(11, "then the hot take"), line(15, "thanks for watching")];

test("an unsaved range gives only the words inside it, cut by word times at the edges", () => {
  // 4 to 9 covers "we talk clips" (4,5,6), then "first the" (7,8): the edge lines are cut, not given whole.
  assert.equal(wordsInRanges(lines, [{ start: 4, end: 9 }]), "we talk clips\nfirst the");
  assert.equal(wordsInRanges(lines, [{ start: 3, end: 7 }]), "today we talk clips");
});

test("captions without word times give the whole line that the range touches", () => {
  const plain: Line[] = [{ start: 0, end: 3, text: "Hello and welcome." }, { start: 3, end: 6, text: "Today we talk." }];
  assert.equal(wordsInRanges(plain, [{ start: 2, end: 4 }]), "Hello and welcome.\nToday we talk.");
});

test("a saved clip with several sections lists each in time order with a blank line between, the gaps skipped", () => {
  // Given out of order (the picked range after the saved sections is the usual case, but order must not matter).
  const text = wordsInRanges(lines, [{ start: 11, end: 15 }, { start: 0, end: 3 }]);
  assert.equal(text, "welcome back everyone\n\nthen the hot take");
  assert.ok(!text.includes("today"), "the gap between the sections is skipped");
});

test("overlapping or touching sections never list a line twice", () => {
  assert.deepEqual(mergeRanges([{ start: 5, end: 12 }, { start: 0, end: 6 }, { start: 12, end: 14 }]), [{ start: 0, end: 14 }]);
  const text = wordsInRanges(lines, [{ start: 0, end: 8 }, { start: 3, end: 11 }]);
  assert.equal(text.match(/today we talk clips/g)?.length, 1);
});

test("no range, or an empty one, gives nothing; the whole transcript lists every line once", () => {
  assert.equal(wordsInRanges(lines, []), "");
  assert.equal(wordsInRanges(lines, [{ start: 5, end: 5 }]), "");
  assert.equal(wholeTranscriptText(lines).split("\n").length, 5);
});

test("rolling auto-captions come out clean: each sentence once, no repeats from the rolling lines", () => {
  const rolling = `WEBVTT

00:00:01.000 --> 00:00:03.500 align:start position:0%
 
hello<00:00:01.500><c> and</c><00:00:02.000><c> welcome</c><00:00:02.800><c> back</c>

00:00:03.490 --> 00:00:03.500 align:start position:0%
hello and welcome back
 

00:00:03.500 --> 00:00:06.000 align:start position:0%
hello and welcome back
today<00:00:04.000><c> we</c><00:00:04.500><c> talk</c><00:00:05.000><c> clips</c>

00:00:05.990 --> 00:00:06.000 align:start position:0%
today we talk clips
 

00:00:06.000 --> 00:00:08.000 align:start position:0%
today we talk clips
next<00:00:06.500><c> line</c>
`;
  const t = parseVttTranscript(rolling).lines as Line[];
  const all = wholeTranscriptText(t);
  assert.equal(all, "hello and welcome back\ntoday we talk clips\nnext line");
  assert.equal(wordsInRanges(t, [{ start: 1, end: 6 }]), "hello and welcome back\ntoday we talk clips");
});

test("download names are safe and say what the file is", () => {
  assert.equal(transcriptFileName("Is It Haram: to Want / More Money?", "clip"), "Is It Haram to Want More Money - clip words.txt");
  assert.equal(transcriptFileName("Podcast #214", "whole"), "Podcast #214 - transcript.txt");
  assert.equal(transcriptFileName(undefined, "whole"), "Transcript - transcript.txt");
});

test("the Transcript tab's menu offers both copies and both downloads, saved through the save dialog", () => {
  const menu = readFileSync(new URL("../components/TranscriptCopyMenu.tsx", import.meta.url), "utf8");
  assert.match(menu, /label: "Whole transcript"[\s\S]*copy\(wholeTranscriptText\(lines\)\)/);
  assert.match(menu, /label: "This clip's words"[\s\S]*copy\(clipWords\)/);
  assert.match(menu, /key: "whole-txt"[\s\S]*download\(wholeTranscriptText\(lines\), "whole"\)/);
  assert.match(menu, /key: "clip-txt"[\s\S]*download\(clipWords, "clip"\)/);
  const save = readFileSync(new URL("../../../shared/utils/saveText.ts", import.meta.url), "utf8");
  assert.match(save, /window\.electronAPI\?\.saveTextFile/);
});
