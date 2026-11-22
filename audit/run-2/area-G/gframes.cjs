/**
 * File: gframes.cjs
 * Path: audit/run-2/area-G/gframes.cjs
 * Description: Says WHICH source frame every frame of a delivered clip came
 * from. Written for run 2 rather than reused from the product's test support,
 * so the measurement does not inherit the fix author's helper. Each decoded
 * frame is reduced to a 32x18 grayscale thumbnail and matched against every
 * source frame; the fixture carries a moving counter, so all 750 thumbnails
 * are distinct and the nearest match is the identity. A stream-copied frame
 * matches at distance 0; a re-encoded one matches within a small distance
 * while every other source frame stays far away (the margin is reported, so an
 * ambiguous attribution cannot pass unnoticed).
 */
const { spawnSync } = require("node:child_process");

const W = 32;
const H = 18;
const BYTES = W * H;

function thumbnails(ffmpeg, file) {
  const r = spawnSync(
    ffmpeg,
    [
      "-v", "error", "-i", file, "-an", "-fps_mode", "passthrough",
      "-vf", `scale=${W}:${H}:flags=area,format=gray`,
      "-f", "rawvideo", "-",
    ],
    { maxBuffer: 1 << 28 },
  );
  if (r.status !== 0) throw new Error(`decode failed: ${r.stderr}`);
  const out = [];
  for (let i = 0; i + BYTES <= r.stdout.length; i += BYTES) {
    out.push(r.stdout.subarray(i, i + BYTES));
  }
  return out;
}

function distance(a, b) {
  let sum = 0;
  for (let i = 0; i < BYTES; i++) sum += Math.abs(a[i] - b[i]);
  return sum / BYTES;
}

function attribute(source, clip) {
  const indices = [];
  let worstDistance = 0;
  let minMargin = Infinity;
  for (const frame of clip) {
    let best = -1;
    let bestD = Infinity;
    let second = Infinity;
    for (let i = 0; i < source.length; i++) {
      const d = distance(frame, source[i]);
      if (d < bestD) {
        second = bestD;
        bestD = d;
        best = i;
      } else if (d < second) second = d;
    }
    indices.push(best);
    worstDistance = Math.max(worstDistance, bestD);
    minMargin = Math.min(minMargin, second - bestD);
  }
  return { indices, worstDistance, minMargin };
}

/** Frame-level verdict for a clip against a list of marked ranges. */
function verdict(ffmpeg, fixture, clipFile, ranges, fps = 25) {
  const source = thumbnails(ffmpeg, fixture);
  const clip = thumbnails(ffmpeg, clipFile);
  const { indices, worstDistance, minMargin } = attribute(source, clip);
  const times = indices.map((i) => Number((i / fps).toFixed(3)));
  // A frame at index i covers [i/fps, (i+1)/fps). It is "inside" a marked
  // range when any part of it is; "before an in-point" means it ends at or
  // before the in-point of every range and is not inside any.
  const inside = (t) =>
    ranges.some((r) => t + 1 / fps > r.start + 1e-9 && t < r.end - 1e-9);
  const before = times.filter(
    (t) => !inside(t) && ranges.some((r) => t + 1 / fps <= r.start + 1e-9),
  );
  const after = times.filter(
    (t) => !inside(t) && !ranges.some((r) => t + 1 / fps <= r.start + 1e-9),
  );
  return {
    sourceFrames: source.length,
    deliveredFrames: clip.length,
    framesInsideMarkedRanges: times.filter(inside).length,
    framesBeforeAnInPoint: before.length,
    framesBeforeAnInPointAt: before,
    framesAfterAnOutPoint: after.length,
    framesAfterAnOutPointAt: after,
    firstDeliveredSourceFrameSec: times[0],
    lastDeliveredSourceFrameSec: times[times.length - 1],
    sourceTimesInOrder: times,
    worstDistance: Number(worstDistance.toFixed(3)),
    minMargin: Number(minMargin.toFixed(3)),
  };
}

module.exports = { thumbnails, attribute, verdict };
