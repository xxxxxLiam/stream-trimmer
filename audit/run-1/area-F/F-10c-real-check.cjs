/**
 * F-10c: press the real "Check" button with GitHub unreachable and sample the
 * strip for 20s. Also measure the header wrap at 1440px with a long error.
 */
const fs = require("node:fs");
const path = require("node:path");
const L = require("./lib.cjs");

const READ = () => {
  const check = [...document.querySelectorAll("header button")].find((b) => b.textContent.trim() === "Check");
  const strip = check?.parentElement;
  const h = document.getElementById("ui-help-button")?.getBoundingClientRect();
  return {
    text: strip ? strip.textContent.trim() : "(strip gone)",
    headerHeight: Math.round(document.querySelector("header").getBoundingClientRect().height),
    helpFromRight: h ? Math.round(innerWidth - h.right) : null,
    helpFromTop: h ? Math.round(h.top) : null,
  };
};

(async () => {
  const a = await L.boot("F-10c-real-check");
  const rows = [];
  try {
    await a.win.setViewportSize({ width: 1440, height: 900 });
    await a.win.waitForTimeout(1000);
    console.log("before:", JSON.stringify(await a.win.evaluate(READ)));
    await a.win.evaluate(() => {
      [...document.querySelectorAll("header button")].find((b) => b.textContent.trim() === "Check")?.click();
    });
    for (let i = 0; i < 40; i++) {
      await a.win.waitForTimeout(500);
      const r = await a.win.evaluate(READ);
      rows.push({ t: (i + 1) * 0.5, ...r });
      if (i % 2 === 0) console.log(`t=${((i + 1) * 0.5).toFixed(1)}s  "${r.text}"`);
    }
    console.log("SHOT", await a.shot("after-real-check-20s"));
    const mainLog = a.logs.stdout.join("").split("\n").filter((l) => /updater/i.test(l));
    console.log("MAIN-PROCESS UPDATER LINES:\n" + mainLog.join("\n"));
    rows.push({ mainLog });

    // Header wrap at a wide viewport with a long error.
    await a.app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()
        .find((x) => !x.isDestroyed())
        .webContents.send("updater:status", { state: "error", message: "HttpError: 404 Not Found" });
    });
    await a.win.waitForTimeout(600);
    const wide = await a.win.evaluate(READ);
    rows.push({ name: "error @1440", ...wide });
    console.log("error @1440:", JSON.stringify(wide));
    console.log("SHOT", await a.shot("error-1440"));
  } finally {
    const out = path.join(a.outDir, "real-check.json");
    fs.writeFileSync(out, JSON.stringify(rows, null, 2));
    console.log("REPORT", out);
    await a.close();
  }
})().catch((e) => {
  console.error("FAILED", e);
  process.exit(1);
});
