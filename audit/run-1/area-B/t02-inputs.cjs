/**
 * File: t02-inputs.cjs
 * Description: Input battery for "paste / change a URL" and "mark in / out".
 *   Every URL variant and every bad time is typed into the real app and the
 *   resulting state read back from the DOM.
 */
const { boot, loadUrl, stubRoot } = require("./boot.cjs");
const STUB = process.env.STUB || "/tmp/claude-0/-home-user-stream-trimmer/fbb59225-b5c7-558d-a212-aff901156a0b/scratchpad/stubB";

const URLS = [
  ["empty", ""],
  ["whitespace", "   "],
  ["non-youtube", "https://vimeo.com/123456789"],
  ["bare word", "hello"],
  ["playlist", "https://www.youtube.com/playlist?list=PLstub000000000000000"],
  ["watch + list", "https://www.youtube.com/watch?v=stub0000001&list=PLxyz&index=4"],
  ["shorts", "https://www.youtube.com/shorts/stub0000002"],
  ["youtu.be", "https://youtu.be/stub0000003"],
  ["timestamped", "https://www.youtube.com/watch?v=stub0000004&t=90"],
  ["tracking params", "https://www.youtube.com/watch?v=stub0000005&si=AbCdEf&utm_source=x&feature=share"],
  ["unicode/emoji", "https://www.youtube.com/watch?v=🎬émoji"],
  ["10k chars", "https://www.youtube.com/watch?v=" + "a".repeat(10000)],
  ["channel url", "https://www.youtube.com/@somechannel"],
];

const TIMES = [
  ["equal in/out", "00:00:10", "00:00:10"],
  ["out before in", "00:00:20", "00:00:05"],
  ["negative in", "-5", "00:00:20"],
  ["beyond duration", "00:00:10", "99:99:99"],
  ["past duration (valid fmt)", "00:00:10", "00:59:00"],
  ["sub-second decimals", "10.5", "20.25"],
  ["zero length at 0", "0", "0"],
  ["letters", "abc", "def"],
  ["bare seconds", "65", "130"],
  ["mm:ss", "1:05", "2:10"],
  ["over 24h", "25:00:00", "25:00:30"],
  ["minutes >= 60", "00:70:00", "00:80:00"],
];

(async () => {
  const stub = stubRoot(STUB);
  stub.write({ info: { id: "stub0000001", title: "Stub video", duration: 1800, uploader: "Stub channel" }, transcriptLines: 10 });
  const a = await boot({ label: "t02-inputs", stub: STUB, viewport: { width: 1440, height: 900 } });

  console.log("=== URL VARIANTS ===");
  for (const [name, url] of URLS) {
    // Once a source has loaded the bar collapses to a chip; reopen it.
    if (!(await a.win.locator('input[type="url"]').count())) {
      await a.win.locator("#ui-source-chip button:has-text('Change')").click();
    }
    const input = a.win.locator('input[type="url"]');
    await input.click();
    await input.fill("");
    await a.win.keyboard.insertText(url);
    await a.win.keyboard.press("Enter");
    await a.win.waitForTimeout(1600);
    const probe = await a.win.evaluate(() => {
      const t = (sel) =>
        Array.from(document.querySelectorAll(sel))
          .map((e) => e.innerText || "")
          .join(" | ")
          .replace(/\s+/g, " ")
          .trim();
      const q = (sel) => document.querySelector(sel);
      return {
        urlBar: !!q('input[type="url"]'),
        reload: q('button[aria-label="Reload source"]')?.disabled ?? null,
        markIn: q("#ui-mark-in") ? q("#ui-mark-in").disabled : null,
        out: q("#ui-mark-out")?.value ?? null,
        status: t("#ui-col-centre [role=status], #ui-col-centre [role=alert]").slice(0, 170),
        bodyLen: (document.body.innerText || "").length,
      };
    });
    console.log(`[${name}]`, JSON.stringify(probe));
    if (!probe.urlBar) console.log("   (bar collapsed to a source chip: a source is considered loaded)");
  }
  console.log("shot:", await a.shot("url-last"));

  // Reset to a good video for the time battery.
  if (!(await a.win.locator('input[type="url"]').count())) {
    await a.win.locator("#ui-source-chip button:has-text('Change')").click();
  }
  await loadUrl(a, "https://www.youtube.com/watch?v=stub0000001");
  await a.win.waitForTimeout(1500);
  const dur = await a.win.locator("#ui-col-centre").innerText();
  console.log("\n=== TIME BATTERY (video duration 1800s) ===");
  for (const [name, s, e] of TIMES) {
    await a.win.fill("#ui-mark-in", s);
    await a.win.fill("#ui-mark-out", e);
    await a.win.waitForTimeout(350);
    const total = await a.win.locator("#ui-stitched-total").innerText();
    const addDisabled = await a.win.locator("#ui-add-segment").isDisabled();
    const cutDisabled = await a.win.locator("#ui-cut").isDisabled();
    const msgs = (await a.win.locator("#ui-col-centre [role=status], #ui-col-centre [role=alert]").allInnerTexts())
      .map((t) => t.replace(/\s+/g, " ").trim())
      .filter(Boolean)
      .join(" ⏐ ");
    const invIn = await a.win.locator("#ui-mark-in").getAttribute("aria-invalid");
    const invOut = await a.win.locator("#ui-mark-out").getAttribute("aria-invalid");
    console.log(
      `[${name}] in="${s}" out="${e}" total=${total} addDisabled=${addDisabled} cutDisabled=${cutDisabled} ariaInvalid=${invIn}/${invOut} msg="${msgs.slice(0, 190)}"`,
    );
  }
  console.log("shot:", await a.shot("times-last"));

  // Sub-second: does a decimal survive into a segment?
  await a.win.fill("#ui-mark-in", "10.5");
  await a.win.fill("#ui-mark-out", "20.25");
  await a.win.waitForTimeout(300);
  const canAdd = !(await a.win.locator("#ui-add-segment").isDisabled());
  if (canAdd) {
    await a.win.click("#ui-add-segment");
    console.log("\nsub-second segment row:", (await a.win.locator('ol[aria-label^="Segments"] > li').allInnerTexts()).join(" / "));
  } else {
    console.log("\nsub-second: Add segment refused");
  }
  console.log("shot:", await a.shot("subsecond"));
  await a.close();
})().catch((e) => {
  console.error("FAILED", e);
  process.exit(1);
});
