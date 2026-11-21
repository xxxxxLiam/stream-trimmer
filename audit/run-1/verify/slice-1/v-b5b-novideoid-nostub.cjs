/**
 * v-b5b-novideoid-nostub.cjs — B-5, reached WITHOUT relying on the stub
 * answering a channel URL as if it were a video.
 *
 * A real video is loaded and a segment added (so `info` is genuine), then the
 * URL text is changed to a channel URL WITHOUT pressing Enter. `videoId` is
 * derived from the text, so it becomes null while the loaded source and the
 * segment stay. If Cut is still enabled and silent in that state, the
 * no-feedback defect is product logic, independent of what yt-dlp answers for
 * a channel URL.
 *
 * Usage: STUB=/tmp/vstubX xvfb-run -a node v-b5b-novideoid-nostub.cjs
 */
const fs = require("node:fs");
const { boot, loadUrl } = require("./v-lib.cjs");

const CLIPS = "/tmp/v-b5b-clips";

const probe = () => {
  const vis = (el) => el && el.offsetParent !== null;
  const pick = (s) => [...document.querySelectorAll(s)].find(vis) || null;
  const t = (el) => (el ? el.innerText.replace(/\s+/g, " ").trim() : null);
  return {
    urlText: pick('input[type="url"]')?.value ?? null,
    chip: t(pick("#ui-source-chip")),
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
  };
};

(async () => {
  fs.rmSync(CLIPS, { recursive: true, force: true });
  fs.mkdirSync(CLIPS, { recursive: true });
  const a = await boot({
    label: "v-b5b-novideoid",
    stubRoot: process.env.STUB,
    viewport: { width: 1440, height: 1250 },
    seed: { "clipper.dataDirConfirmed": true, "clipper.clipsDir": CLIPS },
  });
  try {
    await loadUrl(a, "https://www.youtube.com/watch?v=stub0000001");
    await a.win.waitForTimeout(1500);
    await a.win.locator("#ui-mark-in:visible").first().fill("00:00:05");
    await a.win.locator("#ui-mark-out:visible").first().fill("00:00:15");
    await a.win.locator("#ui-add-segment:visible").first().click();
    await a.win.waitForTimeout(600);
    a.log("a real video, one segment:", await a.win.evaluate(probe));

    // Reveal the URL bar again ("Change"), then type a channel URL and DO NOT
    // press Enter, so no request is made and nothing depends on the stub.
    const change = a.win.locator("button:visible", { hasText: /^Change$/ }).first();
    if (await change.count()) await change.click();
    await a.win.waitForTimeout(500);
    const box = a.win.locator('input[type="url"]:visible').first();
    await box.fill("https://www.youtube.com/@somechannel");
    await a.win.waitForTimeout(1500);
    a.log("URL text now has no video id:", await a.win.evaluate(probe));
    await a.shot("no-videoid-state");

    await a.win.locator("#ui-cut:visible").first().click();
    await a.win.waitForTimeout(10000);
    a.log("10s after clicking Cut:", await a.win.evaluate(probe));
    a.log("files on disk:", fs.readdirSync(CLIPS));
    a.log("download calls to yt-dlp:",
      fs.readFileSync(process.env.STUB + "/calls.log", "utf8")
        .split("\n").filter((l) => l.includes("download-sections")).length);
    await a.shot("after-cut");
  } finally {
    a.log("PROOF:", a.writeLog());
    await a.close();
  }
})();
