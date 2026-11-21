/**
 * File: b13-recheck-and-hunt.cjs
 * Path: audit/run-2/area-B/b13-recheck-and-hunt.cjs
 * Description: Run 1's unassigned area-B findings, re-driven against the fixed tree, plus
 *   the fresh checks around them:
 *     1. B-4  sub-second / non-numeric / negative marks
 *     2. B-13 the I and O keys the mark bar advertises, with the player unavailable
 *     3. B-15 Alt+arrow reordering and where the focus lands
 *     4. B-11 the same range cut twice: files on disk vs the saved-files rows and paths
 *     5. B-20 a timestamped link's ?t=
 *     6. transcript click-to-seek and shift-click range select
 *     7. undo (Cmd+Z) after Clear, and Cmd+Shift+Enter / Cmd+Enter
 */
const fs = require("node:fs");
const path = require("node:path");
const { boot, live, loadLive, markLive, stubRoot, ffDuration, S } = require("./lib.cjs");

const SCRATCH = "/tmp/claude-0/-home-user-stream-trimmer/fbb59225-b5c7-558d-a212-aff901156a0b/scratchpad/b2";
const STUB = process.env.STUB || `${SCRATCH}/stub2`;
const ROOT = process.env.ROOT || "/home/user/stream-trimmer";
const TAG = process.env.TAG || ROOT.split("/").pop();
const CLIPS = `${SCRATCH}/clips-b13-${TAG}`;

const marks = (a) =>
  a.win.evaluate(() => {
    const vis = (s) => Array.from(document.querySelectorAll(s)).find((e) => e.offsetParent !== null) || null;
    const i = vis("#ui-mark-in");
    const o = vis("#ui-mark-out");
    return {
      in: i?.value ?? null,
      out: o?.value ?? null,
      inInvalid: i?.getAttribute("aria-invalid"),
      outInvalid: o?.getAttribute("aria-invalid"),
      total: vis("#ui-stitched-total")?.innerText.trim() ?? null,
      addDisabled: vis("#ui-add-segment")?.disabled ?? null,
      problem: (vis("#ui-col-centre")?.innerText.match(/That is not a time[^\n]*/) || [null])[0],
    };
  });

(async () => {
  console.log(`=== re-check and hunt ===\nROOT=${ROOT}  TAG=${TAG}`);
  fs.rmSync(CLIPS, { recursive: true, force: true });
  fs.mkdirSync(CLIPS, { recursive: true });
  const stub = stubRoot(STUB);
  stub.write({ info: { id: "kkkkkkkkkkk", title: "Recheck", duration: 1800, uploader: "Ch" }, transcriptLines: 12, infoFromUrl: false, delayMs: 0, section403: false });

  const a = await boot({
    label: `b13-${TAG}`,
    root: ROOT,
    stub: STUB,
    viewport: { width: 1440, height: 1200 },
    seed: { "clipper.saveDir": CLIPS, "clipper.saveDirs": [CLIPS] },
  });
  await loadLive(a, "https://www.youtube.com/watch?v=kkkkkkkkkkk");

  console.log("\n--- 1. B-4 bad marks on a 30-minute video ---");
  for (const [name, i, o] of [
    ["sub-second decimals", "10.5", "20.25"],
    ["letters", "abc", "def"],
    ["negative in", "-5", "00:00:20"],
    ["out before in", "00:02:00", "00:01:00"],
    ["out past the end", "00:00:10", "99:00:00"],
    ["empty in", "", "00:00:20"],
    ["zero length", "00:00:10", "00:00:10"],
  ]) {
    await markLive(a, i, o).catch(() => {});
    await a.win.waitForTimeout(250);
    const m = await marks(a);
    console.log(`  [${name}] in=${JSON.stringify(i)} out=${JSON.stringify(o)} -> ${JSON.stringify(m)}`);
    if (m.addDisabled === false) {
      await a.win.click(S.add).catch(() => {});
      await a.win.waitForTimeout(200);
      console.log(`     Add was enabled; rows now: ${JSON.stringify((await live(a)).rows)}`);
      await a.win.locator('button[aria-label^="Remove segment"]').first().click({ force: true }).catch(() => {});
    }
  }
  console.log("  shot:", await a.shot("bad-marks"));

  console.log("\n--- 2. B-13 the I and O keys with the player unavailable ---");
  const before = await marks(a);
  await a.win.locator("#ui-col-transcript").first().click({ position: { x: 5, y: 5 } }).catch(() => {});
  await a.win.keyboard.press("i");
  await a.win.waitForTimeout(200);
  await a.win.keyboard.press("o");
  await a.win.waitForTimeout(300);
  console.log(`  before I/O: in=${before.in} out=${before.out}`);
  const after = await marks(a);
  console.log(`  after  I/O: in=${after.in} out=${after.out}`);
  console.log(
    "  what the pane offers:",
    JSON.stringify(
      await a.win.evaluate(() => {
        const vis = (s) => Array.from(document.querySelectorAll(s)).find((e) => e.offsetParent !== null) || null;
        return {
          setStartButton: Boolean(Array.from(document.querySelectorAll("button")).find((b) => b.offsetParent && /Set start/i.test(b.innerText))),
          playButton: Boolean(Array.from(document.querySelectorAll("button")).find((b) => b.offsetParent && /^Play/i.test(b.innerText))),
          markInKbd: vis("#ui-mark-in")?.closest("label")?.innerText.replace(/\s+/g, " ").trim(),
          previewMessage: (vis("#ui-col-centre")?.innerText.match(/The owner blocks[^\n]*|Could not reach[^\n]*/) || [null])[0],
        };
      }),
    ),
  );

  console.log("\n--- 3. B-15 Alt+arrow reordering and the focus ---");
  await markLive(a, "00:00:02", "00:00:05");
  await a.win.click(S.add);
  await markLive(a, "00:00:20", "00:00:24");
  await a.win.click(S.add);
  await markLive(a, "00:00:10", "00:00:13");
  await a.win.click(S.add);
  await a.win.waitForTimeout(300);
  await a.win.locator('ol[aria-label^="Segments"] > li button[aria-label^="Segment 3"]').first().focus();
  console.log("  focused:", await a.win.evaluate(() => (document.activeElement?.getAttribute("aria-label") || document.activeElement?.tagName || "").slice(0, 60)));
  await a.win.keyboard.press("Alt+ArrowUp");
  await a.win.waitForTimeout(400);
  console.log("  after 1st Alt+Up:", JSON.stringify((await live(a)).rows));
  console.log("  focus now:", await a.win.evaluate(() => (document.activeElement?.getAttribute("aria-label") || document.activeElement?.tagName || "").slice(0, 60)));
  await a.win.keyboard.press("Alt+ArrowUp");
  await a.win.waitForTimeout(400);
  console.log("  after 2nd Alt+Up:", JSON.stringify((await live(a)).rows));
  console.log("  focus now:", await a.win.evaluate(() => (document.activeElement?.getAttribute("aria-label") || document.activeElement?.tagName || "").slice(0, 60)));
  console.log("  shot:", await a.shot("keyboard-reorder"));
  for (let i = 0; i < 4; i++) await a.win.locator('button[aria-label^="Remove segment"]').first().click({ force: true }).catch(() => {});

  console.log("\n--- 4. B-11 the same range cut twice ---");
  for (const pass of [1, 2]) {
    await a.win.locator('button[aria-label="Dismiss"]').first().click({ timeout: 1500 }).catch(() => {});
    await markLive(a, "00:00:01", "00:00:04");
    await a.win.click(S.add);
    await a.win.click(S.cut);
    await a.win
      .waitForFunction(() => !Array.from(document.querySelectorAll("button")).some((b) => b.offsetParent !== null && b.innerText.trim() === "Cancel"), null, { timeout: 120000 })
      .catch(() => console.log("    still running"));
    await a.win.waitForTimeout(1200);
    console.log(`  pass ${pass}: files = ${JSON.stringify(fs.readdirSync(CLIPS))}`);
  }
  const rows = (a.readState()["clipper.downloads"] || []).map((d) => ({ label: d.label, path: d.path, detail: d.detail }));
  console.log("  saved-files rows:", JSON.stringify(rows, null, 1));
  for (const r of rows) if (r.path) console.log(`    ${r.label}: path on disk? ${fs.existsSync(r.path)} -> ${path.basename(r.path)}`);
  for (const f of fs.readdirSync(CLIPS)) console.log(`    ${f}: ${ffDuration(path.join(CLIPS, f)).seconds}s`);
  console.log("  shot:", await a.shot("same-range-twice"));

  console.log("\n--- 5. B-20 a timestamped link ---");
  await loadLive(a, "https://www.youtube.com/watch?v=kkkkkkkkkkk&t=90s&si=TRACK", 2600);
  console.log("  marks after loading ?t=90s:", JSON.stringify(await marks(a)));

  console.log("\n--- 6. transcript click-to-seek and shift-click range ---");
  const lines = a.win.locator("[data-line]");
  await lines.nth(2).click().catch(() => {});
  await a.win.waitForTimeout(400);
  console.log("  after clicking line 3:", JSON.stringify(await marks(a)));
  await lines.nth(1).click().catch(() => {});
  await lines.nth(4).click({ modifiers: ["Shift"] }).catch(() => {});
  await a.win.waitForTimeout(400);
  console.log("  after shift-clicking lines 2..5:", JSON.stringify(await marks(a)));

  console.log("\n--- 7. Clear + Cmd+Z, and the two chords ---");
  await markLive(a, "00:00:06", "00:00:09");
  const clear = a.win.locator("button", { hasText: /^Clear$/ }).first();
  if (await clear.count()) {
    await clear.click().catch(() => {});
    await a.win.waitForTimeout(300);
    console.log("  after Clear:", JSON.stringify(await marks(a)));
    await a.win.keyboard.press("Control+z");
    await a.win.waitForTimeout(300);
    console.log("  after Cmd+Z:", JSON.stringify(await marks(a)));
  } else {
    console.log("  no Clear button on screen");
  }
  await markLive(a, "00:00:06", "00:00:09");
  await a.win.keyboard.press("Control+Shift+Enter");
  await a.win.waitForTimeout(500);
  console.log("  rows after Ctrl+Shift+Enter:", JSON.stringify((await live(a)).rows));
  console.log("  shot:", await a.shot("end"));
  await a.close();
})().catch((e) => {
  console.error("SCRIPT FAILED", e);
  process.exit(1);
});
