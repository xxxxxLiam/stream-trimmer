/**
 * v-b5-novideoid.cjs — B-5. Does a URL with no video id load as a source, and
 * does "Cut as one file" then do nothing at all?
 *
 * Written from the finding's Steps. Records, for a channel URL and a playlist
 * URL: the HTTP answer /api/info gives for it (so the stub's part is visible),
 * the source chip, whether the mark fields and Cut are enabled, and then —
 * after a real click on Cut — every message on screen, the download indicator,
 * the segment rows and the files on disk.
 *
 * Usage: STUB=/tmp/vstubX xvfb-run -a node v-b5-novideoid.cjs
 */
const fs = require("node:fs");
const { boot, loadUrl } = require("./v-lib.cjs");

const CLIPS = "/tmp/v-b5-clips";

const probe = () => {
  const vis = (el) => el && el.offsetParent !== null;
  const pick = (s) => [...document.querySelectorAll(s)].find(vis) || null;
  const t = (el) => (el ? el.innerText.replace(/\s+/g, " ").trim() : null);
  return {
    chip: t(pick("#ui-source-chip")),
    markInDisabled: pick("#ui-mark-in")?.disabled ?? null,
    addDisabled: pick("#ui-add-segment")?.disabled ?? null,
    cutDisabled: pick("#ui-cut")?.disabled ?? null,
    rows: [...document.querySelectorAll("li")]
      .map((li) => li.innerText.replace(/\s+/g, " ").trim())
      .filter((x) => /\d\d:\d\d:\d\d to \d\d:\d\d:\d\d/.test(x)),
    messages: [...document.querySelectorAll('[role="status"], [role="alert"]')]
      .filter(vis)
      .map((e) => e.innerText.replace(/\s+/g, " ").trim())
      .filter(Boolean),
    cancelVisible: [...document.querySelectorAll("button")].some(
      (b) => vis(b) && /cancel/i.test(b.innerText),
    ),
    progressBars: [...document.querySelectorAll('[role="progressbar"]')].filter(vis).length,
    transcriptRows: document.querySelectorAll("#ui-col-transcript li").length,
  };
};

(async () => {
  fs.rmSync(CLIPS, { recursive: true, force: true });
  fs.mkdirSync(CLIPS, { recursive: true });
  const a = await boot({
    label: "v-b5-novideoid",
    stubRoot: process.env.STUB,
    viewport: { width: 1440, height: 1250 },
    seed: { "clipper.dataDirConfirmed": true, "clipper.clipsDir": CLIPS },
  });
  try {
    for (const url of [
      "https://www.youtube.com/@somechannel",
      "https://www.youtube.com/playlist?list=PLabcdefghijklmnop",
    ]) {
      a.log(`===== ${url}`);
      // What the server itself answers for this URL (shows the stub's share).
      const api = await a.win.evaluate(async (u) => {
        const r = await fetch(`${window.__API_BASE__}/api/info`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ url: u }),
        });
        return { status: r.status, body: (await r.text()).slice(0, 200) };
      }, url);
      a.log("  /api/info says:", api);

      await loadUrl(a, url);
      await a.win.waitForTimeout(2500);
      a.log("  after pressing Enter:", await a.win.evaluate(probe));
      await a.shot("loaded-" + (url.includes("playlist") ? "playlist" : "channel"));

      await a.win.locator("#ui-mark-in:visible").first().fill("00:00:05");
      await a.win.locator("#ui-mark-out:visible").first().fill("00:00:15");
      await a.win.locator("#ui-add-segment:visible").first().click();
      await a.win.waitForTimeout(600);
      a.log("  after Add segment:", await a.win.evaluate(probe));

      await a.win.locator("#ui-cut:visible").first().click();
      await a.win.waitForTimeout(1500);
      a.log("  1.5s after clicking Cut:", await a.win.evaluate(probe));
      await a.win.waitForTimeout(8000);
      a.log("  10s after clicking Cut:", await a.win.evaluate(probe));
      a.log("  files on disk:", fs.readdirSync(CLIPS));
      a.log("  yt-dlp calls that mention a download:",
        (fs.existsSync(process.env.STUB + "/calls.log")
          ? fs.readFileSync(process.env.STUB + "/calls.log", "utf8").split("\n")
          : []
        ).filter((l) => l.includes("download-sections")).length);
      await a.shot("after-cut-" + (url.includes("playlist") ? "playlist" : "channel"));

      // reset for the next URL
      await a.win.reload();
      await a.win.waitForTimeout(3500);
    }
  } finally {
    a.log("PROOF:", a.writeLog());
    await a.close();
  }
})();
