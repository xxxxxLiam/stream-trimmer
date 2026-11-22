/**
 * File: frames.cjs
 * Path: audit/run-2/area-B/frames.cjs
 * Description: Identify every delivered frame against every source frame, so "did the cut
 *   lose marked content, or keep footage from outside the marks?" is answered with frames
 *   rather than a duration. Both the stub's cut and the server's local trim RE-ENCODE, so
 *   a checksum match is impossible; this is the nearest-thumbnail method T1 used: decode
 *   every frame to a 16x16 grey thumbnail and match each delivered frame to the source
 *   frame it is closest to. The margin (distance to the runner-up vs distance to the match)
 *   is printed so the matching can be judged, not taken on trust.
 */
const { spawnSync } = require("node:child_process");

const FF = "/home/user/stream-trimmer/resources/bin/ffmpeg";
const N = 16; // thumbnail side
const SIZE = N * N;

/** Every frame of `file` as a 16x16 grey thumbnail, at the file's own frame rate. */
function thumbs(file) {
  const r = spawnSync(
    FF,
    ["-hide_banner", "-loglevel", "error", "-i", file, "-vf", `scale=${N}:${N},format=gray`, "-f", "rawvideo", "-"],
    { maxBuffer: 1 << 28 },
  );
  const buf = r.stdout || Buffer.alloc(0);
  const out = [];
  for (let o = 0; o + SIZE <= buf.length; o += SIZE) out.push(buf.subarray(o, o + SIZE));
  return out;
}

function fps(file) {
  const r = spawnSync(FF, ["-hide_banner", "-i", file], { encoding: "utf8" });
  const m = `${r.stderr}`.match(/(\d+(?:\.\d+)?) fps/);
  return m ? Number(m[1]) : 25;
}

function dist(a, b) {
  let s = 0;
  for (let i = 0; i < SIZE; i++) s += Math.abs(a[i] - b[i]);
  return s / SIZE;
}

/**
 * @param {string} sourceFile 30s fixture
 * @param {string} clipFile   the delivered clip
 * @param {{start:number,end:number}[]} marks what the user marked
 */
function compare(sourceFile, clipFile, marks) {
  const src = thumbs(sourceFile);
  const clip = thumbs(clipFile);
  const sFps = fps(sourceFile);
  const cFps = fps(clipFile);
  const matched = [];
  for (const f of clip) {
    let best = Infinity;
    let bestI = -1;
    let second = Infinity;
    for (let i = 0; i < src.length; i++) {
      const d = dist(f, src[i]);
      if (d < best) {
        second = best;
        best = d;
        bestI = i;
      } else if (d < second) second = d;
    }
    matched.push({ t: bestI / sFps, d: best, margin: second - best });
  }
  const inAnyMark = (t) => marks.some((m) => t >= m.start - 1 / sFps && t <= m.end + 1 / sFps);
  const before = matched.filter((m) => marks.every((k) => m.t < k.start - 1 / sFps));
  const outside = matched.filter((m) => !inAnyMark(m.t));
  const markedFrames = marks.reduce((n, m) => n + Math.round((m.end - m.start) * sFps), 0);
  const coveredSourceFrames = new Set(matched.map((m) => Math.round(m.t * sFps)));
  return {
    sourceFrames: src.length,
    sourceFps: sFps,
    clipFrames: clip.length,
    clipFps: cFps,
    markedFrames,
    deliveredDistinctSourceFrames: coveredSourceFrames.size,
    framesFromBeforeEveryInPoint: before.length,
    framesOutsideEveryMark: outside.length,
    firstMatchedSourceTime: matched.length ? Number(matched[0].t.toFixed(3)) : null,
    lastMatchedSourceTime: matched.length ? Number(matched[matched.length - 1].t.toFixed(3)) : null,
    worstDistance: Number(Math.max(...matched.map((m) => m.d)).toFixed(2)),
    smallestMargin: Number(Math.min(...matched.map((m) => m.margin)).toFixed(2)),
    outsideSamples: outside.slice(0, 8).map((m) => Number(m.t.toFixed(3))),
  };
}

module.exports = { compare, thumbs, fps };
