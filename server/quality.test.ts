/**
 * File: quality.test.ts
 * Path: server/quality.test.ts
 * Description: Pins the resolution safety net that catches the bug where a
 * 1080p video was downloaded, delivered as a muxed 360p stream, and handed
 * over without a word. Both halves matter: the 360p-of-1080p case has to be
 * caught, and the ordinary one-rung-down cases must not be, or every clip of
 * a 4K video would be downloaded twice for nothing.
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  DEGRADED_HEIGHT_RATIO,
  bestAvailableHeight,
  isDegradedDelivery,
} from "./quality";

// The heights from the bug report, exactly as the probe logged them.
const REPORTED = [1080, 720, 480, 360, 240, 180, 144, 90, 45, 27];

test("the reported bug is caught", () => {
  // requested 1080, probe said 1080 was there, itag 18 delivered 360.
  assert.equal(isDegradedDelivery(360, 1080, REPORTED), true);
});

test("the same collapse is caught when the user asked for the best", () => {
  assert.equal(isDegradedDelivery(360, "best", REPORTED), true);
});

test("one rung down is a compromise, not a failure", () => {
  // 720 of a requested 1080 is what a codec or container preference costs.
  // Re-downloading cannot improve it, so it must not trigger a retry.
  assert.equal(isDegradedDelivery(720, 1080, REPORTED), false);
  assert.equal(isDegradedDelivery(480, 720, REPORTED), false);
});

test("an H.264-only 1080p pick from a 4K video is not a failure", () => {
  // "best" on a 2160p video whose only avc1 rendition is 1080p. Exactly half,
  // and deliberate — the threshold is strict so this stays on the safe side.
  assert.equal(isDegradedDelivery(1080, "best", [2160, 1440, 1080, 720]), false);
});

test("exactly the requested height, or better, is never degraded", () => {
  assert.equal(isDegradedDelivery(1080, 1080, REPORTED), false);
  assert.equal(isDegradedDelivery(1080, 720, REPORTED), false);
});

test("a video that only has low renditions is not blamed for them", () => {
  // 240p asked at 1080p: nothing a retry could reach, so no retry.
  assert.equal(isDegradedDelivery(240, 1080, [360, 240, 144]), false);
  // But 144p out of an available 720p still is.
  assert.equal(isDegradedDelivery(144, 1080, [720, 360, 144]), true);
});

test("the request caps the target, so a modest ask is never degraded", () => {
  // 360 requested on a 1080p video: the user asked for 360.
  assert.equal(isDegradedDelivery(360, 360, REPORTED), false);
});

test("an unanswerable question is not treated as a failure", () => {
  // mp3: no video stream, so probeDelivered() reports no height.
  assert.equal(isDegradedDelivery(undefined, 1080, REPORTED), false);
  // ffmpeg's probe failed to parse a resolution out of the clip.
  assert.equal(isDegradedDelivery(0, 1080, REPORTED), false);
  assert.equal(isDegradedDelivery(NaN, "best", REPORTED), false);
  // The probe listed no formats at all, so there is no ceiling to compare to.
  assert.equal(isDegradedDelivery(360, 1080, []), false);
  // A quality string that did not parse to a number must not disable or trip
  // the net; it is simply not a question that can be answered.
  assert.equal(isDegradedDelivery(360, Number("fast"), REPORTED), false);
});

test("junk in the probed height list is ignored", () => {
  assert.equal(bestAvailableHeight([]), 0);
  assert.equal(bestAvailableHeight([360, NaN, 1080, Infinity]), 1080);
  assert.equal(isDegradedDelivery(360, "best", [NaN, Infinity]), false);
});

test("the threshold is the documented half", () => {
  assert.equal(DEGRADED_HEIGHT_RATIO, 0.5);
  const target = 1000;
  assert.equal(isDegradedDelivery(500, target, [target]), false);
  assert.equal(isDegradedDelivery(499, target, [target]), true);
});
