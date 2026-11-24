/**
 * File: vtt.test.ts
 * Path: src/main/features/engine/utils/vtt.test.ts
 * Description: Pins the rolling-caption merge. YouTube auto-captions repeat each line in the next
 *   cue and add 10 ms filler cues; the old parser kept the repeats (the transcript read every line
 *   twice) and threw the word times away. Fixture shape follows YouTube's auto-caption VTT; not
 *   verified against real YouTube.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { parseVttTranscript } from "./vtt";

const ROLLING = `WEBVTT
Kind: captions
Language: en

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

test("rolling captions collapse to one line each, with word times kept", () => {
  const { lines, wordTimings } = parseVttTranscript(ROLLING);
  assert.equal(wordTimings, true);
  assert.deepEqual(
    lines.map((l) => l.text),
    ["hello and welcome back", "today we talk clips", "next line"],
  );
  const first = lines[0];
  assert.deepEqual(
    first.words!.map((w) => [w.text, w.start]),
    [["hello", 1], ["and", 1.5], ["welcome", 2], ["back", 2.8]],
  );
  assert.equal(first.start, 1);
  assert.equal(first.words![3].end, 3.5);
});

test("merged lines never overlap the next line", () => {
  const { lines } = parseVttTranscript(ROLLING);
  for (let i = 0; i + 1 < lines.length; i++) assert.ok(lines[i].end <= lines[i + 1].start);
});

test("hand-made captions carry no word times, so wordTimings is false", () => {
  const manual = `WEBVTT

00:00:01.000 --> 00:00:03.000
Hello and welcome.

00:00:03.000 --> 00:00:05.000
Hello and welcome.
Today we talk clips.
`;
  const { lines, wordTimings } = parseVttTranscript(manual);
  assert.equal(wordTimings, false);
  assert.deepEqual(lines.map((l) => l.text), ["Hello and welcome.", "Today we talk clips."]);
  assert.equal(lines[0].words, undefined);
});

test("empty input gives no lines and no word timings", () => {
  assert.deepEqual(parseVttTranscript("WEBVTT\n"), { lines: [], wordTimings: false });
});
