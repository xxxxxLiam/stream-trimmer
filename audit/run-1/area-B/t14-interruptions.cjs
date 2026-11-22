/**
 * File: t14-interruptions.cjs
 * Description: Interruptions. yt-dlp fails mid-cut; yt-dlp stalls and the user
 *   cancels; the app is killed mid-cut and relaunched — is the state consistent
 *   and is the temp file orphaned?
 */
const fs = require("node:fs");
const path = require("node:path");
const { boot, stubRoot } = require("./boot.cjs");
const { live, S, loadLive, markLive } = require("./live.cjs");
const STUB = process.env.STUB || "/tmp/claude-0/-home-user-stream-trimmer/fbb59225-b5c7-558d-a212-aff901156a0b/scratchpad/stubB";
const CLIPS = "/tmp/claude-0/-home-user-stream-trimmer/fbb59225-b5c7-558d-a212-aff901156a0b/scratchpad/clips-t14";

const jobDirs = () => fs.readdirSync("/tmp").filter((d) => d.startsWith("ytclip-"));
const jobBytes = () => {
  let total = 0;
  for (const d of jobDirs()) {
    for (const f of fs.readdirSync(path.join("/tmp", d))) {
      try { total += fs.statSync(path.join("/tmp", d, f)).size; } catch {}
    }
  }
  return total;
};

async function waitIdle(a, ms = 120000) {
  const t0 = Date.now();
  for (;;) {
    const l = await live(a).catch(() => null);
    if (!l || !l.cancelVisible) return true;
    if (Date.now() - t0 > ms) return false;
    await a.win.waitForTimeout(500);
  }
}

(async () => {
  fs.rmSync(CLIPS, { recursive: true, force: true });
  fs.mkdirSync(CLIPS, { recursive: true });
  for (const d of jobDirs()) fs.rmSync(path.join("/tmp", d), { recursive: true, force: true });

  const stub = stubRoot(STUB);
  stub.write({ info: { id: "stub0000001", title: "Interrupt video", duration: 30, uploader: "Ch" }, transcriptLines: 8, transcriptCueSec: 4, delayMs: 0, exitCode: 0, stderr: "", writeMedia: true });

  const a = await boot({
    label: "t14-interrupt",
    stub: STUB,
    viewport: { width: 1440, height: 900 },
    seed: { "clipper.saveDir": CLIPS, "clipper.saveDirs": [CLIPS] },
  });
  await loadLive(a, "https://www.youtube.com/watch?v=stub0000001");
  await a.win.waitForTimeout(800);

  // --- 1. yt-dlp fails mid-cut --------------------------------------------
  console.log("=== 1. yt-dlp fails ===");
  await markLive(a, "00:00:02", "00:00:08");
  await a.win.keyboard.press("Control+Shift+Enter");
  await a.win.waitForTimeout(300);
  stub.write({ exitCode: 1, stderr: "ERROR: [youtube] stub0000001: Video unavailable. This video has been removed by the uploader" });
  await a.win.click(S.cut);
  await waitIdle(a);
  await a.win.waitForTimeout(1500);
  let l = await live(a);
  console.log("error shown:", JSON.stringify(l.alert || l.status));
  console.log("segments kept:", JSON.stringify(l.rows));
  console.log("clips dir:", JSON.stringify(fs.readdirSync(CLIPS)));
  console.log("temp job dirs left:", JSON.stringify(jobDirs()), jobBytes(), "bytes");
  console.log("next step offered:", await a.win.evaluate(() => {
    const el = Array.from(document.querySelectorAll('[role="alert"]')).map((e) => e.innerText.replace(/\s+/g, " ").trim());
    return el;
  }));
  console.log("shot:", await a.shot("ytdlp-failed"));

  // retry after fixing the cause
  stub.write({ exitCode: 0, stderr: "" });
  await a.win.click(S.cut);
  await waitIdle(a);
  await a.win.waitForTimeout(1500);
  console.log("retry after the failure — clips:", JSON.stringify(fs.readdirSync(CLIPS)));
  console.log("shot:", await a.shot("retry-ok"));

  // --- 2. stall, then cancel ----------------------------------------------
  console.log("\n=== 2. stall, then cancel ===");
  stub.write({ delayMs: 20000 });
  await markLive(a, "00:00:12", "00:00:18");
  await a.win.keyboard.press("Control+Shift+Enter");
  await a.win.click(S.cut);
  await a.win.waitForTimeout(3000);
  l = await live(a);
  console.log("while stalled:", JSON.stringify({ status: l.status, cancel: l.cancelVisible, cut: l.cutDisabled }));
  console.log("temp dirs during the stall:", JSON.stringify(jobDirs()));
  console.log("shot:", await a.shot("stalled"));
  await a.win.locator('button:has-text("Cancel")').locator("visible=true").first().click();
  await a.win.waitForTimeout(2000);
  l = await live(a);
  console.log("after cancel:", JSON.stringify({ status: l.status, alert: l.alert, rows: l.rows, cancel: l.cancelVisible }));
  console.log("temp dirs after cancel:", JSON.stringify(jobDirs()), jobBytes(), "bytes");
  console.log("clips dir:", JSON.stringify(fs.readdirSync(CLIPS)));
  console.log("yt-dlp still running?", require("node:child_process").execSync("ps -ef | grep -c '[y]t-dlp' || true").toString().trim());
  console.log("shot:", await a.shot("after-cancel"));

  // --- 3. killed mid-cut ---------------------------------------------------
  console.log("\n=== 3. killed mid-cut ===");
  stub.write({ delayMs: 25000 });
  await a.win.click(S.cut);
  await a.win.waitForTimeout(4000);
  console.log("mid-cut:", JSON.stringify((await live(a)).status), "temp dirs:", JSON.stringify(jobDirs()));
  const stateBefore = a.readState();
  const udd = a.userDataDir;
  console.log("state before the kill:", JSON.stringify({
    downloads: (stateBefore["clipper.downloads"] || []).length,
    workspaces: stateBefore["clipper.workspaces"],
  }));
  a.app.process().kill("SIGKILL");
  await new Promise((r) => setTimeout(r, 4000));
  console.log("after SIGKILL — temp dirs orphaned:", JSON.stringify(jobDirs()), jobBytes(), "bytes");
  console.log("clips dir:", JSON.stringify(fs.readdirSync(CLIPS)));
  console.log("stray yt-dlp processes:", require("node:child_process").execSync("ps -ef | grep '[y]t-dlp' | wc -l").toString().trim());
  const persisted = JSON.parse(fs.readFileSync(path.join(udd, "settings.json"), "utf8"));
  console.log("settings.json survived with keys:", JSON.stringify(Object.keys(persisted)));
  console.log("downloads recorded:", (persisted["clipper.downloads"] || []).length);

  const b = await boot({
    label: "t14-relaunch",
    stub: STUB,
    viewport: { width: 1440, height: 900 },
    seed: persisted,
  });
  await b.win.waitForTimeout(2500);
  const lb = await live(b);
  console.log("\nafter relaunch:", JSON.stringify({ source: lb.source, rows: lb.rows, status: lb.status }));
  console.log("downloads panel count:", (b.readState()["clipper.downloads"] || []).length);
  // Does the app tell the user about the orphaned partials?
  console.log("partials notice on screen:", await b.win.evaluate(() => {
    const t = document.body.innerText;
    const line = t.split("\n").find((x) => /partial/i.test(x));
    return line || "(none)";
  }));
  console.log("temp dirs still there:", JSON.stringify(jobDirs()), jobBytes(), "bytes");
  console.log("shot:", await b.shot("after-kill-relaunch"));
  await b.close();
})().catch((e) => {
  console.error("FAILED", e);
  process.exit(1);
});
