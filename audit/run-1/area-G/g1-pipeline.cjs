#!/usr/bin/env node
/**
 * G area, audit-only. Drives the REAL production cut+concat pipeline:
 *   - server/segments.ts  resolveSegments / joinSegments / runProcess / probeDurationSec
 *   - the exact ffmpeg trim args server/index.ts builds for the local-trim path
 *   - real ffmpeg (resources/bin/ffmpeg, the one the app bundles)
 * and asserts the OUTPUT DURATION of every case against the expected sum.
 *
 * Nothing here writes to product code. Outputs land in ./out-g1.
 */
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const REPO = "/home/user/stream-trimmer";
const FFMPEG = path.join(REPO, "resources", "bin", "ffmpeg");
const FIXTURE = path.join(REPO, "audit", "fixtures", "fixture.mp4");
const OUT = path.join(__dirname, "out-g1");

// Run this file with `npx tsx` so the .ts require below resolves.
const segments = require(path.join(REPO, "server", "segments.ts"));

const {
  resolveSegments, joinSegments, runProcess, probeDurationSec,
  segmentsTotal, segmentFileName, sectionArg, buildConcatList,
} = segments;

const MAX_CLIP_SECONDS = 600; // server/index.ts

// --- probes ---------------------------------------------------------------

function ffprobeJson(file) {
  const r = spawnSync("ffprobe", [
    "-v", "error", "-show_format", "-show_streams", "-of", "json", file,
  ], { encoding: "utf8" });
  try { return JSON.parse(r.stdout); } catch { return null; }
}

/** Container duration + per-stream durations + decodes-clean check. */
function inspect(file) {
  if (!fs.existsSync(file)) return { exists: false };
  const j = ffprobeJson(file);
  const streams = (j && j.streams) || [];
  const v = streams.find((s) => s.codec_type === "video");
  const a = streams.find((s) => s.codec_type === "audio");
  // Full decode: catches a file that probes fine but will not play through.
  const dec = spawnSync(FFMPEG, ["-v", "error", "-xerror", "-i", file, "-f", "null", "-"], {
    encoding: "utf8", timeout: 120000,
  });
  return {
    exists: true,
    bytes: fs.statSync(file).size,
    duration: j && j.format ? Number(j.format.duration) : undefined,
    // the server's OWN duration reader (ffmpeg -i parsing, no ffprobe bundled)
    serverDuration: probeDurationSec(FFMPEG, file),
    video: v ? `${v.codec_name} ${v.width}x${v.height}` : null,
    videoDur: v && v.duration ? Number(v.duration) : undefined,
    audio: a ? `${a.codec_name} ${a.channels}ch` : null,
    audioDur: a && a.duration ? Number(a.duration) : undefined,
    decodesClean: dec.status === 0,
    decodeErr: dec.status === 0 ? "" : (dec.stderr || "").trim().split("\n").slice(0, 3).join(" | "),
  };
}

// --- the exact production trim args (server/index.ts buildSegment) ---------
function trimArgs(source, seg, out) {
  return [
    "-y", "-ss", String(seg.start), "-to", String(seg.end), "-i", source,
    "-c", "copy", "-movflags", "+faststart", out,
  ];
}

const results = [];
function log(...a) { console.log(...a); }

async function runCase(name, segs, opts = {}) {
  const dir = path.join(OUT, name.replace(/[^\w.-]+/g, "_"));
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });

  const rec = { name, request: segs, notes: [] };

  // 1. the real request validator
  const resolved = resolveSegments({ segments: segs }, MAX_CLIP_SECONDS);
  rec.resolveSegments = resolved.ok ? { ok: true, n: resolved.segments.length } : resolved;
  if (!resolved.ok) {
    log(`\n## ${name}\n  resolveSegments REJECTED: ${resolved.error}`);
    results.push(rec);
    return rec;
  }
  const list = resolved.segments;
  rec.sectionArgs = list.map(sectionArg);
  const expected = segmentsTotal(list);
  rec.expectedSec = expected;

  const multi = list.length > 1;
  const outputPath = path.join(dir, "clip.mp4");
  const segFiles = list.map((_, i) => (multi ? path.join(dir, segmentFileName(i, "mp4")) : outputPath));
  const listPath = path.join(dir, "list.txt");

  // 2. cut every segment the way the server's local-trim path does
  rec.cuts = [];
  for (let i = 0; i < list.length; i++) {
    const args = trimArgs(FIXTURE, list[i], segFiles[i]);
    const r = await runProcess(FFMPEG, args, process.env);
    const ins = inspect(segFiles[i]);
    rec.cuts.push({
      seg: list[i],
      askedSec: +(list[i].end - list[i].start).toFixed(3),
      exit: r.code,
      gotSec: ins.duration,
      driftSec: ins.duration === undefined ? null : +(ins.duration - (list[i].end - list[i].start)).toFixed(3),
      video: ins.video, audio: ins.audio, decodesClean: ins.decodesClean,
      stderrTail: r.code === 0 ? "" : r.stderr.trim().split("\n").slice(-3).join(" | "),
    });
  }

  // 3. the real join (copy first, re-encode fallback) — only for multi,
  //    exactly as server/index.ts does it.
  if (multi) {
    const logLines = [];
    try {
      const join = await joinSegments(
        segFiles, outputPath, listPath, expected,
        { isAudio: false, audioKbps: "192" },
        {
          run: (args) => runProcess(FFMPEG, args, process.env),
          probeDuration: (f) => probeDurationSec(FFMPEG, f),
          log: (m) => { logLines.push(m); },
        },
      );
      rec.join = join;
    } catch (e) {
      rec.join = { threw: true, message: String(e && e.message).slice(0, 400), joinFailed: !!e.joinFailed };
    }
    rec.joinLog = logLines;
    rec.concatList = fs.existsSync(listPath) ? fs.readFileSync(listPath, "utf8") : null;
  } else {
    rec.join = { method: "none (single segment writes straight to clip.mp4)" };
  }

  // 4. assert the output
  const out = inspect(outputPath);
  rec.output = out;
  if (out.exists && out.duration !== undefined) {
    rec.actualSec = +out.duration.toFixed(3);
    rec.errorSec = +(out.duration - expected).toFixed(3);
    rec.PASS = Math.abs(rec.errorSec) <= 0.5 && out.decodesClean && !!out.video && !!out.audio;
  } else {
    rec.PASS = false;
  }

  log(`\n## ${name}`);
  log(`  request      : ${JSON.stringify(segs)}`);
  log(`  sections     : ${rec.sectionArgs.join(" ")}`);
  log(`  expected     : ${expected.toFixed(3)}s`);
  rec.cuts.forEach((c, i) =>
    log(`  cut ${i + 1}        : asked ${c.askedSec}s -> got ${c.gotSec}s (drift ${c.driftSec}s) exit=${c.exit} ${c.decodesClean ? "" : "DECODE-DIRTY"}`));
  if (multi) log(`  join         : ${rec.join.method} durationOk=${rec.join.durationOk} reason=${rec.join.reason || "-"}`);
  log(`  OUTPUT       : ${rec.actualSec}s  (error ${rec.errorSec}s)  v=${out.video} a=${out.audio} decodes=${out.decodesClean}`);
  log(`  server reads : ${out.serverDuration}s`);
  log(`  VERDICT      : ${rec.PASS ? "pass" : "FAIL"}`);
  results.push(rec);
  return rec;
}

(async () => {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  log(`fixture: ${FIXTURE}`);
  log(`ffmpeg : ${FFMPEG}`);
  log(spawnSync(FFMPEG, ["-version"], { encoding: "utf8" }).stdout.split("\n")[0]);
  log(`source : ${JSON.stringify(inspect(FIXTURE), null, 0)}`);

  // one range (keyframe-aligned)
  await runCase("01-one-range-aligned", [{ start: 0, end: 10 }]);
  // one range NOT keyframe aligned
  await runCase("02-one-range-midgop", [{ start: 5, end: 12 }]);
  // two non-adjacent
  await runCase("03-two-nonadjacent", [{ start: 0, end: 5 }, { start: 20, end: 25 }]);
  // three ranges
  await runCase("04-three-ranges", [{ start: 0, end: 4 }, { start: 10, end: 14 }, { start: 20, end: 24 }]);
  // ranges that touch
  await runCase("05-touching", [{ start: 0, end: 10 }, { start: 10, end: 20 }]);
  // ranges that overlap
  await runCase("06-overlapping", [{ start: 0, end: 12 }, { start: 8, end: 20 }]);
  // zero length
  await runCase("07-zero-length", [{ start: 5, end: 5 }]);
  // longer than the source
  await runCase("08-longer-than-source", [{ start: 0, end: 90 }]);
  // starts at 0
  await runCase("09-starts-at-zero", [{ start: 0, end: 7.5 }]);
  // ends exactly at the end
  await runCase("10-ends-at-end", [{ start: 20, end: 30 }]);
  // sub-second boundaries
  await runCase("11-subsecond", [{ start: 1.25, end: 3.75 }]);
  await runCase("12-subsecond-multi", [{ start: 0.5, end: 2.25 }, { start: 10.1, end: 12.35 }]);
  // milli-precision below sectionArg's 2dp rounding
  await runCase("13-below-2dp", [{ start: 1.001, end: 1.009 }]);
  // all-keyframe-aligned multi: the case the copy path is meant to win
  await runCase("14-aligned-multi", [{ start: 0, end: 10 }, { start: 20, end: 30 }]);
  // 20 segments (MAX_SEGMENTS) and 21 (one over)
  await runCase("15-max-segments", Array.from({ length: 20 }, (_, i) => ({ start: i, end: i + 1 })));
  await runCase("16-over-max-segments", Array.from({ length: 21 }, (_, i) => ({ start: i, end: i + 1 })));
  // negative / NaN / Infinity
  await runCase("17-negative-start", [{ start: -5, end: 5 }]);
  await runCase("18-infinity", [{ start: 0, end: Infinity }]);
  await runCase("19-reversed", [{ start: 10, end: 2 }]);
  // over the 600s cap
  await runCase("20-over-cap", [{ start: 0, end: 601 }]);

  fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify(results, null, 2));
  const fails = results.filter((r) => r.resolveSegments.ok && !r.PASS);
  log(`\n\n===== SUMMARY =====`);
  for (const r of results) {
    if (!r.resolveSegments.ok) { log(`  ${r.name}: rejected by validator -> "${r.resolveSegments.error}"`); continue; }
    log(`  ${r.name}: expected ${r.expectedSec}s actual ${r.actualSec}s err ${r.errorSec}s join=${r.join.method} ${r.PASS ? "pass" : "FAIL"}`);
  }
  log(`\n${fails.length} failing case(s) of ${results.filter((r) => r.resolveSegments.ok).length} accepted`);
  log(`results: ${path.join(OUT, "results.json")}`);
})();
