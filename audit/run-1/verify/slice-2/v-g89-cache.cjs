/**
 * slice-2 verification of G-8 (clear cache destroys a handed-over clip and a
 * live job's folder) and G-9 (a damaged cached source permanently breaks that
 * clip, and the user-facing error is ffmpeg's version banner).
 *
 * Written from the findings' Steps. Each section starts a fresh server with a
 * PRIVATE TMPDIR, so "removed: N" counts only this run's folders and no other
 * helper's work is touched — and so the result cannot be an artefact of other
 * `ytclip-*` folders lying around /tmp.
 *
 * Usage: node audit/run-1/verify/slice-2/v-g89-cache.cjs [tag]
 */
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { makeStubRoot, writeStubCfg, startServer, post } = require("./vlib.cjs");

const TAG = process.argv[2] || "a";
const OUT = path.join(__dirname, "out", `g89-${TAG}`);
const URL = "https://www.youtube.com/watch?v=stub0000001";
const FFPROBE = "/usr/bin/ffprobe";

const snap = (f) => {
  try {
    const st = fs.statSync(f);
    return {
      exists: true,
      ino: st.ino,
      size: st.size,
      sha256: crypto.createHash("sha256").update(fs.readFileSync(f)).digest("hex").slice(0, 16),
    };
  } catch (e) {
    return { exists: false, why: String(e.code || e.message) };
  }
};
const get = async (base, route) => {
  const r = await fetch(base + route);
  return { status: r.status, body: await r.text() };
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function env(tmp) {
  fs.mkdirSync(tmp, { recursive: true });
  return { TMPDIR: tmp, TMP: tmp, TEMP: tmp };
}

/** A2: clear cache right after the 200 that handed the path over. */
async function sectionHandedOverClip(port) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `v-g8-h-${TAG}-`));
  const tmp = path.join(root, "tmp");
  const stub = path.join(root, "stub");
  fs.mkdirSync(stub, { recursive: true });
  makeStubRoot(stub, {});
  const srv = await startServer(stub, port, env(tmp));
  const res = await post(srv.base, "/api/download?jobId=job_v_handoff", {
    url: URL, quality: "360", format: "mp4", deliver: "path",
    segments: [{ start: 1, end: 5 }],
  });
  const p = res.json && res.json.path;
  const before = p ? snap(p) : null;
  const usage = await get(srv.base, "/api/cache/usage");
  const clear = await post(srv.base, "/api/cache/clear", {});
  const after = p ? snap(p) : null;
  const usageAfter = await get(srv.base, "/api/cache/usage");
  await srv.stop();
  return {
    section: "G-8 A2: the clip the 200 just handed over",
    privateTmp: tmp,
    response: { status: res.status, body: res.json },
    clipPathInsideTmpdir: p ? p.startsWith(tmp) : null,
    existsRightAfter200: before,
    cacheUsageBefore: usage.body,
    clearResponse: clear.json,
    existsAfterClear: after,
    cacheUsageAfter: usageAfter.body,
    clipDestroyed: !!(before && before.exists && after && !after.exists),
  };
}

/** A: clear cache while a job is writing into its work folder. */
async function sectionLiveJob(port) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `v-g8-l-${TAG}-`));
  const tmp = path.join(root, "tmp");
  const stub = path.join(root, "stub");
  fs.mkdirSync(stub, { recursive: true });
  makeStubRoot(stub, { delayMs: 6000 });
  const srv = await startServer(stub, port, env(tmp));
  const pending = post(srv.base, "/api/download?jobId=job_v_live", {
    url: URL, quality: "360", format: "mp4", deliver: "path",
    segments: [{ start: 1, end: 5 }],
  });
  // wait for the work folder to appear
  let folder = null;
  for (let i = 0; i < 80 && !folder; i++) {
    await sleep(200);
    try {
      folder = fs.readdirSync(tmp).find((f) => f.startsWith("ytclip-")) || null;
    } catch {}
  }
  const folderPath = folder ? path.join(tmp, folder) : null;
  const contentsBefore = folderPath ? fs.readdirSync(folderPath) : null;
  const clear = await post(srv.base, "/api/cache/clear", {});
  const goneImmediately = folderPath ? !fs.existsSync(folderPath) : null;
  const res = await pending;
  const afterJob = {
    folderExists: folderPath ? fs.existsSync(folderPath) : null,
    clipExists: res.json && res.json.path ? fs.existsSync(res.json.path) : null,
  };
  await srv.stop();
  return {
    section: "G-8 A: a live job's work folder",
    privateTmp: tmp,
    workFolder: folder,
    contentsBefore,
    clearResponse: clear.json,
    folderGoneImmediately: goneImmediately,
    jobResponse: { status: res.status, body: res.json || res.text.slice(0, 300) },
    afterJob,
  };
}

/**
 * A3, mine not the original's: clear the cache once a MULTI-segment job has
 * already written a finished segment into its folder. This is the case where
 * "destroys a running job's work folder" would actually cost the user
 * something, so it decides whether the live-job half is harmful or benign.
 */
async function sectionLiveMultiSegment(port) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `v-g8-m-${TAG}-`));
  const tmp = path.join(root, "tmp");
  const stub = path.join(root, "stub");
  fs.mkdirSync(stub, { recursive: true });
  makeStubRoot(stub, { delayMs: 2500 });
  const srv = await startServer(stub, port, env(tmp));
  const pending = post(srv.base, "/api/download?jobId=job_v_live_multi", {
    url: URL, quality: "360", format: "mp4", deliver: "path",
    segments: [{ start: 0, end: 5 }, { start: 10, end: 15 }, { start: 20, end: 25 }],
  });
  let folderPath = null;
  let sawSegment = null;
  for (let i = 0; i < 150; i++) {
    await sleep(200);
    try {
      const f = fs.readdirSync(tmp).find((x) => x.startsWith("ytclip-"));
      if (f) {
        folderPath = path.join(tmp, f);
        const inside = fs.readdirSync(folderPath);
        const done = inside.filter((n) => /^seg-\d+\.mp4$/.test(n));
        if (done.length >= 1) {
          sawSegment = inside;
          break;
        }
      }
    } catch {}
  }
  const clear = await post(srv.base, "/api/cache/clear", {});
  const goneImmediately = folderPath ? !fs.existsSync(folderPath) : null;
  const res = await pending;
  const delivered = res.json && res.json.path && fs.existsSync(res.json.path)
    ? spawnSync(FFPROBE, ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", res.json.path], { encoding: "utf8" }).stdout.trim()
    : null;
  const joinLines = srv.lines.filter((l) => /join:|joined clip is|ENOENT|No such file/.test(l));
  await srv.stop();
  return {
    section: "G-8 A3: clear while a 3-segment job has a finished segment on disk",
    privateTmp: tmp,
    workFolder: folderPath,
    contentsWhenCleared: sawSegment,
    clearResponse: clear.json,
    folderGoneImmediately: goneImmediately,
    jobResponse: { status: res.status, body: res.json || res.text.slice(0, 400) },
    deliveredDurationSec: delivered,
    expectedSec: 15,
    serverLines: joinLines,
  };
}

/** G-18-adjacent control: does clear only touch this app's folders? */
async function sectionDecoy(port) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `v-g8-d-${TAG}-`));
  const tmp = path.join(root, "tmp");
  const stub = path.join(root, "stub");
  fs.mkdirSync(stub, { recursive: true });
  makeStubRoot(stub, {});
  const srv = await startServer(stub, port, env(tmp));
  const decoy = path.join(tmp, "ytclip-NOT-OURS-0000");
  fs.mkdirSync(decoy, { recursive: true });
  fs.writeFileSync(path.join(decoy, "someone-elses-file"), "x".repeat(1024));
  const unrelated = path.join(tmp, "something-else");
  fs.mkdirSync(unrelated, { recursive: true });
  fs.writeFileSync(path.join(unrelated, "keep"), "y");
  const usage = await get(srv.base, "/api/cache/usage");
  const clear = await post(srv.base, "/api/cache/clear", {});
  const out = {
    section: "control: a foreign ytclip-* folder",
    usageWithDecoy: usage.body,
    clearResponse: clear.json,
    decoyStillExists: fs.existsSync(decoy),
    unrelatedFolderStillExists: fs.existsSync(unrelated),
  };
  await srv.stop();
  return out;
}

/** G-9: a damaged source.mp4 in the keyed folder. */
async function sectionPoisoned(port) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `v-g9-${TAG}-`));
  const tmp = path.join(root, "tmp");
  const stub = path.join(root, "stub");
  fs.mkdirSync(stub, { recursive: true });
  makeStubRoot(stub, { failSectioned: true, argvLog: true });
  const srv = await startServer(stub, port, env(tmp));
  const body = {
    url: URL, quality: "360", format: "mp4", deliver: "path",
    segments: [{ start: 2, end: 6 }],
  };
  // 1. a good run, to learn the keyed folder
  const first = await post(srv.base, "/api/download?jobId=job_v_p1", body);
  const folder = first.json && first.json.path ? path.dirname(first.json.path) : null;

  // 2. plant the shape an interrupted whole-file download leaves behind
  const fixture = path.join(stub, "fixture.mp4");
  const whole = fs.readFileSync(fixture);
  const truncated = whole.subarray(0, Math.floor(whole.length / 3));
  fs.rmSync(path.join(folder, "clip.mp4"), { force: true });
  fs.writeFileSync(path.join(folder, "source.mp4"), truncated);
  const probeOfPlanted = spawnSync(FFPROBE, ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path.join(folder, "source.mp4")], { encoding: "utf8" });

  // 3. ask for the same clip three times
  const attempts = [];
  for (let i = 1; i <= 3; i++) {
    const r = await post(srv.base, `/api/download?jobId=job_v_p_retry${i}`, body);
    attempts.push({
      attempt: i,
      status: r.status,
      body: r.json || r.text.slice(0, 400),
      filesLeft: fs.existsSync(folder) ? fs.readdirSync(folder) : "<folder gone>",
    });
  }
  // 4. does Clear cache unstick it?
  const clear = await post(srv.base, "/api/cache/clear", {});
  const afterClear = await post(srv.base, "/api/download?jobId=job_v_p_afterclear", body);
  const serverLines = srv.lines.slice(-40);
  await srv.stop();
  return {
    section: "G-9: damaged cached source",
    privateTmp: tmp,
    firstRun: { status: first.status, body: first.json },
    keyedFolder: folder,
    plantedSourceBytes: truncated.length,
    plantedProbe: { status: probeOfPlanted.status, stderr: (probeOfPlanted.stderr || "").trim().split("\n")[0] },
    attempts,
    identicalEveryTime:
      attempts.length === 3 &&
      JSON.stringify(attempts[0].body) === JSON.stringify(attempts[1].body) &&
      JSON.stringify(attempts[1].body) === JSON.stringify(attempts[2].body),
    errorLooksLikeFfmpegBanner: attempts.some(
      (a) => a.body && typeof a.body === "object" && /libav|ffmpeg version|built with|configuration:/i.test(JSON.stringify(a.body)),
    ),
    actionOffered: attempts[0] && attempts[0].body && attempts[0].body.action,
    errorMentionsCacheOrDamaged: attempts.some(
      (a) => a.body && /cache|damaged|corrupt/i.test(JSON.stringify(a.body)),
    ),
    clearResponse: clear.json,
    afterClear: { status: afterClear.status, body: afterClear.json },
    serverTail: serverLines,
  };
}

(async () => {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  const out = [];
  out.push(await sectionHandedOverClip(0));
  out.push(await sectionLiveJob(0));
  out.push(await sectionLiveMultiSegment(0));
  out.push(await sectionDecoy(0));
  out.push(await sectionPoisoned(0));
  fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
  writeStubCfg;
})().catch((e) => {
  console.error("FAILED", e);
  process.exit(1);
});
