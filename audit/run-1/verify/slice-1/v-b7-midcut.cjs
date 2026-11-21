/**
 * v-b7-midcut.cjs — B-7. If a segment is deleted while the cut is running, is
 * it still in the finished file?
 *
 * Written from the finding's Steps. Three segments 2-5, 20-24, 10-13 (10s
 * stitched). The stub is slowed down (delayMs) so there is time to click the ×
 * on segment 2 while the job runs. The finished file is measured with the real
 * ffprobe: 10s means the deleted segment is still in it, 6s means it was
 * honoured.
 *
 * Usage: STUB=/tmp/vstubX xvfb-run -a node v-b7-midcut.cjs
 */
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { boot, loadUrl } = require("./v-lib.cjs");

const CLIPS = "/tmp/v-b7-clips";
const STUB = process.env.STUB;
const FFPROBE = "/usr/bin/ffprobe";

const rows = () =>
  [...document.querySelectorAll("li")]
    .map((li) => li.innerText.replace(/\s+/g, " ").trim())
    .filter((t) => /\d\d:\d\d:\d\d to \d\d:\d\d:\d\d/.test(t));

const probe = () => {
  const vis = (el) => el && el.offsetParent !== null;
  return {
    rows: [...document.querySelectorAll("li")]
      .map((li) => li.innerText.replace(/\s+/g, " ").trim())
      .filter((t) => /\d\d:\d\d:\d\d to \d\d:\d\d:\d\d/.test(t)),
    removeButtons: [...document.querySelectorAll("button")]
      .filter((b) => vis(b) && /remove segment|^×$/i.test((b.getAttribute("aria-label") || b.innerText || "").trim()))
      .map((b) => b.getAttribute("aria-label") || b.innerText.trim()),
    messages: [...document.querySelectorAll('[role="status"], [role="alert"]')]
      .filter(vis)
      .map((e) => e.innerText.replace(/\s+/g, " ").trim())
      .filter(Boolean),
    cancelVisible: [...document.querySelectorAll("button")].some(
      (b) => vis(b) && /cancel/i.test(b.innerText),
    ),
  };
};

(async () => {
  fs.rmSync(CLIPS, { recursive: true, force: true });
  fs.mkdirSync(CLIPS, { recursive: true });
  const cfgPath = path.join(STUB, "stub.json");
  const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
  fs.writeFileSync(cfgPath, JSON.stringify({ ...cfg, delayMs: 4000 }, null, 2));
  fs.writeFileSync(path.join(STUB, "calls.log"), "");

  const a = await boot({
    label: "v-b7-midcut",
    stubRoot: STUB,
    viewport: { width: 1440, height: 1250 },
    seed: { "clipper.dataDirConfirmed": true, "clipper.clipsDir": CLIPS },
  });
  try {
    await loadUrl(a, "https://www.youtube.com/watch?v=stub0000001");
    await a.win.waitForTimeout(6000); // the stub is slow now; let info settle
    for (const [i, o] of [
      ["00:00:02", "00:00:05"],
      ["00:00:20", "00:00:24"],
      ["00:00:10", "00:00:13"],
    ]) {
      await a.win.locator("#ui-mark-in:visible").first().fill(i);
      await a.win.locator("#ui-mark-out:visible").first().fill(o);
      await a.win.keyboard.press("Control+Shift+Enter");
      await a.win.waitForTimeout(400);
    }
    a.log("before the cut:", await a.win.evaluate(probe));
    await a.shot("three-segments");

    await a.win.locator("#ui-cut:visible").first().click();
    await a.win.waitForTimeout(3000);
    const mid = await a.win.evaluate(probe);
    a.log("mid-cut:", mid);

    // Delete segment 2 while the job runs.
    const removed = await a.win.evaluate(() => {
      const vis = (el) => el && el.offsetParent !== null;
      const btns = [...document.querySelectorAll("button")].filter(
        (b) => vis(b) && /remove segment/i.test(b.getAttribute("aria-label") || ""),
      );
      if (btns.length < 2) return `only ${btns.length} remove buttons found`;
      const label = btns[1].getAttribute("aria-label");
      btns[1].click();
      return `clicked: ${label}`;
    });
    a.log("mid-cut removal:", removed);
    await a.win.waitForTimeout(800);
    a.log("after removing #2 mid-cut:", await a.win.evaluate(probe));
    await a.shot("deleted-midcut");

    // Let the job finish.
    for (let i = 0; i < 40; i++) {
      await a.win.waitForTimeout(2000);
      const files = fs.readdirSync(CLIPS);
      if (files.length) break;
    }
    const files = fs.readdirSync(CLIPS);
    a.log("files produced:", files);
    for (const f of files) {
      const out = execFileSync(
        FFPROBE,
        ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1",
         path.join(CLIPS, f)],
        { encoding: "utf8" },
      ).trim();
      a.log(`  ${f}: ${out}s  (3 segments = 10s, without #2 = 6s)`);
    }
    a.log("sections the engine was asked to cut:",
      fs.readFileSync(path.join(STUB, "calls.log"), "utf8")
        .split("\n")
        .map((l) => {
          const m = l.match(/"--download-sections","([^"]+)"/);
          return m ? m[1] : null;
        })
        .filter(Boolean));
    a.log("final screen:", await a.win.evaluate(probe));
    await a.shot("finished");
  } finally {
    a.log("PROOF:", a.writeLog());
    await a.close();
  }
})();
