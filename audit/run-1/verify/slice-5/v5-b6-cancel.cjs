/**
 * File: v5-b6-cancel.cjs
 * Path: audit/run-1/verify/slice-5/v5-b6-cancel.cjs
 * Description: B-6 verification. Marks a range, starts a cut against a yt-dlp
 *   that takes minutes, presses Cancel, and counts the engine processes that
 *   are still alive 15 s later. Then starts another cut and SIGKILLs the app,
 *   and counts again.
 *
 *   Process counting is done on this verifier's own stub path, so another
 *   helper's run cannot be mistaken for ours.
 *
 *   Audit-only; changes no product code.
 */
const { execSync } = require("node:child_process");
const { boot, loadVideo, setStub, log, STUB } = require("./v5-lib.cjs");

function engineProcs() {
  try {
    const out = execSync(
      `ps -eo pid,etimes,args | grep -F '${STUB}/resources/bin/yt-dlp' | grep -v grep || true`,
    ).toString().trim();
    return out ? out.split("\n").map((l) => l.trim()) : [];
  } catch {
    return [];
  }
}

async function once(run) {
  // The metadata probe must stay fast, or the video never loads; only the
  // DOWNLOAD must take minutes, so the cut is still in flight at Cancel.
  setStub({ delayMs: 0, progress: [0, 50, 100] });
  const before = engineProcs();
  const a = await boot(`b6-${run}`);
  const out = { run, strayBefore: before.length };

  await loadVideo(a);
  setStub({ delayMs: 240000, progress: [0, 10, 20] });
  await a.win.fill("#ui-mark-in", "00:00:05");
  await a.win.fill("#ui-mark-out", "00:00:12");
  await a.win.click("#ui-add-segment", { force: true });
  await a.win.waitForTimeout(500);
  await a.win.click("#ui-cut", { force: true });

  // wait for the Cancel control to appear = the cut is genuinely running
  const cancel = a.win.locator('button:has-text("Cancel")').first();
  await cancel.waitFor({ timeout: 60000 });
  await a.win.waitForTimeout(2500);
  out.duringCut = engineProcs();
  await a.shot("b6-01-cut-running");

  await cancel.click();
  await a.win.waitForTimeout(1500);
  out.uiAfterCancel = await a.win.evaluate(() => ({
    cancelStillShown: [...document.querySelectorAll("button")].some(
      (b) => b.innerText.trim() === "Cancel",
    ),
    statusText: (document.querySelector('[role="status"]') || { innerText: "" }).innerText.trim(),
  }));
  await a.shot("b6-02-after-cancel");

  await a.win.waitForTimeout(15000);
  out.fifteenSecondsAfterCancel = engineProcs();

  // Second cut, then kill the app outright.
  await a.win.click("#ui-cut", { force: true }).catch(() => {});
  await a.win.waitForTimeout(3000);
  out.beforeKill = engineProcs();
  try {
    a.app.process().kill("SIGKILL");
  } catch {}
  await new Promise((r) => setTimeout(r, 6000));
  out.sixSecondsAfterKill = engineProcs();

  // leave nothing behind for the next run
  for (const line of out.sixSecondsAfterKill) {
    const pid = Number(line.split(/\s+/)[0]);
    if (pid) { try { process.kill(pid, "SIGKILL"); } catch {} }
  }
  setStub({ delayMs: 0, progress: [0, 50, 100] });
  return out;
}

(async () => {
  for (const run of [1, 2]) {
    const o = await once(run);
    log(`\n=== B-6 run ${run} ===`);
    log("stray engine processes before the run:", o.strayBefore);
    log(`during the cut: ${o.duringCut.length} yt-dlp process(es)`);
    o.duringCut.forEach((l) => log("   ", l.slice(0, 120)));
    log("UI right after Cancel:", JSON.stringify(o.uiAfterCancel));
    log(`15s after Cancel: ${o.fifteenSecondsAfterCancel.length} still running`);
    o.fifteenSecondsAfterCancel.forEach((l) => log("   ", l.slice(0, 120)));
    log(`before SIGKILL of the app: ${o.beforeKill.length}`);
    log(`6s after the app was killed: ${o.sixSecondsAfterKill.length} still running`);
    o.sixSecondsAfterKill.forEach((l) => log("   ", l.slice(0, 120)));
  }
})().catch((e) => { console.error("FAILED", e); process.exit(1); });
