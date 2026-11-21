/**
 * F-10b: the parts of F-10 that ran after the null-payload crash, re-run in a
 * healthy window: the "none" auto-clear, the manual Check button, and the
 * error strip at narrow widths. Also: does an updater error destroy anything?
 */
const fs = require("node:fs");
const path = require("node:path");
const L = require("./lib.cjs");

const READ = () => {
  const check = [...document.querySelectorAll("header button")].find((b) => b.textContent.trim() === "Check");
  const strip = check?.parentElement ?? null;
  if (!strip) return { found: false };
  const r = strip.getBoundingClientRect();
  const h = document.getElementById("ui-help-button")?.getBoundingClientRect();
  return {
    found: true,
    text: strip.textContent.trim(),
    links: [...strip.querySelectorAll("a")].map((x) => ({ text: x.textContent.trim(), href: x.getAttribute("href"), target: x.getAttribute("target") })),
    buttons: [...strip.querySelectorAll("button")].map((b) => b.textContent.trim()),
    headerHeight: Math.round(document.querySelector("header").getBoundingClientRect().height),
    helpFromRight: h ? Math.round(innerWidth - h.right) : null,
    helpFromTop: h ? Math.round(h.top) : null,
    bodyOverflowsX: document.body.scrollWidth > document.body.clientWidth,
    stripTitle: strip.querySelector("span")?.getAttribute("title") ?? null,
  };
};

const send = (a, p) =>
  a.app.evaluate(({ BrowserWindow }, payload) => {
    BrowserWindow.getAllWindows()
      .find((x) => !x.isDestroyed())
      .webContents.send("updater:status", payload);
  }, p);

(async () => {
  const a = await L.boot("F-10b-updater-tail");
  const rows = [];
  try {
    await a.win.setViewportSize({ width: 1440, height: 900 });
    await a.win.waitForTimeout(800);

    // "none" is supposed to clear itself after 4s.
    await send(a, { state: "none" });
    await a.win.waitForTimeout(600);
    console.log("none, +0.6s:", JSON.stringify((await a.win.evaluate(READ)).text));
    await a.win.waitForTimeout(4200);
    const cleared = await a.win.evaluate(READ);
    rows.push({ name: "none auto-clear", ...cleared });
    console.log("none, +4.8s:", JSON.stringify(cleared.text));

    // "checking" has no timeout at all — does it stay forever?
    await send(a, { state: "checking" });
    await a.win.waitForTimeout(8000);
    const stuck = await a.win.evaluate(READ);
    rows.push({ name: "checking after 8s", ...stuck });
    console.log("checking, +8s:", JSON.stringify(stuck.text));
    console.log("SHOT", await a.shot("checking-stuck"));

    // Real manual Check (this build is packaged-shape, so the updater is live
    // and GitHub is unreachable from this container).
    await a.win.evaluate(() => {
      [...document.querySelectorAll("header button")].find((b) => b.textContent.trim() === "Check")?.click();
    });
    await a.win.waitForTimeout(6000);
    const afterCheck = await a.win.evaluate(READ);
    rows.push({ name: "after real Check (no network)", ...afterCheck });
    console.log("after real Check:", JSON.stringify(afterCheck, null, 1));
    console.log("SHOT", await a.shot("after-real-check"));

    // Error strip at narrow widths.
    for (const w of [1024, 900, 760]) {
      await a.win.setViewportSize({ width: w, height: 800 });
      await send(a, {
        state: "error",
        message: "ENOENT: no such file or directory, open '/root/.config/youtube-clipper/app-update.yml'",
      });
      await a.win.waitForTimeout(600);
      const r = await a.win.evaluate(READ);
      rows.push({ name: `error @${w}px`, ...r });
      console.log(`error @${w}px headerH=${r.headerHeight} helpFromRight=${r.helpFromRight} helpFromTop=${r.helpFromTop} overflowX=${r.bodyOverflowsX} title=${JSON.stringify(r.stripTitle)}`);
      rows[rows.length - 1].shot = await a.shot(`error-${w}`);
    }

    // Ready state: is Restart labelled and reachable by keyboard?
    await a.win.setViewportSize({ width: 1440, height: 900 });
    await send(a, { state: "ready", version: "4.1.0" });
    await a.win.waitForTimeout(500);
    const ax = await a.win.evaluate(() => {
      const strip = [...document.querySelectorAll("header button")].find((b) => b.textContent.trim() === "Check")?.parentElement;
      return [...strip.querySelectorAll("button,a")].map((e) => ({
        tag: e.tagName.toLowerCase(),
        text: e.textContent.trim(),
        ariaLabel: e.getAttribute("aria-label"),
        title: e.getAttribute("title"),
        tabIndex: e.tabIndex,
      }));
    });
    rows.push({ name: "ready accessibility", controls: ax });
    console.log("ready controls:", JSON.stringify(ax));
    console.log("SHOT", await a.shot("ready-state"));
    console.log("PAGE ERRORS", JSON.stringify(a.logs.pageErrors));
  } finally {
    const out = path.join(a.outDir, "updater-tail.json");
    fs.writeFileSync(out, JSON.stringify(rows, null, 2));
    console.log("REPORT", out);
    await a.close();
  }
})().catch((e) => {
  console.error("FAILED", e);
  process.exit(1);
});
