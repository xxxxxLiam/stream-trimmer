/**
 * v-b2b-wrong-cut.cjs — B-2, the consequence. After the cross-tab leak, does
 * cutting in tab 1 really cut VIDEO AAA at a range that was only ever marked
 * on VIDEO BBB in tab 2?
 *
 * Timestamps are kept inside the 30s fixture so the cut genuinely completes.
 *
 * Usage: STUB=/tmp/vstubX xvfb-run -a node v-b2b-wrong-cut.cjs
 */
const fs = require("node:fs");
const path = require("node:path");
const { boot, loadUrl, paneState } = require("./v-lib.cjs");

const CLIPS = "/tmp/v-b2b-clips";
const STUB = process.env.STUB;
const setStub = (patch) => {
  const p = path.join(STUB, "stub.json");
  fs.writeFileSync(p, JSON.stringify({ ...JSON.parse(fs.readFileSync(p, "utf8")), ...patch }, null, 2));
};

(async () => {
  fs.rmSync(CLIPS, { recursive: true, force: true });
  fs.mkdirSync(CLIPS, { recursive: true });
  setStub({ info: { id: "aaa0000001", title: "Video AAA", duration: 600, uploader: "ch" } });
  const a = await boot({
    label: "v-b2b-wrong-cut",
    stubRoot: STUB,
    viewport: { width: 1440, height: 1250 },
    seed: { "clipper.dataDirConfirmed": true, "clipper.clipsDir": CLIPS },
  });
  try {
    await loadUrl(a, "https://www.youtube.com/watch?v=aaa0000001");
    await a.win.waitForTimeout(1500);
    await a.win.locator("#ui-mark-in:visible").first().fill("00:00:10");
    await a.win.locator("#ui-mark-out:visible").first().fill("00:00:14");
    await a.win.keyboard.press("Control+Shift+Enter");
    await a.win.waitForTimeout(500);
    a.log("tab 1 (AAA) marked 00:00:10-00:00:14:", await a.win.evaluate(paneState));

    await a.win.click('[aria-label="New tab"]');
    await a.win.waitForTimeout(1200);
    setStub({ info: { id: "bbb0000002", title: "Video BBB", duration: 600, uploader: "ch" } });
    await loadUrl(a, "https://www.youtube.com/watch?v=bbb0000002");
    await a.win.waitForTimeout(1500);
    await a.win.locator("#ui-mark-in:visible").first().fill("00:00:02");
    await a.win.locator("#ui-mark-out:visible").first().fill("00:00:05");
    await a.win.keyboard.press("Control+Shift+Enter");
    await a.win.waitForTimeout(600);
    a.log("tab 2 (BBB) marked 00:00:02-00:00:05:", await a.win.evaluate(paneState));

    await a.win.locator('[role="tab"]').first().click();
    await a.win.waitForTimeout(1200);
    a.log("back in tab 1:", await a.win.evaluate(paneState));
    await a.shot("tab1-contaminated");

    await a.win.locator("#ui-cut:visible").first().click();
    for (let i = 0; i < 30; i++) {
      await a.win.waitForTimeout(2000);
      if (fs.readdirSync(CLIPS).length) break;
    }
    a.log("file written while tab 1 (Video AAA) was on screen:", fs.readdirSync(CLIPS));
    a.log("sections the engine cut:",
      fs.readFileSync(path.join(STUB, "calls.log"), "utf8")
        .split("\n").map((l) => (l.match(/"--download-sections","([^"]+)"/) || [])[1])
        .filter(Boolean));
    await a.shot("after-cut");
  } finally {
    a.log("PROOF:", a.writeLog());
    await a.close();
  }
})();
