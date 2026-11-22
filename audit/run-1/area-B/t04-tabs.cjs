/**
 * File: t04-tabs.cjs
 * Description: Tabs: open, switch, close, reopen, many. And the question that
 *   matters most — is the clip being built (the segment list) per-tab, or is it
 *   one global list every tab shares?
 */
const { boot, stubRoot } = require("./boot.cjs");
const { live, allPanes, S, loadLive, markLive } = require("./live.cjs");
const STUB = process.env.STUB || "/tmp/claude-0/-home-user-stream-trimmer/fbb59225-b5c7-558d-a212-aff901156a0b/scratchpad/stubB";

const ids = (a) =>
  a.win.evaluate(() =>
    ["ui-mark-in", "ui-cut", "ui-stitched-total", "ui-col-centre", "ui-col-transcript"].map((id) => [
      id,
      document.querySelectorAll("#" + id).length,
    ]),
  );

(async () => {
  const stub = stubRoot(STUB);
  stub.write({ info: { id: "aaaaaaaaaaa", title: "Video AAA", duration: 600, uploader: "Ch" }, transcriptLines: 10 });
  const a = await boot({ label: "t04-tabs", stub: STUB, viewport: { width: 1440, height: 900 } });

  console.log("tabs at first run:", (await a.win.locator(S.wsTabs).allInnerTexts()).map((t) => t.trim()));
  console.log("element ids, one tab:", JSON.stringify(await ids(a)));

  await loadLive(a, "https://www.youtube.com/watch?v=aaaaaaaaaaa");
  await markLive(a, "00:00:10", "00:00:20");
  await a.win.click(S.add);
  await markLive(a, "00:01:00", "00:01:30");
  await a.win.click(S.add);
  console.log("\nTAB1 (Video AAA) after two segments:", JSON.stringify(await live(a)));
  console.log("shot:", await a.shot("tab1-two-segments"));

  stub.write({ info: { id: "bbbbbbbbbbb", title: "Video BBB", duration: 900, uploader: "Ch" } });
  await a.win.click(S.newTab);
  await a.win.waitForTimeout(700);
  console.log("\ntabs:", (await a.win.locator(S.wsTabs).allInnerTexts()).map((t) => t.trim()));
  console.log("element ids, two tabs:", JSON.stringify(await ids(a)));
  console.log("TAB2 fresh:", JSON.stringify(await live(a)));
  console.log("ALL PANES:", JSON.stringify(await allPanes(a)));

  await loadLive(a, "https://www.youtube.com/watch?v=bbbbbbbbbbb");
  console.log("\nafter loading BBB in tab 2 — ALL PANES:", JSON.stringify(await allPanes(a)));
  console.log("shot:", await a.shot("tab2-loaded-bbb"));

  await markLive(a, "00:02:00", "00:02:05");
  await a.win.click(S.add);
  await a.win.waitForTimeout(400);
  console.log("\nafter adding a segment in tab 2 — ALL PANES:", JSON.stringify(await allPanes(a)));
  console.log("shot:", await a.shot("tab2-one-segment"));

  const tabs = await a.win.locator(S.wsTabs).all();
  await tabs[0].click();
  await a.win.waitForTimeout(800);
  console.log("\n*** switched back to TAB 1 (Video AAA):", JSON.stringify(await live(a)));
  console.log("shot:", await a.shot("tab1-after-switch-back"));

  (await a.win.locator(S.wsTabs).all())[1].click();
  await a.win.waitForTimeout(800);
  console.log("\nTAB 2 again:", JSON.stringify(await live(a)));

  console.log("\n=== close and reopen ===");
  await (await a.win.locator(S.wsTabs).all())[1].hover();
  await a.win.locator('button[aria-label^="Close "]').nth(1).click();
  await a.win.waitForTimeout(700);
  console.log("tabs after close:", (await a.win.locator(S.wsTabs).allInnerTexts()).map((t) => t.trim()));
  console.log("workspaces persisted:", JSON.stringify(a.readState()["clipper.workspaces"]));
  console.log("any reopen wording on screen:", await a.win.evaluate(() => {
    const t = document.body.innerText.toLowerCase();
    return t.includes("reopen") || t.includes("recently closed") || t.includes("undo close");
  }));
  await a.win.keyboard.press("Control+Shift+T");
  await a.win.waitForTimeout(700);
  console.log("tabs after Ctrl+Shift+T:", (await a.win.locator(S.wsTabs).allInnerTexts()).map((t) => t.trim()));

  await (await a.win.locator(S.wsTabs).all())[0].hover();
  await a.win.locator('button[aria-label^="Close "]').first().click();
  await a.win.waitForTimeout(700);
  console.log("tabs after closing the last one:", (await a.win.locator(S.wsTabs).allInnerTexts()).map((t) => t.trim()));
  console.log("live pane then:", JSON.stringify(await live(a)));
  console.log("workspaces persisted:", JSON.stringify(a.readState()["clipper.workspaces"]));
  console.log("shot:", await a.shot("after-closes"));
  await a.close();

  console.log("\n=== relaunch: does a tab remember its video? ===");
  const b = await boot({
    label: "t04-relaunch",
    stub: STUB,
    viewport: { width: 1440, height: 900 },
    seed: {
      "clipper.workspaces": {
        tabs: [{ id: "ws_r1", name: "" }, { id: "ws_r2", name: "Interview" }],
        activeId: "ws_r1",
      },
    },
  });
  console.log("tabs after relaunch:", (await b.win.locator(S.wsTabs).allInnerTexts()).map((t) => t.trim()));
  console.log("live pane:", JSON.stringify(await live(b)));
  console.log("shot:", await b.shot("relaunched"));
  await b.close();

  console.log("\n=== 25 seeded tabs ===");
  const many = [];
  for (let i = 0; i < 25; i++) many.push({ id: `ws_seed_${i}`, name: i % 3 === 0 ? `Campaign tab ${i}` : "" });
  const c = await boot({
    label: "t04-25tabs",
    stub: STUB,
    viewport: { width: 1440, height: 900 },
    seed: { "clipper.workspaces": { tabs: many, activeId: "ws_seed_24" } },
  });
  console.log("workspace tabs rendered:", await c.win.locator(S.wsTabs).count());
  console.log("element ids, 25 tabs:", JSON.stringify(await ids(c)));
  console.log("active tab in view:", JSON.stringify(await c.win.evaluate(() => {
    const strip = document.querySelector('div[role="tab"]')?.parentElement;
    const active = document.querySelector('div[role="tab"][aria-selected="true"]');
    if (!strip || !active) return null;
    const s = strip.getBoundingClientRect(), r = active.getBoundingClientRect();
    const n = document.querySelector('button[aria-label="New tab"]');
    const q = n ? n.getBoundingClientRect() : null;
    return {
      activeInView: r.left >= s.left - 1 && r.right <= s.right + 1,
      scrollLeft: strip.scrollLeft, scrollWidth: strip.scrollWidth, clientWidth: strip.clientWidth,
      newTabButtonInView: q ? q.right <= s.right + 1 && q.left >= s.left - 1 : null,
    };
  })));
  console.log("shot:", await c.shot("25-tabs"));
  await c.close();
})().catch((e) => {
  console.error("FAILED", e);
  process.exit(1);
});
