/**
 * v00-smoke.cjs — can I boot the real app, get past the gate, load a video and
 * mark a segment, without touching product code? Prerequisite for everything else.
 */
const { boot, loadUrl, paneState, alive } = require("./v-lib.cjs");

(async () => {
  const a = await boot({
    label: "v00-smoke",
    stubRoot: process.env.STUB,
    viewport: { width: 1440, height: 900 },
  });
  try {
    a.log("alive after gate:", await a.win.evaluate(alive));
    await loadUrl(a, "https://www.youtube.com/watch?v=stub0000001");
    a.log("panes after load:", await a.win.evaluate(paneState));
    await a.shot("loaded");

    await a.win.locator("#ui-mark-in:visible").first().fill("00:00:10");
    await a.win.locator("#ui-mark-out:visible").first().fill("00:00:20");
    await a.win.locator("#ui-add-segment:visible").first().click();
    a.log("panes after add:", await a.win.evaluate(paneState));
    a.log("transcript rows:", await a.win.evaluate(() =>
      document.querySelectorAll("#ui-col-transcript li, #ui-col-transcript [data-cue]").length));
    a.log("search boxes:", await a.win.evaluate(() =>
      [...document.querySelectorAll('input[type="search"], input[placeholder]')]
        .filter((i) => i.offsetParent)
        .map((i) => i.placeholder || i.getAttribute("aria-label"))));
    await a.shot("one-segment");
  } finally {
    a.writeLog();
    await a.close();
  }
})();
