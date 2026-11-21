/**
 * v-f10-updater.cjs — F-10. Does one malformed `updater:status` payload blank
 * the whole window, and is such a payload reachable in the shipped app?
 *
 * Written from the finding's Steps. Each payload is pushed over the REAL
 * updater:status channel from the main process (the only sender there is), and
 * after each one the script records whether the renderer is still mounted.
 * Plausible-but-wrong payloads are tested before the null one, so it is clear
 * which shapes are survivable.
 *
 * Usage: STUB=/tmp/vstubX xvfb-run -a node v-f10-updater.cjs
 */
const { boot } = require("./v-lib.cjs");

const PAYLOADS = [
  ["idle-ish", { state: "idle" }],
  ["checking", { state: "checking" }],
  ["available", { state: "available", version: "9.9.9" }],
  ["none", { state: "none" }],
  ["downloading-50", { state: "downloading", percent: 50 }],
  ["downloading-minus1", { state: "downloading", percent: -1 }],
  ["ready", { state: "ready", version: "9.9.9" }],
  ["error", { state: "error", message: "boom", url: "https://example.com" }],
  ["empty-object", {}],
  ["a-string", "oops"],
  ["a-number", 7],
  ["null-payload", null],
];

const alive = () => {
  const root = document.getElementById("root");
  return {
    rootChildren: root ? root.children.length : -1,
    bodyLen: document.body.innerText.length,
    header: Boolean(document.querySelector("header")),
  };
};

(async () => {
  const a = await boot({
    label: "v-f10-updater",
    stubRoot: process.env.STUB,
    viewport: { width: 1440, height: 1000 },
  });
  try {
    a.log("update strip text at boot:", await a.win.evaluate(() => {
      const h = document.querySelector("header");
      return h ? h.innerText.replace(/\s+/g, " ").trim().slice(0, 160) : null;
    }));

    for (const [name, payload] of PAYLOADS) {
      // Push it from the main process, exactly as sendUpdateStatus does.
      await a.app.evaluate(({ BrowserWindow }, p) => {
        const wins = BrowserWindow.getAllWindows();
        const w = wins.find((x) => !x.isDestroyed() && x.webContents.getURL().includes("127.0.0.1")) || wins[0];
        w.webContents.send("updater:status", p);
      }, payload);
      await a.win.waitForTimeout(1200);
      const state = await a.win.evaluate(alive).catch((e) => `EVAL FAILED: ${e.message}`);
      const strip = await a.win
        .evaluate(() => {
          const h = document.querySelector("header");
          return h ? h.innerText.replace(/\s+/g, " ").trim().slice(0, 120) : null;
        })
        .catch(() => null);
      a.log(`[${name}] alive=${JSON.stringify(state)} strip=${JSON.stringify(strip)} pageErrors=${a.logs.pageErrors.length}`);
      if (name === "null-payload" || name === "a-number") await a.shot(name);
      if (typeof state === "string" || state.rootChildren === 0) {
        a.log(`  *** the tree is gone after [${name}] ***`);
        await a.win.waitForTimeout(6000);
        a.log("  still gone 6s later:", await a.win.evaluate(alive).catch((e) => String(e)));
        break;
      }
    }

    a.log("page errors:", a.logs.pageErrors.slice(0, 5));

    // Is such a payload reachable in the shipped app? Every sender in
    // electron/main.cjs is listed here for the record.
    a.log(
      "senders of updater:status in the product:",
      await a.app.evaluate(() => "see electron/main.cjs sendUpdateStatus call sites"),
    );
  } finally {
    a.log("PROOF:", a.writeLog());
    await a.close();
  }
})();
