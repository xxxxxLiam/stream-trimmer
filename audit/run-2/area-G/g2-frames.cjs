/**
 * File: g2-frames.cjs
 * Path: audit/run-2/area-G/g2-frames.cjs
 * Description: Re-measures run-1 G-4 (footage from before the in-point) and
 * G-6 (a clip the server knows is the wrong length) end to end through the
 * REAL server with REAL ffmpeg, and identifies every delivered frame against
 * all 750 frames of audit/fixtures/fixture.mp4.
 *
 * Cases:
 *   A  the run-1 reproduction: [0.50-2.25] + [10.10-12.35] = 4.00s, on the
 *      whole-file + local-trim path (the fake 403s the sectioned download, as
 *      a real 403 does), which is the path the fix changed.
 *   B  keyframe-aligned control [0-10] + [10-20].
 *   C  a single sub-second range (no join at all).
 *   D  the same marks with the sectioned path emulating real yt-dlp
 *      --force-keyframes-at-cuts, for the path the fix did NOT touch.
 *   E  twenty 1 s ranges on the local-trim path — the stress case for the new
 *      "a join that misses the expected length fails the job" rule.
 *   F  ten 0.4 s ranges, same question with shorter pieces.
 */
const fs = require("node:fs");
const path = require("node:path");
const G = require("./glib.cjs");
const F = require("./gframes.cjs");

const OUT = path.join(G.AREA, "out", "g2-media");

async function runCase(s, label, segments, cfg, opts = {}) {
  s.configure(cfg);
  const started = Date.now();
  const r = await s.post(
    `/api/download?jobId=job_${label}`,
    {
      url: G.YT_URL,
      quality: "360",
      format: "mp4",
      deliver: "path",
      segments,
    },
    { timeout: 600_000 },
  );
  const elapsedSec = Number(((Date.now() - started) / 1000).toFixed(1));
  const row = {
    label,
    segments,
    marked: Number(segments.reduce((a, b) => a + (b.end - b.start), 0).toFixed(3)),
    elapsedSec,
    status: r.status,
    body: r.json ?? (r.body || "").slice(0, 400),
    headers: Object.fromEntries(
      Object.entries(r.headers || {}).filter(([k]) => k.startsWith("x-")),
    ),
  };
  if (r.status === 200 && r.json && r.json.path && fs.existsSync(r.json.path)) {
    const kept = path.join(OUT, `${label}.mp4`);
    fs.mkdirSync(OUT, { recursive: true });
    fs.copyFileSync(r.json.path, kept);
    row.deliveredDurationSec = G.ffprobeDuration(kept);
    row.sizeOnDisk = fs.statSync(kept).size;
    row.sizeMatchesBody = row.sizeOnDisk === r.json.size;
    if (!opts.skipFrames) {
      const v = F.verdict(G.REAL_FFMPEG, G.FIXTURE, kept, segments);
      const times = v.sourceTimesInOrder;
      delete v.sourceTimesInOrder;
      row.frames = v;
      row.firstTenSourceTimes = times.slice(0, 10);
    }
    row.keptAt = kept;
  }
  row.joinLogLines = s
    .log()
    .split("\n")
    .filter((l) => l.includes(`job=job_${label}`) && /join|damaged|discard/.test(l));
  return row;
}

async function main() {
  const out = { when: new Date().toISOString(), cases: [] };
  const s = await G.startServer({ label: "frames", cfg: { duration: 30 } });

  // A — the run-1 reproduction, local-trim path
  out.cases.push(
    await runCase(
      s,
      "A-subsecond-multi-localtrim",
      [
        { start: 0.5, end: 2.25 },
        { start: 10.1, end: 12.35 },
      ],
      { duration: 30, failSections: true },
    ),
  );

  // B — keyframe-aligned control
  out.cases.push(
    await runCase(
      s,
      "B-aligned-control",
      [
        { start: 0, end: 10 },
        { start: 10, end: 20 },
      ],
      { duration: 30, failSections: true },
    ),
  );

  // C — one sub-second range, no join
  out.cases.push(
    await runCase(s, "C-single-subsecond", [{ start: 0.5, end: 2.25 }], {
      duration: 30,
      failSections: true,
    }),
  );

  // D — the sectioned path, with the fake cutting accurately the way real
  // yt-dlp with --force-keyframes-at-cuts is documented to.
  out.cases.push(
    await runCase(
      s,
      "D-sectioned-emulated",
      [
        { start: 0.5, end: 2.25 },
        { start: 10.1, end: 12.35 },
      ],
      { duration: 30, cutSections: true },
    ),
  );

  // E — twenty 1 s ranges on the local-trim path
  const twenty = Array.from({ length: 20 }, (_, i) => ({
    start: i * 1.4 + 0.3,
    end: i * 1.4 + 1.3,
  }));
  out.cases.push(
    await runCase(s, "E-20x1s-localtrim", twenty, {
      duration: 30,
      failSections: true,
    }, { skipFrames: true }),
  );

  // F — ten 0.4 s ranges
  const ten = Array.from({ length: 10 }, (_, i) => ({
    start: i * 2 + 0.3,
    end: i * 2 + 0.7,
  }));
  out.cases.push(
    await runCase(s, "F-10x0.4s-localtrim", ten, {
      duration: 30,
      failSections: true,
    }, { skipFrames: true }),
  );

  out.serverLog = s.log().split("\n").filter((l) => /join|trim|403|damaged/.test(l));
  await s.stop();

  for (const c of out.cases) {
    console.log(
      `\n== ${c.label}  marked=${c.marked}s  status=${c.status}  delivered=${c.deliveredDurationSec ?? "-"}s  join=${(c.body && c.body.joinMethod) || "-"}  ${c.elapsedSec}s`,
    );
    if (c.frames) {
      console.log(
        `   frames=${c.frames.deliveredFrames} inside=${c.frames.framesInsideMarkedRanges} before=${c.frames.framesBeforeAnInPoint} after=${c.frames.framesAfterAnOutPoint} first=${c.frames.firstDeliveredSourceFrameSec}s last=${c.frames.lastDeliveredSourceFrameSec}s worstDist=${c.frames.worstDistance} margin=${c.frames.minMargin}`,
      );
      if (c.frames.framesBeforeAnInPoint)
        console.log(`   before-in-point at: ${c.frames.framesBeforeAnInPointAt.join(" ")}`);
      if (c.frames.framesAfterAnOutPoint)
        console.log(`   after-out-point at: ${c.frames.framesAfterAnOutPointAt.join(" ")}`);
    }
    if (c.status !== 200) console.log(`   body: ${JSON.stringify(c.body).slice(0, 300)}`);
    for (const l of c.joinLogLines) console.log(`   log: ${l.trim()}`);
  }
  console.log("\nresults:", G.saveResults("g2-frames", out));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
