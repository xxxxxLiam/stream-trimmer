/**
 * v-b5c-live-url.cjs — B-5, with a premise that does not depend on the stub
 * pretending a channel is a video.
 *
 * `extractVideoId` (src/lib/clip.ts) understands watch?v=, youtu.be/, /embed/,
 * /shorts/ and /v/ — but NOT youtube.com/live/<id>, which is the canonical URL
 * YouTube hands out for a live stream or premiere and which real yt-dlp
 * resolves as an ordinary video. So the stub answering this URL with real video
 * metadata is what real yt-dlp would also do.
 *
 * Usage: STUB=/tmp/vstubX xvfb-run -a node v-b5c-live-url.cjs
 */
const fs = require("node:fs");
const { boot, loadUrl } = require("./v-lib.cjs");

const CLIPS = "/tmp/v-b5c-clips";

const probe = () => {
  const vis = (el) => el && el.offsetParent !== null;
  const pick = (s) => [...document.querySelectorAll(s)].find(vis) || null;
  const t = (el) => (el ? el.innerText.replace(/\s+/g, " ").trim() : null);
  return {
    chip: t(pick("#ui-source-chip")),
    cutDisabled: pick("#ui-cut")?.disabled ?? null,
    cutLabel: t(pick("#ui-cut")),
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
  };
};

(async () => {
  fs.rmSync(CLIPS, { recursive: true, force: true });
  fs.mkdirSync(CLIPS, { recursive: true });
  const a = await boot({
    label: "v-b5c-live",
    stubRoot: process.env.STUB,
    viewport: { width: 1440, height: 1250 },
    seed: { "clipper.dataDirConfirmed": true, "clipper.clipsDir": CLIPS },
  });
  try {
    await loadUrl(a, "https://www.youtube.com/live/stub0000001");
    await a.win.waitForTimeout(2500);
    a.log("after loading a /live/ URL:", await a.win.evaluate(probe));
    await a.shot("live-url-loaded");

    await a.win.locator("#ui-mark-in:visible").first().fill("00:00:05");
    await a.win.locator("#ui-mark-out:visible").first().fill("00:00:15");
    await a.win.locator("#ui-add-segment:visible").first().click();
    await a.win.waitForTimeout(600);
    a.log("after Add segment:", await a.win.evaluate(probe));

    await a.win.locator("#ui-cut:visible").first().click();
    await a.win.waitForTimeout(1500);
    a.log("1.5s after Cut:", await a.win.evaluate(probe));
    await a.win.waitForTimeout(10000);
    a.log("12s after Cut:", await a.win.evaluate(probe));
    a.log("files on disk:", fs.readdirSync(CLIPS));
    a.log("download calls to yt-dlp:",
      fs.readFileSync(process.env.STUB + "/calls.log", "utf8")
        .split("\n").filter((l) => l.includes("download-sections")).length);
    await a.shot("after-cut");

    // Control: the same video through a URL the app DOES understand.
    await a.win.reload();
    await a.win.waitForTimeout(3500);
    await loadUrl(a, "https://www.youtube.com/watch?v=stub0000001");
    await a.win.waitForTimeout(1500);
    await a.win.locator("#ui-mark-in:visible").first().fill("00:00:05");
    await a.win.locator("#ui-mark-out:visible").first().fill("00:00:15");
    await a.win.locator("#ui-add-segment:visible").first().click();
    await a.win.locator("#ui-cut:visible").first().click();
    await a.win.waitForTimeout(20000);
    a.log("CONTROL (watch?v=): messages:", (await a.win.evaluate(probe)).messages);
    a.log("CONTROL files on disk:", fs.readdirSync(CLIPS));
  } finally {
    a.log("PROOF:", a.writeLog());
    await a.close();
  }
})();
