#!/usr/bin/env node
/**
 * G area, audit-only. Repetition, races, cancellation and interruption.
 *
 * Run: node audit/run-1/area-G/g6-races.cjs
 */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execSync } = require("node:child_process");
const S = require("./srv.cjs");

const OUT = path.join(__dirname, "out-g6");
const out = {};
const log = (...a) => console.log(...a);

const kids = (needle) => {
  try {
    const all = execSync("ps -eo pid,ppid,etimes,args").toString().split("\n");
    return all.filter((l) => l.includes(needle) && !l.includes("ps -eo"));
  } catch { return []; }
};
const clipDirs = () => fs.readdirSync(os.tmpdir()).filter((n) => n.startsWith("ytclip-"));

async function section(name, fn) {
  log(`\n\n=== ${name} ===`);
  try { out[name] = await fn(); } catch (e) { out[name] = { FATAL: String(e.message) }; log("  ERROR", e.message); }
}

(async () => {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  const stub = S.makeStub("g6");
  const DL = (segs, extra = {}) => ({ url: S.YT, deliver: "path", quality: "360", format: "mp4", segments: segs, ...extra });

  // ---------------------------------------------------------------- 1
  await section("two downloads of the same video at once", async () => {
    S.setStub(stub, { info: { id: "stub0000001", title: "Stub", duration: 30 }, delayMs: 800 });
    const s = await S.start({ stub });
    const a = s.open("POST", "/api/download?jobId=job_same_a", { body: JSON.stringify(DL([{ start: 0, end: 3 }])), headers: { "content-type": "application/json" } });
    const b = s.open("POST", "/api/download?jobId=job_same_b", { body: JSON.stringify(DL([{ start: 0, end: 3 }])), headers: { "content-type": "application/json" } });
    const [ra, rb] = [await a.wait(), await b.wait()];
    const pa = JSON.parse(ra.body || "{}"), pb = JSON.parse(rb.body || "{}");
    const r = {
      statuses: [ra.status, rb.status],
      paths: [pa.path, pb.path],
      samePath: pa.path === pb.path,
      sizes: [pa.size, pb.size],
      bothExist: [pa.path && fs.existsSync(pa.path), pb.path && fs.existsSync(pb.path)],
      durations: [pa.path, pb.path].map((p) => { try { return execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 ${JSON.stringify(p)}`).toString().trim(); } catch { return null; } }),
    };
    log(`  ${JSON.stringify(r)}`);
    log(`  >>> the keyed work folder means both jobs write the SAME file: ${r.samePath}`);
    await s.stop();
    return r;
  });

  // ---------------------------------------------------------------- 2
  await section("two downloads, different ranges, same video", async () => {
    S.setStub(stub, { info: { id: "stub0000001", title: "Stub", duration: 30 }, delayMs: 600 });
    const s = await S.start({ stub });
    const a = s.open("POST", "/api/download?jobId=job_r1", { body: JSON.stringify(DL([{ start: 0, end: 3 }])), headers: { "content-type": "application/json" } });
    const b = s.open("POST", "/api/download?jobId=job_r2", { body: JSON.stringify(DL([{ start: 5, end: 8 }])), headers: { "content-type": "application/json" } });
    const [ra, rb] = [await a.wait(), await b.wait()];
    const r = { statuses: [ra.status, rb.status], paths: [JSON.parse(ra.body || "{}").path, JSON.parse(rb.body || "{}").path] };
    r.samePath = r.paths[0] === r.paths[1];
    log(`  ${JSON.stringify(r)}`);
    await s.stop();
    return r;
  });

  // ---------------------------------------------------------------- 3
  await section("start then immediately cancel (client aborts)", async () => {
    S.setStub(stub, { info: { id: "stub0000001", title: "Stub", duration: 30 }, delayMs: 8000 });
    const s = await S.start({ stub });
    const before = kids("stub0000001").length;
    const a = s.open("POST", "/api/download?jobId=job_cancel", { body: JSON.stringify(DL([{ start: 0, end: 3 }])), headers: { "content-type": "application/json" } });
    await new Promise((r) => setTimeout(r, 2500));           // probe done, section run in flight
    const duringKids = kids("--download-sections");
    a.abort();
    await new Promise((r) => setTimeout(r, 2000));
    const afterAbort = kids("--download-sections");
    await new Promise((r) => setTimeout(r, 9000));
    const settled = kids("--download-sections");
    const prog = await s.req("GET", "/api/download/progress?jobId=job_cancel", { timeoutMs: 1500 }).catch(() => ({}));
    const r = {
      ytDlpChildrenWhileRunning: duringKids.length,
      ytDlpChildren2sAfterClientAborted: afterAbort.length,
      ytDlpChildren11sAfterClientAborted: settled.length,
      orphanSurvivedTheCancel: afterAbort.length > 0,
      childCmdlineAfterAbort: afterAbort.slice(0, 1),
      serverLogMentionsCancel: /cancel|abort/i.test(s.log()),
    };
    log(`  ${JSON.stringify(r, null, 1)}`);
    log(`  >>> there is no cancel endpoint; the only cancel is hanging up the HTTP request`);
    await s.stop();
    return r;
  });

  // ---------------------------------------------------------------- 4
  await section("cancel an unknown job / poll unknown and finished jobs", async () => {
    S.setStub(stub, { info: { id: "stub0000001", title: "Stub", duration: 30 } });
    const s = await S.start({ stub });
    const r = {};
    // There is no cancel route at all — prove it.
    r.cancelRoutes = {};
    for (const route of ["/api/download/cancel", "/api/download/stop", "/api/cancel"]) {
      const x = await s.json("POST", route, { jobId: "job_nope" });
      r.cancelRoutes[route] = { status: x.status, ct: x.contentType, html: /^\s*(<!DOCTYPE|<html)/i.test(x.body || "") };
    }
    // SSE for an id that never existed: read the first event.
    const sse = (id, ms = 1200) => new Promise((res) => {
      const http = require("node:http");
      const req = http.request({ host: "127.0.0.1", port: s.port, path: "/api/download/progress?jobId=" + encodeURIComponent(id) }, (resp) => {
        let first = "";
        resp.on("data", (c) => { first += c.toString(); });
        setTimeout(() => { req.destroy(); res({ status: resp.statusCode, ct: resp.headers["content-type"], first: first.slice(0, 200) }); }, ms);
      });
      req.on("error", () => res({ error: true }));
      req.end();
    });
    r.unknownJob = await sse("job_never_existed");
    r.weirdJob = await sse("../../etc/passwd");
    // A job that really ran, polled after it finished.
    const done = await s.json("POST", "/api/download?jobId=job_finished_1", DL([{ start: 0, end: 2 }]));
    r.downloadStatus = done.status;
    r.rightAfterDone = await sse("job_finished_1");
    await new Promise((x) => setTimeout(x, 6500));           // publishProgress deletes the channel after 5s
    r.sixSecondsAfterDone = await sse("job_finished_1");
    log(`  ${JSON.stringify(r, null, 1)}`);
    await s.stop();
    return r;
  });

  // ---------------------------------------------------------------- 5
  await section("kill the yt-dlp child mid-download", async () => {
    S.setStub(stub, { info: { id: "stub0000001", title: "Stub", duration: 30 }, delayMs: 9000 });
    const s = await S.start({ stub });
    const a = s.open("POST", "/api/download?jobId=job_kill_yt", { body: JSON.stringify(DL([{ start: 0, end: 3 }])), headers: { "content-type": "application/json" } });
    await new Promise((r) => setTimeout(r, 2500));
    const found = kids("--download-sections");
    let killed = 0;
    for (const line of found) {
      const pid = Number(line.trim().split(/\s+/)[0]);
      try { process.kill(pid, "SIGKILL"); killed++; } catch { /* gone */ }
    }
    const res = await a.wait(90000);
    const r = { killedChildren: killed, status: res.status, ct: res.headers && res.headers["content-type"], body: (res.body || "").slice(0, 500) };
    r.isJson = /application\/json/.test(r.ct || "");
    r.looksHtml = /^\s*(<!DOCTYPE|<html)/i.test(r.body);
    r.leaksHome = (r.body.match(/\/(?:home|Users)\/[\w./-]+/g) || []).slice(0, 3);
    log(`  ${JSON.stringify(r, null, 1)}`);
    await s.stop();
    return r;
  });

  // ---------------------------------------------------------------- 6
  await section("kill ffmpeg mid-concat (403 fallback path, multi-segment)", async () => {
    // Force the whole-file + local-trim path: the section run fails with a 403,
    // so yt-dlp downloads the file and ffmpeg trims locally, then concats.
    S.setStub(stub, {
      info: { id: "stub0000001", title: "Stub", duration: 30 },
      exitCode: 0, delayMs: 0,
    });
    const s = await S.start({ stub });
    const a = s.open("POST", "/api/download?jobId=job_kill_ff", {
      body: JSON.stringify(DL([{ start: 0, end: 5 }, { start: 10, end: 15 }, { start: 20, end: 25 }])),
      headers: { "content-type": "application/json" },
    });
    // ffmpeg runs are short here; try hard to catch one.
    let killed = 0;
    const t0 = Date.now();
    while (Date.now() - t0 < 12000 && killed === 0) {
      for (const line of kids("ffmpeg")) {
        const parts = line.trim().split(/\s+/);
        if (!/concat|ytclip/.test(line)) continue;
        try { process.kill(Number(parts[0]), "SIGKILL"); killed++; } catch { /* gone */ }
      }
      await new Promise((r) => setTimeout(r, 40));
    }
    const res = await a.wait(120000);
    const r = { killedFfmpeg: killed, status: res.status, body: (res.body || "").slice(0, 600) };
    r.isJson = /application\/json/.test((res.headers || {})["content-type"] || "");
    r.joinFailureShape = /join_failed|could not be joined/.test(r.body);
    log(`  ${JSON.stringify(r, null, 1)}`);
    log(`  server log tail:\n${s.log().split("\n").filter((l) => /join|ffmpeg|job=job_kill_ff/.test(l)).slice(-12).join("\n")}`);
    await s.stop();
    return r;
  });

  // ---------------------------------------------------------------- 7
  await section("temp work dir removed mid-job", async () => {
    S.setStub(stub, { info: { id: "stub0000001", title: "Stub", duration: 30 }, delayMs: 4000 });
    const s = await S.start({ stub });
    const before = new Set(clipDirs());
    const a = s.open("POST", "/api/download?jobId=job_rmdir", { body: JSON.stringify(DL([{ start: 0, end: 3 }])), headers: { "content-type": "application/json" } });
    await new Promise((r) => setTimeout(r, 2000));
    const fresh = clipDirs().filter((d) => !before.has(d));
    for (const d of fresh) fs.rmSync(path.join(os.tmpdir(), d), { recursive: true, force: true });
    const res = await a.wait(90000);
    const r = { removedDirs: fresh, status: res.status, body: (res.body || "").slice(0, 500) };
    r.isJson = /application\/json/.test((res.headers || {})["content-type"] || "");
    r.looksHtml = /^\s*(<!DOCTYPE|<html)/i.test(r.body);
    log(`  ${JSON.stringify(r, null, 1)}`);
    await s.stop();
    return r;
  });

  // ---------------------------------------------------------------- 8
  await section("unwritable temp dir (TMPDIR points at a read-only dir)", async () => {
    const ro = path.join(OUT, "readonly-tmp");
    fs.rmSync(ro, { recursive: true, force: true });
    fs.mkdirSync(ro, { recursive: true });
    fs.chmodSync(ro, 0o500);
    S.setStub(stub, { info: { id: "stub0000001", title: "Stub", duration: 30 } });
    const r = {};
    try {
      const s = await S.start({ stub, env: { TMPDIR: ro } });
      const res = await s.json("POST", "/api/download", DL([{ start: 0, end: 2 }]));
      r.status = res.status;
      r.body = (res.body || "").slice(0, 600);
      r.isJson = /application\/json/.test(res.contentType || "");
      r.looksHtml = /^\s*(<!DOCTYPE|<html)/i.test(r.body);
      r.leaksHome = (r.body.match(/\/(?:home|Users)\/[\w./-]+/g) || []).slice(0, 3);
      r.cacheUsage = (await s.req("GET", "/api/cache/usage")).body;
      await s.stop();
    } catch (e) { r.serverFailedToBoot = String(e.message).slice(0, 400); }
    fs.chmodSync(ro, 0o700);
    log(`  ${JSON.stringify(r, null, 1)}`);
    return r;
  });

  // ---------------------------------------------------------------- 9
  await section("repeat the same download 5x in a row", async () => {
    S.setStub(stub, { info: { id: "stub0000001", title: "Stub", duration: 30 } });
    const s = await S.start({ stub });
    const rows = [];
    for (let i = 0; i < 5; i++) {
      const res = await s.json("POST", "/api/download?jobId=job_rep_" + i, DL([{ start: 0, end: 2 }]));
      const p = JSON.parse(res.body || "{}");
      rows.push({ status: res.status, path: p.path, size: p.size });
    }
    const r = { rows, distinctPaths: [...new Set(rows.map((x) => x.path))].length, usage: (await s.req("GET", "/api/cache/usage")).body };
    log(`  ${JSON.stringify(r, null, 1)}`);
    await s.stop();
    return r;
  });

  fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify(out, null, 2));
  log(`\n\nresults: ${path.join(OUT, "results.json")}`);
  log("SUMMARY-DONE");
})().catch((e) => { console.error("FATAL", e); process.exit(1); });
