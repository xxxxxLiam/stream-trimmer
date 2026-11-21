/**
 * File: t03-marking.cjs
 * Description: Marking defects. (1) a sub-second or non-numeric mark silently
 *   becomes the whole video and can be added as a segment; (2) the advertised
 *   I / O keyboard rhythm; (3) which range controls actually exist in the DOM;
 *   (4) a URL with no video id loads as a source but Cut does nothing.
 */
const fs = require("node:fs");
const { boot, loadUrl, mark, stubRoot } = require("./boot.cjs");
const STUB = process.env.STUB || "/tmp/claude-0/-home-user-stream-trimmer/fbb59225-b5c7-558d-a212-aff901156a0b/scratchpad/stubB";
const CLIPS = "/tmp/claude-0/-home-user-stream-trimmer/fbb59225-b5c7-558d-a212-aff901156a0b/scratchpad/clips-t03";

async function segRows(a) {
  return (await a.win.locator('ol[aria-label^="Segments"] > li').allInnerTexts()).map((t) =>
    t.replace(/\s+/g, " ").trim(),
  );
}

(async () => {
  fs.rmSync(CLIPS, { recursive: true, force: true });
  fs.mkdirSync(CLIPS, { recursive: true });
  const stub = stubRoot(STUB);
  stub.write({ info: { id: "stub0000001", title: "Stub video", duration: 1800, uploader: "Stub channel" }, transcriptLines: 12 });
  const a = await boot({
    label: "t03-marking",
    stub: STUB,
    viewport: { width: 1440, height: 900 },
    seed: { "clipper.saveDir": CLIPS, "clipper.saveDirs": [CLIPS] },
  });
  await loadUrl(a, "https://www.youtube.com/watch?v=stub0000001");
  await a.win.waitForTimeout(1500);

  console.log("=== 1. what range controls exist ===");
  console.log(await a.win.evaluate(() => ({
    rangeInputs: document.querySelectorAll('input[type="range"]').length,
    startTimeSlider: !!document.querySelector('input[aria-label="Start time"]'),
    setStartButton: !!document.querySelector('button[title^="Set clip start"]'),
    playButton: !!document.querySelector('button[aria-label="Play"]'),
    timelineSlider: !!document.querySelector('[role="slider"][aria-label="Video timeline"]'),
    markInKbdLabel: document.querySelector("#ui-mark-in")?.closest("label")?.innerText.replace(/\s+/g, " "),
    markOutKbdLabel: document.querySelector("#ui-mark-out")?.closest("label")?.innerText.replace(/\s+/g, " "),
    previewMessage: document.querySelector(".aspect-video")?.innerText.replace(/\s+/g, " "),
  })));

  console.log("\n=== 2. the I / O keys the labels advertise ===");
  await a.win.click('[role="slider"][aria-label="Video timeline"]', { position: { x: 300, y: 8 } });
  await a.win.waitForTimeout(400);
  const beforeIO = { in: await a.win.inputValue("#ui-mark-in"), out: await a.win.inputValue("#ui-mark-out") };
  await a.win.locator("body").click({ position: { x: 5, y: 400 } });
  await a.win.keyboard.press("i");
  await a.win.waitForTimeout(250);
  await a.win.keyboard.press("o");
  await a.win.waitForTimeout(250);
  console.log("before I/O:", JSON.stringify(beforeIO), "after:", JSON.stringify({ in: await a.win.inputValue("#ui-mark-in"), out: await a.win.inputValue("#ui-mark-out") }));
  console.log("shot:", await a.shot("io-keys"));

  console.log("\n=== 3. sub-second mark -> whole video segment ===");
  await mark(a, "10.5", "20.25");
  await a.win.waitForTimeout(400);
  console.log("total readout:", await a.win.locator("#ui-stitched-total").innerText());
  console.log("add disabled:", await a.win.locator("#ui-add-segment").isDisabled());
  await a.win.click("#ui-add-segment");
  console.log("segment rows:", JSON.stringify(await segRows(a)));
  console.log("cut disabled after adding:", await a.win.locator("#ui-cut").isDisabled());
  console.log("shot:", await a.shot("subsecond-segment"));
  await a.win.click("#ui-cut");
  await a.win.waitForTimeout(6000);
  console.log("alerts:", JSON.stringify((await a.win.locator('[role="alert"]').allInnerTexts()).map((t) => t.replace(/\s+/g, " ").trim())));
  console.log("files written:", JSON.stringify(fs.readdirSync(CLIPS)));
  console.log("shot:", await a.shot("subsecond-cut-result"));
  // clean up the segment
  await a.win.locator('button[aria-label="Remove segment 1"]').click();

  console.log("\n=== 4. non-numeric mark -> whole video segment ===");
  await mark(a, "abc", "def");
  await a.win.waitForTimeout(400);
  console.log("total readout:", await a.win.locator("#ui-stitched-total").innerText());
  console.log("add disabled:", await a.win.locator("#ui-add-segment").isDisabled());
  console.log("aria-invalid in/out:", await a.win.locator("#ui-mark-in").getAttribute("aria-invalid"), await a.win.locator("#ui-mark-out").getAttribute("aria-invalid"));
  await a.win.click("#ui-add-segment");
  console.log("segment rows:", JSON.stringify(await segRows(a)));
  console.log("shot:", await a.shot("letters-segment"));
  await a.win.locator('button[aria-label="Remove segment 1"]').click();

  console.log("\n=== 5. negative in ===");
  await mark(a, "-5", "00:00:20");
  await a.win.waitForTimeout(400);
  console.log("total readout:", await a.win.locator("#ui-stitched-total").innerText(), "add disabled:", await a.win.locator("#ui-add-segment").isDisabled());
  await a.win.click("#ui-add-segment");
  console.log("segment rows:", JSON.stringify(await segRows(a)));
  await a.win.locator('button[aria-label="Remove segment 1"]').click();

  console.log("\n=== 6. a URL with no video id (channel) ===");
  if (!(await a.win.locator('input[type="url"]').count())) {
    await a.win.locator("#ui-source-chip button:has-text('Change')").click();
  }
  await loadUrl(a, "https://www.youtube.com/@somechannel");
  await a.win.waitForTimeout(2500);
  console.log("source chip / header:", (await a.win.locator("#ui-source-chip").innerText()).replace(/\s+/g, " "));
  await mark(a, "00:00:05", "00:00:15");
  await a.win.waitForTimeout(300);
  await a.win.click("#ui-add-segment");
  console.log("segment rows:", JSON.stringify(await segRows(a)));
  console.log("cut disabled:", await a.win.locator("#ui-cut").isDisabled());
  const before = fs.readdirSync(CLIPS).length;
  await a.win.click("#ui-cut");
  await a.win.waitForTimeout(6000);
  console.log("after clicking Cut: files added =", fs.readdirSync(CLIPS).length - before);
  console.log("downloading indicator:", await a.win.locator('button:has-text("Cancel")').count());
  console.log("alerts:", JSON.stringify((await a.win.locator('[role="alert"]').allInnerTexts()).map((t) => t.replace(/\s+/g, " ").trim())));
  console.log("segments still there:", JSON.stringify(await segRows(a)));
  console.log("shot:", await a.shot("no-videoid-cut"));
  await a.close();
})().catch((e) => {
  console.error("FAILED", e);
  process.exit(1);
});
