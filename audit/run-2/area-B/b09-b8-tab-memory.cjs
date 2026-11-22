/**
 * File: b09-b8-tab-memory.cjs
 * Path: audit/run-2/area-B/b09-b8-tab-memory.cjs
 * Description: B-8 — a tab remembering nothing. Four questions:
 *     1. closing a tab with marked segments: is the user asked?
 *     2. is there a visible way to reopen, and does Ctrl+Shift+T bring the work back?
 *     3. does a relaunch restore the video and the unsaved segments?
 *     4. what is actually written to clipper.workspaces?
 *   Native confirm() dialogs are answered through Playwright's dialog handler and
 *   their text is printed, since the wording is part of the fix.
 */
const { boot, live, loadLive, markLive, stubRoot, S } = require("./lib.cjs");

const SCRATCH = "/tmp/claude-0/-home-user-stream-trimmer/fbb59225-b5c7-558d-a212-aff901156a0b/scratchpad/b2";
const STUB = process.env.STUB || `${SCRATCH}/stub2`; // per-URL info: each tab must get its own video
const ROOT = process.env.ROOT || "/home/user/stream-trimmer";
const TAG = process.env.TAG || ROOT.split("/").pop();

const tabNames = (a) => a.win.locator(S.wsTabs).allInnerTexts().then((t) => t.map((x) => x.trim()));

(async () => {
  console.log(`=== B-8 tab memory ===\nROOT=${ROOT}  TAG=${TAG}`);
  const stub = stubRoot(STUB);
  stub.write({
    info: { id: "hhhhhhhhhhh", title: "Memory AAA", duration: 600, uploader: "Ch" },
    transcriptLines: 8,
    // Answer each probe about the video it was actually asked about, so a restored
    // workspace cannot look right (or wrong) by accident.
    infoFromUrl: true,
    titles: { hhhhhhhhhhh: "Memory AAA", iiiiiiiiiii: "Memory BBB" },
  });

  const a = await boot({ label: `b09-${TAG}`, root: ROOT, stub: STUB, viewport: { width: 1440, height: 900 } });
  const dialogs = [];
  a.win.on("dialog", async (d) => {
    dialogs.push({ type: d.type(), message: d.message() });
    await d.accept().catch(() => {});
  });

  // tab 1 = AAA with two segments
  await loadLive(a, "https://www.youtube.com/watch?v=hhhhhhhhhhh");
  await markLive(a, "00:00:10", "00:00:20");
  await a.win.click(S.add);
  await markLive(a, "00:01:00", "00:01:30");
  await a.win.click(S.add);
  await a.win.waitForTimeout(500);

  // tab 2 = BBB with one segment
  await a.win.click(S.newTab);
  await a.win.waitForTimeout(1200);
  await loadLive(a, "https://www.youtube.com/watch?v=iiiiiiiiiii");
  await markLive(a, "00:02:00", "00:02:30");
  await a.win.click(S.add);
  await a.win.waitForTimeout(800);
  console.log("tabs:", JSON.stringify(await tabNames(a)));
  console.log("persisted now:", JSON.stringify(a.readState()["clipper.workspaces"]));

  // visible reopen affordance?
  console.log(
    "reopen wording anywhere on screen:",
    await a.win.evaluate(() => {
      const t = document.body.innerText.toLowerCase();
      return {
        reopen: t.includes("reopen"),
        recentlyClosed: t.includes("recently closed"),
        undoClose: t.includes("undo close"),
        title: Array.from(document.querySelectorAll("button,[role=tab]"))
          .map((b) => b.title || b.getAttribute("aria-label") || "")
          .filter((s) => /reopen|closed/i.test(s)),
      };
    }),
  );

  // close tab 2 (it has unsaved work)
  await (await a.win.locator(S.wsTabs).all())[1].hover();
  await a.win.locator('button[aria-label^="Close "]').nth(1).click();
  await a.win.waitForTimeout(900);
  console.log("dialogs so far:", JSON.stringify(dialogs));
  console.log("tabs after close:", JSON.stringify(await tabNames(a)));
  console.log("persisted after close:", JSON.stringify(a.readState()["clipper.workspaces"]));
  console.log("shot:", await a.shot("after-close"));

  // reopen
  await a.win.keyboard.press("Control+Shift+T");
  await a.win.waitForTimeout(5000);
  console.log("tabs after Ctrl+Shift+T:", JSON.stringify(await tabNames(a)));
  console.log("the reopened tab's pane:", JSON.stringify(await live(a)));
  console.log("persisted after reopen:", JSON.stringify(a.readState()["clipper.workspaces"]));
  console.log("shot:", await a.shot("after-reopen"));

  // back to tab 1 — is its work intact?
  await (await a.win.locator(S.wsTabs).all())[0].click();
  await a.win.waitForTimeout(1200);
  console.log("tab 1 after all of that:", JSON.stringify(await live(a)));

  const persisted = a.readState()["clipper.workspaces"];
  console.log("\npersisted before quitting:", JSON.stringify(persisted));
  await a.close();

  // --- relaunch with exactly what was persisted
  console.log("\n=== relaunch ===");
  const b = await boot({
    label: `b09-${TAG}-relaunch`,
    root: ROOT,
    stub: STUB,
    viewport: { width: 1440, height: 900 },
    seed: { "clipper.workspaces": persisted },
  });
  await b.win.waitForTimeout(4000);
  console.log("tabs after relaunch:", JSON.stringify(await tabNames(b)));
  console.log("active pane:", JSON.stringify(await live(b)));
  const all = await b.win.evaluate(`(() => Array.from(document.querySelectorAll('#ui-mark-in')).map((el, i) => {
    const pane = el.closest('div.absolute.inset-0');
    return { i, shown: el.offsetParent !== null,
      source: pane?.querySelector('#ui-source-chip')?.innerText.replace(/\\s+/g,' ').trim() ?? null,
      rows: Array.from(pane?.querySelectorAll('ol[aria-label^="Segments"] > li') ?? []).map((li) => li.innerText.replace(/\\s+/g,' ').trim()) };
  }))()`);
  console.log("every pane after relaunch:", JSON.stringify(all));
  console.log("shot:", await b.shot("relaunched"));

  // switch to the other tab and look again
  const t = await b.win.locator(S.wsTabs).all();
  if (t.length > 1) {
    await t[1].click();
    await b.win.waitForTimeout(2500);
    console.log("second tab after relaunch:", JSON.stringify(await live(b)));
    console.log("shot:", await b.shot("relaunched-tab2"));
  }
  console.log("persisted after relaunch:", JSON.stringify(b.readState()["clipper.workspaces"]));
  await b.close();
})().catch((e) => {
  console.error("SCRIPT FAILED", e);
  process.exit(1);
});
