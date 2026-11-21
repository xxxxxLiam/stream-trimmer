/**
 * File: copyBlocksInput.test.ts
 * Description: D-3 — the Copy blocks panel gets live input, so blocks are not all disabled.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { buildHandoffBlocks } from "../../lib/handoff";
import { buildCopyBlocksInput } from "./copyBlocksInput";

const lines = [
  { start: 0, end: 5, text: "hello there" },
  { start: 5, end: 10, text: "second line" },
];

test("D-3: with a video, segments and transcript every block is available", () => {
  const blocks = buildHandoffBlocks(
    buildCopyBlocksInput({
      sourceUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      videoId: "dQw4w9WgXcQ",
      transcript: lines,
      segments: [{ start: 1, end: 8 }],
      campaign: { clipIdPattern: "{prefix}-{videoId}-{nn}", prefix: "ab" },
      nextClipId: "ab-dQw4w9WgXcQ-01",
    }),
  );
  assert.equal(blocks.length, 7);
  for (const b of blocks) assert.equal(b.available, true, `${b.id}: ${b.reason}`);
});

test("D-3: the reasons are honest when something really is missing", () => {
  const blocks = buildHandoffBlocks(
    buildCopyBlocksInput({ videoId: "dQw4w9WgXcQ", transcript: null, segments: [] }),
  );
  const by = Object.fromEntries(blocks.map((b) => [b.id, b]));
  assert.equal(by.source.available, true, "a loaded video never reports 'No video id'");
  assert.equal(by.transcript.reason, "No transcript loaded.");
  assert.equal(by.ranges.reason, "Add a segment first.");
});

test("D-3: App passes the input to CopyBlocks", () => {
  const app = readFileSync(join(process.cwd(), "src", "App.tsx"), "utf8");
  assert.match(app, /<CopyBlocks[^>]*\sinput=\{copyInput\}/);
});
