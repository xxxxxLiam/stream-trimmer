/**
 * v-g10-cancel.cjs — VERIFY G-10: "cancelling a download does not stop it:
 * yt-dlp keeps running and there is no cancel endpoint".
 *
 * Written from the finding's Steps, from scratch.
 *   1. Cold start the real app with my stub at delayMs 3000, so each child
 *      lives long enough to be counted.
 *   2. POST /api/download and hang up the socket while a section run is in
 *      flight (destroy the client socket — what a browser does on abort).
 *   3. Count the live yt-dlp children at +0.3s, +1.5s, +4s, +12s by reading
 *      /proc (no `ps` parsing), matching on the stub path so only THIS run's
 *      children count.
 *   4. Probe for a cancel route.
 *
 * Disproof attempts built in:
 *   - A CONTROL on /api/auth/youtube/status, which DOES register
 *     res.on("close") and kill its child. If the counter cannot see that one
 *     die, the counter is broken, not the server.
 *   - The children are matched by the stub's own path, so another helper's
 *     yt-dlp cannot be counted.
 *   - The run is also checked for whether the child finished on its own
 *     (which is not the same as being killed).
 *
 * Run: xvfb-run -a --server-args="-screen 0 1440x900x24" node v-g10-cancel.cjs [runLabel]
 */
const fs = require("node:fs");
const http = require("node:http");
const L = require("./v-lib.cjs");

/** Live processes whose cmdline mentions this stub root. */
function children(stubRoot, filter) {
  const rows = [];
  let pids = [];
  try { pids = fs.readdirSync("/proc").filter((d) => /^\d+$/.test(d)); } catch {}
  for (const pid of pids) {
    let cmd = "";
    try { cmd = fs.readFileSync(`/proc/${pid}/cmdline`, "utf8").replace(/\0/g, " ").trim(); } catch { continue; }
    if (!cmd.includes(stubRoot)) continue;
    if (!cmd.includes("yt-dlp")) continue;
    if (filter && !filter.test(cmd)) continue;
    rows.push({ pid: Number(pid), cmd: cmd.slice(0, 200) });
  }
  return rows;
}

function postAndAbort(port, path, body, abortAfterMs) {
  return new Promise((resolve) => {
    const payload = JSON.stringify(body);
    const r = http.request(
      { host: "127.0.0.1", port, method: "POST", path, headers: { "content-type": "application/json", "content-length": Buffer.byteLength(payload) } },
      (res) => { res.resume(); res.on("end", () => resolve({ completed: true, status: res.statusCode })); },
    );
    r.on("error", (e) => resolve({ aborted: true, error: String(e.code || e.message) }));
    r.write(payload);
    r.end();
    setTimeout(() => { r.destroy(); resolve({ aborted: true, at: abortAfterMs }); }, abortAfterMs);
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const runLabel = process.argv[2] || "r1";
  const out = { runLabel, startedAt: new Date().toISOString() };

  const stubRoot = L.makeStub(`g10-${runLabel}`);
  // 25 s so the child CANNOT finish naturally inside the observation window:
  // if it is still alive 12 s after the client left, nothing killed it.
  L.stub(stubRoot, { infoDelayMs: 0, downloadDelayMs: 25000 });
  const a = await L.launchMirror({ shape: "public", label: `v-g10-${runLabel}`, stubRoot, seed: { "clipper.dataDirConfirmed": true } });
  await a.win.waitForSelector("header", { timeout: 20000 });
  out.apiBase = a.apiBase;

  // ---------- the subject: /api/download -------------------------------
  const sectionRe = /download-sections|--download-sections/;
  const dl = postAndAbort(a.port, "/api/download?jobId=v_g10", {
    url: "https://www.youtube.com/watch?v=stub0000001",
    quality: "360", format: "mp4", deliver: "path",
    segments: [{ start: 0, end: 4 }],
  }, 4000);

  const timeline = [];
  let tracked = null; // the pid of THIS job's section-download child
  const alive = (pid) => { try { fs.readFileSync(`/proc/${pid}/cmdline`); return true; } catch { return false; } };
  const sample = async (label) => {
    const all = children(stubRoot);
    const sections = children(stubRoot, sectionRe);
    if (!tracked && sections.length) tracked = sections[0].pid;
    timeline.push({
      at: label,
      sectionRuns: sections.length,
      trackedPid: tracked,
      trackedStillAlive: tracked ? alive(tracked) : null,
      allStubChildren: all.length,
      pids: all.map((c) => c.pid),
    });
  };
  await sleep(3800); await sample("t=3.8s (section run in flight)");
  const abortResult = await dl;                    // fires the abort at t=4s
  out.abortResult = abortResult;
  await sleep(300);  await sample("t=+0.3s after abort");
  await sleep(1200); await sample("t=+1.5s after abort");
  await sleep(2500); await sample("t=+4s after abort");
  await sleep(8000); await sample("t=+12s after abort");
  out.G10_timeline = timeline;
  out.G10_trackedPid = tracked;
  out.G10_stillRunningAfterAbort = timeline[1].trackedStillAlive === true;
  out.G10_stillRunning12sAfterAbort = timeline[timeline.length - 1].trackedStillAlive === true;
  out.G10_serverSaysItKilled = a.logs.stdout.join("").toLowerCase().includes("kill");

  // ---------- CONTROL: a route that DOES kill on close ------------------
  // /api/auth/youtube/status registers res.on("close") and SIGKILLs the live
  // child. If the same counter sees that child vanish immediately, the
  // counter works and the /api/download result above is about the server.
  await sleep(1500);
  const ctlTimeline = [];
  const simulateRe = /--simulate/;
  let ctlPid = null;
  // The app's own boot sweep leaves --simulate children around, and they are
  // stalled too, so snapshot them first and track only a NEW one.
  const before = new Set(children(stubRoot, simulateRe).map((c) => c.pid));
  out.control_preexistingSimulatePids = [...before];
  const ctl = postAndAbort(a.port, "/api/auth/youtube/status", { browser: "chrome" }, 3000);
  await sleep(2500);
  const c0 = children(stubRoot, simulateRe).filter((c) => !before.has(c.pid));
  ctlPid = c0.length ? c0[0].pid : null;
  ctlTimeline.push({ at: "t=2.5s (probe child alive)", pid: ctlPid, alive: ctlPid ? alive(ctlPid) : null, simulateRuns: c0.length, newPids: c0.map((c) => c.pid) });
  out.controlAbort = await ctl;
  await sleep(600);
  ctlTimeline.push({ at: "t=+0.6s after abort", pid: ctlPid, alive: ctlPid ? alive(ctlPid) : null, simulateRuns: children(stubRoot, simulateRe).length });
  await sleep(1500);
  ctlTimeline.push({ at: "t=+2.1s after abort", pid: ctlPid, alive: ctlPid ? alive(ctlPid) : null, simulateRuns: children(stubRoot, simulateRe).length });
  out.control_authProbeTimeline = ctlTimeline;
  out.control_counterCanSeeAKill = ctlTimeline[0].alive === true && ctlTimeline[1].alive === false;

  // ---------- cancel routes --------------------------------------------
  out.G10_cancelRoutes = {};
  for (const p of ["/api/download/cancel", "/api/download/stop", "/api/cancel", "/api/download/abort"]) {
    const r = await L.req({ port: a.port, method: "POST", path: p, headers: { "content-type": "application/json" }, body: "{}" });
    out.G10_cancelRoutes[p] = { status: r.status, isHtml404: r.status === 404 };
  }
  // and a route that DOES exist, as a control for the 404s
  const existing = await L.req({ port: a.port, path: "/api/cache/usage" });
  out.G10_existingRouteControl = existing.status;

  out.shot = await a.shot("end");
  await a.close();

  out.summary = {
    timeline: timeline.map((t) => `${t.at}: trackedPid=${t.trackedPid} alive=${t.trackedStillAlive} sectionRuns=${t.sectionRuns}`),
    stillRunningAfterAbort: out.G10_stillRunningAfterAbort,
    stillRunning12sAfterAbort: out.G10_stillRunning12sAfterAbort,
    serverLogMentionsAKill: out.G10_serverSaysItKilled,
    counterProvenToSeeAKill: out.control_counterCanSeeAKill,
    control: out.control_authProbeTimeline.map((t) => `${t.at}: pid=${t.pid} alive=${t.alive}`),
    cancelRoutes: out.G10_cancelRoutes,
  };
  console.log(JSON.stringify(out.summary, null, 2));
  console.log(L.save(`v-g10-${runLabel}.json`, out));
})();
