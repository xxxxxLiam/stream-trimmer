/**
 * File: b02-b2-crosstab-segments.cjs
 * Path: audit/run-2/area-B/b02-b2-crosstab-segments.cjs
 * Description: B-2 ("one global segment list is shared by every tab") with a negative
 *   control, carried through to real files on disk like run 1 did.
 *
 *   Run against ROOT=<scratch>/ctrlA (run-1 code) to see the defect, then against
 *   ROOT=/home/user/stream-trimmer. The question answered end to end: can a segment
 *   marked in tab 1 appear in — or be CUT by — tab 2, and vice versa?
 *
 *   Both videos report duration 30 so the fixture is honest media and every cut's
 *   decoded duration is a real assertion.
 *
 * Usage: ROOT=... xvfb-run -a --server-args="-screen 0 1440x900x24" node b02-b2-crosstab-segments.cjs
 */
const fs = require("node:fs");
const path = require("node:path");
const { boot, crashState, live, allPanes, loadLive, markLive, stubRoot, ffDuration, S } = require("./lib.cjs");

const SCRATCH = "/tmp/claude-0/-home-user-stream-trimmer/fbb59225-b5c7-558d-a212-aff901156a0b/scratchpad/b2";
const STUB = process.env.STUB || `${SCRATCH}/stub`;
const ROOT = process.env.ROOT || "/home/user/stream-trimmer";
const TAG = process.env.TAG || ROOT.split("/").pop();
const CLIPS = `${SCRATCH}/clips-b02-${TAG}`;

const AAA = "aaaaaaaaaaa";
const BBB = "bbbbbbbbbbb";

const clipsOnDisk = () => (fs.existsSync(CLIPS) ? fs.readdirSync(CLIPS).sort() : []);

async function waitCut(a, label) {
  await a.win
    .waitForSelector('[role="status"]:has-text("Clip saved")', { timeout: 60000 })
    .catch(async () => {
      console.log(`    [${label}] no "Clip saved": alerts =`, JSON.stringify(await a.win.locator('[role="alert"]').allInnerTexts().catch(() => [])));
    });
  await a.win.waitForTimeout(800);
}

(async () => {
  console.log(`=== B-2 cross-tab segments ===\nROOT=${ROOT}\nTAG=${TAG}\n`);
  fs.rmSync(CLIPS, { recursive: true, force: true });
  fs.mkdirSync(CLIPS, { recursive: true });

  const stub = stubRoot(STUB);
  stub.clearCalls();
  stub.write({ info: { id: AAA, title: "Video AAA", duration: 30, uploader: "Ch" }, transcriptLines: 8, delayMs: 0, writeMedia: true, exitCode: 0 });

  const a = await boot({
    label: `b02-${TAG}`,
    root: ROOT,
    stub: STUB,
    viewport: { width: 1440, height: 900 },
    seed: { "clipper.saveDir": CLIPS, "clipper.saveDirs": [CLIPS] },
  });

  // --- tab 1: video AAA, two segments of its own (3s + 4s = 7s)
  await loadLive(a, `https://www.youtube.com/watch?v=${AAA}`);
  await markLive(a, "00:00:10", "00:00:13");
  await a.win.click(S.add);
  await markLive(a, "00:00:20", "00:00:24");
  await a.win.click(S.add);
  await a.win.waitForTimeout(400);
  console.log("TAB1 (Video AAA) after two segments:", JSON.stringify(await live(a)));
  console.log("shot:", await a.shot("tab1-two-segments"));

  // --- open tab 2. Run 1: tab 1's segments were wiped right here.
  await a.win.click(S.newTab);
  await a.win.waitForTimeout(1500);
  console.log("\nAFTER OPENING TAB 2 — ALL PANES:", JSON.stringify(await allPanes(a)));

  // --- tab 2: a DIFFERENT video, and a range only ever marked on it
  stub.write({ info: { id: BBB, title: "Video BBB", duration: 30, uploader: "Ch" } });
  await loadLive(a, `https://www.youtube.com/watch?v=${BBB}`);
  console.log("after loading BBB in tab 2 — ALL PANES:", JSON.stringify(await allPanes(a)));
  await markLive(a, "00:00:02", "00:00:05");
  await a.win.click(S.add);
  await a.win.waitForTimeout(600);
  console.log("\nafter adding 00:00:02-00:00:05 in TAB 2 — ALL PANES:", JSON.stringify(await allPanes(a)));
  console.log("shot:", await a.shot("tab2-one-segment"));

  // --- back to tab 1: whose segments does it show?
  const tabs = await a.win.locator(S.wsTabs).all();
  await tabs[0].click();
  await a.win.waitForTimeout(1200);
  const t1 = await live(a);
  console.log("\n*** SWITCHED BACK TO TAB 1:", JSON.stringify(t1));
  console.log("shot:", await a.shot("tab1-after-switch-back"));
  const leaked = (t1.rows || []).some((r) => r.includes("00:00:02 to 00:00:05"));
  console.log(`*** tab 1 shows BBB's range 00:00:02-00:00:05: ${leaked ? "YES — LEAK" : "no"}`);
  console.log(`*** tab 1 still has its own two segments: ${(t1.rows || []).length === 2 ? "yes" : `NO (${(t1.rows || []).length} rows)`}`);

  // --- cut in tab 1. The file must contain AAA's 3s+4s, and must NOT be 3s of BBB's range.
  stub.write({ info: { id: AAA, title: "Video AAA", duration: 30, uploader: "Ch" } });
  stub.clearCalls();
  await a.win.click(S.cut).catch((e) => console.log("cut click failed", String(e).slice(0, 80)));
  await waitCut(a, "tab1");
  console.log("\nfiles after cutting in TAB 1:", JSON.stringify(clipsOnDisk()));
  for (const f of clipsOnDisk()) {
    const d = ffDuration(path.join(CLIPS, f));
    console.log(`  ${f}: decoded=${d.seconds}s container=${d.header}s  (tab 1 expects 7.0s of Video AAA)`);
  }
  console.log("  sections the engine was given:", JSON.stringify(stub.calls().map((c) => c[c.indexOf("--download-sections") + 1]).filter(Boolean)));

  // --- cut in tab 2 as well
  const before = clipsOnDisk();
  stub.write({ info: { id: BBB, title: "Video BBB", duration: 30, uploader: "Ch" } });
  stub.clearCalls();
  await (await a.win.locator(S.wsTabs).all())[1].click();
  await a.win.waitForTimeout(1200);
  console.log("\nTAB 2 before its cut:", JSON.stringify(await live(a)));
  await a.win.click(S.cut).catch((e) => console.log("cut click failed", String(e).slice(0, 80)));
  await waitCut(a, "tab2");
  const added = clipsOnDisk().filter((f) => !before.includes(f));
  console.log("files tab 2's cut added:", JSON.stringify(added));
  for (const f of added) {
    const d = ffDuration(path.join(CLIPS, f));
    console.log(`  ${f}: decoded=${d.seconds}s  (tab 2 expects 3.0s of Video BBB)`);
  }
  console.log("  sections the engine was given:", JSON.stringify(stub.calls().map((c) => c[c.indexOf("--download-sections") + 1]).filter(Boolean)));

  console.log("\nall files:", JSON.stringify(clipsOnDisk()));
  console.log("crash state:", JSON.stringify(await crashState(a)));
  console.log("shot:", await a.shot("end"));
  await a.close();
})().catch((e) => {
  console.error("SCRIPT FAILED", e);
  process.exit(1);
});
