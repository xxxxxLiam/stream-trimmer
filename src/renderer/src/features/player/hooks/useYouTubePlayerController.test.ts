/**
 * File: useYouTubePlayerController.test.ts
 * Path: src/renderer/src/features/player/hooks/useYouTubePlayerController.test.ts
 * Description: The playhead double-jump on every timeline click. Seeking is asynchronous, so
 *   for a tick or two getCurrentTime() still reports where the video WAS; believing that
 *   reading drags the playhead back and then forward again. acceptPolledTime decides which
 *   polled readings to believe while a seek is outstanding.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  SEEK_SETTLE_SEC,
  SEEK_TIMEOUT_MS,
  acceptPolledTime,
  shouldStayPaused,
  OWNER_BLOCK_CODES,
  CONFIG_ERROR_CODES,
  BLOCKED_RETRIES,
  type PendingSeek,
} from "./useYouTubePlayerController";

const NOW = 1_000_000;
const pendingAt = (target: number, now = NOW): PendingSeek => ({
  target,
  until: now + SEEK_TIMEOUT_MS,
});

test("with no seek outstanding, every reading is believed", () => {
  assert.equal(acceptPolledTime(12.5, null, NOW), true);
  assert.equal(acceptPolledTime(0, null, NOW), true);
});

test("the stale reading that caused the double-jump is rejected", () => {
  // Clicked 45s while playing at 12s. The next poll still says 12s.
  assert.equal(
    acceptPolledTime(12, pendingAt(45), NOW + 200),
    false,
    "a pre-seek reading must not drag the playhead back",
  );
});

test("the reading is believed once the player arrives", () => {
  assert.equal(acceptPolledTime(45, pendingAt(45), NOW + 400), true);
});

test("landing near the target counts as arrived, because YouTube seeks to a keyframe", () => {
  const justInside = 45 + SEEK_SETTLE_SEC - 0.01;
  const justOutside = 45 + SEEK_SETTLE_SEC + 0.01;
  assert.equal(acceptPolledTime(justInside, pendingAt(45), NOW + 400), true);
  assert.equal(acceptPolledTime(justOutside, pendingAt(45), NOW + 400), false);
});

test("a seek that never lands stops being waited for, so the playhead cannot freeze", () => {
  const p = pendingAt(45);
  assert.equal(acceptPolledTime(12, p, NOW + SEEK_TIMEOUT_MS - 1), false, "still waiting");
  assert.equal(acceptPolledTime(12, p, NOW + SEEK_TIMEOUT_MS), true, "gave up waiting");
});

test("seeking backwards is guarded too, not just forwards", () => {
  // Clicked 10s while playing at 90s; the stale reading is ahead of the target, not behind.
  assert.equal(acceptPolledTime(90, pendingAt(10), NOW + 200), false);
  assert.equal(acceptPolledTime(10.2, pendingAt(10), NOW + 200), true);
});

import { readFileSync as readSrc } from "node:fs";

test("the embed keeps YouTube's normal controls: nothing turns them off, so they fade while playing", () => {
  const src = readSrc(new URL("./useYouTubePlayerController.ts", import.meta.url), "utf8");
  const vars = src.slice(src.indexOf("playerVars: {"), src.indexOf("events: {"));
  assert.doesNotMatch(vars, /controls:\s*0/);
  assert.doesNotMatch(vars, /disablekb/);
  assert.match(vars, /modestbranding: 1/);
});

test("seeking keeps the play state: paused, cued and ended stay paused, playing keeps playing", () => {
  for (const state of [-1, 0, 2, 5]) assert.equal(shouldStayPaused(state, false), true, `state ${state}`);
  for (const state of [1, 3]) assert.equal(shouldStayPaused(state, false), false, `state ${state}`);
  assert.equal(shouldStayPaused(5, true), false, "a seek that asks to play plays");
});

test("seekTo puts the pause back through shouldStayPaused", () => {
  const src = readFileSync(new URL("./useYouTubePlayerController.ts", import.meta.url), "utf8");
  assert.match(src, /const stayPaused = shouldStayPaused\(playerRef\.current\?\.getPlayerState\(\)/);
});

test("only 101, 150 and 152 say the owner blocks playback; 153 is a configuration error that is retried first", () => {
  assert.deepEqual(OWNER_BLOCK_CODES, [101, 150, 152]);
  assert.deepEqual(CONFIG_ERROR_CODES, [153]);
  assert.ok(BLOCKED_RETRIES >= 1);
  const src = readFileSync(new URL("./useYouTubePlayerController.ts", import.meta.url), "utf8");
  assert.match(src, /OWNER_BLOCK_CODES\.includes\(code\)\) setBlockedBy\(\{ owner: true, code \}\)/);
  assert.match(src, /CONFIG_ERROR_CODES\.includes\(code\)\) failOrRetry\(code\)/);
  const panel = readFileSync(new URL("../components/PreviewPanel.tsx", import.meta.url), "utf8");
  assert.match(panel, /player\.blockedBy\?\.owner \? "The owner blocks playback here" : "The preview did not load"/);
});
