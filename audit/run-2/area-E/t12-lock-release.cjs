#!/usr/bin/env node
/**
 * t12-lock-release.cjs — how long the new duplicate-run lock stays held when
 * the client goes away without cancelling, versus when it cancels properly.
 *
 * The lock is released in the handler's `finally`, so it lives as long as the
 * handler does. A client that abandons the request (tab closed, window gone,
 * reload) does not end the handler by itself — `res.on("close")` cancels the
 * job, which is what should unwind it — so this measures the real window in
 * which the next identical export is refused with 409 while nothing is on
 * screen.
 *
 * Per case: start a slow export, leave/cancel it, then poll an identical
 * request every 400 ms until it is no longer 409, and report the elapsed time.
 *
 * usage: xvfb-run -a ... node t12-lock-release.cjs <shape>
 */
const fs = require("node:fs");
const os = require("node:os");
const { launch, stubRoot, setStub, save, sleep } = require("./lib.cjs");

const SHAPE = process.argv[2] || "owner-hash";

(async () => {
  const report = { shape: SHAPE, startedAt: new Date().toISOString() };
  const root = stubRoot("t12");
  // One slow stage, so the handler is demonstrably mid-call when the client goes.
  setStub(root, { videos: 8, commentTexts: ["one"], commentDelayMs: 4000, subDelayMs: 100 });
  const dataDir = fs.mkdtempSync("/tmp/r2e-data-t12-");

  const a = await launch({
    shape: SHAPE,
    label: `t12-${SHAPE}`,
    cwd: root,
    seed: { "clipper.dataDir": dataDir, "clipper.dataDirConfirmed": true, "clipper.clipsDir": dataDir, "clipper.saveDir": dataDir },
  });
  try {
    await a.win.waitForSelector("header", { timeout: 30000 });
    const skip = a.win.locator('button:has-text("Continue without signing in")');
    if (await skip.count()) await skip.first().click().catch(() => {});
    await sleep(600);

    report.cases = await a.win.evaluate(async () => {
      const base = window.__API_BASE__;
      const body = (limit) =>
        JSON.stringify({
          url: "https://www.youtube.com/@locktest",
          contentType: "all",
          limit,
          includeVideoDetails: true,
          includeComments: true,
          includeTranscripts: true,
          deliver: "path",
        });
      const post = (job, limit, signal) =>
        fetch(`${base}/api/channel/export?jobId=${job}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: body(limit),
          signal,
        });

      async function waitForFree(limit, tag, budgetMs) {
        const t0 = Date.now();
        let tries = 0;
        for (;;) {
          tries += 1;
          const r = await post(`${tag}-probe-${tries}`, limit);
          const txt = await r.text();
          if (r.status !== 409) return { elapsedMs: Date.now() - t0, tries, finalStatus: r.status, body: txt.slice(0, 120) };
          if (Date.now() - t0 > budgetMs) return { elapsedMs: Date.now() - t0, tries, timedOut: true, finalStatus: 409 };
          await new Promise((res) => setTimeout(res, 400));
        }
      }

      // Case 1: the client ABANDONS the request (no cancel call).
      const ctl = new AbortController();
      const abandoned = post("L-abandoned", 21, ctl.signal).catch((e) => ({ aborted: String(e) }));
      await new Promise((r) => setTimeout(r, 2500));
      ctl.abort();
      const case1 = await waitForFree(21, "L-abandoned", 60000);
      await abandoned;

      // Case 2: the client CANCELS properly (what the Stop button does).
      const running = post("L-cancelled", 22).then(async (r) => ({ status: r.status, body: (await r.text()).slice(0, 120) }));
      await new Promise((r) => setTimeout(r, 2500));
      const cancelRes = await fetch(`${base}/api/channel/export/cancel`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jobId: "L-cancelled" }),
      }).then(async (r) => ({ status: r.status, body: await r.text() }));
      const case2 = await waitForFree(22, "L-cancelled", 60000);
      const firstResult = await running;

      return { case1_abandoned: case1, case2_cancelled: { cancelRes, freed: case2, firstResult } };
    });

    report.wipAfter = fs.readdirSync(os.tmpdir()).filter((n) => n.startsWith("ytchanwip-"));
    report.serverLog = a.logs.stdout.join("").split("\n").filter((l) => /channel|export/i.test(l)).slice(-15);
  } catch (e) {
    report.fatal = String(e && e.stack ? e.stack : e);
  } finally {
    save(`t12-${SHAPE}.json`, report);
    await a.close();
  }
})();
