/**
 * F-10: every UpdateStatusPayload state, driven into the real renderer by
 * sending the real `updater:status` IPC message from the main process
 * (Playwright's app.evaluate), so no product code is modified.
 *
 * Asserts: nothing crashes, the strip is never blank when it should say
 * something, the label/links are sane, and the percent edge cases.
 */
const fs = require("node:fs");
const path = require("node:path");
const L = require("./lib.cjs");

const STATES = [
  ["checking", { state: "checking" }],
  ["available-with-version", { state: "available", version: "4.1.0" }],
  ["available-no-version", { state: "available" }],
  ["manual-with-version", { state: "manual", version: "4.1.0", url: "https://github.com/x/y/releases/download/v4.1.0/App.dmg" }],
  ["manual-no-version", { state: "manual", url: "https://github.com/x/y/releases/latest" }],
  ["manual-no-url", { state: "manual", version: "4.1.0" }],
  ["none", { state: "none" }],
  ["downloading-0", { state: "downloading", percent: 0 }],
  ["downloading-50", { state: "downloading", percent: 50 }],
  ["downloading-100", { state: "downloading", percent: 100 }],
  ["downloading-NaN", { state: "downloading", percent: Number.NaN }],
  ["downloading-minus1", { state: "downloading", percent: -1 }],
  ["downloading-999", { state: "downloading", percent: 999 }],
  ["downloading-missing-percent", { state: "downloading" }],
  ["ready-with-version", { state: "ready", version: "4.1.0" }],
  ["ready-no-version", { state: "ready" }],
  ["error-with-url", { state: "error", message: "net::ERR_INTERNET_DISCONNECTED", url: "https://github.com/x/y/releases/latest" }],
  ["error-no-url", { state: "error", message: "ENOENT: no such file or directory, open 'app-update.yml'" }],
  ["error-empty-message", { state: "error", message: "" }],
  ["error-huge-message", { state: "error", message: "E".repeat(3000) }],
  ["unknown-state", { state: "wat" }],
  ["null-payload", null],
];

const READ = () => {
  // The update strip lives in the header next to the Check button.
  const check = [...document.querySelectorAll("header button")].find((b) => b.textContent.trim() === "Check");
  const strip = check?.parentElement ?? null;
  if (!strip) return { found: false };
  const r = strip.getBoundingClientRect();
  return {
    found: true,
    text: strip.textContent.trim(),
    width: Math.round(r.width),
    height: Math.round(r.height),
    buttons: [...strip.querySelectorAll("button")].map((b) => b.textContent.trim()),
    links: [...strip.querySelectorAll("a")].map((x) => ({ text: x.textContent.trim(), href: x.getAttribute("href") })),
    // Does the strip push the help button off the header?
    helpFromRight: (() => {
      const h = document.getElementById("ui-help-button");
      if (!h) return null;
      const b = h.getBoundingClientRect();
      return Math.round(innerWidth - b.right);
    })(),
    headerHeight: Math.round(document.querySelector("header").getBoundingClientRect().height),
    bodyOverflowsX: document.body.scrollWidth > document.body.clientWidth,
  };
};

(async () => {
  const a = await L.boot("F-10-updater-states");
  const rows = [];
  try {
    await a.win.setViewportSize({ width: 1440, height: 900 });
    await a.win.waitForTimeout(1000);
    rows.push({ name: "baseline (idle)", ...(await a.win.evaluate(READ)) });
    console.log("baseline:", JSON.stringify(rows[0]));

    for (const [name, payload] of STATES) {
      await a.app.evaluate(({ BrowserWindow }, p) => {
        const w = BrowserWindow.getAllWindows().find((x) => !x.isDestroyed());
        w.webContents.send("updater:status", p);
      }, payload);
      await a.win.waitForTimeout(450);
      const r = await a.win.evaluate(READ);
      const errs = a.logs.pageErrors.length;
      rows.push({ name, payload, ...r, pageErrorsSoFar: errs });
      console.log(
        `${name.padEnd(28)} text="${r.text}"  links=${JSON.stringify(r.links)}  buttons=${JSON.stringify(r.buttons)}  h=${r.headerHeight} overflowX=${r.bodyOverflowsX} errs=${errs}`,
      );
      rows[rows.length - 1].shot = await a.shot(`update-${name}`);
    }

    // The "none" state is supposed to clear itself after 4s.
    await a.app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()
        .find((x) => !x.isDestroyed())
        .webContents.send("updater:status", { state: "none" });
    });
    await a.win.waitForTimeout(5200);
    const afterNone = await a.win.evaluate(READ);
    rows.push({ name: "none, 5.2s later", ...afterNone });
    console.log(`none auto-clear after 5.2s -> text="${afterNone.text}"`);

    // The manual Check button, in dev-disabled mode.
    await a.win.evaluate(() => {
      [...document.querySelectorAll("header button")].find((b) => b.textContent.trim() === "Check")?.click();
    });
    await a.win.waitForTimeout(2500);
    const afterCheck = await a.win.evaluate(READ);
    rows.push({ name: "after pressing Check", ...afterCheck });
    console.log(`after Check -> text="${afterCheck.text}" links=${JSON.stringify(afterCheck.links)}`);
    console.log("SHOT", await a.shot("after-check"));

    // Narrow viewport: does the strip wrap or shove the help button?
    for (const w of [1024, 900]) {
      await a.win.setViewportSize({ width: w, height: 800 });
      await a.app.evaluate(({ BrowserWindow }) => {
        BrowserWindow.getAllWindows()
          .find((x) => !x.isDestroyed())
          .webContents.send("updater:status", { state: "error", message: "ENOENT: no such file or directory, open 'app-update.yml'" });
      });
      await a.win.waitForTimeout(500);
      const r = await a.win.evaluate(READ);
      rows.push({ name: `error state at ${w}px`, ...r });
      console.log(`error @${w}px -> headerHeight=${r.headerHeight} helpFromRight=${r.helpFromRight} overflowX=${r.bodyOverflowsX}`);
      rows[rows.length - 1].shot = await a.shot(`update-error-${w}`);
    }

    console.log("PAGE ERRORS", JSON.stringify(a.logs.pageErrors));
    console.log("RENDERER CONSOLE ERRORS", JSON.stringify(a.logs.console.filter((l) => l.startsWith("[error]")).slice(-10), null, 1));
  } finally {
    const out = path.join(a.outDir, "updater-states.json");
    fs.writeFileSync(out, JSON.stringify(rows, null, 2));
    console.log("REPORT", out);
    await a.close();
  }
})().catch((e) => {
  console.error("FAILED", e);
  process.exit(1);
});
