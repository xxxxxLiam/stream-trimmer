/**
 * slice-2 verification of G-6 ("a joined clip the server knows is the wrong
 * length is delivered as a plain success"), and an end-to-end check of G-4
 * through the real server rather than through the pipeline modules.
 *
 * Case R (realistic): the stub 403s the sectioned download, so the server takes
 *   the whole-file + local-trim path with REAL ffmpeg. Two sub-second ranges,
 *   4.00 s marked. Everything in the cut and the join is production code.
 * Case S (the original author's shape): the sectioned download "succeeds" and
 *   the stub writes the whole 30 s fixture per segment, so the overshoot is
 *   huge. Kept only to see whether the response differs; the 6x number itself
 *   is a stub artefact.
 *
 * Usage: node audit/run-1/verify/slice-2/v-g6-duration.cjs [tag]
 */
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { makeStubRoot, writeStubCfg, startServer, post } = require("./vlib.cjs");

const TAG = process.argv[2] || "a";
const OUT = path.join(__dirname, "out", `g6-${TAG}`);
const FFPROBE = "/usr/bin/ffprobe";
const URL = "https://www.youtube.com/watch?v=stub0000001";

function probe(file) {
  const d = spawnSync(FFPROBE, ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file], { encoding: "utf8" });
  const f = spawnSync(FFPROBE, ["-v", "error", "-select_streams", "v:0", "-count_frames", "-show_entries", "stream=nb_read_frames", "-of", "csv=p=0", file], { encoding: "utf8" });
  return { duration: (d.stdout || "").trim(), frames: (f.stdout || "").trim() };
}

async function run(label, stubCfg, segments, expectedSec, port) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `v-g6-${label}-`));
  makeStubRoot(root, stubCfg);
  const srv = await startServer(root, port);
  const res = await post(srv.base, `/api/download?jobId=job_v_${label}_${Date.now()}`, {
    url: URL,
    quality: "360",
    format: "mp4",
    deliver: "path",
    segments,
  });
  const delivered = res.json && res.json.path && fs.existsSync(res.json.path) ? probe(res.json.path) : null;
  const joinLines = srv.lines.filter((l) => /join:|joined clip is|STILL OFF/.test(l));
  if (res.json && res.json.path && fs.existsSync(res.json.path)) {
    fs.mkdirSync(OUT, { recursive: true });
    fs.copyFileSync(res.json.path, path.join(OUT, `${label}-delivered.mp4`));
  }
  await srv.stop();
  const xHeaders = Object.fromEntries(
    Object.entries(res.headers).filter(([k]) => k.toLowerCase().startsWith("x-")),
  );
  return {
    label,
    expectedSec,
    requestSegments: segments,
    status: res.status,
    body: res.json,
    bodyHasWarningField: !!(res.json && res.json.warning),
    bodyKeys: res.json ? Object.keys(res.json) : null,
    xHeaders,
    anyDurationHeader: Object.keys(xHeaders).some((k) => /dur/i.test(k)),
    deliveredProbe: delivered,
    deliveredSec: delivered ? Number(delivered.duration) : null,
    overshootSec: delivered ? +(Number(delivered.duration) - expectedSec).toFixed(3) : null,
    serverJoinLines: joinLines,
    serverSaidStillOff: joinLines.some((l) => /STILL OFF|even after/.test(l)),
    tookLocalTrimPath: srv.lines.some((l) => /retrying with full download \+ local trim/.test(l)),
  };
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const results = [];
  results.push(
    await run(
      "R-realistic-localtrim",
      { failSectioned: true, argvLog: true },
      [
        { start: 0.5, end: 2.25 },
        { start: 10.1, end: 12.35 },
      ],
      4.0,
      0,
    ),
  );
  results.push(
    await run(
      "S-stub-whole-fixture",
      { argvLog: true },
      [
        { start: 0, end: 5 },
        { start: 5, end: 10 },
        { start: 10, end: 15 },
      ],
      15.0,
      0,
    ),
  );
  // control: keyframe-aligned marks on the same local-trim path
  results.push(
    await run(
      "C-control-keyframe-aligned",
      { failSectioned: true, argvLog: true },
      [
        { start: 0, end: 10 },
        { start: 10, end: 20 },
      ],
      20.0,
      0,
    ),
  );
  fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify(results, null, 2));
  for (const r of results) {
    console.log("=".repeat(70));
    console.log(r.label, "status", r.status, "localTrimPath", r.tookLocalTrimPath);
    console.log("  body:", JSON.stringify(r.body));
    console.log("  bodyHasWarningField:", r.bodyHasWarningField, " anyDurationHeader:", r.anyDurationHeader);
    console.log("  x-headers:", JSON.stringify(r.xHeaders));
    console.log("  expected", r.expectedSec, "delivered", r.deliveredSec, "frames", r.deliveredProbe && r.deliveredProbe.frames, "overshoot", r.overshootSec);
    console.log("  server join lines:");
    for (const l of r.serverJoinLines) console.log("   ", l);
  }
  writeStubCfg;
})();
