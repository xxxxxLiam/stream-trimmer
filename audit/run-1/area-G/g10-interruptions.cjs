#!/usr/bin/env node
/**
 * G area, audit-only. Interruptions that the first pass of g6 could not create
 * properly (running as root ignores chmod), done a way that really fails:
 *   - the temp root cannot be created at all (TMPDIR under a regular file)
 *   - the temp root exists but writes fail (TMPDIR on a full tmpfs)
 *   - the work folder is deleted under a live job (unique key each time)
 *   - the output file is replaced by a directory under a live job
 *
 * Run: node audit/run-1/area-G/g10-interruptions.cjs
 */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execSync } = require("node:child_process");
const S = require("./srv.cjs");

const OUT = path.join(__dirname, "out-g10");
const out = {};
const log = (...a) => console.log(...a);
const clipDirs = (root) => { try { return fs.readdirSync(root).filter((n) => n.startsWith("ytclip-")); } catch { return []; } };

async function section(name, fn) {
  log(`\n\n=== ${name} ===`);
  try { out[name] = await fn(); } catch (e) { out[name] = { FATAL: String(e.message) }; log("  ERROR", e.message); }
}

let seq = 0;
const DL = (segs) => ({ url: S.YT, deliver: "path", quality: "360", format: "mp4", segments: segs });
/** A range nothing else has used, so the keyed folder is always new. */
const uniqueSegs = () => { seq += 1; return [{ start: seq * 0.37, end: seq * 0.37 + 2 }]; };

(async () => {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  const stub = S.makeStub("g10");

  // ---------------------------------------------------------------- 1
  await section("TMPDIR cannot be created (points under a regular file)", async () => {
    S.setStub(stub, { info: { id: "stub0000001", title: "Stub", duration: 30 } });
    const bogus = "/etc/hostname/not-a-dir";       // parent is a file -> ENOTDIR
    const r = {};
    let s;
    try {
      s = await S.start({ stub, env: { TMPDIR: bogus } });
      r.serverBooted = true;
      r.cacheUsage = (await s.req("GET", "/api/cache/usage")).body;
      const res = await s.json("POST", "/api/download", DL(uniqueSegs()), undefined);
      r.downloadStatus = res.status ?? null;
      r.downloadError = res.error || null;
      r.body = (res.body || "").slice(0, 500);
      r.isJson = /application\/json/.test(res.contentType || "");
      r.looksHtml = /^\s*(<!DOCTYPE|<html)/i.test(r.body);
      r.noResponseAtAll = !!res.error && /timeout|socket hang up/i.test(res.error);
      r.serverStillAlive = (await s.req("GET", "/api/cache/usage", { timeoutMs: 5000 })).status === 200;
      r.unhandledInLog = /UnhandledPromiseRejection|unhandled|ENOTDIR|ENOENT/i.test(s.log());
      r.logTail = s.log().split("\n").slice(-14);
      await s.stop();
    } catch (e) {
      r.serverBooted = false; r.bootError = String(e.message).slice(0, 500);
      if (s) await s.stop();
    }
    log(`  ${JSON.stringify(r, null, 1)}`);
    return r;
  });

  // ---------------------------------------------------------------- 2
  await section("TMPDIR on a FULL filesystem (1MB tmpfs)", async () => {
    const mnt = path.join(OUT, "tiny");
    fs.mkdirSync(mnt, { recursive: true });
    let mounted = false;
    try { execSync(`mount -t tmpfs -o size=1M tmpfs ${JSON.stringify(mnt)}`); mounted = true; }
    catch (e) { log(`  (cannot mount tmpfs here: ${String(e.message).split("\n")[0]})`); }
    if (!mounted) return { skipped: "no tmpfs mount available", notProvableHere: true };
    const r = {};
    try {
      S.setStub(stub, { info: { id: "stub0000001", title: "Stub", duration: 30 } });
      const s = await S.start({ stub, env: { TMPDIR: mnt } });
      const res = await s.json("POST", "/api/download", DL(uniqueSegs()));
      r.status = res.status ?? null;
      r.body = (res.body || "").slice(0, 700);
      r.isJson = /application\/json/.test(res.contentType || "");
      r.classifiedAsDiskFull = /disk_full|disk is full/.test(r.body);
      r.saysHowMuchIsNeeded = /needs about \d+ MB/.test(r.body);
      r.leaksHome = (r.body.match(/\/(?:home|Users)\/[\w./-]+/g) || []).slice(0, 3);
      r.cacheUsage = (await s.req("GET", "/api/cache/usage")).body;
      await s.stop();
    } finally {
      try { execSync(`umount ${JSON.stringify(mnt)}`); } catch { /* leave it */ }
    }
    log(`  ${JSON.stringify(r, null, 1)}`);
    return r;
  });

  // ---------------------------------------------------------------- 3
  await section("work folder deleted under a live job", async () => {
    S.setStub(stub, { info: { id: "stub0000001", title: "Stub", duration: 30 }, delayMs: 3500 });
    const s = await S.start({ stub });
    const before = new Set(clipDirs(os.tmpdir()));
    const segs = uniqueSegs();
    const a = s.open("POST", "/api/download?jobId=job_rm_live", { body: JSON.stringify(DL(segs)), headers: { "content-type": "application/json" } });
    // Wait until the probe is done and the work folder exists.
    let fresh = [];
    const t0 = Date.now();
    while (Date.now() - t0 < 15000 && fresh.length === 0) {
      fresh = clipDirs(os.tmpdir()).filter((d) => !before.has(d));
      await new Promise((r) => setTimeout(r, 100));
    }
    await new Promise((r) => setTimeout(r, 400));
    for (const d of fresh) fs.rmSync(path.join(os.tmpdir(), d), { recursive: true, force: true });
    const res = await a.wait(120000);
    const r = {
      removedDirs: fresh,
      status: res.status ?? null,
      body: (res.body || "").slice(0, 600),
      isJson: /application\/json/.test((res.headers || {})["content-type"] || ""),
      error: res.error || null,
    };
    r.looksHtml = /^\s*(<!DOCTYPE|<html)/i.test(r.body);
    try { const p = JSON.parse(r.body).path; r.promisedPath = p; r.promisedPathExists = p ? fs.existsSync(p) : null; } catch { /* error body */ }
    r.failureShape = (() => { try { const j = JSON.parse(r.body); return { code: j.code, action: j.action && j.action.id, preserved: !!j.preserved }; } catch { return null; } })();
    log(`  ${JSON.stringify(r, null, 1)}`);
    await s.stop();
    return r;
  });

  // ---------------------------------------------------------------- 4
  await section("output file replaced by a directory under a live job", async () => {
    S.setStub(stub, { info: { id: "stub0000001", title: "Stub", duration: 30 }, delayMs: 3500 });
    const s = await S.start({ stub });
    const before = new Set(clipDirs(os.tmpdir()));
    const a = s.open("POST", "/api/download?jobId=job_dir_clash", { body: JSON.stringify(DL(uniqueSegs())), headers: { "content-type": "application/json" } });
    let fresh = [];
    const t0 = Date.now();
    while (Date.now() - t0 < 15000 && fresh.length === 0) {
      fresh = clipDirs(os.tmpdir()).filter((d) => !before.has(d));
      await new Promise((r) => setTimeout(r, 100));
    }
    const dir = fresh[0] ? path.join(os.tmpdir(), fresh[0]) : null;
    if (dir) {
      try { fs.rmSync(path.join(dir, "clip.mp4"), { force: true }); fs.mkdirSync(path.join(dir, "clip.mp4"), { recursive: true }); } catch (e) { log("  (clash setup failed) " + e.message); }
    }
    const res = await a.wait(120000);
    const r = { dir, status: res.status ?? null, body: (res.body || "").slice(0, 600), isJson: /application\/json/.test((res.headers || {})["content-type"] || "") };
    r.looksHtml = /^\s*(<!DOCTYPE|<html)/i.test(r.body);
    r.failureShape = (() => { try { const j = JSON.parse(r.body); return { code: j.code, action: j.action && j.action.id }; } catch { return null; } })();
    log(`  ${JSON.stringify(r, null, 1)}`);
    await s.stop();
    return r;
  });

  // ---------------------------------------------------------------- 5
  await section("a joined clip whose duration fails the server's own check", async () => {
    // The stub always writes the whole 30s fixture for each segment, so a
    // 3-segment 15s clip joins to 90s. The point is not the stub: it is what
    // the server does when joinSegments reports durationOk:false.
    S.setStub(stub, { info: { id: "stub0000001", title: "Stub", duration: 30 } });
    const s = await S.start({ stub });
    const res = await s.json("POST", "/api/download?jobId=job_badlen", {
      url: S.YT, deliver: "path", quality: "360", format: "mp4",
      segments: [{ start: 0, end: 5 }, { start: 10, end: 15 }, { start: 20, end: 25 }],
    });
    const body = JSON.parse(res.body || "{}");
    const r = {
      status: res.status,
      responseBody: res.body.slice(0, 400),
      headers: Object.fromEntries(Object.entries(res.headers || {}).filter(([k]) => /^x-/.test(k))),
      hasWarningField: "warning" in body,
      hasDurationField: "duration" in body || "expectedDuration" in body,
      askedSec: 15,
      serverJoinLines: s.log().split("\n").filter((l) => /join:|joined clip is/.test(l)).map((l) => l.trim()),
    };
    if (body.path && fs.existsSync(body.path)) {
      const d = execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 ${JSON.stringify(body.path)}`).toString().trim();
      r.deliveredSec = Number(d);
      r.overByFactor = +(r.deliveredSec / 15).toFixed(2);
    }
    log(`  ${JSON.stringify(r, null, 1)}`);
    log(`  >>> server detected the wrong length and still answered 200 with no warning in the body: ${r.status === 200 && !r.hasWarningField}`);
    await s.stop();
    return r;
  });

  fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify(out, null, 2));
  log(`\n\nresults: ${path.join(OUT, "results.json")}`);
  log("SUMMARY-DONE");
})().catch((e) => { console.error("FATAL", e); process.exit(1); });
