/**
 * File: t19-two-tab-cuts.cjs
 * Description: Two tabs cutting at the same time. Does each tab's clip reach
 *   the clips folder, and does either tab report a failure?
 */
const fs = require("node:fs");
const { boot, stubRoot } = require("./boot.cjs");
const { live, allPanes, S, loadLive, markLive } = require("./live.cjs");
const STUB = process.env.STUB || "/tmp/claude-0/-home-user-stream-trimmer/fbb59225-b5c7-558d-a212-aff901156a0b/scratchpad/stubB";
const CLIPS = "/tmp/claude-0/-home-user-stream-trimmer/fbb59225-b5c7-558d-a212-aff901156a0b/scratchpad/clips-t19";

const clips = () => fs.readdirSync(CLIPS).sort();

/** Read every pane's error text, not just the visible one. */
const alerts = (a) =>
  a.win.evaluate(() =>
    Array.from(document.querySelectorAll("#ui-mark-in")).map((el, i) => {
      const pane = el.closest("div.absolute.inset-0");
      return {
        i,
        shown: el.offsetParent !== null,
        title: pane.querySelector("#ui-source-chip")?.innerText.replace(/\s+/g, " ").trim().slice(0, 30),
        alerts: Array.from(pane.querySelectorAll('[role="alert"]')).map((e) => e.innerText.replace(/\s+/g, " ").trim().slice(0, 120)),
        cancel: Array.from(pane.querySelectorAll("button")).some((b) => b.innerText.trim() === "Cancel"),
      };
    }),
  );

(async () => {
  fs.rmSync(CLIPS, { recursive: true, force: true });
  fs.mkdirSync(CLIPS, { recursive: true });
  const stub = stubRoot(STUB);
  stub.write({
    info: { id: "alpha000001", title: "ALPHA", duration: 30, uploader: "Ch" },
    transcriptLines: 8, transcriptCueSec: 4, delayMs: 0, exitCode: 0, stderr: "", writeMedia: true,
  });
  const a = await boot({
    label: "t19-two-tabs", stub: STUB, viewport: { width: 1440, height: 900 },
    seed: { "clipper.saveDir": CLIPS, "clipper.saveDirs": [CLIPS] },
  });

  await loadLive(a, "https://www.youtube.com/watch?v=alpha000001");
  await a.win.waitForTimeout(600);
  stub.write({ info: { id: "beta0000001", title: "BETA", duration: 30, uploader: "Ch" } });
  await a.win.click(S.newTab);
  await a.win.waitForTimeout(600);
  await loadLive(a, "https://www.youtube.com/watch?v=beta0000001", 3500);

  await markLive(a, "00:00:05", "00:00:09");
  await a.win.keyboard.press("Control+Shift+Enter");
  await a.win.waitForTimeout(400);
  console.log("both panes before any cut:", JSON.stringify(await allPanes(a)));

  // Tab 2 (BETA) starts first.
  stub.write({ delayMs: 3000 });
  await a.win.click(S.cut);
  await a.win.waitForTimeout(1200);
  console.log("tab2 cutting. busy dots:", await a.win.locator('div[role="tab"] span.animate-pulse').count());

  // Switch to tab 1 (ALPHA) and start its cut too.
  (await a.win.locator(S.wsTabs).all())[0].click();
  await a.win.waitForTimeout(600);
  const l1 = await live(a);
  console.log("tab1:", JSON.stringify({ source: l1.source, rows: l1.rows, cutDisabled: l1.cutDisabled }));
  await a.win.click(S.cut);
  await a.win.waitForTimeout(1500);
  console.log("both cutting. busy dots:", await a.win.locator('div[role="tab"] span.animate-pulse').count());
  console.log("shot:", await a.shot("both-cutting"));

  stub.write({ delayMs: 0 });
  for (let i = 0; i < 180; i++) {
    await a.win.waitForTimeout(1000);
    const st = await alerts(a);
    if (!st.some((p) => p.cancel)) break;
  }
  await a.win.waitForTimeout(4000);
  console.log("\nfinal pane states:", JSON.stringify(await alerts(a), null, 1));
  console.log("files:", JSON.stringify(clips()), "(EXPECT one ALPHA and one BETA)");
  console.log("history:", JSON.stringify((a.readState()["clipper.downloads"] || []).map((d) => d.label)));
  console.log("shot:", await a.shot("after-both"));
  await a.close();
})().catch((e) => {
  console.error("FAILED", e);
  process.exit(1);
});
