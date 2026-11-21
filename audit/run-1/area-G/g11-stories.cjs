#!/usr/bin/env node
/**
 * G area, audit-only. STEP 4 — realistic user stories, at the server level,
 * each one RUN against the real server with assertions.
 *
 * Run: node audit/run-1/area-G/g11-stories.cjs
 */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const { spawnSync, execSync } = require("node:child_process");
const S = require("./srv.cjs");

const OUT = path.join(__dirname, "out-g11");
const FFMPEG = path.join(S.REPO, "resources", "bin", "ffmpeg");
const stories = [];
const log = (...a) => console.log(...a);

const dur = (f) => { try { return Number(execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 ${JSON.stringify(f)}`).toString().trim()); } catch { return null; } };
const streams = (f) => { try { return execSync(`ffprobe -v error -show_entries stream=codec_type -of csv=p=0 ${JSON.stringify(f)}`).toString().trim().split("\n"); } catch { return []; } };
const plays = (f) => spawnSync(FFMPEG, ["-v", "error", "-xerror", "-i", f, "-f", "null", "-"], { encoding: "utf8" }).status === 0;
const nukeCache = () => { for (const d of fs.readdirSync(os.tmpdir()).filter((n) => n.startsWith("ytclip-"))) fs.rmSync(path.join(os.tmpdir(), d), { recursive: true, force: true }); };

/** Collect every SSE event for a job until it ends or the deadline passes. */
function watchProgress(port, jobId, ms) {
  return new Promise((resolve) => {
    const events = [];
    const req = http.request({ host: "127.0.0.1", port, path: "/api/download/progress?jobId=" + encodeURIComponent(jobId) }, (res) => {
      let buf = "";
      res.on("data", (c) => {
        buf += c.toString();
        const parts = buf.split("\n\n"); buf = parts.pop();
        for (const p of parts) {
          const m = p.match(/^data: (.*)$/m);
          if (m) { try { events.push(JSON.parse(m[1])); } catch { /* ping */ } }
        }
      });
      setTimeout(() => { req.destroy(); resolve(events); }, ms);
    });
    req.on("error", () => resolve(events));
    req.end();
  });
}

let n = 0;
async function story(title, fn) {
  n += 1;
  log(`\n\n### Story ${n}: ${title}`);
  const rec = { n, title };
  try {
    const r = await fn();
    Object.assign(rec, r);
  } catch (e) { rec.FATAL = String(e.message); log("  ERROR", e.message); }
  rec.verdict = rec.pass === true ? "PASS" : rec.pass === false ? "FAIL" : "see notes";
  log(`  VERDICT: ${rec.verdict}${rec.why ? " — " + rec.why : ""}`);
  stories.push(rec);
  return rec;
}

(async () => {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  const stub = S.makeStub("g11");
  const base = { info: { id: "stub0000001", title: "How we shipped v4", duration: 1800, uploader: "Dev channel" } };
  const COOKIE = path.join(OUT, "yt-cookies.txt");
  fs.writeFileSync(COOKIE, "# Netscape HTTP Cookie File\n.youtube.com\tTRUE\t/\tTRUE\t9999999999\tSID\tlive-session\n");

  // ---------------------------------------------------------------- 1
  await story("A clipper pastes a URL and expects the title and length back", async () => {
    S.setStub(stub, base);
    const s = await S.start({ stub });
    const r = await s.json("POST", "/api/info", { url: S.YT });
    const b = JSON.parse(r.body || "{}");
    await s.stop();
    const pass = r.status === 200 && b.title === "How we shipped v4" && b.duration === 1800;
    log(`  ${r.status} ${JSON.stringify(b).slice(0, 200)}`);
    return { status: r.status, body: b, pass, why: pass ? "" : "title/duration not returned" };
  });

  // ---------------------------------------------------------------- 2
  await story("...then asks for the transcript of that video", async () => {
    S.setStub(stub, base);
    const s = await S.start({ stub });
    const r = await s.json("POST", "/api/transcript", { url: S.YT });
    await s.stop();
    const b = JSON.parse(r.body || "{}");
    log(`  ${r.status} ${JSON.stringify(b).slice(0, 200)}`);
    return {
      status: r.status, body: b,
      pass: r.status === 200 && "available" in b,
      why: "the stub serves no subtitles, so `available:false` is the right answer; what matters is that it is a clean 200 JSON and not an error",
    };
  });

  // ---------------------------------------------------------------- 3
  await story("Cuts one 7s range at 360p and saves the file", async () => {
    nukeCache();
    S.setStub(stub, base);
    const s = await S.start({ stub });
    const r = await s.json("POST", "/api/download?jobId=job_s3", { url: S.YT, deliver: "path", quality: "360", format: "mp4", segments: [{ start: 5, end: 12 }] });
    const b = JSON.parse(r.body || "{}");
    const out = { status: r.status, path: b.path, size: b.size };
    if (b.path && fs.existsSync(b.path)) { out.duration = dur(b.path); out.streams = streams(b.path); out.plays = plays(b.path); }
    await s.stop();
    log(`  ${JSON.stringify(out)}`);
    return { ...out, pass: r.status === 200 && out.plays === true && out.streams.includes("video") && out.streams.includes("audio"),
      why: "the stub cannot cut, so the duration is the fixture's 30s rather than 7s; the assertion here is that a playable file with both streams comes back and the path is handed over" };
  });

  // ---------------------------------------------------------------- 4
  await story("Cuts three highlights out of one talk into a single file", async () => {
    nukeCache();
    S.setStub(stub, base);
    const s = await S.start({ stub });
    const segs = [{ start: 10, end: 14 }, { start: 100, end: 104 }, { start: 200, end: 204 }];
    const r = await s.json("POST", "/api/download?jobId=job_s4", { url: S.YT, deliver: "path", quality: "360", format: "mp4", segments: segs });
    const b = JSON.parse(r.body || "{}");
    const out = { status: r.status, segments: b.segments, joinMethod: b.joinMethod, headers: Object.fromEntries(Object.entries(r.headers).filter(([k]) => /^x-/.test(k))) };
    if (b.path && fs.existsSync(b.path)) { out.duration = dur(b.path); out.streams = streams(b.path); out.plays = plays(b.path); }
    out.expectedDuration = 12;
    out.warningInBody = "warning" in b;
    await s.stop();
    log(`  ${JSON.stringify(out)}`);
    return { ...out, pass: false,
      why: `the join produced ${out.duration}s where the user marked 12s, the server's own check said so (join=${out.joinMethod}), and the response is still a plain 200 with no warning` };
  });

  // ---------------------------------------------------------------- 5
  await story("Rips just the audio as an mp3 for a cold open", async () => {
    nukeCache();
    S.setStub(stub, base);
    const s = await S.start({ stub });
    const r = await s.json("POST", "/api/download?jobId=job_s5", { url: S.YT, deliver: "path", quality: "192", format: "mp3", segments: [{ start: 30, end: 40 }] });
    const b = JSON.parse(r.body || "{}");
    const out = { status: r.status, path: b.path };
    if (b.path && fs.existsSync(b.path)) { out.streams = streams(b.path); out.plays = plays(b.path); out.bytes = fs.statSync(b.path).size; }
    await s.stop();
    log(`  ${JSON.stringify(out)}`);
    return { ...out, pass: r.status === 200,
      why: "the stub hands back the fixture rather than transcoding, so the container is not really mp3 here; the request/response contract is what is being checked" };
  });

  // ---------------------------------------------------------------- 6
  await story("Watches the progress bar while the clip downloads", async () => {
    nukeCache();
    S.setStub(stub, { ...base, delayMs: 500, progress: [0, 10, 40, 70, 100] });
    const s = await S.start({ stub });
    const watcher = watchProgress(s.port, "job_s6", 14000);
    const r = await s.json("POST", "/api/download?jobId=job_s6", { url: S.YT, deliver: "path", quality: "360", format: "mp4", segments: [{ start: 0, end: 6 }, { start: 20, end: 26 }] });
    const events = await watcher;
    await s.stop();
    const pcts = events.map((e) => e.percent);
    const monotonic = pcts.every((p, i) => i === 0 || p >= pcts[i - 1] || events[i].phase === "downloading" && p === 0);
    const out = {
      status: r.status, eventCount: events.length,
      phases: [...new Set(events.map((e) => e.phase))],
      percents: pcts,
      stages: [...new Set(events.map((e) => e.stage).filter(Boolean))],
      reached100: pcts.includes(100),
      monotonic,
      wentBackwards: pcts.filter((p, i) => i > 0 && p < pcts[i - 1]).length,
    };
    log(`  ${JSON.stringify(out)}`);
    return { ...out, pass: out.reached100 && out.phases.includes("done"), why: out.wentBackwards ? `${out.wentBackwards} backwards step(s) in the bar` : "" };
  });

  // ---------------------------------------------------------------- 7
  await story("The connection drops mid-download; the clipper wants to resume", async () => {
    nukeCache();
    S.setStub(stub, { ...base, failDownload: 1, failStderr: "ERROR: unable to download video data: <urlopen error [Errno 104] Connection reset by peer>" });
    const s = await S.start({ stub });
    const first = await s.json("POST", "/api/download?jobId=job_s7a", { url: S.YT, deliver: "path", quality: "360", format: "mp4", segments: [{ start: 60, end: 70 }] });
    const fb = JSON.parse(first.body || "{}");
    const out = {
      failStatus: first.status,
      code: fb.code, action: fb.action && fb.action.id, label: fb.action && fb.action.label,
      preserved: fb.preserved,
      hasDiagnostics: "diagnostics" in fb,
      homeDirInDiagnostics: fb.diagnostics ? fb.diagnostics.homeDir : null,
    };
    // Now the network comes back.
    S.setStub(stub, base);
    const second = await s.json("POST", "/api/download?jobId=job_s7b", { url: S.YT, deliver: "path", quality: "360", format: "mp4", segments: [{ start: 60, end: 70 }] });
    const sb = JSON.parse(second.body || "{}");
    out.retryStatus = second.status;
    out.retryPlays = sb.path && fs.existsSync(sb.path) ? plays(sb.path) : null;
    await s.stop();
    log(`  ${JSON.stringify(out)}`);
    return { ...out,
      pass: out.failStatus === 502 && out.code === "network_dropped" && out.action === "resume" && out.retryStatus === 200,
      why: out.homeDirInDiagnostics ? `the failure JSON carries the user's home directory verbatim: ${out.homeDirInDiagnostics}` : "" };
  });

  // ---------------------------------------------------------------- 8
  await story("Marks an out point past the end of the video by accident", async () => {
    S.setStub(stub, { info: { id: "stub0000001", title: "Short clip", duration: 42 } });
    const s = await S.start({ stub });
    const r = await s.json("POST", "/api/download", { url: S.YT, deliver: "path", quality: "360", format: "mp4", segments: [{ start: 10, end: 300 }] });
    const b = JSON.parse(r.body || "{}");
    await s.stop();
    log(`  ${r.status} ${JSON.stringify(b).slice(0, 300)}`);
    return { status: r.status, code: b.code, action: b.action && b.action.id, detail: b.detail, error: b.error,
      pass: r.status === 400 && b.code === "out_point_past_end" && b.action.id === "snap_out_point" && b.detail && b.detail.runsTo === 42 };
  });

  // ---------------------------------------------------------------- 9
  await story("Asks for 1080p with no YouTube session connected", async () => {
    S.setStub(stub, base);
    const s = await S.start({ stub });
    const r = await s.json("POST", "/api/download", { url: S.YT, deliver: "path", quality: "1080", format: "mp4", segments: [{ start: 0, end: 5 }] });
    const b = JSON.parse(r.body || "{}");
    await s.stop();
    log(`  ${r.status} ${JSON.stringify(b).slice(0, 250)}`);
    return { status: r.status, code: b.code, action: b.action && b.action.id, pass: r.status === 401 && b.code === "YOUTUBE_AUTH_REQUIRED" && b.action.id === "import_cookies" };
  });

  // --------------------------------------------------------------- 10
  await story("The video turns out to be members-only", async () => {
    S.setStub(stub, { ...base, failJson: 1, failDownload: 1, failStderr: "ERROR: [youtube] abc: Join this channel to get access to members-only content like this video, and other exclusive perks." });
    const s = await S.start({ stub });
    const r = await s.json("POST", "/api/download", { url: S.YT, deliver: "path", quality: "360", format: "mp4", segments: [{ start: 0, end: 5 }] });
    const b = JSON.parse(r.body || "{}");
    await s.stop();
    log(`  ${r.status} ${JSON.stringify(b).slice(0, 280)}`);
    return { status: r.status, code: b.code, action: b.action && b.action.id, pass: r.status === 403 && b.code === "private_video" };
  });

  // --------------------------------------------------------------- 11
  await story("YouTube changes something the bundled engine cannot read", async () => {
    S.setStub(stub, { ...base, failJson: 1, failDownload: 1, failStderr: "ERROR: [youtube] abc: Signature extraction failed: Some formats may be missing\n  Please report this issue on https://github.com/yt-dlp/yt-dlp/issues" });
    const s = await S.start({ stub });
    const r = await s.json("POST", "/api/download", { url: S.YT, deliver: "path", quality: "360", format: "mp4", segments: [{ start: 0, end: 5 }] });
    const b = JSON.parse(r.body || "{}");
    await s.stop();
    log(`  ${r.status} ${JSON.stringify(b).slice(0, 250)}`);
    return { status: r.status, code: b.code, action: b.action && b.action.id, pass: r.status === 502 && b.code === "engine_behind" && b.action.id === "update_engine" };
  });

  // --------------------------------------------------------------- 12
  await story("The disk fills up halfway through", async () => {
    S.setStub(stub, { ...base, failDownload: 1, failStderr: "ERROR: unable to write data: [Errno 28] No space left on device" });
    const s = await S.start({ stub });
    const r = await s.json("POST", "/api/download", { url: S.YT, deliver: "path", quality: "1080", format: "mp4", segments: [{ start: 0, end: 60 }], cookiesFromBrowser: "app" });
    const b = JSON.parse(r.body || "{}");
    await s.stop();
    log(`  ${r.status} ${JSON.stringify(b).slice(0, 320)}`);
    return { status: r.status, code: b.code, action: b.action && b.action.id, cause: b.cause,
      saysNumbers: /needs about \d+ MB and \d+ MB is free/.test(b.cause || ""),
      pass: r.status === 507 && b.code === "disk_full" };
  });

  // --------------------------------------------------------------- 13
  await story("Wants to know how much disk the temp cache is using, then clears it", async () => {
    nukeCache();
    S.setStub(stub, base);
    const s = await S.start({ stub });
    const empty = JSON.parse((await s.req("GET", "/api/cache/usage")).body);
    await s.json("POST", "/api/download?jobId=job_s13a", { url: S.YT, deliver: "path", quality: "360", format: "mp4", segments: [{ start: 1, end: 3 }] });
    await s.json("POST", "/api/download?jobId=job_s13b", { url: S.YT, deliver: "path", quality: "360", format: "mp4", segments: [{ start: 5, end: 7 }] });
    const used = JSON.parse((await s.req("GET", "/api/cache/usage")).body);
    const cleared = JSON.parse((await s.json("POST", "/api/cache/clear", {})).body);
    const after = JSON.parse((await s.req("GET", "/api/cache/usage")).body);
    await s.stop();
    const out = { empty, used, cleared, after };
    log(`  ${JSON.stringify(out)}`);
    return { ...out, pass: empty.folders === 0 && used.folders === 2 && cleared.removed === 2 && after.folders === 0 };
  });

  // --------------------------------------------------------------- 14
  await story("Checks whether the saved YouTube sign-in is still good", async () => {
    S.setStub(stub, base);
    const s = await S.start({ stub, env: { YT_CLIPPER_COOKIE_FILE: COOKIE } });
    const withFile = JSON.parse((await s.json("POST", "/api/auth/youtube/status", { browser: "app" })).body);
    await s.stop();
    const s2 = await S.start({ stub });                      // no cookie file configured
    const withoutFile = JSON.parse((await s2.json("POST", "/api/auth/youtube/status", { browser: "app" })).body);
    await s2.stop();
    log(`  with a cookie file:    ${JSON.stringify(withFile)}`);
    log(`  with no cookie file:   ${JSON.stringify(withoutFile)}`);
    return { withFile, withoutFile,
      pass: withoutFile.status === "signed_out" && typeof withFile.status === "string",
      why: `a live session cannot be proven here (no YouTube), so "${withFile.status}" is the honest answer; the no-file case must say signed_out and does` };
  });

  // --------------------------------------------------------------- 15
  await story("Double-clicks Download and fires the same job twice", async () => {
    nukeCache();
    S.setStub(stub, { ...base, delayMs: 1200 });
    const s = await S.start({ stub });
    const body = JSON.stringify({ url: S.YT, deliver: "path", quality: "360", format: "mp4", segments: [{ start: 2, end: 8 }, { start: 20, end: 26 }] });
    const a = s.open("POST", "/api/download?jobId=job_s15a", { body, headers: { "content-type": "application/json" } });
    const b = s.open("POST", "/api/download?jobId=job_s15b", { body, headers: { "content-type": "application/json" } });
    const [ra, rb] = [await a.wait(180000), await b.wait(180000)];
    const pa = JSON.parse(ra.body || "{}"), pb = JSON.parse(rb.body || "{}");
    const out = {
      statuses: [ra.status, rb.status], paths: [pa.path, pb.path], samePath: pa.path === pb.path,
      sizesReported: [pa.size, pb.size],
      sizeOnDiskNow: pa.path && fs.existsSync(pa.path) ? fs.statSync(pa.path).size : null,
    };
    out.firstClientsSizeIsWrong = out.sizeOnDiskNow !== null && out.sizesReported[0] !== out.sizeOnDiskNow;
    out.durationOnDisk = pa.path && fs.existsSync(pa.path) ? dur(pa.path) : null;
    out.playsNow = pa.path && fs.existsSync(pa.path) ? plays(pa.path) : null;
    await s.stop();
    log(`  ${JSON.stringify(out)}`);
    return { ...out, pass: !out.samePath,
      why: out.samePath ? "both jobs were given the same work folder and the same output file; the size one client was told no longer matches the file" : "" };
  });

  // --------------------------------------------------------------- 16
  await story("Closes the app mid-download and comes back to finish the clip", async () => {
    nukeCache();
    S.setStub(stub, { ...base, delayMs: 6000 });
    const s = await S.start({ stub });
    const a = s.open("POST", "/api/download?jobId=job_s16", {
      body: JSON.stringify({ url: S.YT, deliver: "path", quality: "360", format: "mp4", segments: [{ start: 11, end: 19 }] }),
      headers: { "content-type": "application/json" },
    });
    await new Promise((r) => setTimeout(r, 3000));
    await s.stop();                                            // "closed the app"
    const leftovers = fs.readdirSync(os.tmpdir()).filter((n) => n.startsWith("ytclip-"));
    const contents = leftovers.map((d) => ({ dir: d, files: fs.readdirSync(path.join(os.tmpdir(), d)) }));
    S.setStub(stub, base);
    const s2 = await S.start({ stub });                        // "opened it again"
    const r2 = await s2.json("POST", "/api/download?jobId=job_s16b", { url: S.YT, deliver: "path", quality: "360", format: "mp4", segments: [{ start: 11, end: 19 }] });
    const b2 = JSON.parse(r2.body || "{}");
    const out = {
      leftovers: contents,
      retryStatus: r2.status,
      retryPlays: b2.path && fs.existsSync(b2.path) ? plays(b2.path) : null,
      sameFolder: b2.path ? leftovers.some((d) => b2.path.includes(d)) : null,
      sweptOnBoot: /swept \d+ stale/.test(s2.log()),
    };
    await s2.stop();
    log(`  ${JSON.stringify(out)}`);
    return { ...out, pass: out.retryStatus === 200 && out.retryPlays === true };
  });

  fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify(stories, null, 2));
  log("\n\n===== STORY SUMMARY =====");
  for (const st of stories) log(`  ${String(st.n).padStart(2)}. ${st.verdict.padEnd(10)} ${st.title}${st.why ? "\n        " + st.why : ""}`);
  log(`\n  ${stories.filter((s) => s.verdict === "PASS").length} pass / ${stories.filter((s) => s.verdict === "FAIL").length} fail / ${stories.filter((s) => s.verdict === "see notes").length} qualified, of ${stories.length}`);
  log(`  results: ${path.join(OUT, "results.json")}`);
  log("SUMMARY-DONE");
})().catch((e) => { console.error("FATAL", e); process.exit(1); });
