/**
 * File: b10-headline-and-frames.cjs
 * Path: audit/run-2/area-B/b10-headline-and-frames.cjs
 * Description: The headline assertion of this area, re-proved after the fixes, and the
 *   frame-level question the brief asks about T1's cut change.
 *
 *   1. Mark 00:00:02-00:00:07 (5s) and 00:00:20-00:00:28 (8s), Add each, Cut as one file.
 *      Exactly ONE file must appear and real ffmpeg must decode it at ~13.0s.
 *   2. Identify every delivered frame against all 750 source frames (frames.cjs). T1
 *      removed 14 frames of pre-roll from the local-trim path; this checks that nothing
 *      MARKED went with it.
 *   3. Then force the sectioned download to 403 so the server takes the whole-file +
 *      local-trim path T1 actually changed, and run the same two checks on it.
 */
const fs = require("node:fs");
const path = require("node:path");
const { boot, live, loadLive, markLive, stubRoot, ffDuration, S } = require("./lib.cjs");
const { compare } = require("./frames.cjs");

const SCRATCH = "/tmp/claude-0/-home-user-stream-trimmer/fbb59225-b5c7-558d-a212-aff901156a0b/scratchpad/b2";
const STUB = process.env.STUB || `${SCRATCH}/stub2`;
const ROOT = process.env.ROOT || "/home/user/stream-trimmer";
const TAG = process.env.TAG || ROOT.split("/").pop();
const CLIPS = `${SCRATCH}/clips-b10-${TAG}`;
const FIXTURE = `${STUB}/fixture.mp4`;
const MARKS = [
  { start: 2, end: 7 },
  { start: 20, end: 28 },
];

async function cutAndMeasure(a, stub, label) {
  const before = fs.readdirSync(CLIPS);
  stub.clearCalls();
  // The saved toast is deliberately sticky (no auto-dismiss), so an earlier cut's toast
  // would satisfy a wait for "Clip saved". Clear it first.
  await a.win.locator('button[aria-label="Dismiss"]').first().click({ timeout: 2000 }).catch(() => {});
  await a.win.waitForTimeout(300);
  await markLive(a, "00:00:02", "00:00:07");
  await a.win.click(S.add);
  await markLive(a, "00:00:20", "00:00:28");
  await a.win.click(S.add);
  await a.win.waitForTimeout(300);
  console.log(`  stitched total readout: ${await a.win.locator("#ui-stitched-total").first().innerText()} (expect 00:00:13)`);
  await a.win.click(S.cut);
  await a.win.waitForTimeout(1000);
  // Wait for the job itself to end (the Cancel button disappears), not for a toast.
  await a.win
    .waitForFunction(
      () => !Array.from(document.querySelectorAll("button")).some((b) => b.offsetParent !== null && b.innerText.trim() === "Cancel"),
      null,
      { timeout: 240000 },
    )
    .catch(() => console.log("  the job was still running after 240s"));
  await a.win.waitForTimeout(1500);
  const toast = await a.win.locator('[role="status"]:has-text("Clip saved")').count();
  const alerts = await a.win.locator('[role="alert"]').allInnerTexts();
  console.log(`  saved toast: ${toast > 0 ? "yes" : "NO"}; alerts: ${JSON.stringify(alerts.map((t) => t.replace(/\s+/g, " ").slice(0, 160)))}`);
  const added = fs.readdirSync(CLIPS).filter((f) => !before.includes(f));
  console.log(`  files this cut added: ${JSON.stringify(added)}  (expect exactly 1)`);
  for (const f of added) {
    const full = path.join(CLIPS, f);
    const d = ffDuration(full);
    console.log(`  ${f}: decoded=${d.seconds}s container=${d.header}s  (expect ~13.0)`);
    const fr = compare(FIXTURE, full, MARKS);
    console.log(`  frames vs source: ${JSON.stringify(fr, null, 2).replace(/\n/g, "\n  ")}`);
  }
  const sections = stub
    .calls()
    .map((c) => c[c.indexOf("--download-sections") + 1])
    .filter((x) => x && /^\*/.test(x));
  console.log(`  sections the engine was asked for: ${JSON.stringify(sections)}`);
  console.log(`  shot: ${await a.shot(label)}`);
  return added;
}

(async () => {
  console.log(`=== headline assertion + frame identity ===\nROOT=${ROOT}  TAG=${TAG}`);
  fs.rmSync(CLIPS, { recursive: true, force: true });
  fs.mkdirSync(CLIPS, { recursive: true });
  const stub = stubRoot(STUB);
  stub.write({
    info: { id: "jjjjjjjjjjj", title: "Headline", duration: 30, uploader: "Ch" },
    transcriptLines: 8,
    delayMs: 0,
    exitCode: 0,
    writeMedia: true,
    section403: false,
    infoFromUrl: false,
  });

  const a = await boot({
    label: `b10-${TAG}`,
    root: ROOT,
    stub: STUB,
    viewport: { width: 1440, height: 1200 },
    seed: { "clipper.saveDir": CLIPS, "clipper.saveDirs": [CLIPS] },
  });
  await loadLive(a, "https://www.youtube.com/watch?v=jjjjjjjjjjj");

  console.log("\n--- 1. the normal (sectioned) path ---");
  await cutAndMeasure(a, stub, "sectioned-cut");

  console.log("\n--- 2. the whole-file + LOCAL TRIM path (sectioned download 403s) ---");
  console.log("    this is the path T1 changed for G-4; the sectioned path never reaches it");
  stub.write({ section403: true });
  await cutAndMeasure(a, stub, "local-trim-cut");

  console.log("\nall files:", JSON.stringify(fs.readdirSync(CLIPS)));
  console.log("downloads recorded:", JSON.stringify((a.readState()["clipper.downloads"] || []).map((d) => ({ label: d.label, detail: d.detail }))));
  console.log("pane at the end:", JSON.stringify(await live(a)));
  await a.close();
})().catch((e) => {
  console.error("SCRIPT FAILED", e);
  process.exit(1);
});
