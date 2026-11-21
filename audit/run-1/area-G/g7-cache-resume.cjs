#!/usr/bin/env node
/**
 * G area, audit-only. Temp cache (usage / clear) and resume of a partial
 * download. Also: does clearing the cache delete a file a running job needs,
 * and can a resume ever continue into a CORRUPT file?
 *
 * Run: node audit/run-1/area-G/g7-cache-resume.cjs
 */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execSync, spawnSync } = require("node:child_process");
const S = require("./srv.cjs");

const OUT = path.join(__dirname, "out-g7");
const FFMPEG = path.join(S.REPO, "resources", "bin", "ffmpeg");
const out = {};
const log = (...a) => console.log(...a);
const clipDirs = () => fs.readdirSync(os.tmpdir()).filter((n) => n.startsWith("ytclip-") || n.startsWith("ytchan-"));
const nukeCache = () => { for (const d of clipDirs()) fs.rmSync(path.join(os.tmpdir(), d), { recursive: true, force: true }); };
const probe = (f) => {
  const r = spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f], { encoding: "utf8" });
  return { exit: r.status, duration: Number(String(r.stdout).trim()) || null, err: (r.stderr || "").trim().split("\n")[0] };
};
const plays = (f) => spawnSync(FFMPEG, ["-v", "error", "-xerror", "-i", f, "-f", "null", "-"], { encoding: "utf8" }).status === 0;

async function section(name, fn) {
  log(`\n\n=== ${name} ===`);
  try { out[name] = await fn(); } catch (e) { out[name] = { FATAL: String(e.message) }; log("  ERROR", e.message, e.stack); }
}

const DL = (segs, extra = {}) => ({ url: S.YT, deliver: "path", quality: "360", format: "mp4", segments: segs, ...extra });

(async () => {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  const stub = S.makeStub("g7");

  // -------------------------------------------------------------- cache 1
  await section("usage and clear: empty cache, then twice", async () => {
    nukeCache();
    S.setStub(stub, { info: { id: "stub0000001", title: "Stub", duration: 30 } });
    const s = await S.start({ stub });
    const r = {};
    r.usageEmpty = (await s.req("GET", "/api/cache/usage")).body;
    r.clearEmpty = (await s.json("POST", "/api/cache/clear", {})).body;
    r.clearEmptyTwice = (await s.json("POST", "/api/cache/clear", {})).body;
    // one real download, then usage / clear / clear
    const d = await s.json("POST", "/api/download?jobId=job_cache_1", DL([{ start: 0, end: 3 }]));
    r.downloadStatus = d.status;
    r.downloadPath = JSON.parse(d.body || "{}").path;
    r.usageAfterDownload = (await s.req("GET", "/api/cache/usage")).body;
    r.clearAfterDownload = (await s.json("POST", "/api/cache/clear", {})).body;
    r.clipStillOnDiskAfterClear = r.downloadPath ? fs.existsSync(r.downloadPath) : null;
    r.usageAfterClear = (await s.req("GET", "/api/cache/usage")).body;
    r.clearAgain = (await s.json("POST", "/api/cache/clear", {})).body;
    log(`  ${JSON.stringify(r, null, 1)}`);
    log(`  >>> cache/clear deletes the finished clip the server just told the client to collect: ${r.clipStillOnDiskAfterClear === false}`);
    await s.stop();
    return r;
  });

  // -------------------------------------------------------------- cache 2
  await section("clear while a job is running", async () => {
    nukeCache();
    S.setStub(stub, { info: { id: "stub0000001", title: "Stub", duration: 30 }, delayMs: 4000 });
    const s = await S.start({ stub });
    const a = s.open("POST", "/api/download?jobId=job_cache_running", {
      body: JSON.stringify(DL([{ start: 0, end: 3 }])), headers: { "content-type": "application/json" },
    });
    await new Promise((x) => setTimeout(x, 1500));
    const usageDuring = (await s.req("GET", "/api/cache/usage")).body;
    const cleared = await s.json("POST", "/api/cache/clear", {});
    const res = await a.wait(120000);
    const body = res.body || "";
    const r = {
      usageDuring, clearResponse: cleared.body,
      downloadStatus: res.status,
      downloadBody: body.slice(0, 400),
      isJson: /application\/json/.test((res.headers || {})["content-type"] || ""),
      looksHtml: /^\s*(<!DOCTYPE|<html)/i.test(body),
    };
    try { const p = JSON.parse(body).path; r.promisedPath = p; r.promisedPathExists = p ? fs.existsSync(p) : null; } catch { /* error body */ }
    log(`  ${JSON.stringify(r, null, 1)}`);
    log(`  >>> clearing the cache under a live job destroyed its work folder; the job ${r.downloadStatus === 200 ? "still reported success" : "failed with " + r.downloadStatus}`);
    await s.stop();
    return r;
  });

  // ------------------------------------------------------------- resume 1
  await section("resume: a .part file is picked up and reported", async () => {
    nukeCache();
    // Fail the section run so a .part survives, then succeed on the retry.
    S.setStub(stub, { info: { id: "stub0000001", title: "Stub", duration: 30 } });
    const s = await S.start({ stub });
    // Work out the keyed folder by asking for the download once.
    const first = await s.json("POST", "/api/download?jobId=job_resume_probe", DL([{ start: 0, end: 4 }]));
    const dir = path.dirname(JSON.parse(first.body || "{}").path || "");
    const r = { keyedDir: dir };
    // Leave a 5 MB partial behind, exactly as an interrupted yt-dlp would.
    fs.rmSync(path.join(dir, "clip.mp4"), { force: true });
    const part = path.join(dir, "clip.mp4.part");
    fs.writeFileSync(part, Buffer.alloc(5 * 1024 * 1024, 0x41));
    r.partialBytes = fs.statSync(part).size;
    const second = await s.json("POST", "/api/download?jobId=job_resume_2", DL([{ start: 0, end: 4 }]));
    r.secondStatus = second.status;
    r.secondBody = (second.body || "").slice(0, 300);
    r.serverSaidResuming = /resuming with \d+ cached byte/.test(s.log());
    r.resumeLogLine = (s.log().split("\n").find((l) => /resuming with/.test(l)) || "").trim();
    r.continueFlagSent = s.argvLog().some((x) => x.argv.includes("--continue"));
    r.partStillThere = fs.existsSync(part);
    const p = JSON.parse(second.body || "{}").path;
    if (p && fs.existsSync(p)) { r.deliveredProbe = probe(p); r.deliveredPlays = plays(p); r.deliveredBytes = fs.statSync(p).size; }
    log(`  ${JSON.stringify(r, null, 1)}`);
    await s.stop();
    return r;
  });

  // ------------------------------------------------------------- resume 2
  await section("resume into a CORRUPT cached whole-file source", async () => {
    nukeCache();
    S.setStub(stub, { info: { id: "stub0000001", title: "Stub", duration: 30 } });
    const s = await S.start({ stub });
    const first = await s.json("POST", "/api/download?jobId=job_corrupt_probe", DL([{ start: 0, end: 4 }]));
    const dir = path.dirname(JSON.parse(first.body || "{}").path || "");
    const r = { keyedDir: dir };
    fs.rmSync(path.join(dir, "clip.mp4"), { force: true });
    // findDownloaded() accepts any `source.*` that is not .part/.ytdl and the
    // job then trims from it without ever checking it is valid media. Plant a
    // finished-looking but corrupt source, the shape an interrupted-then-
    // renamed download leaves.
    const src = path.join(dir, "source.mp4");
    const good = fs.readFileSync(path.join(S.REPO, "audit", "fixtures", "fixture.mp4"));
    fs.writeFileSync(src, good.subarray(0, Math.floor(good.length / 3)));   // truncated mp4
    r.plantedSource = { file: src, bytes: fs.statSync(src).size, probe: probe(src), plays: plays(src) };
    // Make the sectioned path 403 so the job takes the whole-file + trim path
    // and therefore reaches findDownloaded().
    S.setStub(stub, { info: { id: "stub0000001", title: "Stub", duration: 30 }, exitCodeOnDownloadOnly: true, stderr: "ERROR: unable to download video data: HTTP Error 403: Forbidden", exitCode: 1 });
    const second = await s.json("POST", "/api/download?jobId=job_corrupt_2", DL([{ start: 0, end: 4 }]));
    r.secondStatus = second.status;
    r.secondBody = (second.body || "").slice(0, 500);
    r.isJson = /application\/json/.test(second.contentType || "");
    try {
      const p = JSON.parse(second.body || "{}").path;
      if (p && fs.existsSync(p)) { r.delivered = { path: p, bytes: fs.statSync(p).size, probe: probe(p), plays: plays(p) }; }
    } catch { /* error body */ }
    r.logTail = s.log().split("\n").filter((l) => /job_corrupt_2|403|trim|source/.test(l)).slice(-10);
    log(`  ${JSON.stringify(r, null, 1)}`);
    await s.stop();
    return r;
  });

  // ------------------------------------------------------------- resume 3
  await section("a finished clip left in the keyed folder is never reused", async () => {
    nukeCache();
    S.setStub(stub, { info: { id: "stub0000001", title: "Stub", duration: 30 } });
    const s = await S.start({ stub });
    const first = await s.json("POST", "/api/download?jobId=job_stale_probe", DL([{ start: 0, end: 4 }]));
    const p = JSON.parse(first.body || "{}").path;
    const r = { firstPath: p };
    // Replace the finished clip with a marker file; a correct implementation
    // re-downloads rather than handing the marker back.
    fs.writeFileSync(p, "NOT A VIDEO - stale cached clip marker\n");
    const second = await s.json("POST", "/api/download?jobId=job_stale_2", DL([{ start: 0, end: 4 }]));
    r.secondStatus = second.status;
    r.secondPath = JSON.parse(second.body || "{}").path;
    r.secondSize = JSON.parse(second.body || "{}").size;
    r.contentIsStillTheMarker = fs.readFileSync(p, "utf8").startsWith("NOT A VIDEO");
    r.secondPlays = plays(p);
    log(`  ${JSON.stringify(r, null, 1)}`);
    await s.stop();
    return r;
  });

  // --------------------------------------------------------- cache 3
  await section("cacheUsage counts every ytclip-/ytchan- dir in the shared temp dir", async () => {
    nukeCache();
    S.setStub(stub, { info: { id: "stub0000001", title: "Stub", duration: 30 } });
    const s = await S.start({ stub });
    const r = { before: (await s.req("GET", "/api/cache/usage")).body };
    // Anything in the OS temp dir with the prefix is counted and cleared,
    // whoever created it. Plant a decoy that this app did not make.
    const decoy = path.join(os.tmpdir(), "ytclip-NOT-OURS-0000");
    fs.mkdirSync(decoy, { recursive: true });
    fs.writeFileSync(path.join(decoy, "someone-elses-file"), Buffer.alloc(1024));
    r.afterPlantingDecoy = (await s.req("GET", "/api/cache/usage")).body;
    r.clear = (await s.json("POST", "/api/cache/clear", {})).body;
    r.decoyStillExists = fs.existsSync(decoy);
    log(`  ${JSON.stringify(r, null, 1)}`);
    await s.stop();
    return r;
  });

  fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify(out, null, 2));
  log(`\n\nresults: ${path.join(OUT, "results.json")}`);
  log("SUMMARY-DONE");
})().catch((e) => { console.error("FATAL", e); process.exit(1); });
