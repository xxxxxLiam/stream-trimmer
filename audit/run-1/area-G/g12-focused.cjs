#!/usr/bin/env node
/**
 * G area, audit-only. Focused re-runs of three things the first pass mistimed
 * or mis-stubbed:
 *   A. /api/cache/clear fired while a job's keyed folder really exists
 *   B. resume into a corrupt cached whole-file source (403 -> local trim)
 *   C. /api/auth/youtube/status after the client hangs up: the kill-on-close is
 *      single-shot, so does the probe loop keep spawning?
 *
 * Run: node audit/run-1/area-G/g12-focused.cjs
 */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execSync, spawnSync } = require("node:child_process");
const S = require("./srv.cjs");

const OUT = path.join(__dirname, "out-g12");
const FFMPEG = path.join(S.REPO, "resources", "bin", "ffmpeg");
const out = {};
const log = (...a) => console.log(...a);
const clipDirs = () => { try { return fs.readdirSync(os.tmpdir()).filter((n) => n.startsWith("ytclip-")); } catch { return []; } };
const nukeCache = () => { for (const d of clipDirs()) fs.rmSync(path.join(os.tmpdir(), d), { recursive: true, force: true }); };
const probeDur = (f) => { const r = spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f], { encoding: "utf8" }); return { exit: r.status, duration: Number(String(r.stdout).trim()) || null, err: (r.stderr || "").trim().split("\n")[0] }; };
const plays = (f) => spawnSync(FFMPEG, ["-v", "error", "-xerror", "-i", f, "-f", "null", "-"], { encoding: "utf8" }).status === 0;
const psMatch = (...needles) => { try { return execSync("ps -eo pid,etimes,args").toString().split("\n").filter((l) => needles.every((n) => l.includes(n)) && !l.includes("ps -eo")); } catch { return []; } };

async function section(name, fn) {
  log(`\n\n=== ${name} ===`);
  try { out[name] = await fn(); } catch (e) { out[name] = { FATAL: String(e.message) }; log("  ERROR", e.message); }
}

(async () => {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  const stub = S.makeStub("g12");
  const STUBBIN = path.join(stub, "resources", "bin", "yt-dlp");
  const base = { info: { id: "stub0000001", title: "Stub", duration: 60 } };
  const DL = (segs) => ({ url: S.YT, deliver: "path", quality: "360", format: "mp4", segments: segs });

  // ---------------------------------------------------------------- A
  await section("A. /api/cache/clear fired while a job's work folder exists", async () => {
    nukeCache();
    S.setStub(stub, { ...base, delayMs: 3000 });
    const s = await S.start({ stub });
    const before = new Set(clipDirs());
    const a = s.open("POST", "/api/download?jobId=job_clear_live", { body: JSON.stringify(DL([{ start: 3, end: 9 }])), headers: { "content-type": "application/json" } });
    // Wait until the keyed folder is really on disk (after the probe).
    let fresh = [];
    const t0 = Date.now();
    while (Date.now() - t0 < 20000 && fresh.length === 0) {
      fresh = clipDirs().filter((d) => !before.has(d));
      await new Promise((r) => setTimeout(r, 80));
    }
    const r = { workFolder: fresh[0] || null };
    r.usageDuring = (await s.req("GET", "/api/cache/usage")).body;
    r.clearResponse = (await s.json("POST", "/api/cache/clear", {})).body;
    r.folderGoneImmediately = fresh[0] ? !fs.existsSync(path.join(os.tmpdir(), fresh[0])) : null;
    const res = await a.wait(120000);
    r.jobStatus = res.status ?? null;
    r.jobBody = (res.body || "").slice(0, 400);
    r.isJson = /application\/json/.test((res.headers || {})["content-type"] || "");
    try { const p = JSON.parse(r.jobBody).path; r.promisedPath = p; r.promisedPathExists = p ? fs.existsSync(p) : null; } catch { /* error body */ }
    log(`  ${JSON.stringify(r, null, 1)}`);
    await s.stop();
    return r;
  });

  // ---------------------------------------------------------------- A2
  await section("A2. clear the cache between the 200 and the client moving the file", async () => {
    nukeCache();
    S.setStub(stub, base);
    const s = await S.start({ stub });
    const res = await s.json("POST", "/api/download?jobId=job_clear_after", DL([{ start: 4, end: 10 }]));
    const p = JSON.parse(res.body || "{}").path;
    const r = { status: res.status, path: p, existsRightAfter200: p ? fs.existsSync(p) : null };
    r.clear = (await s.json("POST", "/api/cache/clear", {})).body;
    r.existsAfterClear = p ? fs.existsSync(p) : null;
    log(`  ${JSON.stringify(r, null, 1)}`);
    log(`  >>> the clip the server told the client to collect was deleted by Clear cache: ${r.existsRightAfter200 === true && r.existsAfterClear === false}`);
    await s.stop();
    return r;
  });

  // ---------------------------------------------------------------- B
  await section("B. resume into a corrupt cached whole-file source", async () => {
    nukeCache();
    S.setStub(stub, base);
    const s = await S.start({ stub });
    // Learn the keyed folder for this exact request.
    const warm = await s.json("POST", "/api/download?jobId=job_b_warm", DL([{ start: 5, end: 11 }]));
    const dir = path.dirname(JSON.parse(warm.body || "{}").path || "");
    const r = { keyedDir: dir };
    fs.rmSync(path.join(dir, "clip.mp4"), { force: true });
    // A finished-looking but truncated whole-file source — what an interrupted
    // download that got renamed leaves behind. findDownloaded() accepts any
    // `source.*` that is not .part/.ytdl, with no validity check.
    const src = path.join(dir, "source.mp4");
    const good = fs.readFileSync(path.join(S.REPO, "audit", "fixtures", "fixture.mp4"));
    fs.writeFileSync(src, good.subarray(0, Math.floor(good.length / 3)));
    r.plantedSource = { bytes: fs.statSync(src).size, probe: probeDur(src), plays: plays(src) };
    // Make only the SECTIONED run 403, so the job takes the whole-file + local
    // trim path and therefore reaches findDownloaded(). --version and the JSON
    // probe still succeed, so the stub stays the resolved binary.
    S.setStub(stub, { ...base, failDownload: 1, failStderr: "ERROR: unable to download video data: HTTP Error 403: Forbidden" });
    const res = await s.json("POST", "/api/download?jobId=job_b_resume", DL([{ start: 5, end: 11 }]));
    r.status = res.status;
    r.body = (res.body || "").slice(0, 600);
    r.isJson = /application\/json/.test(res.contentType || "");
    try {
      const p = JSON.parse(r.body).path;
      if (p && fs.existsSync(p)) r.delivered = { path: p, bytes: fs.statSync(p).size, probe: probeDur(p), plays: plays(p) };
    } catch { /* error body */ }
    r.reachedLocalTrim = /sectioned download failed \(403\)/.test(s.log());
    r.usedTheCorruptSource = /ffmpeg \(trim\)/.test(s.log());
    r.logTail = s.log().split("\n").filter((l) => /403|trim|job_b_resume|no output/.test(l)).slice(-10).map((l) => l.slice(0, 200));
    log(`  ${JSON.stringify(r, null, 1)}`);
    await s.stop();
    return r;
  });

  // ---------------------------------------------------------------- C
  await section("C. auth status: does the probe loop keep spawning after the client leaves?", async () => {
    S.setStub(stub, { ...base, delayMs: 2500 });
    const s = await S.start({ stub });
    const b = s.open("POST", "/api/auth/youtube/status", { body: JSON.stringify({ browser: "chrome" }), headers: { "content-type": "application/json" } });
    await new Promise((r) => setTimeout(r, 1200));
    const samples = [];
    const pids = new Set();
    const take = (tag) => {
      const lines = psMatch(STUBBIN, "--simulate");
      for (const l of lines) pids.add(l.trim().split(/\s+/)[0]);
      samples.push({ tag, live: lines.length, cmd: lines[0] ? lines[0].trim().slice(0, 90) : null });
      log(`  [${tag}] live --simulate children=${lines.length} distinct pids so far=${pids.size}`);
    };
    take("before abort");
    b.abort();
    for (const ms of [400, 1500, 3000, 5000, 7500]) {
      await new Promise((r) => setTimeout(r, ms === 400 ? 400 : 1100));
      take(`+${ms}ms after abort`);
    }
    const r = {
      samples, distinctChildPids: pids.size,
      stillSpawningAfterClientLeft: samples.filter((x) => /after abort/.test(x.tag) && x.live > 0).length,
      probeUrlsTried: (s.log().match(/auth probe \w+ on this target/g) || []).length,
    };
    log(`  ${JSON.stringify({ distinctChildPids: r.distinctChildPids, stillSpawningAfterClientLeft: r.stillSpawningAfterClientLeft, probeUrlsTried: r.probeUrlsTried })}`);
    await s.stop();
    return r;
  });

  // ---------------------------------------------------------------- D
  await section("D. disk_full really does get its own row when the engine says ENOSPC", async () => {
    S.setStub(stub, { ...base, failDownload: 1, failStderr: "ERROR: unable to write data: [Errno 28] No space left on device" });
    const s = await S.start({ stub });
    const res = await s.json("POST", "/api/download", DL([{ start: 0, end: 30 }]));
    const b = JSON.parse(res.body || "{}");
    const r = { status: res.status, code: b.code, action: b.action && b.action.id, cause: b.cause, saysNumbers: /needs about \d+ MB and \d+ MB is free/.test(b.cause || "") };
    log(`  ${JSON.stringify(r, null, 1)}`);
    await s.stop();
    return r;
  });

  fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify(out, null, 2));
  log(`\n\nresults: ${path.join(OUT, "results.json")}`);
  log("SUMMARY-DONE");
})().catch((e) => { console.error("FATAL", e); process.exit(1); });
