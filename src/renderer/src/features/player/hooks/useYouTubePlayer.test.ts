/**
 * File: useYouTubePlayer.test.ts
 * Path: src/renderer/src/features/player/hooks/useYouTubePlayer.test.ts
 * Description: The playhead double-jump on every timeline click. Seeking is asynchronous, so
 *   for a tick or two getCurrentTime() still reports where the video WAS; believing that
 *   reading drags the playhead back and then forward again. acceptPolledTime decides which
 *   polled readings to believe while a seek is outstanding.
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  SEEK_SETTLE_SEC,
  SEEK_TIMEOUT_MS,
  acceptPolledTime,
  type PendingSeek,
} from "./useYouTubePlayer";

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
