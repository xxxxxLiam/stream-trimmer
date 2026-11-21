/**
 * File: g11b-partials.cjs
 * Path: audit/run-2/area-G/g11b-partials.cjs
 * Description: Where a dropped download's `.part` file lands under the new
 * two-folder split, and whether it survives the failure the server tells the
 * user it survived. One range versus several, because the output path differs:
 * a single segment is written straight to the per-request clip folder, several
 * go to the shared keyed folder.
 *
 * For each shape: the `.part` on disk DURING the run, the folders left after
 * the failure, what the response promised, and whether the next attempt says
 * "resuming with N cached byte(s)".
 */
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const G = require("./glib.cjs");

const body = (segments) => ({
  url: G.YT_URL,
  quality: "360",
  format: "mp4",
  deliver: "path",
  segments,
});

function scan(root) {
  const rows = [];
  for (const f of fs.readdirSync(root).filter((n) => n.startsWith("ytclip-"))) {
    const dir = path.join(root, f);
    let files = [];
    try {
      files = fs.readdirSync(dir).map((n) => `${n}:${fs.statSync(path.join(dir, n)).size}`);
    } catch {
      /* gone */
    }
    rows.push({ folder: f, perJob: /-[0-9a-f]{10}$/.test(f), files });
  }
  return rows;
}

async function shape(label, segments, cfg) {
  const s = await G.startServer({ label: `part-${label}`, cfg });
  const row = { label, segments: segments.length };
  const p = s.post(`/api/download?jobId=job_${label}`, body(segments), {
    timeout: 300_000,
  });
  // catch the .part while the run is still in flight
  let during = null;
  for (let i = 0; i < 100; i++) {
    await G.sleep(150);
    const rows = scan(s.serverTmp);
    if (rows.some((r) => r.files.some((f) => /\.part:/.test(f)))) {
      during = rows;
      break;
    }
  }
  const r = await p;
  row.duringRun = during;
  row.response = {
    status: r.status,
    code: r.json && r.json.code,
    error: (r.json && r.json.error) || null,
    preserved: r.json && r.json.preserved,
    action: r.json && r.json.action,
  };
  row.afterFailure = scan(s.serverTmp);
  row.partialBytesLeft = row.afterFailure
    .flatMap((x) => x.files)
    .filter((f) => /\.(part|ytdl):/.test(f))
    .map((f) => Number(f.split(":").pop()))
    .reduce((a, b) => a + b, 0);
  // the retry
  s.configure({ ...cfg, partialBytes: 0 });
  const retry = await s.post(`/api/download?jobId=job_${label}_retry`, body(segments), {
    timeout: 300_000,
  });
  row.retry = {
    status: retry.status,
    resumeLines: s.log().split("\n").filter((l) => /resuming with/.test(l)),
    durationSec:
      retry.json && retry.json.path && fs.existsSync(retry.json.path)
        ? G.ffprobeDuration(retry.json.path)
        : null,
  };
  await s.stop();
  return row;
}

async function main() {
  const out = { when: new Date().toISOString(), shapes: [] };
  const partial = { duration: 30, partialBytes: 5 * 1024 * 1024, delayMs: 600 };

  out.shapes.push(await shape("single-sectioned", [{ start: 0, end: 4 }], partial));
  out.shapes.push(
    await shape(
      "multi-sectioned",
      [
        { start: 0, end: 4 },
        { start: 10, end: 14 },
      ],
      partial,
    ),
  );
  // the whole-file fallback: the sectioned run 403s first, then the full
  // download drops leaving a .part
  // the whole-file fallback: the sectioned run 403s (no partial), then the
  // full download drops leaving source.mp4.part
  out.shapes.push(
    await shape("single-wholefile", [{ start: 0, end: 4 }], {
      ...partial,
      failSections: true,
      partialOnFull: true,
    }),
  );

  for (const sh of out.shapes) {
    console.log(`\n== ${sh.label} (${sh.segments} range(s))`);
    console.log("  during run :", JSON.stringify(sh.duringRun));
    console.log("  response   :", sh.response.status, sh.response.code, "|", sh.response.preserved);
    console.log("  error      :", (sh.response.error || "").slice(0, 150));
    console.log("  after fail :", JSON.stringify(sh.afterFailure));
    console.log("  partial bytes kept:", sh.partialBytesLeft);
    console.log("  retry      :", sh.retry.status, sh.retry.durationSec, JSON.stringify(sh.retry.resumeLines));
  }
  console.log("\nresults:", G.saveResults("g11b-partials", out));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
