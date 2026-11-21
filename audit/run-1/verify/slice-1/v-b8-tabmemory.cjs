/**
 * v-b8-tabmemory.cjs — B-8. Does a tab remember anything: a confirmation on
 * close, a way to reopen, anything restored on relaunch?
 *
 * Written from the finding's Steps. Part 1 drives two tabs in a live app:
 * renames one, loads a video and marks a segment, closes a tab with its × and
 * watches for a confirm dialog, then looks for any reopen affordance and
 * presses Ctrl+Shift+T. Part 2 is the relaunch: a SECOND cold launch seeded
 * with exactly what the first app persisted, which is what the app itself
 * reads on start.
 *
 * Usage: STUB=/tmp/vstubX xvfb-run -a node v-b8-tabmemory.cjs
 */
const { boot, loadUrl } = require("./v-lib.cjs");

const snapshot = () => {
  const vis = (el) => el && el.offsetParent !== null;
  const pick = (s) => [...document.querySelectorAll(s)].find(vis) || null;
  const t = (el) => (el ? el.innerText.replace(/\s+/g, " ").trim() : null);
  return {
    tabs: [...document.querySelectorAll('[role="tab"]')].map((e) =>
      e.innerText.replace(/\s+/g, " ").trim(),
    ),
    chip: t(pick("#ui-source-chip")),
    total: t(pick("#ui-stitched-total")),
    rows: [...document.querySelectorAll("li")]
      .map((li) => li.innerText.replace(/\s+/g, " ").trim())
      .filter((x) => /\d\d:\d\d:\d\d to \d\d:\d\d:\d\d/.test(x)),
    transcriptRows: document.querySelectorAll("#ui-col-transcript li").length,
    reopenWording: /reopen|recently closed|undo close|restore tab/i.test(
      document.body.innerText,
    ),
  };
};

(async () => {
  const a = await boot({
    label: "v-b8-live",
    stubRoot: process.env.STUB,
    viewport: { width: 1440, height: 1250 },
  });
  let persisted;
  try {
    // A native confirm() would block the page; record any that appears.
    const dialogs = [];
    a.win.on("dialog", async (d) => {
      dialogs.push({ type: d.type(), message: d.message() });
      await d.dismiss().catch(() => {});
    });

    await loadUrl(a, "https://www.youtube.com/watch?v=stub0000001");
    await a.win.waitForTimeout(1500);
    await a.win.locator("#ui-mark-in:visible").first().fill("00:00:10");
    await a.win.locator("#ui-mark-out:visible").first().fill("00:00:20");
    await a.win.keyboard.press("Control+Shift+Enter");
    await a.win.waitForTimeout(500);

    // Rename tab 1 to "Interview" (double-click, type, Enter).
    const tab1 = a.win.locator('[role="tab"]').first();
    await tab1.dblclick();
    await a.win.locator('[role="tab"] input').first().fill("Interview");
    await a.win.locator('[role="tab"] input').first().press("Enter");
    await a.win.waitForTimeout(400);

    await a.win.click('[aria-label="New tab"]');
    await a.win.waitForTimeout(1200);
    await loadUrl(a, "https://www.youtube.com/watch?v=stub0000001");
    await a.win.waitForTimeout(1500);
    await a.win.locator("#ui-mark-in:visible").first().fill("00:00:30");
    await a.win.locator("#ui-mark-out:visible").first().fill("00:00:40");
    await a.win.keyboard.press("Control+Shift+Enter");
    await a.win.waitForTimeout(600);
    a.log("two tabs, work in the second:", await a.win.evaluate(snapshot));
    await a.shot("two-tabs");

    // Close tab 2 with its ×.
    const closeBtn = a.win.locator('[aria-label^="Close "]').nth(1);
    await closeBtn.click({ force: true });
    await a.win.waitForTimeout(1500);
    a.log("confirm dialogs seen while closing:", dialogs);
    a.log("after closing tab 2:", await a.win.evaluate(snapshot));
    await a.shot("after-close");

    a.log("any reopen affordance in the DOM:", await a.win.evaluate(() => {
      const hits = [...document.querySelectorAll("button, [role=menuitem], a")]
        .map((e) => (e.innerText || e.getAttribute("aria-label") || "").trim())
        .filter((s) => /reopen|recently closed|undo close|restore/i.test(s));
      return { hits, bodyMentionsReopen: /reopen|recently closed|undo close/i.test(document.body.innerText) };
    }));

    await a.win.keyboard.press("Control+Shift+T");
    await a.win.waitForTimeout(1500);
    a.log("after Ctrl+Shift+T:", await a.win.evaluate(snapshot));
    await a.shot("after-ctrl-shift-t");

    persisted = a.readState();
    a.log("clipper.workspaces persisted:", JSON.stringify(persisted["clipper.workspaces"]));
    a.log("every persisted key:", Object.keys(persisted));
  } finally {
    a.log("PROOF (part 1):", a.writeLog());
    await a.close();
  }

  // ---- Part 2: the relaunch. A new cold app, seeded with exactly what the
  // first one wrote, which is what the real app reads from settings.json.
  const b = await boot({
    label: "v-b8-relaunch",
    stubRoot: process.env.STUB,
    viewport: { width: 1440, height: 1250 },
    seed: persisted,
  });
  try {
    await b.win.waitForTimeout(2500);
    b.log("after the relaunch:", await b.win.evaluate(snapshot));
    await b.shot("relaunched");
  } finally {
    b.log("PROOF (part 2):", b.writeLog());
    await b.close();
  }
})();
