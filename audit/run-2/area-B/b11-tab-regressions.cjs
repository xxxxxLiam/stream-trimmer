/**
 * File: b11-tab-regressions.cjs
 * Path: audit/run-2/area-B/b11-tab-regressions.cjs
 * Description: Regression hunt around the per-tab clip store, App.tsx's tab mounting and
 *   the bank. Six passes, all in the real app:
 *     1. 25 seeded tabs — strip scrolling, the + button, duplicate element ids (B-9, B-18)
 *     2. eight tabs, fast switching, 24 switches — crash, and does each tab keep its clip
 *     3. mark and cut in tab 2 while tab 1 is downloading — locks, concurrency, files
 *     4. close the ACTIVE tab mid-cut — the confirm, the job, the engine child
 *     5. bank x tabs — each tab's own planned ranges on its own timeline
 *     6. the saved-files record vs the files actually on disk
 */
const { execSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { boot, crashState, live, allPanes, loadLive, markLive, seedBank, stubRoot, ffDuration, S } = require("./lib.cjs");

const SCRATCH = "/tmp/claude-0/-home-user-stream-trimmer/fbb59225-b5c7-558d-a212-aff901156a0b/scratchpad/b2";
const STUB = process.env.STUB || `${SCRATCH}/stub2`;
const ROOT = process.env.ROOT || "/home/user/stream-trimmer";
const TAG = process.env.TAG || ROOT.split("/").pop();
const CLIPS = `${SCRATCH}/clips-b11-${TAG}`;

const ids = (a) =>
  a.win.evaluate(() =>
    ["ui-mark-in", "ui-cut", "ui-cut-row", "ui-stitched-total", "ui-col-centre", "ui-source-chip"].map((id) => [
      id,
      document.querySelectorAll("#" + id).length,
    ]),
  );

function ytdlp() {
  try {
    return execSync("ps -eo pid,args", { encoding: "utf8" })
      .split("\n")
      .filter((l) => l.includes(STUB + "/resources/bin/yt-dlp"));
  } catch {
    return [];
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  console.log(`=== tab regressions ===\nROOT=${ROOT}  TAG=${TAG}`);
  fs.rmSync(CLIPS, { recursive: true, force: true });
  fs.mkdirSync(CLIPS, { recursive: true });
  const stub = stubRoot(STUB);
  stub.write({
    info: { id: "stub0000001", title: "Stub", duration: 30, uploader: "Ch" },
    transcriptLines: 8,
    delayMs: 0,
    exitCode: 0,
    writeMedia: true,
    section403: false,
    infoFromUrl: true,
    titles: { aaaaaaaaaaa: "Video AAA", bbbbbbbbbbb: "Video BBB", ccccccccccc: "Video CCC" },
  });

  // ---------- 1. 25 tabs
  console.log("\n--- 1. 25 seeded tabs ---");
  const many = [];
  for (let i = 0; i < 25; i++) many.push({ id: `ws_seed_${i}`, name: i % 3 === 0 ? `Campaign tab ${i}` : "" });
  const c = await boot({
    label: `b11-${TAG}-25tabs`,
    root: ROOT,
    stub: STUB,
    viewport: { width: 1440, height: 900 },
    seed: { "clipper.workspaces": { tabs: many, activeId: "ws_seed_24" } },
  });
  await c.win.waitForTimeout(2500);
  console.log("tabs rendered:", await c.win.locator(S.wsTabs).count());
  console.log("element ids:", JSON.stringify(await ids(c)));
  console.log(
    "active tab in view:",
    JSON.stringify(
      await c.win.evaluate(() => {
        const strip = document.querySelector('div[role="tab"]')?.parentElement;
        const active = document.querySelector('div[role="tab"][aria-selected="true"]');
        if (!strip || !active) return null;
        const s = strip.getBoundingClientRect();
        const r = active.getBoundingClientRect();
        const n = document.querySelector('button[aria-label="New tab"]');
        const q = n ? n.getBoundingClientRect() : null;
        return {
          activeInView: r.left >= s.left - 1 && r.right <= s.right + 1,
          scrollLeft: Math.round(strip.scrollLeft),
          scrollWidth: strip.scrollWidth,
          clientWidth: strip.clientWidth,
          newTabButtonInView: q ? q.right <= s.right + 1 && q.left >= s.left - 1 : null,
        };
      }),
    ),
  );
  console.log("crash:", JSON.stringify(await crashState(c)));
  console.log("shot:", await c.shot("25-tabs"));
  await c.close();

  // ---------- 2..6 one app, built up
  const a = await boot({
    label: `b11-${TAG}`,
    root: ROOT,
    stub: STUB,
    viewport: { width: 1440, height: 1200 },
    seed: {
      "clipper.saveDir": CLIPS,
      "clipper.saveDirs": [CLIPS],
      ...seedBank({
        videoId: "aaaaaaaaaaa",
        rows: [
          { id: "A01", label: "hook", segments: [{ start: 2, end: 6 }], status: "banked" },
          { id: "A02", label: "payoff", segments: [{ start: 12, end: 16 }], status: "banked" },
        ],
      }),
    },
  });

  console.log("\n--- 2. eight tabs, each with its own clip, then 24 fast switches ---");
  const vids = ["aaaaaaaaaaa", "bbbbbbbbbbb", "ccccccccccc"];
  await loadLive(a, `https://www.youtube.com/watch?v=${vids[0]}`);
  await markLive(a, "00:00:01", "00:00:03");
  await a.win.click(S.add);
  for (let t = 1; t < 8; t++) {
    await a.win.click(S.newTab);
    await a.win.waitForTimeout(700);
    await loadLive(a, `https://www.youtube.com/watch?v=${vids[t % 3]}`, 1800);
    await markLive(a, `00:00:0${(t % 5) + 1}`, `00:00:1${t % 5}`);
    await a.win.click(S.add).catch(() => {});
    await a.win.waitForTimeout(250);
  }
  const panesBefore = await allPanes(a);
  console.log("eight panes before switching:", JSON.stringify(panesBefore.map((p) => ({ i: p.i, source: p.source, rows: p.rows.length, total: p.total }))));
  const order = [];
  for (let i = 0; i < 24; i++) order.push(i % 8);
  for (const i of order) {
    const tabs = await a.win.locator(S.wsTabs).all();
    await tabs[i].click({ timeout: 4000 }).catch(() => {});
    await a.win.waitForTimeout(60); // deliberately faster than React can settle
  }
  await a.win.waitForTimeout(1500);
  const panesAfter = await allPanes(a);
  console.log("eight panes after 24 fast switches:", JSON.stringify(panesAfter.map((p) => ({ i: p.i, source: p.source, rows: p.rows.length, total: p.total }))));
  const same = JSON.stringify(panesBefore.map((p) => p.rows)) === JSON.stringify(panesAfter.map((p) => p.rows));
  console.log("every tab kept exactly its own clip:", same);
  console.log("crash:", JSON.stringify(await crashState(a)));
  console.log("shot:", await a.shot("eight-tabs-after-switching"));

  // ---------- 3. mark and cut in tab 2 while tab 1 downloads
  console.log("\n--- 3. cut in tab 1, then work in tab 2 while it runs ---");
  let tabs = await a.win.locator(S.wsTabs).all();
  await tabs[0].click();
  await a.win.waitForTimeout(800);
  stub.write({ delayMs: 12000 });
  await a.win.click(S.cut);
  await a.win.waitForTimeout(2500);
  console.log("tab 1 mid-cut:", JSON.stringify(await live(a)));
  tabs = await a.win.locator(S.wsTabs).all();
  await tabs[1].click();
  await a.win.waitForTimeout(900);
  const t2 = await live(a);
  console.log("tab 2 while tab 1 downloads:", JSON.stringify({ rows: t2.rows, addDisabled: t2.addDisabled, cutDisabled: t2.cutDisabled, cancelVisible: t2.cancelVisible, status: t2.status }));
  await markLive(a, "00:00:20", "00:00:24").catch(() => {});
  const added = await a.win.click(S.add, { timeout: 4000 }).then(() => "added").catch((e) => "REFUSED " + String(e).slice(0, 60));
  console.log("marking in tab 2 while tab 1 downloads:", added, "rows now:", (await live(a)).rows.length);
  stub.write({ delayMs: 0 });
  const cut2 = await a.win.click(S.cut, { timeout: 4000 }).then(() => "clicked").catch((e) => "REFUSED " + String(e).slice(0, 60));
  console.log("cutting in tab 2 while tab 1 downloads:", cut2);
  await a.win.waitForTimeout(20000);
  console.log("files on disk:", JSON.stringify(fs.readdirSync(CLIPS)));
  console.log("panes after both cuts:", JSON.stringify((await allPanes(a)).map((p) => ({ i: p.i, source: p.source, rows: p.rows.length }))));
  console.log("crash:", JSON.stringify(await crashState(a)));
  console.log("shot:", await a.shot("two-tabs-cutting"));

  // ---------- 4. close the ACTIVE tab mid-cut
  console.log("\n--- 4. close the active tab while its cut runs ---");
  const dialogs = [];
  a.win.on("dialog", async (d) => {
    dialogs.push(d.message());
    await d.accept().catch(() => {});
  });
  tabs = await a.win.locator(S.wsTabs).all();
  await tabs[2].click();
  await a.win.waitForTimeout(800);
  stub.write({ delayMs: 25000 });
  const beforeFiles = fs.readdirSync(CLIPS);
  if ((await live(a)).cutDisabled === false) await a.win.click(S.cut).catch(() => {});
  await a.win.waitForTimeout(3000);
  console.log("engine children during the cut:", ytdlp().length);
  await (await a.win.locator(S.wsTabs).all())[2].hover();
  await a.win.locator('button[aria-label^="Close "]').nth(2).click({ timeout: 5000 }).catch((e) => console.log("close click:", String(e).slice(0, 70)));
  await sleep(4000);
  console.log("dialog shown:", JSON.stringify(dialogs));
  console.log("tabs now:", (await a.win.locator(S.wsTabs).allInnerTexts()).map((t) => t.trim()).length);
  console.log("engine children 4s after closing the tab:", ytdlp().length);
  console.log("files added by that cut:", JSON.stringify(fs.readdirSync(CLIPS).filter((f) => !beforeFiles.includes(f))));
  console.log("crash:", JSON.stringify(await crashState(a)));
  console.log("shot:", await a.shot("after-closing-active-tab-midcut"));
  stub.write({ delayMs: 0 });

  // ---------- 5. bank x tabs
  console.log("\n--- 5. the bank's planned ranges, per tab ---");
  const bankState = await a.win.evaluate(`(() => Array.from(document.querySelectorAll('#ui-mark-in')).map((el, i) => {
    const pane = el.closest('div.absolute.inset-0');
    return {
      i, shown: el.offsetParent !== null,
      source: pane?.querySelector('#ui-source-chip')?.innerText.replace(/\\s+/g,' ').trim() ?? null,
      bankedSpans: Array.from(pane?.querySelectorAll('[title^="Banked"]') ?? []).map((e) => e.getAttribute('title')),
    };
  }))()`);
  console.log(JSON.stringify(bankState, null, 1));
  console.log("  (only the tabs showing Video AAA should carry the two banked spans)");

  // ---------- 6. the saved-files record vs the disk
  console.log("\n--- 6. saved-files record vs the disk ---");
  const dls = (a.readState()["clipper.downloads"] || []).map((d) => ({ label: d.label, path: d.path }));
  console.log("clipper.downloads:", JSON.stringify(dls, null, 1));
  console.log("on disk:", JSON.stringify(fs.readdirSync(CLIPS)));
  for (const d of dls) {
    if (d.path) console.log(`  ${d.label}: path exists on disk = ${fs.existsSync(d.path)} (${d.path})`);
  }
  for (const f of fs.readdirSync(CLIPS)) {
    console.log(`  ${f}: ${ffDuration(path.join(CLIPS, f)).seconds}s`);
  }
  await a.close();
})().catch((e) => {
  console.error("SCRIPT FAILED", e);
  process.exit(1);
});
