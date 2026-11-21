/**
 * E/T1 — PUBLIC build: the exporter must be invisible AND unreachable.
 *   - no header entry, no panel
 *   - POST /api/channel/export, POST .../cancel, GET .../progress all 404,
 *     with no stack trace
 *   - window.electronAPI.isOwnerMachine still exists? (bridge surface)
 */
const path = require("node:path");
const L = require("./lib.cjs");

(async () => {
  L.useShape("public");
  const root = L.stubRoot("t1");
  L.writeStub(root, { info: L.channelInfo(), exitCode: 0, delayMs: 0, writeMedia: false });

  const outDir = path.join(L.OUT, "t1-public");
  const a = await L.launchApp({ label: "t1-public", outDir, cwd: root, seed: L.SEED_READY });
  const report = {};
  try {
    await a.win.waitForSelector("header", { timeout: 20000 });
    report.shot_header = await a.shot("public-header");

    report.ui = await a.win.evaluate(() => ({
      channelLink: !!document.querySelector("#ui-channel-link"),
      navText: Array.from(document.querySelectorAll("nav[aria-label='Tools'] button")).map(
        (b) => b.textContent.trim(),
      ),
      bodyHasChannelData: document.body.innerText.includes("Channel data"),
      bodyHasExporter: document.body.innerText.includes("Channel profile exporter"),
      hasIsOwnerMachine: typeof window.electronAPI?.isOwnerMachine,
      apiBase: window.__API_BASE__ || null,
    }));

    report.endpoints = {
      export: await L.api(a.win, "POST", "/api/channel/export", {
        url: "https://www.youtube.com/@stub",
        contentType: "all",
        limit: 10,
      }),
      cancel: await L.api(a.win, "POST", "/api/channel/export/cancel", { jobId: "x" }),
      progress: await L.api(a.win, "GET", "/api/channel/export/progress?jobId=x"),
      // control: a route that does exist, to prove the server is up
      cacheUsage: await L.api(a.win, "GET", "/api/cache/usage"),
    };

    // Can the hidden screen still be reached at all in a public build?
    report.forcedScreen = await a.win.evaluate(() => {
      const btn = document.querySelector("#ui-channel-link");
      return btn ? "link present" : "no link";
    });
  } finally {
    report.logs = { stderr: a.logs.stderr.join(""), pageErrors: a.logs.pageErrors };
    await a.close();
  }
  console.log(JSON.stringify(report, null, 2));
  L.save(outDir, "report.json", report);
})();
