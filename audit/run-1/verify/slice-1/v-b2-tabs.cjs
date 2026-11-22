/**
 * v-b2-tabs.cjs — B-2. Is the segment list one global store shared by every
 * workspace tab, so opening a second tab destroys the first tab's clip?
 *
 * Written from the finding's Steps. Bank is left EMPTY throughout, to keep this
 * separate from C-1 (which needs a non-empty bank).
 *
 * Usage: STUB=/tmp/vstubX xvfb-run -a node v-b2-tabs.cjs
 */
const fs = require("node:fs");
const path = require("node:path");
const { boot, loadUrl, paneState, alive } = require("./v-lib.cjs");

const STUB = process.env.STUB;
function setStub(patch) {
  const p = path.join(STUB, "stub.json");
  const cur = JSON.parse(fs.readFileSync(p, "utf8"));
  fs.writeFileSync(p, JSON.stringify({ ...cur, ...patch }, null, 2));
}

(async () => {
  setStub({ info: { id: "aaa0000001", title: "Video AAA", duration: 600, uploader: "ch" } });
  const a = await boot({
    label: "v-b2-tabs",
    stubRoot: STUB,
    viewport: { width: 1440, height: 900 },
  });
  const add = async (i, o, nth = 0) => {
    await a.win.locator("#ui-mark-in:visible").nth(nth).fill(i);
    await a.win.locator("#ui-mark-out:visible").nth(nth).fill(o);
    await a.win.locator("#ui-add-segment:visible").nth(nth).click();
  };
  try {
    await loadUrl(a, "https://www.youtube.com/watch?v=aaa0000001");
    await add("00:00:10", "00:00:20");
    await add("00:01:00", "00:01:30");
    a.log("1. TAB 1 with two segments:", await a.win.evaluate(paneState));
    await a.shot("tab1-two-segments");
    a.log("   bank rows anywhere:", await a.win.evaluate(() =>
      document.querySelectorAll('[role="button"][tabindex="0"]').length));

    // Step 2: open a second tab.
    await a.win.click('[aria-label="New tab"]');
    await a.win.waitForTimeout(1500);
    a.log("2. after clicking + (tab 1 is NOT on screen):", await a.win.evaluate(paneState));
    a.log("   alive:", await a.win.evaluate(alive));
    await a.shot("after-new-tab");

    // Step 3: a different video in tab 2.
    setStub({ info: { id: "bbb0000002", title: "Video BBB", duration: 600, uploader: "ch" } });
    await loadUrl(a, "https://www.youtube.com/watch?v=bbb0000002");
    a.log("3. after loading BBB in tab 2:", await a.win.evaluate(paneState));

    // Step 4: mark in tab 2.
    await add("00:02:00", "00:02:05");
    a.log("4. after adding a segment in tab 2 — ALL panes:", await a.win.evaluate(paneState));
    await a.shot("tab2-one-segment");

    // Step 5: back to tab 1.
    await a.win.locator('[role="tab"]').first().click();
    await a.win.waitForTimeout(1200);
    a.log("5. switched back to TAB 1:", await a.win.evaluate(paneState));
    await a.shot("tab1-after-switch-back");
    a.log("   cut button enabled in tab 1:", await a.win.evaluate(() => {
      const b = [...document.querySelectorAll("#ui-cut")].find((e) => e.offsetParent);
      return b ? { text: b.innerText.replace(/\s+/g, " ").trim(), disabled: b.disabled } : null;
    }));
    a.log("page errors:", a.logs.pageErrors.slice(0, 3));
  } finally {
    a.log("PROOF:", a.writeLog());
    await a.close();
  }
})();
