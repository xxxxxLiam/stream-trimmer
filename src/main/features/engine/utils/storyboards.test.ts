/**
 * File: storyboards.test.ts
 * Path: src/main/features/engine/utils/storyboards.test.ts
 * Description: Pins the storyboard reading: only storyboard formats are picked up, frames map to the
 *   right sheet and cell, and a video with no storyboard gives nothing. The fixture is built the way
 *   yt-dlp builds a level (2 h video, 5x5 sheets of 160x90 frames every 2 s); not real YouTube data.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { frameAt, frameInterval, levelCost, pickLevel, storyboardsOf } from "./storyboards";

const DURATION = 7200;
function level(id: string, width: number, height: number, fps: number) {
  const cols = 5, rows = 5, frames = DURATION * fps, sheets = Math.ceil(frames / 25);
  return {
    format_id: id, format_note: "storyboard", ext: "mhtml", width, height, columns: cols, rows, fps,
    fragments: Array.from({ length: sheets }, (_, j) => ({
      url: `https://i.ytimg.com/sb/x/${id}/M${j}.jpg`,
      duration: Math.min(25 / fps, DURATION - j * (25 / fps)),
    })),
  };
}
const info = {
  formats: [
    { format_id: "137", vcodec: "avc1", height: 1080 },
    level("sb1", 160, 90, 0.5),
    level("sb0", 48, 27, 0.1),
  ],
};

test("only storyboard formats are read, smallest frame first", () => {
  const l = storyboardsOf(info);
  assert.deepEqual(l.map((x) => x.id), ["sb0", "sb1"]);
  assert.deepEqual(storyboardsOf({}), []);
});

test("a frame maps to its sheet and cell", () => {
  const sb1 = storyboardsOf(info)[1];
  assert.equal(frameInterval(sb1), 2);
  // t=0 -> first cell of sheet 0; t=50 -> frame 25 -> first cell of sheet 1; t=52 -> frame 26 -> col 1.
  assert.deepEqual(frameAt(sb1, 0), { url: sb1.sheets[0].url, col: 0, row: 0 });
  assert.deepEqual(frameAt(sb1, 50), { url: sb1.sheets[1].url, col: 0, row: 0 });
  assert.deepEqual(frameAt(sb1, 52), { url: sb1.sheets[1].url, col: 1, row: 0 });
  // Between frames the earlier one shows: t=51 s is still frame 25, not 26.
  assert.deepEqual(frameAt(sb1, 51), { url: sb1.sheets[1].url, col: 0, row: 0 });
  assert.deepEqual(frameAt(sb1, 58), { url: sb1.sheets[1].url, col: 4, row: 0 });
  assert.deepEqual(frameAt(sb1, 60), { url: sb1.sheets[1].url, col: 0, row: 1 });
  // Past the end clamps to the last sheet's last cell rather than throwing.
  assert.equal(frameAt(sb1, 99999).url, sb1.sheets[sb1.sheets.length - 1].url);
});

test("cost and level choice", () => {
  const [sb0, sb1] = storyboardsOf(info);
  assert.deepEqual(levelCost(sb1), { sheets: 144, frames: 3600, sheetPixels: [800, 450] });
  assert.equal(pickLevel([sb0, sb1], 100), sb1);
  assert.equal(pickLevel([sb0, sb1], 400), sb1);
  assert.equal(pickLevel([], 100), null);
});
