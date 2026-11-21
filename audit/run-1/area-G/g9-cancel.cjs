#!/usr/bin/env node
/**
 * G area, audit-only. Cancellation, in detail.
 *
 * /api/download has no cancel route and, unlike /api/auth/youtube/status, no
 * res.on("close") handler that kills its child. This measures what actually
 * happens to the yt-dlp process when the client hangs up.
 *
 * Run: node audit/run-1/area-G/g9-cancel.cjs
 */
const fs = require("node:fs");
const path = require("node:path");
const { execSync } = require("node:child_process");
const S = require("./srv.cjs");

const OUT = path.join(__dirname, "out-g9");
const out = {};
const log = (...a) => console.log(...a);

const psLines = () => {
  try { return execSync("ps -eo pid,ppid,etimes,args").toString().split("\n"); } catch { return []; }
};
const matching = (...needles) =>
  psLines().filter((l) => needles.every((n) => l.includes(n)) && !l.includes("ps -eo"))
    .map((l) => l.trim());

(async () => {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  const stub = S.makeStub("g9");
  const STUBBIN = path.join(stub, "resources", "bin", "yt-dlp");
  const DL = { url: S.YT, deliver: "path", quality: "360", format: "mp4", segments: [{ start: 0, end: 5 }] };

  // Probe and download each take 3s, so there is a clean window where the
  // SECTION run (the one doing the work) is the live child.
  S.setStub(stub, { info: { id: "stub0000001", title: "Stub", duration: 30 }, delayMs: 3000 });
  const s = await S.start({ stub });

  const snap = (tag) => {
    const probe = matching(STUBBIN, "--dump-single-json");
    const section = matching(STUBBIN, "--download-sections");
    log(`  [${tag}] probe-children=${probe.length} section-children=${section.length}`);
    return { tag, probe: probe.length, section: section.length, sectionCmd: section.slice(0, 1) };
  };

  log("=== client hangs up while the SECTION download is in flight ===");
  const timeline = [];
  const a = s.open("POST", "/api/download?jobId=job_g9_cancel", {
    body: JSON.stringify(DL), headers: { "content-type": "application/json" },
  });
  await new Promise((r) => setTimeout(r, 1000)); timeline.push(snap("t=1s (probe running)"));
  await new Promise((r) => setTimeout(r, 3000)); timeline.push(snap("t=4s (section running)"));
  const atAbort = snap("t=4s just before abort");
  a.abort();
  log("  >>> client aborted");
  await new Promise((r) => setTimeout(r, 300));  timeline.push(snap("t=4.3s (0.3s after abort)"));
  await new Promise((r) => setTimeout(r, 1200)); timeline.push(snap("t=5.5s (1.5s after abort)"));
  const res = await a.wait(5000);
  await new Promise((r) => setTimeout(r, 2500)); timeline.push(snap("t=8s (4s after abort)"));
  await new Promise((r) => setTimeout(r, 4000)); timeline.push(snap("t=12s"));

  const sectionsAfterAbort = timeline.filter((t) => /after abort/.test(t.tag) && t.section > 0);
  out.orphan = {
    clientResult: res,
    timeline,
    sectionChildAliveAfterAbort: sectionsAfterAbort.length > 0,
    sectionChildCmd: (sectionsAfterAbort[0] || {}).sectionCmd || null,
    serverKilledIt: /kill|SIGKILL/i.test(s.log()),
  };
  log(`  >>> yt-dlp still running after the client hung up: ${out.orphan.sectionChildAliveAfterAbort}`);
  log(`  >>> anything in the server log about killing it: ${out.orphan.serverKilledIt}`);

  log("\n=== for contrast: /api/auth/youtube/status DOES kill its child on close ===");
  S.setStub(stub, { info: { id: "stub0000001", title: "Stub", duration: 30 }, delayMs: 6000 });
  const b = s.open("POST", "/api/auth/youtube/status", {
    body: JSON.stringify({ browser: "chrome" }), headers: { "content-type": "application/json" },
  });
  await new Promise((r) => setTimeout(r, 1500));
  const probeKids = matching(STUBBIN, "--simulate");
  log(`  probe children while running: ${probeKids.length}`);
  b.abort();
  await new Promise((r) => setTimeout(r, 1200));
  const after = matching(STUBBIN, "--simulate");
  log(`  probe children 1.2s after abort: ${after.length}`);
  out.authProbeCancel = { whileRunning: probeKids.length, afterAbort: after.length, killedOnClose: probeKids.length > 0 && after.length === 0 };
  log(`  >>> killed on close: ${out.authProbeCancel.killedOnClose}`);

  log("\n=== does the work folder survive an abandoned job, and is it resumable? ===");
  const os_ = require("node:os");
  out.leftovers = {
    clipDirs: fs.readdirSync(os_.tmpdir()).filter((n) => n.startsWith("ytclip-")).length,
    usage: (await s.req("GET", "/api/cache/usage")).body,
  };
  log(`  ${JSON.stringify(out.leftovers)}`);

  await s.stop();
  fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify(out, null, 2));
  log(`\nresults: ${path.join(OUT, "results.json")}`);
  log("SUMMARY-DONE");
})().catch((e) => { console.error("FATAL", e); process.exit(1); });
