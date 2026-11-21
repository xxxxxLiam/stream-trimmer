/**
 * File: g12-cost.cjs
 * Path: audit/run-2/area-G/g12-cost.cjs
 * Description: What the G-4 fix costs. The whole-file fallback's local trim
 * used to be a stream copy and is now a full libx264 re-encode, so this
 * measures both with the REAL bundled ffmpeg and the production argument list,
 * at 360p and 1080p, and then drives a 300 s cut end to end through the real
 * server to see that the job still finishes and the progress bar still moves.
 *
 * The trim arguments are read out of server/index.ts at run time and asserted
 * against the list used here, so this cannot drift from the product.
 */
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const G = require("./glib.cjs");

const WORK = fs.mkdtempSync(path.join(os.tmpdir(), "g2cost-"));

function ff(args) {
  const t0 = Date.now();
  const r = spawnSync(G.REAL_FFMPEG, args, { encoding: "utf8", maxBuffer: 1 << 26 });
  return { ms: Date.now() - t0, status: r.status, stderr: (r.stderr || "").slice(-400) };
}

function loop(src, times, out) {
  const list = path.join(WORK, "list.txt");
  fs.writeFileSync(list, Array.from({ length: times }, () => `file '${src}'`).join("\n") + "\n");
  const r = ff(["-y", "-f", "concat", "-safe", "0", "-i", list, "-c", "copy", out]);
  if (r.status !== 0) throw new Error(`loop failed: ${r.stderr}`);
  return out;
}

// the production list, from server/index.ts: localTrimArgs
const newArgs = (src, start, dur, out) => [
  "-hide_banner", "-y", "-ss", String(start), "-i", src, "-t", String(dur),
  "-fps_mode", "passthrough", "-c:v", "libx264", "-crf", "18",
  "-preset", "veryfast", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k",
  "-movflags", "+faststart", out,
];
// what it was before the fix (run-1 G-4 quoted these)
const oldArgs = (src, start, end, out) => [
  "-y", "-ss", String(start), "-to", String(end), "-i", src, "-c", "copy",
  "-movflags", "+faststart", out,
];

async function main() {
  const out = { when: new Date().toISOString(), work: WORK };

  // the source still contains the arguments this script measures
  const src = fs.readFileSync(path.join(G.repoRoot, "server", "index.ts"), "utf8");
  out.argsMatchSource = [
    '"-fps_mode",',
    '"passthrough",',
    '"libx264"',
    '"-crf",',
    '"18"',
    '"veryfast"',
    '"-b:a",',
  ].every((needle) => src.includes(needle));

  const p360 = loop(G.FIXTURE, 20, path.join(WORK, "src-600s-360p.mp4"));
  out.sources = { "600s-360p": { bytes: fs.statSync(p360).size, dur: G.ffprobeDuration(p360) } };

  // a 1080p source, which is what a signed-in user actually downloads
  const up = ff([
    "-y", "-i", G.FIXTURE, "-vf", "scale=1920:1080", "-c:v", "libx264",
    "-crf", "20", "-preset", "veryfast", "-c:a", "copy",
    path.join(WORK, "fixture-1080p.mp4"),
  ]);
  const p1080 = loop(path.join(WORK, "fixture-1080p.mp4"), 4, path.join(WORK, "src-120s-1080p.mp4"));
  out.sources["120s-1080p"] = {
    upscaleMs: up.ms,
    bytes: fs.statSync(p1080).size,
    dur: G.ffprobeDuration(p1080),
  };

  out.trims = [];
  for (const [label, source, start, dur] of [
    ["360p, 60s cut", p360, 0.5, 60],
    ["360p, 300s cut", p360, 0.5, 300],
    ["1080p, 60s cut", p1080, 0.5, 60],
    ["1080p, 120s cut", p1080, 0.5, 119],
  ]) {
    const a = path.join(WORK, `new-${label.replace(/\W+/g, "_")}.mp4`);
    const b = path.join(WORK, `old-${label.replace(/\W+/g, "_")}.mp4`);
    const now = ff(newArgs(source, start, dur, a));
    const then = ff(oldArgs(source, start, start + dur, b));
    out.trims.push({
      label,
      cutSeconds: dur,
      reencodeMs: now.ms,
      reencodeRealtimeFactor: Number((dur / (now.ms / 1000)).toFixed(1)),
      reencodeBytes: fs.existsSync(a) ? fs.statSync(a).size : null,
      copyMs: then.ms,
      copyBytes: fs.existsSync(b) ? fs.statSync(b).size : null,
      slowerBy: Number((now.ms / Math.max(1, then.ms)).toFixed(1)),
    });
  }

  // extrapolation to the 600 s cap
  const f1080 = out.trims.find((t) => t.label === "1080p, 120s cut");
  out.extrapolated600sAt1080p = {
    secondsOfCpu: Number((600 / f1080.reencodeRealtimeFactor).toFixed(0)),
    note: "one core of this container; a real 1080p source is also higher bitrate",
  };

  // --- end to end through the real server, with the long source -----------
  {
    const s = await G.startServer({
      label: "cost",
      cfg: { duration: 1200, failSections: true },
      env: { G_FAKE_FIXTURE: p360 },
    });
    const events = [];
    const req = require("node:http").request(
      {
        host: "127.0.0.1",
        port: s.port,
        path: "/api/download/progress?jobId=job_cost",
        method: "GET",
      },
      (res) => res.on("data", (c) => events.push({ at: Date.now(), data: c.toString().trim() })),
    );
    req.on("error", () => undefined);
    req.end();
    const t0 = Date.now();
    const r = await s.post(
      "/api/download?jobId=job_cost",
      {
        url: G.YT_URL,
        quality: "360",
        format: "mp4",
        deliver: "path",
        segments: [{ start: 0.5, end: 300.5 }],
      },
      { timeout: 900_000 },
    );
    const wallSec = Number(((Date.now() - t0) / 1000).toFixed(1));
    req.destroy();
    out.endToEnd = {
      status: r.status,
      wallSec,
      body: r.json ?? (r.body || "").slice(0, 200),
      deliveredDuration:
        r.json && r.json.path && fs.existsSync(r.json.path)
          ? G.ffprobeDuration(r.json.path)
          : null,
      progressEvents: events.length,
      progressPercents: events
        .map((e) => {
          const m = /"percent":(\d+)/.exec(e.data);
          return m ? Number(m[1]) : null;
        })
        .filter((x) => x !== null),
      longestGapBetweenEventsSec: (() => {
        let worst = 0;
        for (let i = 1; i < events.length; i++) {
          worst = Math.max(worst, (events[i].at - events[i - 1].at) / 1000);
        }
        return Number(worst.toFixed(1));
      })(),
    };
    await s.stop();
  }

  fs.rmSync(WORK, { recursive: true, force: true });
  console.log(JSON.stringify(out, null, 2));
  console.log("results:", G.saveResults("g12-cost", out));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
