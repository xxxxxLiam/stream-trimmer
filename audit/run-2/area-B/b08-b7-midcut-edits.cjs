/**
 * File: b08-b7-midcut-edits.cjs
 * Path: audit/run-2/area-B/b08-b7-midcut-edits.cjs
 * Description: B-7 — deleting a segment while the cut runs and still getting it in the
 *   file. Builds the same three-segment clip run 1 used (2-5, 20-24, 10-13 = 10s),
 *   starts the cut, and then tries every edit the list offers while it runs: the row's
 *   x, the Delete key, Alt+arrow reorder, drag, Add segment, and loading a bank row.
 *   Then checks the finished file against what was on screen.
 */
const fs = require("node:fs");
const path = require("node:path");
const { boot, live, loadLive, markLive, stubRoot, ffDuration, S } = require("./lib.cjs");

const SCRATCH = "/tmp/claude-0/-home-user-stream-trimmer/fbb59225-b5c7-558d-a212-aff901156a0b/scratchpad/b2";
const STUB = process.env.STUB || `${SCRATCH}/stub`;
const ROOT = process.env.ROOT || "/home/user/stream-trimmer";
const TAG = process.env.TAG || ROOT.split("/").pop();
const CLIPS = `${SCRATCH}/clips-b08-${TAG}`;

(async () => {
  console.log(`=== B-7 edits during a cut ===\nROOT=${ROOT}  TAG=${TAG}`);
  fs.rmSync(CLIPS, { recursive: true, force: true });
  fs.mkdirSync(CLIPS, { recursive: true });
  const stub = stubRoot(STUB);
  stub.clearCalls();
  stub.write({ info: { id: "ggggggggggg", title: "Mutate", duration: 30, uploader: "Ch" }, transcriptLines: 8, delayMs: 0, writeMedia: true, exitCode: 0 });

  const a = await boot({
    label: `b08-${TAG}`,
    root: ROOT,
    stub: STUB,
    viewport: { width: 1440, height: 1200 },
    seed: { "clipper.saveDir": CLIPS, "clipper.saveDirs": [CLIPS] },
  });
  await loadLive(a, "https://www.youtube.com/watch?v=ggggggggggg");
  for (const [i, o] of [["00:00:02", "00:00:05"], ["00:00:20", "00:00:24"], ["00:00:10", "00:00:13"]]) {
    await markLive(a, i, o);
    await a.win.click(S.add);
  }
  await a.win.waitForTimeout(300);
  console.log("before the cut:", JSON.stringify((await live(a)).rows));

  stub.write({ delayMs: 9000 }); // long enough to interfere with
  stub.clearCalls();
  await a.win.click(S.cut);
  await a.win.waitForTimeout(2500);

  const mid = await a.win.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('ol[aria-label^="Segments"] > li')).filter((li) => li.offsetParent !== null);
    const xs = Array.from(document.querySelectorAll('button[aria-label^="Remove segment"]')).filter((b) => b.offsetParent !== null);
    return {
      rows: rows.length,
      removeDisabled: xs.map((b) => b.disabled),
      removeTitle: xs[0]?.title ?? null,
      draggable: rows.map((li) => li.getAttribute("draggable")),
      addDisabled: document.querySelector("#ui-add-segment")?.disabled ?? null,
      cutDisabled: document.querySelector("#ui-cut")?.disabled ?? null,
    };
  });
  console.log("mid-cut controls:", JSON.stringify(mid));
  console.log("shot:", await a.shot("midcut-controls"));

  // try to remove segment 2 with a real click
  const before = (await live(a)).rows.length;
  await a.win
    .locator('button[aria-label^="Remove segment 2"]')
    .first()
    .click({ timeout: 3000, force: true })
    .catch((e) => console.log("  remove click refused:", String(e).split("\n")[0].slice(0, 90)));
  await a.win.waitForTimeout(400);
  console.log(`rows after clicking segment 2's x mid-cut: ${before} -> ${(await live(a)).rows.length}`);

  // keyboard: focus a row, press Delete, then Alt+Up
  await a.win.locator('ol[aria-label^="Segments"] > li button').nth(2).focus().catch(() => {});
  await a.win.keyboard.press("Delete").catch(() => {});
  await a.win.waitForTimeout(300);
  await a.win.keyboard.press("Alt+ArrowUp").catch(() => {});
  await a.win.waitForTimeout(300);
  const afterKeys = await live(a);
  console.log("rows after Delete and Alt+Up mid-cut:", JSON.stringify(afterKeys.rows));

  // try to add another segment mid-cut
  await a.win.fill(S.markIn, "00:00:26").catch(() => {});
  await a.win.fill(S.markOut, "00:00:28").catch(() => {});
  await a.win.click(S.add, { timeout: 2500, force: true }).catch((e) => console.log("  add refused:", String(e).split("\n")[0].slice(0, 80)));
  await a.win.waitForTimeout(400);
  console.log("rows after trying to Add mid-cut:", JSON.stringify((await live(a)).rows.length));

  await a.win.waitForSelector('[role="status"]:has-text("Clip saved")', { timeout: 90000 }).catch(() => console.log("no saved toast"));
  await a.win.waitForTimeout(1200);
  const files = fs.readdirSync(CLIPS);
  console.log("\nfile produced:", JSON.stringify(files));
  for (const f of files) {
    const d = ffDuration(path.join(CLIPS, f));
    console.log(`  ${f}: decoded=${d.seconds}s  (the cut was launched with 3 segments = 10s)`);
  }
  console.log("sections the engine cut:", JSON.stringify(stub.calls().map((c) => c[c.indexOf("--download-sections") + 1]).filter(Boolean)));
  console.log("rows after the cut finished:", JSON.stringify((await live(a)).rows));
  console.log("shot:", await a.shot("after-cut"));
  await a.close();
})().catch((e) => {
  console.error("SCRIPT FAILED", e);
  process.exit(1);
});
