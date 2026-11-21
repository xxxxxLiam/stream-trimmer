/**
 * File: b07-b6-cancel.cjs
 * Path: audit/run-2/area-B/b07-b6-cancel.cjs
 * Description: B-6 — Cancel not stopping the engine, and killing the app orphaning it.
 *   Three checks, all on real processes:
 *     1. press Cancel in the status strip during a stalled cut, then count yt-dlp
 *        children 2 s, 8 s and 15 s later;
 *     2. drive POST /api/download/cancel directly and assert the contract T1 published
 *        (200 {ok,found}, and the cancelled /api/download answering 499 "cancelled");
 *     3. SIGKILL the app mid-cut and count the orphans it leaves.
 *   The control is run 1's own numbers (1 child still running 15 s after Cancel, 2
 *   orphans after a kill) and ROOT=<scratch>/ctrlA re-runs it here.
 */
const { execSync } = require("node:child_process");
const fs = require("node:fs");
const { boot, live, loadLive, markLive, stubRoot, S } = require("./lib.cjs");

const SCRATCH = "/tmp/claude-0/-home-user-stream-trimmer/fbb59225-b5c7-558d-a212-aff901156a0b/scratchpad/b2";
const STUB = process.env.STUB || `${SCRATCH}/stub`;
const ROOT = process.env.ROOT || "/home/user/stream-trimmer";
const TAG = process.env.TAG || ROOT.split("/").pop();
const CLIPS = `${SCRATCH}/clips-b07-${TAG}`;

function ytdlpProcs() {
  try {
    const out = execSync("ps -eo pid,etimes,args", { encoding: "utf8" });
    return out
      .split("\n")
      // Other run-2 helpers have their own stub roots running at the same time:
      // count only children spawned from THIS script's stub.
      .filter((l) => l.includes(STUB + "/resources/bin/yt-dlp") && !l.includes("grep"))
      .map((l) => l.trim());
  } catch {
    return [];
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  console.log(`=== B-6 cancel ===\nROOT=${ROOT}  TAG=${TAG}`);
  fs.rmSync(CLIPS, { recursive: true, force: true });
  fs.mkdirSync(CLIPS, { recursive: true });
  const stub = stubRoot(STUB);
  stub.write({ info: { id: "fffffffffff", title: "Cancel video", duration: 30, uploader: "Ch" }, transcriptLines: 8, delayMs: 0, exitCode: 0, writeMedia: true });

  const a = await boot({
    label: `b07-${TAG}`,
    root: ROOT,
    stub: STUB,
    viewport: { width: 1440, height: 900 },
    seed: { "clipper.saveDir": CLIPS, "clipper.saveDirs": [CLIPS] },
  });
  await loadLive(a, "https://www.youtube.com/watch?v=fffffffffff");
  await markLive(a, "00:00:02", "00:00:12");
  await a.win.click(S.add);
  await a.win.waitForTimeout(300);

  console.log("\n--- 1. Cancel in the UI during a stalled cut ---");
  console.log("yt-dlp before:", ytdlpProcs().length);
  stub.write({ delayMs: 60000 }); // the engine hangs for a minute
  await a.win.click(S.cut);
  await sleep(4000);
  console.log("during the cut:", ytdlpProcs().length, "yt-dlp process(es)");
  for (const p of ytdlpProcs()) console.log("   ", p.slice(0, 110));
  console.log("UI:", JSON.stringify(await live(a)));
  const cancelBtn = a.win.locator("button", { hasText: /^Cancel$/ }).first();
  console.log("Cancel button present:", await cancelBtn.count());
  await cancelBtn.click({ timeout: 5000 }).catch((e) => console.log("cancel click:", String(e).slice(0, 80)));
  for (const t of [2000, 6000, 7000]) {
    await sleep(t);
    const n = ytdlpProcs();
    console.log(`  +${t}ms after Cancel: ${n.length} yt-dlp process(es) still running`);
    for (const p of n) console.log("     ", p.slice(0, 110));
  }
  console.log("UI after Cancel:", JSON.stringify(await live(a)));
  console.log("shot:", await a.shot("after-cancel"));
  console.log("clips dir:", JSON.stringify(fs.readdirSync(CLIPS)));

  console.log("\n--- 2. the published contract: POST /api/download/cancel and a 499 ---");
  stub.write({ delayMs: 20000 });
  const contract = await a.win.evaluate(async () => {
    const base = window.__API_BASE__ || "";
    const jobId = `audit_${Date.now()}`;
    const post = (p, body) =>
      fetch(base + p, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    // Start a download that will stall, then cancel it by jobId.
    const dl = post(`/api/download?jobId=${encodeURIComponent(jobId)}`, {
      url: "https://www.youtube.com/watch?v=ffffffffff",
      segments: [{ start: 2, end: 6 }],
      format: "mp4",
      quality: "360",
      jobId,
    });
    await new Promise((r) => setTimeout(r, 3000));
    const c = await post("/api/download/cancel", { jobId });
    const cancelBody = await c.text();
    let dlStatus = null;
    let dlBody = null;
    try {
      const r = await dl;
      dlStatus = r.status;
      dlBody = (await r.text()).slice(0, 220);
    } catch (e) {
      dlStatus = "threw: " + String(e).slice(0, 80);
    }
    // And a cancel for a job that does not exist, plus one with no jobId at all.
    const none = await post("/api/download/cancel", { jobId: "no-such-job" });
    const bad = await post("/api/download/cancel", {});
    return {
      cancelStatus: c.status,
      cancelBody: cancelBody.slice(0, 160),
      downloadStatus: dlStatus,
      downloadBody: dlBody,
      unknownJob: { status: none.status, body: (await none.text()).slice(0, 120) },
      noJobId: { status: bad.status, body: (await bad.text()).slice(0, 120) },
    };
  });
  console.log(JSON.stringify(contract, null, 2));
  await sleep(1500);
  console.log("yt-dlp after the direct cancel:", ytdlpProcs().length);

  console.log("\n--- 3. SIGKILL the app mid-cut ---");
  stub.write({ delayMs: 60000 });
  await a.win.locator(S.cut).click({ timeout: 8000 }).catch(() => {});
  await sleep(4000);
  const before = ytdlpProcs();
  console.log("before SIGKILL:", before.length, "yt-dlp process(es)");
  const pid = a.app.process().pid;
  try {
    process.kill(-pid, "SIGKILL");
  } catch {
    try {
      process.kill(pid, "SIGKILL");
    } catch {}
  }
  await sleep(6000);
  const after = ytdlpProcs();
  console.log("6s after the app was killed:", after.length, "yt-dlp process(es) still running");
  for (const p of after) console.log("   ", p.slice(0, 110));
  // leave nothing behind for the next script
  for (const p of after) {
    const id = p.split(/\s+/)[0];
    try {
      process.kill(Number(id), "SIGKILL");
    } catch {}
  }
})().catch((e) => {
  console.error("SCRIPT FAILED", e);
  process.exit(1);
});
