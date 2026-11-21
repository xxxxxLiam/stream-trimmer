/**
 * File: g8b-damaged.cjs
 * Path: audit/run-2/area-G/g8b-damaged.cjs
 * Description: Run-1 G-9 re-verified. The shared keyed folder name is derived
 * here the way server/resumeCache.ts derives it (sha1 of the key parts,
 * NUL-joined, first 16 hex), so a truncated source.mp4 can be planted in the
 * folder the next job will actually use.
 */
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const G = require("./glib.cjs");

const body = (segments, extra = {}) => ({
  url: G.YT_URL,
  quality: "360",
  format: "mp4",
  deliver: "path",
  segments,
  ...extra,
});

function keyedFolder(tmpRoot, parts) {
  const hash = crypto
    .createHash("sha1")
    .update(parts.map(String).join("\u0000"))
    .digest("hex")
    .slice(0, 16);
  return path.join(tmpRoot, `ytclip-${hash}`);
}

async function main() {
  const out = { when: new Date().toISOString() };
  const s = await G.startServer({
    label: "damaged",
    cfg: { duration: 30, failSections: true },
  });

  const seg = { start: 0, end: 4 };
  const dir = keyedFolder(s.serverTmp, [
    G.YT_URL,
    "mp4",
    "360",
    seg.start.toFixed(2),
    seg.end.toFixed(2),
  ]);
  fs.mkdirSync(dir, { recursive: true });
  const planted = path.join(dir, "source.mp4");
  fs.writeFileSync(planted, fs.readFileSync(G.FIXTURE).subarray(0, 327152));
  out.planted = {
    dir,
    bytes: fs.statSync(planted).size,
    readableMedia: G.ffprobeDuration(planted) ?? null,
  };

  out.attempts = [];
  for (let i = 1; i <= 3; i++) {
    const r = await s.post(`/api/download?jobId=job_dmg${i}`, body([seg]), {
      timeout: 300_000,
    });
    out.attempts.push({
      status: r.status,
      error: (r.json && r.json.error) || (r.body || "").slice(0, 200),
      code: r.json && r.json.code,
      action: r.json && r.json.action,
      mentionsDamaged: /damag/i.test(JSON.stringify(r.json || r.body)),
      hasFfmpegBanner: /libav(format|device|codec|util)/i.test(
        JSON.stringify(r.json || r.body),
      ),
      clipDuration:
        r.json && r.json.path && fs.existsSync(r.json.path)
          ? G.ffprobeDuration(r.json.path)
          : null,
      plantedStillThere: fs.existsSync(planted)
        ? fs.statSync(planted).size
        : false,
      filesInKeyed: fs.existsSync(dir) ? fs.readdirSync(dir) : null,
    });
  }

  // and now: every fetch comes back damaged
  s.configure({ duration: 30, failSections: true, corruptSource: true });
  const bad = await s.post("/api/download?jobId=job_dmg_always", body([seg]), {
    timeout: 300_000,
  });
  out.alwaysDamaged = {
    status: bad.status,
    error: (bad.json && bad.json.error) || (bad.body || "").slice(0, 300),
    code: bad.json && bad.json.code,
    action: bad.json && bad.json.action,
    mentionsDamaged: /damag/i.test(JSON.stringify(bad.json || bad.body)),
    hasFfmpegBanner: /libav/i.test(JSON.stringify(bad.json || bad.body)),
    filesLeft: s.workFolders().map((f) => ({
      f,
      files: fs.readdirSync(path.join(s.serverTmp, f)),
    })),
    engineRuns: s.pids().length,
  };

  out.log = s
    .log()
    .split("\n")
    .filter((l) => /readable media|damaged|discard|hide_banner/i.test(l));
  await s.stop();
  console.log(JSON.stringify(out, null, 2));
  console.log("results:", G.saveResults("g8b-damaged", out));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
