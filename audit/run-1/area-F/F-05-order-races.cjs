/**
 * F-05: order of actions, repetition and races.
 *  - start a tutorial, then navigate away mid-tutorial (new tab / switch tab)
 *  - start one tutorial while another is running
 *  - open help, close it, reopen: resume or reset?
 *  - a tutorial whose step needs a video, with no video loaded
 *  - double-click the help button
 *  - spam Escape
 *  - open help while a download is running
 */
const fs = require("node:fs");
const path = require("node:path");
const L = require("./lib.cjs");

const state = () =>
  // eslint-disable-next-line no-undef
  (() => {
    const d = document.getElementById("ui-help-drawer");
    if (!d) return { open: false };
    const h3 = d.querySelector("h3");
    const step = (d.textContent.match(/Step (\d+) of (\d+)/) || [])[0] ?? null;
    return {
      open: true,
      task: h3 ? h3.textContent.trim() : null,
      step,
      listShown: d.querySelectorAll("[data-help-result]").length,
      query: document.getElementById("help-search")?.value ?? null,
      spotlight: document.querySelector("[data-help-spotlight]")?.getAttribute("data-help-spotlight") ?? null,
      notice: /not on screen right now/i.test(d.textContent),
    };
  })();

async function snap(a, label, rows) {
  const s = await a.win.evaluate(state);
  rows.push({ label, ...s });
  console.log(`${label.padEnd(44)} ${JSON.stringify(s)}`);
  return s;
}

async function pick(win, title) {
  await win.evaluate((t) => {
    const b = [...document.querySelectorAll("[data-help-result]")].find((n) => (n.textContent || "").startsWith(t));
    b?.click();
  }, title);
  await win.waitForTimeout(300);
}

async function next(win) {
  await win.evaluate(() => {
    const d = document.getElementById("ui-help-drawer");
    [...d.querySelectorAll("button")].find((x) => x.textContent.trim() === "Next step")?.click();
  });
  await win.waitForTimeout(250);
}

(async () => {
  const a = await L.boot("F-05-order-races");
  const rows = [];
  try {
    await a.win.setViewportSize({ width: 1440, height: 900 });

    // --- 1. start a tutorial, advance, then close + reopen ---
    await L.openHelp(a.win);
    await a.win.locator("#help-search").fill("clip");
    await a.win.waitForTimeout(250);
    await pick(a.win, "Cut a clip");
    await next(a.win);
    await snap(a, "1. tutorial at step 2", rows);
    await a.win.click("#ui-help-button"); // close
    await a.win.waitForTimeout(300);
    await snap(a, "1. after close", rows);
    await a.win.click("#ui-help-button"); // reopen
    await a.win.waitForTimeout(400);
    await snap(a, "1. after reopen (resume or reset?)", rows);
    console.log("SHOT", await a.shot("reopen-state"));

    // --- 2. start a second tutorial while the first is running ---
    await a.win.evaluate(() => {
      const d = document.getElementById("ui-help-drawer");
      [...d.querySelectorAll("button")].find((x) => x.textContent.trim() === "All tasks")?.click();
    });
    await a.win.waitForTimeout(250);
    await pick(a.win, "Switch campaign");
    await snap(a, "2. second tutorial picked", rows);
    console.log("SHOT", await a.shot("second-tutorial"));
    // Spotlight should now follow the new task only.
    const spots = await a.win.evaluate(() => document.querySelectorAll("[data-help-spotlight]").length);
    rows.push({ label: "2. spotlight element count", spots });
    console.log("spotlight elements on screen:", spots);

    // --- 3. navigate away mid-tutorial: open a new workspace tab ---
    await next(a.win);
    await snap(a, "3. before navigating away", rows);
    await a.win.evaluate(() => {
      const b = [...document.querySelectorAll("button")].find((x) => (x.getAttribute("aria-label") || x.title || "").match(/new tab|add tab/i) || x.textContent.trim() === "+");
      b?.click();
    });
    await a.win.waitForTimeout(1200);
    await snap(a, "3. after opening a new tab", rows);
    console.log("SHOT", await a.shot("after-new-tab"));

    // Switch back to the first tab.
    await a.win.evaluate(() => {
      const tabs = [...document.querySelectorAll("button")].filter((b) => /New tab/.test(b.textContent));
      tabs[0]?.click();
    });
    await a.win.waitForTimeout(800);
    await snap(a, "3. after switching back", rows);

    // --- 4. double-click the help button ---
    await a.win.evaluate(() => {
      const d = document.getElementById("ui-help-drawer");
      if (d) document.getElementById("ui-help-button").click();
    });
    await a.win.waitForTimeout(300);
    await a.win.dblclick("#ui-help-button");
    await a.win.waitForTimeout(400);
    await snap(a, "4. after double-click help button", rows);
    console.log("SHOT", await a.shot("after-dblclick"));

    // --- 5. spam Escape ---
    await a.win.evaluate(() => {
      if (!document.getElementById("ui-help-drawer")) document.getElementById("ui-help-button").click();
    });
    await a.win.waitForTimeout(300);
    for (let i = 0; i < 12; i++) await a.win.keyboard.press("Escape");
    await a.win.waitForTimeout(500);
    await snap(a, "5. after 12x Escape", rows);
    const alive = await a.win.evaluate(() => ({
      header: Boolean(document.querySelector("header")),
      helpBtn: Boolean(document.getElementById("ui-help-button")),
      bodyText: document.body.innerText.length,
    }));
    console.log("app alive after Escape spam:", JSON.stringify(alive));
    rows.push({ label: "5. app alive", ...alive });
    console.log("SHOT", await a.shot("after-escape-spam"));

    // --- 6. Escape while a tutorial is running: does it close the drawer or just the tutorial? ---
    await a.win.click("#ui-help-button");
    await a.win.waitForTimeout(300);
    await pick(a.win, "Cut a clip");
    await snap(a, "6. tutorial running", rows);
    await a.win.keyboard.press("Escape");
    await a.win.waitForTimeout(400);
    await snap(a, "6. after one Escape", rows);

    // --- 7. open help while a download is running ---
    L.stub({ exitCode: 0, writeMedia: true, progress: [0, 10, 20, 40, 60, 80, 100], delayMs: 4000 });
    await a.win.evaluate(() => {
      if (document.getElementById("ui-help-drawer")) document.getElementById("ui-help-button").click();
    });
    await a.win.locator("#ui-source-chip input").fill("https://www.youtube.com/watch?v=stub0000001");
    await a.win.keyboard.press("Enter");
    await a.win.waitForTimeout(7000);
    // mark a range and cut
    const cut = await a.win.evaluate(() => {
      const whole = [...document.querySelectorAll("button")].find((b) => /Whole video/.test(b.textContent));
      whole?.click();
      return Boolean(whole);
    });
    await a.win.waitForTimeout(400);
    await a.win.evaluate(() => document.getElementById("ui-cut")?.click());
    await a.win.waitForTimeout(800);
    console.log("cut started (whole-video button found:", cut, ")");
    let clickOk = true;
    try {
      await a.win.click("#ui-help-button", { timeout: 3000 });
    } catch (e) {
      clickOk = false;
      console.log("help click during download FAILED:", String(e).split("\n")[0]);
    }
    await a.win.waitForTimeout(400);
    await snap(a, "7. help during download", rows);
    rows.push({ label: "7. help clickable during download", clickOk });
    console.log("SHOT", await a.shot("help-during-download"));

    console.log("PAGE ERRORS", JSON.stringify(a.logs.pageErrors));
  } finally {
    const out = path.join(a.outDir, "order-races.json");
    fs.writeFileSync(out, JSON.stringify(rows, null, 2));
    console.log("REPORT", out);
    await a.close();
  }
})().catch((e) => {
  console.error("FAILED", e);
  process.exit(1);
});
