#!/usr/bin/env node
/**
 * G area, audit-only. Isolates the RE-ENCODE FALLBACK of the join.
 *
 * Same segment files, two joins: production concatCopyArgs vs production
 * concatReencodeArgs. If the re-encode path alone loses audio length, the
 * fallback — not the cut — is the defect.
 *
 * Also forces joinSegments down the fallback the way production reaches it
 * (copy produced the wrong length) and reports what it hands back.
 *
 * Run: npx tsx audit/run-1/area-G/g2-reencode.cjs
 */
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const REPO = "/home/user/stream-trimmer";
const FFMPEG = path.join(REPO, "resources", "bin", "ffmpeg");
const FIXTURE = path.join(REPO, "audit", "fixtures", "fixture.mp4");
const OUT = path.join(__dirname, "out-g2");
const S = require(path.join(REPO, "server", "segments.ts"));

function dur(file, sel) {
  const r = spawnSync("ffprobe", ["-v", "error",
    ...(sel ? ["-select_streams", sel] : []),
    "-show_entries", sel ? "stream=duration" : "format=duration",
    "-of", "csv=p=0", file], { encoding: "utf8" });
  const n = Number(String(r.stdout).trim().split("\n")[0]);
  return Number.isFinite(n) ? +n.toFixed(3) : undefined;
}
function plays(file) {
  const r = spawnSync(FFMPEG, ["-v", "error", "-xerror", "-i", file, "-f", "null", "-"], { encoding: "utf8" });
  return r.status === 0;
}
function cut(seg, out) {
  // exactly server/index.ts buildSegment's local-trim args
  const r = spawnSync(FFMPEG, ["-y", "-ss", String(seg.start), "-to", String(seg.end),
    "-i", FIXTURE, "-c", "copy", "-movflags", "+faststart", out], { encoding: "utf8" });
  return r.status;
}

async function scenario(name, segs) {
  const dir = path.join(OUT, name);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const files = segs.map((s, i) => {
    const f = path.join(dir, S.segmentFileName(i, "mp4"));
    cut(s, f);
    return f;
  });
  const expected = S.segmentsTotal(segs);
  const piecesSum = files.reduce((t, f) => t + (dur(f) || 0), 0);
  const listPath = path.join(dir, "list.txt");
  fs.writeFileSync(listPath, S.buildConcatList(files), "utf8");

  const out = {};
  for (const method of ["copy", "reencode"]) {
    const o = path.join(dir, `join-${method}.mp4`);
    const args = method === "copy"
      ? S.concatCopyArgs(listPath, o, { isAudio: false })
      : S.concatReencodeArgs(listPath, o, { isAudio: false });
    const r = await S.runProcess(FFMPEG, args, process.env);
    out[method] = {
      exit: r.code,
      total: dur(o), video: dur(o, "v:0"), audio: dur(o, "a:0"),
      plays: plays(o),
    };
    out[method].avGap = (out[method].video !== undefined && out[method].audio !== undefined)
      ? +(out[method].video - out[method].audio).toFixed(3) : null;
    out[method].errVsExpected = out[method].total !== undefined
      ? +(out[method].total - expected).toFixed(3) : null;
  }

  // And what production's joinSegments actually decides, forced down the
  // fallback by telling it the truthful expected length it cannot meet.
  const forced = path.join(dir, "joinSegments-forced.mp4");
  const logLines = [];
  let verdict;
  try {
    verdict = await S.joinSegments(files, forced, path.join(dir, "list2.txt"),
      expected, { isAudio: false },
      { run: (a) => S.runProcess(FFMPEG, a, process.env),
        probeDuration: (f) => S.probeDurationSec(FFMPEG, f),
        log: (m) => logLines.push(m) });
  } catch (e) { verdict = { threw: String(e.message).slice(0, 200) }; }

  console.log(`\n## ${name}`);
  console.log(`  segments      : ${JSON.stringify(segs)}`);
  console.log(`  expected sum  : ${expected.toFixed(3)}s   pieces on disk sum: ${piecesSum.toFixed(3)}s`);
  for (const m of ["copy", "reencode"]) {
    const r = out[m];
    console.log(`  ${m.padEnd(9)}     : total=${r.total}s video=${r.video}s audio=${r.audio}s  A/V gap=${r.avGap}s  err vs expected=${r.errVsExpected}s  exit=${r.exit} plays=${r.plays}`);
  }
  console.log(`  joinSegments  : ${JSON.stringify(verdict)}`);
  console.log(`  join log      : ${logLines.join(" || ")}`);
  return { name, segs, expected, piecesSum: +piecesSum.toFixed(3), out, verdict, logLines };
}

(async () => {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  const all = [];
  // keyframe-aligned: the copy path's happy case. Does the re-encode of the
  // SAME pieces stay correct?
  all.push(await scenario("A-aligned-2x10s", [{ start: 0, end: 10 }, { start: 20, end: 30 }]));
  // three pieces
  all.push(await scenario("B-three-4s", [{ start: 0, end: 4 }, { start: 10, end: 14 }, { start: 20, end: 24 }]));
  // sub-second, the case that reached the fallback for real in g1
  all.push(await scenario("C-subsecond-2", [{ start: 0.5, end: 2.25 }, { start: 10.1, end: 12.35 }]));
  // many short pieces: does cut drift accumulate past the 0.5s tolerance and
  // push a perfectly joinable clip into a needless re-encode?
  all.push(await scenario("D-20x0.5s", Array.from({ length: 20 }, (_, i) => ({ start: i * 1.5, end: i * 1.5 + 0.5 }))));
  all.push(await scenario("E-10x1s-subsecond", Array.from({ length: 10 }, (_, i) => ({ start: i * 2 + 0.25, end: i * 2 + 1.25 }))));
  fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify(all, null, 2));
  console.log(`\nDURATION_TOLERANCE_SEC = ${S.DURATION_TOLERANCE_SEC}`);
  console.log(`results: ${path.join(OUT, "results.json")}`);
})();
